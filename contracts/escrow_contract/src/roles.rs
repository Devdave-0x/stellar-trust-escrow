//! # Role-Based Access Control
//!
//! Formal role definitions and guard functions for the escrow contract.
//! Every entry point should call exactly one of the `require_*` guards as its
//! first authorization statement before touching storage.
//!
//! ## Role Matrix
//!
//! | Operation                  | Admin | Arbiter | Participant      |
//! |----------------------------|-------|---------|-----------------|
//! | initialize / pause         |   ✓   |         |                 |
//! | set_fee_tiers / freeze     |   ✓   |         |                 |
//! | propose / accept admin     |   ✓   |         |                 |
//! | create_escrow              |       |         | ✓ (client)      |
//! | add_milestone              |       |         | ✓ (client)      |
//! | submit_milestone           |       |         | ✓ (freelancer)  |
//! | approve_milestone          |       |         | ✓ (client)      |
//! | release_funds (post-lock)  | ✓     |         | ✓ (client)      |
//! | raise_dispute              |       |         | ✓               |
//! | resolve_dispute            | ✓     | ✓       |                 |
//! | submit_ruling              |       | ✓       |                 |
//! | expire_escrow              | any   | any     | any             |
//! | cancel_escrow              |       |         | ✓ (client)      |

#![allow(dead_code)]

use soroban_sdk::{Address, Env};

use crate::{DataKey, EscrowError, EscrowMeta};

/// Returns `true` if `addr` is the current contract admin.
pub fn is_admin(env: &Env, addr: &Address) -> bool {
    env.storage()
        .instance()
        .get::<DataKey, Address>(&DataKey::Admin)
        .map(|a| a == *addr)
        .unwrap_or(false)
}

/// Returns `true` if `addr` is the arbiter assigned to this escrow.
///
/// Only checks the escrow's arbiter field. For the admin-managed allowlist
/// guard used during arbiter assignment, see `DataKey::ApprovedArbiter`.
pub fn is_arbiter(_env: &Env, addr: &Address, meta: &EscrowMeta) -> bool {
    meta.arbiter.as_ref().is_some_and(|a| a == addr)
}

/// Returns `true` if `addr` is a participant (client or freelancer) of this escrow.
pub fn is_participant(_env: &Env, addr: &Address, meta: &EscrowMeta) -> bool {
    *addr == meta.client || *addr == meta.freelancer
}

/// Returns `Err(EscrowError::E4)` if `addr` is not the contract admin.
pub fn require_admin(env: &Env, addr: &Address) -> Result<(), EscrowError> {
    if !is_admin(env, addr) {
        return Err(EscrowError::E4);
    }
    Ok(())
}

/// Returns `Err(EscrowError::E3)` if `addr` is not the assigned arbiter for this escrow.
pub fn require_arbiter(env: &Env, addr: &Address, meta: &EscrowMeta) -> Result<(), EscrowError> {
    if !is_arbiter(env, addr, meta) {
        return Err(EscrowError::E3);
    }
    Ok(())
}

/// Returns `Err(EscrowError::E3)` if `addr` is not a participant (client or freelancer).
pub fn require_participant(
    env: &Env,
    addr: &Address,
    meta: &EscrowMeta,
) -> Result<(), EscrowError> {
    if !is_participant(env, addr, meta) {
        return Err(EscrowError::E3);
    }
    Ok(())
}
