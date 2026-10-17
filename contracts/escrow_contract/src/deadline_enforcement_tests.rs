//! Tests for escrow deadline enforcement.
//!
//! These tests exercise the extension request/confirm flow, boundary
//! conditions on the proposed deadline, expiry handling, and duplicate
//! request rejection. They assert deterministic error codes and that
//! failure paths leave persisted state unchanged.
//!
//! Ledger assumptions documented here (see also `lib.rs`):
//! - `env.ledger().timestamp()` is monotonic and deterministic per ledger.
//! - Extension windows are expressed in seconds and must be strictly
//!   greater than the current ledger timestamp and the current deadline.
//! - No TTL, fee, or transaction-size assumptions are required for these
//!   unit tests; they operate purely on ledger time and persisted state.

use crate::{EscrowContract, EscrowContractClient, EscrowError, EscrowMeta};
use soroban_sdk::{testutils::Ledger, Address, Env, Symbol};

/// Helper: register the contract and return a client bound to `env`.
fn setup<'a>(env: &'a Env) -> EscrowContractClient<'a> {
    let contract_id = env.register_contract(None, EscrowContract);
    EscrowContractClient::new(env, &contract_id)
}

/// Helper: seed a minimal escrow with a known deadline and return its id.
fn seed_escrow(
    env: &Env,
    client: &EscrowContractClient,
    deadline: u64,
) -> (u64, Address, Address) {
    let depositor = Address::generate(env);
    let beneficiary = Address::generate(env);
    let id = client.create_escrow(&depositor, &beneficiary, &1_000i128, &deadline);
    (id, depositor, beneficiary)
}

/// (a) Success path: request_extension then confirm_extension before expiry
/// updates `meta.deadline` and emits `ESCROW_EXTENDED`.
#[test]
fn request_and_confirm_extension_before_expiry_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

    let client = setup(&env);
    let (id, _depositor, _beneficiary) = seed_escrow(&env, &client, 5_000);

    // Request an extension to a later deadline.
    let new_deadline = 8_000u64;
    client.request_extension(&id, &new_deadline);

    // Confirm before the original deadline expires.
    env.ledger().set_timestamp(2_000);
    client.confirm_extension(&id);

    // Deadline must be updated to the requested value.
    let meta: EscrowMeta = client.get_meta(&id);
    assert_eq!(meta.deadline, new_deadline);

    // The ESCROW_EXTENDED event must have been emitted.
    let events = env.events().all();
    let extended = Symbol::new(&env, "ESCROW_EXTENDED");
    let found = events
        .iter()
        .any(|(_, topics, _)| topics.iter().any(|t| t == &extended));
    assert!(found, "expected ESCROW_EXTENDED event to be emitted");
}

/// (b) Boundary: `new_deadline == now` is rejected with E72.
#[test]
fn request_extension_equal_to_now_returns_e72() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

    let client = setup(&env);
    let (id, _depositor, _beneficiary) = seed_escrow(&env, &client, 5_000);

    let before: EscrowMeta = client.get_meta(&id);

    let result = client.try_request_extension(&id, &1_000u64);
    assert_eq!(result, Err(Ok(EscrowError::E72)));

    // No state mutation on failure.
    let after: EscrowMeta = client.get_meta(&id);
    assert_eq!(before.deadline, after.deadline);
}

/// (b) Boundary: `new_deadline < current deadline` is rejected with E72.
#[test]
fn request_extension_before_current_deadline_returns_e72() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

    let client = setup(&env);
    let (id, _depositor, _beneficiary) = seed_escrow(&env, &client, 5_000);

    let before: EscrowMeta = client.get_meta(&id);

    // 4_000 is greater than now (1_000) but less than the current deadline.
    let result = client.try_request_extension(&id, &4_000u64);
    assert_eq!(result, Err(Ok(EscrowError::E72)));

    // No state mutation on failure.
    let after: EscrowMeta = client.get_meta(&id);
    assert_eq!(before.deadline, after.deadline);
}

/// (c) Failure: `confirm_extension` after `expires_at` returns E36 and
/// leaves `meta.deadline` unchanged.
#[test]
fn confirm_extension_after_expiry_returns_e36() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

    let client = setup(&env);
    let (id, _depositor, _beneficiary) = seed_escrow(&env, &client, 5_000);

    let new_deadline = 8_000u64;
    client.request_extension(&id, &new_deadline);

    let before: EscrowMeta = client.get_meta(&id);

    // Advance past the original deadline (expires_at).
    env.ledger().set_timestamp(5_001);

    let result = client.try_confirm_extension(&id);
    assert_eq!(result, Err(Ok(EscrowError::E36)));

    // Deadline must remain unchanged after the failed confirm.
    let after: EscrowMeta = client.get_meta(&id);
    assert_eq!(before.deadline, after.deadline);
}

/// (d) Duplicate request returns E73 and does not overwrite the pending
/// extension.
#[test]
fn duplicate_request_extension_returns_e73() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

    let client = setup(&env);
    let (id, _depositor, _beneficiary) = seed_escrow(&env, &client, 5_000);

    client.request_extension(&id, &8_000u64);

    let before: EscrowMeta = client.get_meta(&id);

    // A second request while one is pending must be rejected.
    let result = client.try_request_extension(&id, &9_000u64);
    assert_eq!(result, Err(Ok(EscrowError::E73)));

    // No state mutation on failure.
    let after: EscrowMeta = client.get_meta(&id);
    assert_eq!(before.deadline, after.deadline);
}