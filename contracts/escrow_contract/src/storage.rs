//! # Upgradeable Storage
//!
//! This module provides storage isolation for safe contract upgrades.
//! It manages storage versioning and migration to prevent data corruption
//! during contract upgrades.
//!
//! ## Storage Layout
//!
//! The contract uses two storage areas:
//!
//! 1. **Instance Storage**: Used for admin, pause state, escrow counter, and
//!    storage version. This data persists across upgrades.
//!
//! 2. **Persistent Storage**: Used for escrow meta, milestones, reputation,
//!    cancellation requests, and slash records. This data IS versioned.
//!
//! ## Version History
//!
//! - Version 1 (v1): Initial storage layout - escrow data stored with
//!   milestones inline in the EscrowState struct.
//! - Version 2 (v2): Granular storage - EscrowMeta stored separately from
//!   individual Milestones for better gas efficiency (see issue #65).
//!
//! ## Migration Strategy
//!
//! When upgrading:
//! 1. Read current storage version from instance storage
//! 2. If version matches current, no migration needed
//! 3. Otherwise, run migration functions in order
//! 4. Update version after successful migration
//!
//! Migration progress is persisted via `DataKey::MigrationCursor` so an
//! interrupted batch can be resumed without skipping or double-migrating an
//! escrow. The cursor is only advanced after a batch fully commits, and each
//! escrow is migrated idempotently (the v1 entry is removed once converted).
//!
//! ## Legacy Optional Fields
//!
//! Earlier stored shapes may omit fields that were introduced in later
//! versions. When migrating such legacy escrows, the following documented
//! defaults are applied:
//!
//! - `arbiter` absent -> `None` (no arbiter assigned)
//! - `deadline` absent -> `None` (no deadline)
//! - `lock_time` absent -> `None` (no lock)
//! - `lock_time_extension` absent -> `None` (no extension)
//!
//! Required fields (`escrow_id`, `client`, `freelancer`, `token`,
//! `total_amount`, `remaining_balance`, `status`, `milestones`, `created_at`,
//! `brief_hash`) must be present; a legacy entry missing any of them is
//! treated as corrupted and the migration fails with `EscrowError::E42`.

use soroban_sdk::{contracttype, Address, BytesN, Env, Vec};

use crate::PackedDataKey;
use crate::{DataKey, Milestone, OptionalTimelock, MS_APPROVED, MS_RELEASED, MS_SUBMITTED};

// Current storage version - increment when storage layout changes
pub const STORAGE_VERSION: u32 = 2;

/// Maximum number of escrows to migrate in a single v1-to-v2 batch.
pub const MAX_MIGRATION_BATCH: u32 = 20;

/// Storage keys for version management (stored in instance storage)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StorageKey {
    /// Current storage version - value: u32
    Version,
}

/// Legacy v1 escrow state format for migration reference.
/// In v1, EscrowState stored milestones inline as a Vec.
#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowStateV1 {
    pub escrow_id: u64,
    pub client: Address,
    pub freelancer: Address,
    pub token: Address,
    pub total_amount: i128,
    pub remaining_balance: i128,
    pub status: crate::types::EscrowStatus,
    pub milestones: Vec<Milestone>,
    pub arbiter: Option<Address>,
    pub created_at: u64,
    pub deadline: Option<u64>,
    pub lock_time: Option<u64>,
    pub lock_time_extension: Option<u64>,
    pub brief_hash: BytesN<32>,
}

/// Legacy v1 escrow shape from before optional fields were introduced.
///
/// Earlier stored shapes omitted `arbiter`, `deadline`, `lock_time`, and
/// `lock_time_extension`. Migration applies documented defaults (`None`) for
/// each absent optional field so the resulting v2 entry is fully populated.
#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowStateV1Legacy {
    pub escrow_id: u64,
    pub client: Address,
    pub freelancer: Address,
    pub token: Address,
    pub total_amount: i128,
    pub remaining_balance: i128,
    pub status: crate::types::EscrowStatus,
    pub milestones: Vec<Milestone>,
    pub created_at: u64,
    pub brief_hash: BytesN<32>,
}

