//! # Terms Hash Binding and DEX Swap
//!
//! Handles off-chain terms acceptance and simulated DEX asset swaps.
//!
//! Closes #121, #123

#![allow(dead_code)]

use soroban_sdk::{Address, BytesN, Env};

use crate::{DataKey, DexConfig, DexSwapRecord, EscrowError, TermsAcceptance};

/// Validates a terms hash: rejects all-zero hashes.
pub fn validate_terms_hash(env: &Env, terms_hash: &BytesN<32>) -> Result<(), EscrowError> {
    if *terms_hash == BytesN::from_array(env, &[0u8; 32]) {
        return Err(EscrowError::TermsHashEmpty);
    }
    Ok(())
}

/// Records the client's acceptance of terms for an escrow.
pub fn record_terms_acceptance(
    env: &Env,
    escrow_id: u64,
    client: &Address,
    terms_hash: BytesN<32>,
) -> Result<(), EscrowError> {
    let key = DataKey::TermsAcceptance(escrow_id);
    let mut acceptance: TermsAcceptance = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or(TermsAcceptance {
            escrow_id,
            client: client.clone(),
            terms_hash,
            accepted: false,
            accepted_at: None,
        });
    if acceptance.accepted {
        return Err(EscrowError::ClientAlreadyAcceptedTerms);
    }
    acceptance.accepted = true;
    acceptance.accepted_at = Some(env.ledger().timestamp());
    env.storage().persistent().set(&key, &acceptance);
    Ok(())
}

/// Returns true if the client has accepted terms for this escrow.
pub fn check_terms_accepted(env: &Env, escrow_id: u64) -> Result<bool, EscrowError> {
    let acceptance = env
        .storage()
        .persistent()
        .get(&DataKey::TermsAcceptance(escrow_id))
        .ok_or(EscrowError::ClientHasNotAcceptedTerms)?;
    Ok(acceptance.accepted)
}

/// Stores the DEX configuration in instance storage. Admin only.
pub fn set_dex_config(env: &Env, config: &DexConfig) {
    env.storage().instance().set(&DataKey::DexConfig, config);
}

/// Retrieves the DEX configuration from instance storage.
pub fn get_dex_config(env: &Env) -> Result<DexConfig, EscrowError> {
    env.storage()
        .instance()
        .get(&DataKey::DexConfig)
        .ok_or(EscrowError::DexNotConfigured)
}

/// Records a DEX swap for an escrow.
pub fn record_dex_swap(env: &Env, record: &DexSwapRecord) {
    let key = DataKey::DexSwapRecord(record.escrow_id);
    env.storage().persistent().set(&key, record);
}

/// Loads a DEX swap record for an escrow.
pub fn load_dex_swap(env: &Env, escrow_id: u64) -> Option<DexSwapRecord> {
    env.storage()
        .persistent()
        .get(&DataKey::DexSwapRecord(escrow_id))
}
