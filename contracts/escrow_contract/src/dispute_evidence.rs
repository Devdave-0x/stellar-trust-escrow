use soroban_sdk::{Address, BytesN, Env, String, Vec};

use crate::errors::EscrowError;
use crate::types::{DataKey, DisputeEvidence, EscrowStatus};
use crate::ContractStorage;
use crate::MAX_STRING_LEN;

pub fn add_evidence(
    env: Env,
    caller: Address,
    escrow_id: u64,
    evidence_hash: BytesN<32>,
    description: String,
) -> Result<u32, EscrowError> {
    caller.require_auth();
    ContractStorage::require_not_paused(&env)?;

    let meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;

    if meta.status != EscrowStatus::Disputed {
        return Err(EscrowError::E82);
    }

    if caller != meta.client && caller != meta.freelancer {
        return Err(EscrowError::E83);
    }

    let zero_hash = BytesN::from_array(&env, &[0u8; 32]);
    if evidence_hash == zero_hash {
        return Err(EscrowError::E80);
    }

    let desc_len = description.len();
    if desc_len == 0 {
        return Err(EscrowError::E80);
    }
    if desc_len > MAX_STRING_LEN as usize {
        return Err(EscrowError::E81);
    }

    let mut evidences: Vec<DisputeEvidence> = env
        .storage()
        .persistent()
        .get(&DataKey::DisputeEvidences(escrow_id))
        .unwrap_or_else(|| Vec::new(&env));

    let evidence = DisputeEvidence {
        escrow_id,
        submitted_by: caller.clone(),
        evidence_hash,
        submitted_at: env.ledger().timestamp(),
        description,
    };

    evidences.push_back(evidence);
    env.storage()
        .persistent()
        .set(&DataKey::DisputeEvidences(escrow_id), &evidences);
    ContractStorage::bump_persistent_ttl(&env, &DataKey::DisputeEvidences(escrow_id));

    Ok(evidences.len())
}

pub fn get_evidence(env: Env, escrow_id: u64) -> Result<Vec<DisputeEvidence>, EscrowError> {
    ContractStorage::require_initialized(&env)?;

    let evidences: Vec<DisputeEvidence> = env
        .storage()
        .persistent()
        .get(&DataKey::DisputeEvidences(escrow_id))
        .unwrap_or_else(|| Vec::new(&env));

    Ok(evidences)
}
