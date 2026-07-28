//! # Pending Milestone Count
//!
//! Tracks how many milestones in a given escrow are still awaiting client
//! approval (i.e. have not yet been approved or rejected).
//!
//! The counter is incremented every time a new milestone is created and
//! decremented when the client either approves or rejects that milestone.
//! Dashboards can read a single `u32` value instead of loading and scanning
//! every milestone individually.

use soroban_sdk::Env;

use crate::DataKey;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

fn key(escrow_id: u64) -> DataKey {
    DataKey::PendingMilestoneCount(escrow_id)
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/// Returns the current pending-approval count for `escrow_id`.
/// Returns `0` if no counter entry exists yet (new escrow with no milestones).
pub(crate) fn get(env: &Env, escrow_id: u64) -> u32 {
    env.storage()
        .persistent()
        .get::<DataKey, u32>(&key(escrow_id))
        .unwrap_or(0u32)
}

/// Increments the counter for `escrow_id` by one.
///
/// Call this immediately after a milestone is created with `MS_PENDING` status.
/// Uses saturating arithmetic to avoid a panic on overflow (which would require
/// creating more than `u32::MAX` milestones, a practical impossibility).
pub(crate) fn increment(env: &Env, escrow_id: u64) {
    let k = key(escrow_id);
    let count: u32 = env
        .storage()
        .persistent()
        .get::<DataKey, u32>(&k)
        .unwrap_or(0u32);
    env.storage()
        .persistent()
        .set(&k, &count.saturating_add(1));
    crate::ContractStorage::bump_persistent_ttl(env, &k);
}

/// Decrements the counter for `escrow_id` by one.
///
/// Call this when a milestone is approved or rejected.
/// Uses saturating subtraction — the count can never go below `0`.
pub(crate) fn decrement(env: &Env, escrow_id: u64) {
    let k = key(escrow_id);
    let count: u32 = env
        .storage()
        .persistent()
        .get::<DataKey, u32>(&k)
        .unwrap_or(0u32);
    env.storage()
        .persistent()
        .set(&k, &count.saturating_sub(1));
    crate::ContractStorage::bump_persistent_ttl(env, &k);
}
