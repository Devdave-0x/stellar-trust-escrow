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
            // In v2, we use PackedDataKey::EscrowMeta(id) and PackedDataKey::Milestone(id, milestone_id)
            let v1_key = DataKey::Escrow(escrow_id);

            // Check if this escrow exists in v1 format. If the v1 entry is
            // already gone, it was migrated by a previous (possibly partial)
            // batch, so skip it to avoid double migration.
            if let Some(v1_escrow) = env
                .storage()
                .persistent()
                .get::<DataKey, EscrowStateV1>(&v1_key)
            {
                // Count approved milestones
                let approved_count = v1_escrow
                    .milestones
                    .iter()
                    .filter(|m| m.status == MS_APPROVED)
                    .count() as u32;
                let released_count = v1_escrow
                    .milestones
                    .iter()
                    .filter(|m| m.status == MS_RELEASED)
                    .count() as u32;
                let submitted_count = v1_escrow
                    .milestones
                    .iter()
                    .filter(|m| m.status == MS_SUBMITTED)
                    .count() as u32;

                // Create EscrowMeta from v1 data
                let meta = crate::EscrowMeta {
                    escrow_id: v1_escrow.escrow_id,
                    client: v1_escrow.client,
                    freelancer: v1_escrow.freelancer,
