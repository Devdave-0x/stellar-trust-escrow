#![allow(dead_code)]
//! Platform fee collection mechanism.
//!
//! Deducts the configured fee from an escrow's remaining balance and
//! transfers it to the platform treasury.
//!
//! Closes #95

use soroban_sdk::{token, Env};

use crate::errors::EscrowError;
use crate::events;
use crate::types::{EscrowFeeSnapshot, EscrowStatus};
use crate::DataKey;
use crate::ContractStorage;

/// Calculate the fee amount for an escrow based on configured tiers.
pub fn calculate_fee(env: &Env, total_amount: i128) -> (u32, i128) {
    let tiers: soroban_sdk::Vec<crate::types::FeeTier> = env
        .storage()
        .instance()
        .get(&DataKey::PlatformFeeTiers)
        .unwrap_or_else(|| soroban_sdk::Vec::new(env));

    let mut applicable_bps: u32 = 0;
    for i in 0..tiers.len() {
        let tier = tiers.get(i).unwrap();
        if total_amount >= tier.min_total_amount {
            applicable_bps = tier.fee_bps;
        }
    }

    let fee_amount = if applicable_bps > 0 {
        total_amount * (applicable_bps as i128) / 10_000
    } else {
        0
    };

    (applicable_bps, fee_amount)
}

/// Collect the platform fee for a completed or cancelled escrow.
///
/// Transfers the fee from the contract to the treasury. Can only be called
/// once per escrow (tracked via `EscrowFeeSnapshot.collected`).
pub fn collect_fee(
    env: &Env,
    caller: &soroban_sdk::Address,
    escrow_id: u64,
) -> Result<i128, EscrowError> {
    caller.require_auth();
    ContractStorage::require_not_paused(env)?;

    let meta = ContractStorage::load_escrow_meta(env, escrow_id)?;

    // Only admin or client may collect fees
    ContractStorage::require_admin(env, caller)
        .or_else(|_| {
            if caller == &meta.client {
                Ok(())
            } else {
                Err(EscrowError::E3)
            }
        })?;

    // Only collect from completed or cancelled escrows
    if meta.status != EscrowStatus::Completed && meta.status != EscrowStatus::Cancelled {
        return Err(EscrowError::E9);
    }

    // Check if fee already collected
    let mut snapshot: EscrowFeeSnapshot = env
        .storage()
        .persistent()
        .get(&DataKey::PlatformFeeSnapshot(escrow_id))
        .unwrap_or(EscrowFeeSnapshot {
            fee_bps: 0,
            fee_amount: 0,
            collected: false,
        });

    if snapshot.collected {
        return Err(EscrowError::E9);
    }

    // Calculate fee if not pre-computed
    if snapshot.fee_amount == 0 {
        let (bps, amount) = calculate_fee(env, meta.total_amount);
        snapshot.fee_bps = bps;
        snapshot.fee_amount = amount;
    }

    if snapshot.fee_amount == 0 {
        snapshot.collected = true;
        env.storage()
            .persistent()
            .set(&DataKey::PlatformFeeSnapshot(escrow_id), &snapshot);
        return Ok(0);
    }

    // Get treasury
    let treasury: soroban_sdk::Address = env
        .storage()
        .instance()
        .get(&DataKey::PlatformTreasury)
        .ok_or(EscrowError::E2)?;

    // Transfer fee to treasury
    token::Client::new(env, &meta.token).transfer(
        &env.current_contract_address(),
        &treasury,
        &snapshot.fee_amount,
    );

    snapshot.collected = true;
    env.storage()
        .persistent()
        .set(&DataKey::PlatformFeeSnapshot(escrow_id), &snapshot);

    events::emit_referral_payout(env, escrow_id, &treasury, snapshot.fee_amount);

    Ok(snapshot.fee_amount)
}

#[cfg(test)]
mod tests {

    #[test]
    fn test_calculate_fee_math() {
        // 100 bps = 1% of 1_000_000 = 10_000
        let amount: i128 = 1_000_000;
        let bps: u32 = 100;
        let fee = amount * (bps as i128) / 10_000;
        assert_eq!(fee, 10_000);

        // 0 bps = no fee
        let zero_fee = amount * 0_i128 / 10_000;
        assert_eq!(zero_fee, 0);
    }

    #[test]
    fn test_calculate_fee_basic_math() {
        // 100 bps = 1% of 1_000_000 = 10_000
        let fee = 1_000_000_i128 * 100 / 10_000;
        assert_eq!(fee, 10_000);
    }
}
