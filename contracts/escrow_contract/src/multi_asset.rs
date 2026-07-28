#![allow(dead_code)]
//! Multi-asset escrow support beyond XLM.
//!
//! Extends the escrow contract to handle multiple token types in a single
//! escrow agreement via `AssetAllocation` entries.
//!
//! Closes #101

use soroban_sdk::{contracttype, token, Address, Env, Vec};

use crate::errors::EscrowError;
use crate::events;
use crate::ContractStorage;
use crate::types::DataKey;
use crate::validation;

/// A single asset allocation within a multi-asset escrow.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssetAllocation {
    /// Token contract address (SAC or custom token).
    pub token: Address,
    /// Amount of this token locked in the escrow.
    pub amount: i128,
    /// Amount already released to the freelancer.
    pub released: i128,
}

/// Storage key for multi-asset allocations on an escrow.
#[contracttype]
pub enum MultiAssetKey {
    /// Asset allocations for escrow_id — value: Vec<AssetAllocation>
    Allocations(u64),
}

/// Deposit an additional token type into an existing escrow.
///
/// The caller must be the client of the escrow, and the escrow must be Active.
/// Each call adds a new `AssetAllocation` entry. The same token can be deposited
/// multiple times (amounts stack).
pub fn deposit_asset(
    env: &Env,
    caller: &Address,
    escrow_id: u64,
    token_addr: &Address,
    amount: i128,
) -> Result<(), EscrowError> {
    caller.require_auth();
    ContractStorage::require_not_paused(env)?;
    ContractStorage::require_not_frozen(env, escrow_id)?;
    validation::validate_amount(amount)?;

    let meta = ContractStorage::load_escrow_meta(env, escrow_id)?;
    if caller != &meta.client {
        return Err(EscrowError::E5);
    }
    if meta.status != crate::types::EscrowStatus::Active {
        return Err(EscrowError::E9);
    }

    // Check token whitelist if enabled
    if ContractStorage::is_token_whitelist_enabled(env)
        && !ContractStorage::is_token_approved(env, token_addr)
    {
        return Err(EscrowError::TokenNotApproved);
    }

    // Transfer tokens into the contract
    token::Client::new(env, token_addr).transfer(
        caller,
        &env.current_contract_address(),
        &amount,
    );

    // Load or create the allocation list
    let key = MultiAssetKey::Allocations(escrow_id);
    let mut allocations: Vec<AssetAllocation> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env));

    // Check if this token is already in the list and stack amounts
    let mut found = false;
    for i in 0..allocations.len() {
        let mut alloc = allocations.get(i).unwrap();
        if alloc.token == *token_addr {
            alloc.amount = alloc.amount.checked_add(amount).ok_or(EscrowError::E20)?;
            allocations.set(i, alloc);
            found = true;
            break;
        }
    }
    if !found {
        allocations.push_back(AssetAllocation {
            token: token_addr.clone(),
            amount,
            released: 0,
        });
    }

    env.storage().persistent().set(&key, &allocations);
    events::emit_multi_asset_deposited(env, escrow_id, token_addr, amount);
    Ok(())
}

/// Release a specific asset allocation to the freelancer.
///
/// Only the client or admin may call this. The specified amount is transferred
/// from the contract to the freelancer.
pub fn release_asset(
    env: &Env,
    caller: &Address,
    escrow_id: u64,
    token_addr: &Address,
    amount: i128,
) -> Result<(), EscrowError> {
    caller.require_auth();
    ContractStorage::require_not_paused(env)?;
    ContractStorage::require_not_frozen(env, escrow_id)?;
    validation::validate_amount(amount)?;

    let meta = ContractStorage::load_escrow_meta(env, escrow_id)?;
    // Only client or admin may release
    let admin: Option<Address> = env.storage().instance().get(&DataKey::Admin);
    if caller != &meta.client && Some(caller.clone()) != admin {
        return Err(EscrowError::E5);
    }

    let key = MultiAssetKey::Allocations(escrow_id);
    let mut allocations: Vec<AssetAllocation> = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(EscrowError::E8)?;

    let mut released = false;
    for i in 0..allocations.len() {
        let mut alloc = allocations.get(i).unwrap();
        if alloc.token == *token_addr {
            let available = alloc.amount.checked_sub(alloc.released).ok_or(EscrowError::E20)?;
            if amount > available {
                return Err(EscrowError::InsufficientAssetBalance);
            }
            // Transfer to freelancer
            token::Client::new(env, token_addr).transfer(
                &env.current_contract_address(),
                &meta.freelancer,
                &amount,
            );
            alloc.released = alloc.released.checked_add(amount).ok_or(EscrowError::E20)?;
            allocations.set(i, alloc);
            released = true;
            break;
        }
    }
    if !released {
        return Err(EscrowError::E8);
    }

    env.storage().persistent().set(&key, &allocations);
    events::emit_multi_asset_released(env, escrow_id, token_addr, amount);
    Ok(())
}

/// Get all asset allocations for an escrow.
pub fn get_asset_allocations(env: &Env, escrow_id: u64) -> Vec<AssetAllocation> {
    let key = MultiAssetKey::Allocations(escrow_id);
    env.storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_asset_allocation_struct() {
        let env = Env::default();
        use soroban_sdk::testutils::Address as _;
        let addr = Address::generate(&env);
        let alloc = AssetAllocation {
            token: addr.clone(),
            amount: 1000,
            released: 0,
        };
        assert_eq!(alloc.amount, 1000);
        assert_eq!(alloc.released, 0);
        assert_eq!(alloc.token, addr);
    }
}