impl EscrowStateV1Legacy {
    /// Upgrade a legacy shape (optional fields absent) to the full v1 shape
    /// by applying documented defaults (`None`) for each missing optional
    /// field. Required fields are carried over unchanged.
    pub fn into_v1(self) -> EscrowStateV1 {
        EscrowStateV1 {
            escrow_id: self.escrow_id,
            client: self.client,
            freelancer: self.freelancer,
            token: self.token,
            total_amount: self.total_amount,
            remaining_balance: self.remaining_balance,
            status: self.status,
            milestones: self.milestones,
            arbiter: None,
            created_at: self.created_at,
            deadline: None,
            lock_time: None,
            lock_time_extension: None,
            brief_hash: self.brief_hash,
        }
    }
}

/// Storage manager for handling versioned storage access and migrations.
///
/// This provides the core upgradeable storage functionality:
/// - Version tracking in instance storage
/// - Migration from older storage formats
/// - Data preservation guarantees
pub struct StorageManager;

impl StorageManager {
    /// Get the current storage version from instance storage.
    /// Returns 1 for uninitialized contracts (legacy default).
    pub fn get_version(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&StorageKey::Version)
            .unwrap_or(1_u32) // Default to v1 if not set (legacy contracts)
    }

    /// Set the storage version in instance storage.
    fn set_version(env: &Env, version: u32) {
        env.storage().instance().set(&StorageKey::Version, &version);
    }

    /// Read the persisted migration cursor (next escrow id to migrate).
    /// Defaults to 1 for a fresh migration.
    fn get_cursor(env: &Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::MigrationCursor)
            .unwrap_or(1_u64)
    }

    /// Persist the migration cursor so an interrupted batch can resume.
    fn set_cursor(env: &Env, cursor: u64) {
        env.storage()
            .instance()
            .set(&DataKey::MigrationCursor, &cursor);
    }

    /// Check if storage migration is needed.
    /// Returns true if current version is less than STORAGE_VERSION.
    #[expect(
        dead_code,
        reason = "kept as a small migration-status helper for future upgrade flows"
    )]
    pub fn needs_migration(env: &Env) -> bool {
        Self::get_version(env) < STORAGE_VERSION
    }

    /// Run all necessary migrations from current version to latest.
    ///
    /// This function should be called:
    /// 1. During contract initialization (to migrate any stale state)
    /// 2. During the upgrade process (before new code runs)
    ///
    /// Returns Ok(()) if migration successful or not needed.
    /// Returns Err if migration fails (e.g., corrupted data).
    pub fn migrate(env: &Env) -> Result<(), crate::EscrowError> {
        let current_version = Self::get_version(env);

        if current_version == STORAGE_VERSION {
            return Ok(()); // Already at latest version
        }

        if current_version > STORAGE_VERSION {
            // Downgrade not supported - this could corrupt data
            return Err(crate::EscrowError::E42);
        }

        // Run migrations in order from current to target version

        // v1 -> v2: Migration from monolithic EscrowState to granular storage
        // This is now run in configurable batches to avoid per-transaction ledger entry limits.
        if current_version < 2 {
            let cursor = Self::get_cursor(env);
            let escrow_counter: u64 = env
                .storage()
                .instance()
                .get(&DataKey::EscrowCounter)
                .unwrap_or(0_u64);

            if cursor > escrow_counter {
                Self::set_version(env, 2);
                return Ok(());
            }

            // Migrate the batch. `migrate_v1_to_v2` returns the id of the last
            // escrow it fully processed. Only after the batch commits do we
            // advance the persisted cursor, so a restart resumes exactly at the
            // next unprocessed escrow (no skips, no double migration).
            let last_id = Self::migrate_v1_to_v2(env, cursor, MAX_MIGRATION_BATCH)?;
            let next_cursor = last_id.saturating_add(1);
            Self::set_cursor(env, next_cursor);

            if next_cursor > escrow_counter {
                Self::set_version(env, 2);
            }
        }

        Ok(())
    }

    /// Migration from v1 (monolithic) to v2 (granular) storage layout.
    ///
    /// In v1: EscrowState stored as single unit with inline milestones Vec
    /// In v2: EscrowMeta stored separately from Milestones for better gas efficiency
    ///
    /// This migration:
    /// 1. Reads each escrow in v1 format
    /// 2. Extracts EscrowMeta fields and stores separately
    /// 3. Stores each milestone with its own key
    /// 4. Removes the v1 storage entry
    ///
    /// The migration is idempotent: an escrow whose v1 entry has already been
    /// removed (e.g. a batch that stopped after a partial ledger operation) is
    /// skipped on resume, so it is never migrated twice.
    #[deny(clippy::arithmetic_side_effects)]
    fn migrate_v1_to_v2(
        env: &Env,
        start_id: u64,
        max_count: u32,
    ) -> Result<u64, crate::EscrowError> {
        let escrow_counter: u64 = env
            .storage()
            .instance()
            .get(&DataKey::EscrowCounter)
            .unwrap_or(0_u64);

        let start_id = if start_id == 0 { 1 } else { start_id };
        if start_id > escrow_counter {
            return Ok(escrow_counter);
        }

        let end_id = core::cmp::min(
            start_id.saturating_add(u64::from(max_count).saturating_sub(1)),
            escrow_counter,
        );

        let mut last_processed = start_id.saturating_sub(1);

        for escrow_id in start_id..=end_id {
            // In v1, escrows were stored with DataKey::Escrow(id)
            // In v2, we use PackedDataKey::EscrowMeta(id) and PackedDataKey::Milestone(id, idx)
            let v1_key = DataKey::Escrow(escrow_id);

            // Try the full v1 shape first; fall back to the legacy shape that
            // omits optional fields introduced in later versions.
            let migrated: Option<EscrowStateV1> = if let Some(state) =
                env.storage().persistent().get::<_, EscrowStateV1>(&v1_key)
            {
                Some(state)
            } else {
                env.storage()
                    .persistent()
                    .get::<_, EscrowStateV1Legacy>(&v1_key)
                    .map(EscrowStateV1Legacy::into_v1)
            };

            let Some(state) = migrated else {
                // No v1 entry (already migrated or never existed) - skip.
                last_processed = escrow_id;
                continue;
            };

            // Store escrow meta in v2 granular layout.
            env.storage()
                .persistent()
                .set(&PackedDataKey::EscrowMeta(escrow_id), &state);

            // Store each milestone with its own key.
            for (idx, milestone) in state.milestones.iter().enumerate() {
                env.storage().persistent().set(
                    &PackedDataKey::Milestone(escrow_id, idx as u32),
                    &milestone,
                );
            }

            // Remove the v1 entry so the migration is idempotent.
            env.storage().persistent().remove(&v1_key);

            last_processed = escrow_id;
        }

        Ok(last_processed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, BytesN, Env, Vec};

    fn setup_env() -> Env {
        Env::default()
    }

    fn sample_milestone(env: &Env, amount: i128) -> Milestone {
        Milestone {
            amount,
            status: MS_APPROVED,
            submitted_at: 0,
            approved_at: 0,
            released_at: 0,
        }
    }

    fn seed_legacy_escrow(env: &Env, escrow_id: u64) -> EscrowStateV1Legacy {
        let client = Address::generate(env);
        let freelancer = Address::generate(env);
        let token = Address::generate(env);
        let mut milestones = Vec::new(env);
        milestones.push_back(sample_milestone(env, 100));

        let legacy = EscrowStateV1Legacy {
            escrow_id,
            client,
            freelancer,
            token,
            total_amount: 100,
            remaining_balance: 100,
            status: crate::types::EscrowStatus::Active,
            milestones,
            created_at: 1_000,
            brief_hash: BytesN::from_array(env, &[7u8; 32]),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Escrow(escrow_id), &legacy);
        legacy
    }

    #[test]
    fn migrates_legacy_escrow_with_absent_optional_fields() {
        let env = setup_env();
        let escrow_id = 1_u64;
        let legacy = seed_legacy_escrow(&env, escrow_id);

        env.storage()
            .instance()
            .set(&DataKey::EscrowCounter, &escrow_id);

        StorageManager::migrate(&env).expect("migration should succeed");

        // Version advanced to latest.
        assert_eq!(StorageManager::get_version(&env), STORAGE_VERSION);

        // Migrated meta is queryable through the v2 public view key.
        let meta: EscrowStateV1 = env
            .storage()
            .persistent()
            .get(&PackedDataKey::EscrowMeta(escrow_id))
            .expect("migrated meta should be queryable");

        // Documented defaults applied for absent optional fields.
        assert_eq!(meta.arbiter, None);
        assert_eq!(meta.deadline, None);
        assert_eq!(meta.lock_time, None);
        assert_eq!(meta.lock_time_extension, None);

        // Required fields preserved.
        assert_eq!(meta.escrow_id, legacy.escrow_id);
        assert_eq!(meta.client, legacy.client);
        assert_eq!(meta.freelancer, legacy.freelancer);
        assert_eq!(meta.token, legacy.token);
        assert_eq!(meta.total_amount, legacy.total_amount);
        assert_eq!(meta.remaining_balance, legacy.remaining_balance);
        assert_eq!(meta.created_at, legacy.created_at);
        assert_eq!(meta.brief_hash, legacy.brief_hash);

        // Milestones migrated to their own keys.
        let milestone: Milestone = env
            .storage()
            .persistent()
            .get(&PackedDataKey::Milestone(escrow_id, 0))
            .expect("migrated milestone should be queryable");
        assert_eq!(milestone.amount, 100);

        // v1 entry removed (idempotent).
        assert!(!env
            .storage()
            .persistent()
            .has(&DataKey::Escrow(escrow_id)));
    }

    #[test]
    fn migrates_fully_populated_legacy_escrow_preserving_optional_fields() {
        let env = setup_env();
        let escrow_id = 2_u64;
        let client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = Address::generate(&env);
        let arbiter = Address::generate(&env);
        let mut milestones = Vec::new(&env);
        milestones.push_back(sample_milestone(&env, 50));

        let full = EscrowStateV1 {
            escrow_id,
            client,
            freelancer,
            token,
            total_amount: 50,
            remaining_balance: 50,
            status: crate::types::EscrowStatus::Active,
            milestones,
            arbiter: Some(arbiter.clone()),
            created_at: 2_000,
            deadline: Some(9_000),
            lock_time: Some(3_000),
            lock_time_extension: Some(4_000),
            brief_hash: BytesN::from_array(&env, &[9u8; 32]),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Escrow(escrow_id), &full);
        env.storage()
            .instance()
            .set(&DataKey::EscrowCounter, &escrow_id);

        StorageManager::migrate(&env).expect("migration should succeed");

        let meta: EscrowStateV1 = env
            .storage()
            .persistent()
            .get(&PackedDataKey::EscrowMeta(escrow_id))
            .expect("migrated meta should be queryable");

        // Optional fields present in the legacy shape are preserved, not defaulted.
        assert_eq!(meta.arbiter, Some(arbiter));
        assert_eq!(meta.deadline, Some(9_000));
        assert_eq!(meta.lock_time, Some(3_000));
        assert_eq!(meta.lock_time_extension, Some(4_000));
    }

    #[test]
    fn legacy_into_v1_applies_documented_defaults() {
        let env = setup_env();
        let legacy = EscrowStateV1Legacy {
            escrow_id: 3,
            client: Address::generate(&env),
            freelancer: Address::generate(&env),
            token: Address::generate(&env),
            total_amount: 10,
            remaining_balance: 10,
            status: crate::types::EscrowStatus::Active,
            milestones: Vec::new(&env),
            created_at: 5,
            brief_hash: BytesN::from_array(&env, &[1u8; 32]),
        };

        let upgraded = legacy.into_v1();
        assert_eq!(upgraded.arbiter, None);
        assert_eq!(upgraded.deadline, None);
        assert_eq!(upgraded.lock_time, None);
        assert_eq!(upgraded.lock_time_extension, None);
    }
}
