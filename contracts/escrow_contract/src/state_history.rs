use soroban_sdk::{Address, Env, Vec};

use crate::errors::EscrowError;
use crate::storage::ContractStorage;
use crate::types::{DataKey, EscrowStatus, StateHistoryEntry};

pub fn record_state_change(
    env: &Env,
    escrow_id: u64,
    from_status: EscrowStatus,
    to_status: EscrowStatus,
    caller: &Address,
) {
    let key = DataKey::StateHistory(escrow_id);
    let now = env.ledger().timestamp();
    let entry = StateHistoryEntry {
        escrow_id,
        from_status,
        to_status,
        timestamp: now,
        caller: caller.clone(),
    };
    let mut history: Vec<StateHistoryEntry> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(Vec::new);
    history.push_back(entry);
    env.storage().persistent().set(&key, &history);
    ContractStorage::bump_persistent_ttl(env, &key);
}

pub fn get_state_history(env: &Env, escrow_id: u64) -> Vec<StateHistoryEntry> {
    let key = DataKey::StateHistory(escrow_id);
    match env.storage().persistent().get(&key) {
        Some(history) => {
            ContractStorage::bump_persistent_ttl(env, &key);
            history
        }
        None => Vec::new(env),
    }
}