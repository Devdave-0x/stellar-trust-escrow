//! Regression tests for milestone approval quorum transitions.
//!
//! These tests exercise the primary success path and several failure/boundary
//! paths for milestone approval quorum transitions, asserting exact stable
//! error codes and deterministic behavior.

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, Vec,
};

/// Helper: set up a contract with a single milestone and a set of approvers.
fn setup_quorum_contract(
    env: &Env,
    approvers: &Vec<Address>,
    quorum: u32,
) -> (EscrowContractClient<'_>, u32) {
    let contract_id = env.register_contract(None, EscrowContract);
    let client = EscrowContractClient::new(env, &contract_id);

    let admin = Address::generate(env);
    client.initialize(&admin);

    // Create an escrow with a single milestone.
    let payer = Address::generate(env);
    let payee = Address::generate(env);
    let amount: i128 = 1_000;

    let milestone_id = client.create_milestone(&payer, &payee, &amount);

    // Register approvers and set quorum.
    for approver in approvers.iter() {
        client.add_approver(&admin, &milestone_id, &approver);
    }
    client.set_approval_quorum(&admin, &milestone_id, &quorum);

    (client, milestone_id)
}

#[test]
fn test_quorum_approval_success_path() {
    let env = Env::default();
    env.mock_all_auths();

    let approvers = Vec::from_array(
        &env,
        [Address::generate(&env), Address::generate(&env), Address::generate(&env)],
    );
    let (client, milestone_id) = setup_quorum_contract(&env, &approvers, 2);

    // First approval: quorum not yet reached.
    client.approve_milestone(&approvers.get(0).unwrap(), &milestone_id);
    assert!(!client.is_milestone_approved(&milestone_id));

    // Second approval: quorum reached, milestone approved.
    client.approve_milestone(&approvers.get(1).unwrap(), &milestone_id);
    assert!(client.is_milestone_approved(&milestone_id));

    // Deterministic: repeated query returns the same result.
    assert!(client.is_milestone_approved(&milestone_id));
}

#[test]
fn test_quorum_insufficient_approvals_does_not_approve() {
    let env = Env::default();
    env.mock_all_auths();

    let approvers = Vec::from_array(
        &env,
        [Address::generate(&env), Address::generate(&env), Address::generate(&env)],
    );
    let (client, milestone_id) = setup_quorum_contract(&env, &approvers, 3);

    // Two out of three approvals: still below quorum.
    client.approve_milestone(&approvers.get(0).unwrap(), &milestone_id);
    client.approve_milestone(&approvers.get(1).unwrap(), &milestone_id);

    assert!(!client.is_milestone_approved(&milestone_id));
    assert_eq!(client.get_approval_count(&milestone_id), 2);
}

#[test]
fn test_quorum_already_approved_milestone_returns_stable_error() {
    let env = Env::default();
    env.mock_all_auths();

    let approvers = Vec::from_array(
        &env,
        [Address::generate(&env), Address::generate(&env)],
    );
    let (client, milestone_id) = setup_quorum_contract(&env, &approvers, 2);

    // Reach quorum.
    client.approve_milestone(&approvers.get(0).unwrap(), &milestone_id);
    client.approve_milestone(&approvers.get(1).unwrap(), &milestone_id);
    assert!(client.is_milestone_approved(&milestone_id));

    // Approving again must fail with the stable "already approved" error.
    let result = client.try_approve_milestone(&approvers.get(0).unwrap(), &milestone_id);
    assert_eq!(result, Err(Ok(Error::MilestoneAlreadyApproved)));
}

#[test]
fn test_quorum_duplicate_approval_returns_stable_error() {
    let env = Env::default();
    env.mock_all_auths();

    let approvers = Vec::from_array(
        &env,
        [Address::generate(&env), Address::generate(&env), Address::generate(&env)],
    );
    let (client, milestone_id) = setup_quorum_contract(&env, &approvers, 3);

    // First approval succeeds.
    client.approve_milestone(&approvers.get(0).unwrap(), &milestone_id);

    // Same approver approving again must fail deterministically.
    let result = client.try_approve_milestone(&approvers.get(0).unwrap(), &milestone_id);
    assert_eq!(result, Err(Ok(Error::AlreadyApprovedByApprover)));

    // Approval count must remain unchanged.
    assert_eq!(client.get_approval_count(&milestone_id), 1);
}

#[test]
fn test_quorum_unauthorized_approver_returns_stable_error() {
    let env = Env::default();
    env.mock_all_auths();

    let approvers = Vec::from_array(
        &env,
        [Address::generate(&env), Address::generate(&env)],
    );
    let (client, milestone_id) = setup_quorum_contract(&env, &approvers, 2);

    // An address that is not a registered approver attempts to approve.
    let unauthorized = Address::generate(&env);
    let result = client.try_approve_milestone(&unauthorized, &milestone_id);
    assert_eq!(result, Err(Ok(Error::UnauthorizedApprover)));

    // No approval recorded.
    assert_eq!(client.get_approval_count(&milestone_id), 0);
    assert!(!client.is_milestone_approved(&milestone_id));
}

#[test]
fn test_quorum_invalid_state_returns_stable_error() {
    let env = Env::default();
    env.mock_all_auths();

    let approvers = Vec::from_array(
        &env,
        [Address::generate(&env), Address::generate(&env)],
    );
    let (client, milestone_id) = setup_quorum_contract(&env, &approvers, 2);

    // Move the milestone into a terminal state (e.g., released/cancelled).
    client.release_milestone(&milestone_id);

    // Approving a milestone in a terminal state must fail with a stable error.
    let result = client.try_approve_milestone(&approvers.get(0).unwrap(), &milestone_id);
    assert_eq!(result, Err(Ok(Error::InvalidMilestoneState)));
}

#[test]
fn test_quorum_zero_quorum_boundary() {
    let env = Env::default();
    env.mock_all_auths();

    let approvers = Vec::from_array(&env, [Address::generate(&env)]);
    let (client, milestone_id) = setup_quorum_contract(&env, &approvers, 0);

    // With a zero quorum, the milestone is considered approved without any
    // approvals, and the query is deterministic.
    assert!(client.is_milestone_approved(&milestone_id));
    assert!(client.is_milestone_approved(&milestone_id));
}

#[test]
fn test_quorum_exact_boundary_reaches_quorum() {
    let env = Env::default();
    env.mock_all_auths();

    let approvers = Vec::from_array(
        &env,
        [Address::generate(&env), Address::generate(&env), Address::generate(&env)],
    );
    let (client, milestone_id) = setup_quorum_contract(&env, &approvers, 3);

    // Approve exactly up to the quorum boundary.
    client.approve_milestone(&approvers.get(0).unwrap(), &milestone_id);
    assert!(!client.is_milestone_approved(&milestone_id));
    client.approve_milestone(&approvers.get(1).unwrap(), &milestone_id);
    assert!(!client.is_milestone_approved(&milestone_id));
    client.approve_milestone(&approvers.get(2).unwrap(), &milestone_id);
    assert!(client.is_milestone_approved(&milestone_id));
    assert_eq!(client.get_approval_count(&milestone_id), 3);
}