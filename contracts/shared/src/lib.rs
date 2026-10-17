//! # Shared Constants — StellarTrustEscrow
//!
//! Common constants and configuration shared across all contracts in the
//! StellarTrustEscrow workspace.

#![no_std]
#![deny(warnings)]

use soroban_sdk::{Env, IntoVal, Val};

pub mod auth;

// ── TTL constants ─────────────────────────────────────────────────────────────

/// Bump instance storage TTL when remaining ledgers fall below this threshold.
pub const INSTANCE_TTL_THRESHOLD: u32 = 5_000;

/// Extend instance storage TTL to this value on bump.
pub const INSTANCE_TTL_EXTEND_TO: u32 = 50_000;

/// Bump persistent storage TTL when remaining ledgers fall below this threshold.
pub const PERSISTENT_TTL_THRESHOLD: u32 = 5_000;

/// Extend persistent storage TTL to this value on bump.
pub const PERSISTENT_TTL_EXTEND_TO: u32 = 50_000;

/// Maximum number of persistent entries renewed by one bounded maintenance operation.
pub const MAX_TTL_RENEWAL_WRITES: u32 = 1_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StorageTtlError {
    InvalidTtlRange,
    MissingPersistentKey,
    WriteBudgetExceeded,
}

pub fn validate_ttl_range(threshold: u32, extend_to: u32) -> Result<(), StorageTtlError> {
    if threshold == 0 || extend_to <= threshold {
        return Err(StorageTtlError::InvalidTtlRange);
    }
    Ok(())
}

pub fn ttl_renewal_write_count(entry_count: u32) -> Result<u32, StorageTtlError> {
    if entry_count > MAX_TTL_RENEWAL_WRITES {
        return Err(StorageTtlError::WriteBudgetExceeded);
    }
    Ok(entry_count)
}

/// Bump instance TTL using shared config constants.
#[inline]
pub fn bump_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}

/// Bump persistent TTL using shared config constants.
#[inline]
pub fn bump_persistent_ttl<K>(env: &Env, key: &K)
where
    K: IntoVal<Env, Val>,
{
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND_TO);
}

/// Renew a persistent key while mapping missing-key and configuration failures.
pub fn try_bump_persistent_ttl<K>(env: &Env, key: &K) -> Result<(), StorageTtlError>
where
    K: IntoVal<Env, Val>,
{
    validate_ttl_range(PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND_TO)?;
    if !env.storage().persistent().has(key) {
        return Err(StorageTtlError::MissingPersistentKey);
    }
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND_TO);
    Ok(())
}

// ── Escrow limits ─────────────────────────────────────────────────────────────

/// Maximum number of milestones per escrow.
pub const MAX_MILESTONES: u32 = 50;

/// Maximum number of buyer signers per escrow.
pub const MAX_BUYER_SIGNERS: u32 = 3;

/// Required approvals from buyer signers (2-of-N).
pub const REQUIRED_BUYER_APPROVALS: u32 = 2;

// ── Timing constants ──────────────────────────────────────────────────────────

/// Dispute window for cancellation requests (~6 days at 5 s/ledger).
pub const CANCELLATION_DISPUTE_PERIOD: u64 = 120_960;

/// Dispute window for slash records (~6 days).
pub const SLASH_DISPUTE_PERIOD: u64 = 51_840;

/// Slash penalty as a percentage of remaining balance.
pub const SLASH_PERCENTAGE: u64 = 10;

// ── Storage rent ──────────────────────────────────────────────────────────────

/// One rent period in seconds (1 day).
pub const RENT_PERIOD_SECONDS: u64 = 86_400;

/// Number of periods to reserve rent for upfront.
pub const RENT_RESERVE_PERIODS: u64 = 30;

/// Rent cost per storage entry per period (in token base units).
pub const RENT_PER_ENTRY_PER_PERIOD: i128 = 1;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ttl_configuration_rejects_invalid_ranges() {
        assert_eq!(
            validate_ttl_range(0, 10),
            Err(StorageTtlError::InvalidTtlRange)
        );
        assert_eq!(
            validate_ttl_range(10, 10),
            Err(StorageTtlError::InvalidTtlRange)
        );
        assert_eq!(validate_ttl_range(10, 11), Ok(()));
    }

    #[test]
    fn ttl_renewal_write_budget_is_linear_and_bounded() {
        assert_eq!(ttl_renewal_write_count(0), Ok(0));
        assert_eq!(ttl_renewal_write_count(500), Ok(500));
        assert_eq!(
            ttl_renewal_write_count(MAX_TTL_RENEWAL_WRITES),
            Ok(MAX_TTL_RENEWAL_WRITES)
        );
    }

    #[test]
    fn ttl_renewal_write_budget_rejects_growth_above_limit() {
        assert_eq!(
            ttl_renewal_write_count(MAX_TTL_RENEWAL_WRITES + 1),
            Err(StorageTtlError::WriteBudgetExceeded)
        );
    }
}
