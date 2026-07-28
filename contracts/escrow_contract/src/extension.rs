#![allow(dead_code)]
//! Escrow extension by mutual consent.
//!
//! Allows the client and freelancer to jointly extend the escrow deadline.
//! Both parties must call `consent_extend` before the extension takes effect.
//!
//! Closes #96

use soroban_sdk::{contracttype, Env, Address};

use crate::errors::EscrowError;
use crate::events;
use crate::types::EscrowStatus;
use crate::ContractStorage;

/// Storage key for pending extension requests.
#[contracttype]
pub enum ExtensionKey {
    /// Pending extension for escrow_id — value: ExtensionRequest
    Pending(u64),
}

/// A pending deadline extension request.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ExtensionRequest {
    /// The proposed new deadline.
    pub new_deadline: u64,
    /// Whether the client has consented.
    pub client_consented: bool,
    /// Whether the freelancer has consented.
    pub freelancer_consented: bool,
    /// When the request was created.
    pub requested_at: u64,
}

/// Request or consent to a deadline extension.
///
/// Either the client or freelancer may initiate. Once both have consented
/// to the same `new_deadline`, the escrow deadline is updated.
/// Returns `true` when the extension was applied (both consented).
pub fn consent_extend(
    env: &Env,
    caller: &Address,
    escrow_id: u64,
    new_deadline: u64,
) -> Result<bool, EscrowError> {
    caller.require_auth();
    ContractStorage::require_not_paused(env)?;
    ContractStorage::require_not_frozen(env, escrow_id)?;

    let mut meta = ContractStorage::load_escrow_meta(env, escrow_id)?;
    if meta.status != EscrowStatus::Active {
        return Err(EscrowError::E9);
    }

    // Only client or freelancer may consent
    let is_client = caller == &meta.client;
    let is_freelancer = caller == &meta.freelancer;
    if !is_client && !is_freelancer {
        return Err(EscrowError::E3);
    }

    // New deadline must be in the future
    let now = env.ledger().timestamp();
    if new_deadline <= now {
        return Err(EscrowError::E3);
    }

    // New deadline must be later than current deadline (if set)
    if let Some(current) = meta.deadline {
        if new_deadline <= current {
            return Err(EscrowError::E3);
        }
    }

    let key = ExtensionKey::Pending(escrow_id);
    let mut request: ExtensionRequest = env
        .storage()
        .temporary()
        .get(&key)
        .unwrap_or(ExtensionRequest {
            new_deadline,
            client_consented: false,
            freelancer_consented: false,
            requested_at: now,
        });

    // If the proposed deadline differs, reset consents
    if request.new_deadline != new_deadline {
        request = ExtensionRequest {
            new_deadline,
            client_consented: false,
            freelancer_consented: false,
            requested_at: now,
        };
    }

    if is_client {
        request.client_consented = true;
    }
    if is_freelancer {
        request.freelancer_consented = true;
    }

    if request.client_consented && request.freelancer_consented {
        // Both consented — apply the extension
        let old_deadline = meta.deadline.unwrap_or(0);
        meta.deadline = Some(new_deadline);
        ContractStorage::save_escrow_meta(env, &meta);
        env.storage().temporary().remove(&key);
        events::emit_deadline_extended(env, escrow_id, old_deadline, new_deadline);
        Ok(true)
    } else {
        // Save pending request, wait for other party
        env.storage().temporary().set(&key, &request);
        Ok(false)
    }
}

/// Get the pending extension request for an escrow, if any.
pub fn get_pending_extension(env: &Env, escrow_id: u64) -> Option<ExtensionRequest> {
    let key = ExtensionKey::Pending(escrow_id);
    env.storage().temporary().get(&key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extension_request_struct() {
        let req = ExtensionRequest {
            new_deadline: 1000,
            client_consented: true,
            freelancer_consented: false,
            requested_at: 500,
        };
        assert!(req.client_consented);
        assert!(!req.freelancer_consented);
        assert_eq!(req.new_deadline, 1000);
    }
}
