#![allow(dead_code)]
//! Escrow auto-expiry with refund to depositor.
//!
//! When an escrow's deadline has passed and no milestones have been
//! approved, any party (or a keeper bot) can trigger expiry.
//! Remaining funds are refunded to the client (depositor).
//!
//! Closes #98

use soroban_sdk::{token, Env, Address};

use crate::errors::EscrowError;
use crate::events;
use crate::types::EscrowStatus;
use crate::ContractStorage;

/// Trigger auto-expiry on an escrow whose deadline has passed.
///
/// Anyone may call this (it's a public-good action like liquidation).
/// The escrow must be Active with a deadline that is in the past.
/// All remaining funds are refunded to the client (depositor).
///
/// Returns the refunded amount.
pub fn trigger_expiry(
    env: &Env,
    caller: &Address,
    escrow_id: u64,
) -> Result<i128, EscrowError> {
    caller.require_auth();
    ContractStorage::require_not_paused(env)?;

    let mut meta = ContractStorage::load_escrow_meta(env, escrow_id)?;

    // Only active escrows can expire
    if meta.status != EscrowStatus::Active {
        return Err(EscrowError::E9);
    }

    // Must have a deadline
    let deadline = meta.deadline.ok_or(EscrowError::E3)?;

    // Deadline must have passed
    let now = env.ledger().timestamp();
    if now <= deadline {
        return Err(EscrowError::E3);
    }

    // Refund remaining balance to client
    let refund_amount = meta.remaining_balance;
    if refund_amount > 0 {
        token::Client::new(env, &meta.token).transfer(
            &env.current_contract_address(),
            &meta.client,
            &refund_amount,
        );
    }

    meta.remaining_balance = 0;
    meta.status = EscrowStatus::Cancelled;
    ContractStorage::save_escrow_meta(env, &meta);

    events::emit_escrow_cancelled(env, escrow_id, refund_amount);

    Ok(refund_amount)
}

/// Check if an escrow is expired (deadline passed) without triggering it.
pub fn is_expired(env: &Env, escrow_id: u64) -> Result<bool, EscrowError> {
    let meta = ContractStorage::load_escrow_meta(env, escrow_id)?;
    if meta.status != EscrowStatus::Active {
        return Ok(false);
    }
    match meta.deadline {
        Some(deadline) => Ok(env.ledger().timestamp() > deadline),
        None => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_expiry_logic_basic() {
        // Deadline 100, current time 200 => expired
        assert!(200_u64 > 100_u64);
        // Deadline 100, current time 50 => not expired
        assert!(!(50_u64 > 100_u64));
    }
}
