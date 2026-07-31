use soroban_sdk::{Address, Env};

use crate::errors::EscrowError;
use crate::types::DataKey;
use crate::ContractStorage;

pub fn add_to_arbiter_allowlist(
    env: Env,
    caller: Address,
    arbiter: Address,
) -> Result<(), EscrowError> {
    caller.require_auth();
    ContractStorage::require_admin(&env, &caller)?;

    let key = DataKey::ArbiterAllowlist(arbiter.clone());
    if env.storage().persistent().has(&key) {
        return Err(EscrowError::E91);
    }

    env.storage().persistent().set(&key, &true);
    ContractStorage::bump_persistent_ttl(&env, &key);
    Ok(())
}

pub fn remove_from_arbiter_allowlist(
    env: Env,
    caller: Address,
    arbiter: Address,
) -> Result<(), EscrowError> {
    caller.require_auth();
    ContractStorage::require_admin(&env, &caller)?;

    let key = DataKey::ArbiterAllowlist(arbiter.clone());
    if !env.storage().persistent().has(&key) {
        return Err(EscrowError::E92);
    }

    env.storage().persistent().remove(&key);
    Ok(())
}

pub fn is_arbiter_allowed(env: Env, arbiter: Address) -> bool {
    env.storage()
        .persistent()
        .get::<DataKey, bool>(&DataKey::ArbiterAllowlist(arbiter))
        .unwrap_or(false)
}
