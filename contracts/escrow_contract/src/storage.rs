//! # On-Chain Persistent Storage Layer
//!
//! Typed, panic-free helpers for every [`DataKey`] used by the escrow contract.
//!
//! ## Design decisions
//!
//! * **Persistent storage, not instance storage.** Every protocol key lives in
//!   `env.storage().persistent()` so it survives contract-instance TTL recycling.
//!   Instance storage is reserved for the upgrade/version metadata touched by
//!   [`StorageManager`].
//! * **TTL is bumped on *every* read, not just writes.** Soroban evicts
//!   persistent entries once their live-until ledger lapses. A key that is read
//!   often but never written would eventually be evicted; bumping the TTL on
//!   each `get_*` keeps hot keys (treasury, fee bps, arbiter registry, escrow
//!   rows) alive without requiring the caller to remember to re-`set` them.
//! * **No `.unwrap()` / `.expect()`.** Absent keys return `Option<T>`; callers
//!   decide how to handle a missing value. This is load-bearing for safety: a
//!   saturated storage or an out-of-order upgrade must never panic the contract.
//! * **Single source of truth for TTL constants.** `LEDGER_THRESHOLD` /
//!   `LEDGER_TO_LIVE` are shared by every helper so the rent policy is uniform.

#![allow(dead_code)]

use soroban_sdk::{contracttype, Address, Env, Vec};

use crate::errors::EscrowError;
use crate::types::{EscrowState, Milestone};

/// Minimum remaining TTL (in ledgers) before a key is considered "stale" and
/// gets extended. Read/extend operations that find a key with at least this
/// many ledgers of life left are no-ops on the TTL.
pub const LEDGER_THRESHOLD: u32 = 100;

/// How far into the future (in ledgers) a key's live-until is pushed on every
/// touch. At ~5s/ledger, 535_000 ledgers ≈ 31 days of TTL headroom on every
/// touched key — comfortably past the longest realistic read gap so hot keys
/// (treasury, fee bps, arbiter registry, escrow rows) are never evicted between
/// touches without a manual rent transaction.
pub const LEDGER_TO_LIVE: u32 = 535_000;

/// Every persistent protocol key. Deriving [`contracttype`] gives the enum a
/// stable, host-serialisable layout so keys can be compared and stored
/// efficiently on-chain.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Single admin address (instance storage is used for the multisig variant).
    Admin,
    /// Monotonically increasing escrow id counter.
    EscrowCounter,
    /// Configured maximum number of milestones per escrow.
    MaxMilestones,
    /// Global pause flag.
    Paused,
    /// Full escrow state for a given escrow id.
    Escrow(u64),
    /// A single milestone within an escrow.
    Milestone(u64, u32),
    /// Number of milestones defined for an escrow (mirrors the Milestone list).
    MilestoneCount(u64),
    /// Registered arbiter address set.
    ArbiterRegistry,
    /// Platform fee in basis points.
    PlatformFeeBps,
    /// Platform treasury address that receives fees.
    Treasury,
}

// ─── Generic primitives ─────────────────────────────────────────────────────
// Small internal helpers so each public accessor stays a one-liner and the TTL
// policy is enforced in exactly one place.

fn get_persistent<K, V>(env: &Env, key: &K) -> Option<V>
where
    K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>,
    V: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>,
{
    let storage = env.storage().persistent();
    let value: Option<V> = storage.get(key);
    if value.is_some() {
        // Bump TTL on read — keeps frequently-read keys from being evicted.
        storage.extend_ttl(key, LEDGER_THRESHOLD, LEDGER_TO_LIVE);
    }
    value
}

fn set_persistent<K, V>(env: &Env, key: &K, value: &V)
where
    K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>,
    V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>,
{
    let storage = env.storage().persistent();
    storage.set(key, value);
    storage.extend_ttl(key, LEDGER_THRESHOLD, LEDGER_TO_LIVE);
}

// ─── Admin ───────────────────────────────────────────────────────────────────

/// Returns the admin address, if initialised.
pub fn get_admin(env: &Env) -> Option<Address> {
    get_persistent(env, &DataKey::Admin)
}

/// Persists the admin address and refreshes its TTL.
pub fn set_admin(env: &Env, admin: &Address) {
    set_persistent(env, &DataKey::Admin, admin);
}

// ─── Escrow counter ──────────────────────────────────────────────────────────

/// Returns the current escrow id counter (defaults to `0` when unset).
pub fn get_escrow_counter(env: &Env) -> Option<u64> {
    get_persistent(env, &DataKey::EscrowCounter)
}

/// Persists the escrow id counter and refreshes its TTL.
pub fn set_escrow_counter(env: &Env, counter: &u64) {
    set_persistent(env, &DataKey::EscrowCounter, counter);
}

// ─── Max milestones ──────────────────────────────────────────────────────────

/// Returns the configured maximum number of milestones per escrow.
pub fn get_max_milestones(env: &Env) -> Option<u32> {
    get_persistent(env, &DataKey::MaxMilestones)
}

/// Persists the maximum milestone count and refreshes its TTL.
pub fn set_max_milestones(env: &Env, max: &u32) {
    set_persistent(env, &DataKey::MaxMilestones, max);
}

// ─── Pause flag ──────────────────────────────────────────────────────────────

/// Returns the global pause flag, if set.
pub fn get_paused(env: &Env) -> Option<bool> {
    get_persistent(env, &DataKey::Paused)
}

