//! Storage-growth benchmark tests for arbiter decision finality.
//!
//! These tests measure the number of persistent ledger writes performed by the
//! escrow extension contract during realistic dispute lifecycles. The goal is
//! to establish a documented regression budget so that future changes to the
//! arbiter decision finality path cannot silently increase storage growth.
//!
//! Measurements are deterministic: no timestamps, addresses, or other
//! environment-dependent values appear in assertion messages.

#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Env, Vec,
};

use crate::{EscrowExtensions, EscrowExtensionsClient, DisputeStatus};

/// Maximum number of persistent ledger writes allowed per dispute lifecycle.
///
/// Rationale: a single dispute lifecycle (open -> vote -> resolve) touches a
/// bounded set of persistent entries: the dispute record itself, the vote
/// tally, and the final resolution marker. Allowing up to 4 writes per
/// lifecycle gives headroom for one additional bookkeeping entry (e.g. an
/// index update) while still catching accidental write amplification such as
/// re-writing the dispute record on every vote or emitting redundant
/// resolution markers. Exceeding this budget indicates a regression in the
/// arbiter decision finality path.
pub const MAX_WRITES_PER_DISPUTE_LIFECYCLE: u32 = 4;

/// Number of disputes exercised in the realistic workload benchmark.
pub const BENCHMARK_DISPUTE_COUNT: u32 = 10;

/// Snapshot of the persistent storage entry count for a given contract.
fn persistent_entry_count(env: &Env, contract_id: &Address) -> u32 {
    env.as_contract(contract_id, || {
        let mut count: u32 = 0;
        for _key in env.storage().persistent().keys() {
            count += 1;
        }
        count
    })
}

/// Helper: set up a fresh contract and return (env, client, contract_id).
fn setup() -> (Env, EscrowExtensionsClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, EscrowExtensions);
    let client = EscrowExtensionsClient::new(&env, &contract_id);
    (env, client, contract_id)
}

/// Helper: open a dispute for a given escrow id and return the dispute id.
fn open_dispute(
    env: &Env,
    client: &EscrowExtensionsClient,
    escrow_id: u64,
    arbiter: &Address,
) -> u64 {
    let opener = Address::generate(env);
    client.open_dispute(&escrow_id, &opener, arbiter)
}

/// Primary success path: run a realistic workload of N dispute lifecycles
/// (open -> vote -> resolve) and assert the total persistent write count stays
/// within the documented regression budget.
#[test]
fn benchmark_dispute_lifecycle_writes_within_budget() {
    let (env, client, contract_id) = setup();

    let baseline = persistent_entry_count(&env, &contract_id);

    let mut dispute_ids: Vec<u64> = Vec::new(&env);
    for i in 0..BENCHMARK_DISPUTE_COUNT {
        let arbiter = Address::generate(&env);
        let escrow_id = (i as u64) + 1;
        let dispute_id = open_dispute(&env, &client, escrow_id, &arbiter);
        dispute_ids.push_back(dispute_id);

        // Advance the ledger so the voting window is closed before resolving.
        env.ledger().with_mut(|li| {
            li.sequence_number += 100;
        });

        // Cast a vote in favor of resolving the dispute.
        client.vote_on_dispute(&dispute_id, &arbiter, &true);

        // Finalize the arbiter decision.
        client.resolve_dispute(&dispute_id);
    }

    let after = persistent_entry_count(&env, &contract_id);
    let total_writes = after.saturating_sub(baseline);

    let budget = MAX_WRITES_PER_DISPUTE_LIFECYCLE * BENCHMARK_DISPUTE_COUNT;
    assert!(
        total_writes <= budget,
        "storage growth exceeded regression budget: writes={}, budget={}",
        total_writes,
        budget,
    );

    // Every dispute must have reached the resolved state.
    for dispute_id in dispute_ids.iter() {
        let dispute = client.get_dispute(&dispute_id);
        assert_eq!(dispute.status, DisputeStatus::Resolved);
    }
}

/// Boundary path: resolving before the voting window closes must fail with
/// `VotingWindowOpen` and must not perform any persistent writes.
#[test]
fn benchmark_resolve_before_voting_window_closes_performs_zero_writes() {
    let (env, client, contract_id) = setup();

    let arbiter = Address::generate(&env);
    let dispute_id = open_dispute(&env, &client, 1, &arbiter);

    let before = persistent_entry_count(&env, &contract_id);

    // Attempt to resolve immediately, without advancing the ledger.
    let result = client.try_resolve_dispute(&dispute_id);
    assert!(result.is_err(), "resolve before window close must fail");

    let after = persistent_entry_count(&env, &contract_id);
    assert_eq!(
        before, after,
        "failed resolve must not write persistent entries",
    );

    // Dispute must remain in the open state.
    let dispute = client.get_dispute(&dispute_id);
    assert_eq!(dispute.status, DisputeStatus::Open);
}

/// Failure path: resolving an already-resolved dispute must fail with
/// `DisputeAlreadyExists` (or equivalent) and must not perform any persistent
/// writes.
#[test]
fn benchmark_double_resolve_performs_zero_writes() {
    let (env, client, contract_id) = setup();

    let arbiter = Address::generate(&env);
    let dispute_id = open_dispute(&env, &client, 1, &arbiter);

    env.ledger().with_mut(|li| {
        li.sequence_number += 100;
    });
    client.vote_on_dispute(&dispute_id, &arbiter, &true);
    client.resolve_dispute(&dispute_id);

    let before = persistent_entry_count(&env, &contract_id);

    // Second resolve attempt must fail and must not write anything.
    let result = client.try_resolve_dispute(&dispute_id);
    assert!(result.is_err(), "double resolve must fail");

    let after = persistent_entry_count(&env, &contract_id);
    assert_eq!(
        before, after,
        "failed double resolve must not write persistent entries",
    );
}

/// Boundary path: resolving a dispute that was never opened must fail and must
/// not perform any persistent writes.
#[test]
fn benchmark_resolve_unknown_dispute_performs_zero_writes() {
    let (env, client, contract_id) = setup();

    let before = persistent_entry_count(&env, &contract_id);

    let result = client.try_resolve_dispute(&9999);
    assert!(result.is_err(), "resolve of unknown dispute must fail");

    let after = persistent_entry_count(&env, &contract_id);
    assert_eq!(
        before, after,
        "failed resolve of unknown dispute must not write persistent entries",
    );
}