/// Persists the global pause flag and refreshes its TTL.
pub fn set_paused(env: &Env, paused: &bool) {
    set_persistent(env, &DataKey::Paused, paused);
}

// ─── Arbiter registry ─────────────────────────────────────────────────────────

/// Returns the registered arbiter address set, if initialised.
pub fn get_arbiter_registry(env: &Env) -> Option<Vec<Address>> {
    get_persistent(env, &DataKey::ArbiterRegistry)
}

/// Persists the arbiter registry and refreshes its TTL.
pub fn set_arbiter_registry(env: &Env, registry: &Vec<Address>) {
    set_persistent(env, &DataKey::ArbiterRegistry, registry);
}

// ─── Platform fee ─────────────────────────────────────────────────────────────

/// Returns the platform fee in basis points, if set.
pub fn get_platform_fee_bps(env: &Env) -> Option<u32> {
    get_persistent(env, &DataKey::PlatformFeeBps)
}

/// Persists the platform fee (in basis points) and refreshes its TTL.
pub fn set_platform_fee_bps(env: &Env, bps: &u32) {
    set_persistent(env, &DataKey::PlatformFeeBps, bps);
}

// ─── Treasury ─────────────────────────────────────────────────────────────────

/// Returns the platform treasury address, if configured.
pub fn get_treasury(env: &Env) -> Option<Address> {
    get_persistent(env, &DataKey::Treasury)
}

/// Persists the platform treasury address and refreshes its TTL.
pub fn set_treasury(env: &Env, treasury: &Address) {
    set_persistent(env, &DataKey::Treasury, treasury);
}

// ─── Escrow state ─────────────────────────────────────────────────────────────

/// Returns the full escrow state for `escrow_id`, if it exists.
pub fn get_escrow(env: &Env, escrow_id: u64) -> Option<EscrowState> {
    get_persistent(env, &DataKey::Escrow(escrow_id))
}

/// Persists the escrow state and refreshes its TTL.
pub fn set_escrow(env: &Env, escrow_id: u64, escrow: &EscrowState) {
    set_persistent(env, &DataKey::Escrow(escrow_id), escrow);
}

// ─── Milestones ───────────────────────────────────────────────────────────────

/// Returns a single milestone, if it exists.
pub fn get_milestone(env: &Env, escrow_id: u64, index: u32) -> Option<Milestone> {
    get_persistent(env, &DataKey::Milestone(escrow_id, index))
}

/// Persists a single milestone and refreshes its TTL.
pub fn set_milestone(env: &Env, escrow_id: u64, index: u32, milestone: &Milestone) {
    set_persistent(env, &DataKey::Milestone(escrow_id, index), milestone);
}

/// Returns the number of milestones defined for an escrow, if tracked.
pub fn get_milestone_count(env: &Env, escrow_id: u64) -> Option<u32> {
    get_persistent(env, &DataKey::MilestoneCount(escrow_id))
}

/// Persists the milestone count and refreshes its TTL.
pub fn set_milestone_count(env: &Env, escrow_id: u64, count: &u32) {
    set_persistent(env, &DataKey::MilestoneCount(escrow_id), count);
}

// ─── TTL management ───────────────────────────────────────────────────────────

/// Extends the TTL of every persistent key belonging to `escrow_id`.
///
/// Covers the escrow row itself, its milestone-count key, and each milestone
/// index up to the currently tracked count (read defensively so a partially
/// initialised escrow never panics). This is the single call the indexer and
/// long-lived read paths use to keep an escrow's storage alive across the
/// archival window without a separate rent transaction.
pub fn bump_escrow_ttl(env: &Env, escrow_id: u64) {
    let storage = env.storage().persistent();

    let escrow_key = DataKey::Escrow(escrow_id);
    if storage.has(&escrow_key) {
        storage.extend_ttl(&escrow_key, LEDGER_THRESHOLD, LEDGER_TO_LIVE);
    }

    let count_key = DataKey::MilestoneCount(escrow_id);
    let count: Option<u32> = storage.get(&count_key);
    if let Some(count) = count {
        storage.extend_ttl(&count_key, LEDGER_THRESHOLD, LEDGER_TO_LIVE);
        for index in 0..count {
            let milestone_key = DataKey::Milestone(escrow_id, index);
            if storage.has(&milestone_key) {
                storage.extend_ttl(&milestone_key, LEDGER_THRESHOLD, LEDGER_TO_LIVE);
            }
        }
    }
}

// ─── StorageManager (legacy bridge) ───────────────────────────────────────────
// `lib.rs` still calls `StorageManager::init_version` during contract init and
// `StorageManager::migrate` during upgrades. These are thin, panic-free shims
// that keep those call sites compiling; the typed helpers above are the
// preferred API for new code.

/// Upgradeable-storage lifecycle helpers.
pub struct StorageManager;

impl StorageManager {
    /// Marks the contract instance as live for a full archival window so a
    /// freshly deployed or upgraded contract is never evicted before its first
    /// interaction.
    pub fn init_version(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(LEDGER_THRESHOLD, LEDGER_TO_LIVE);
    }

    /// Runs storage migrations for the current version. This version performs no
    /// transformation, but the signature is retained so future migrations can
    /// rewrite persistent keys without changing call sites in `lib.rs`.
    pub fn migrate(_env: &Env) -> Result<(), EscrowError> {
        Ok(())
    }
}
