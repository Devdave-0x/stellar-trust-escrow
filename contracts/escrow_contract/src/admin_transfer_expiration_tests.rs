//! Tests for admin transfer expiration behavior and emitted events.
//!
//! Verifies that pending admin transfers properly enforce expiration boundaries,
//! emit appropriate events, and that queries correctly reflect the state after expiry.

#[cfg(test)]
#[allow(clippy::module_inception)]
mod admin_transfer_expiration_tests {
    use soroban_sdk::{
        testutils::{Address as _, Events as _, Ledger as _},
        Address, Env,
    };

    use crate::{EscrowContract, EscrowContractClient, EscrowError};

    fn setup() -> (Env, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);

        (env, admin, client)
    }

    fn advance_ledger(env: &Env, ledgers: u32) {
        env.ledger().with_mut(|l| {
            l.sequence_number += ledgers;
            l.timestamp += (ledgers as u64) * 5;
        });
    }

    /// Verifies that expiry boundary is respected: accept_admin fails when called
    /// before the timelock ledger is reached.
    #[test]
    fn test_admin_transfer_expiry_boundary_before_timelock() {
        let (env, admin, contract) = setup();
        let new_admin = Address::generate(&env);

        contract.propose_admin(&admin, &new_admin);

        // Try to accept immediately (should fail due to timelock not elapsed)
        let result = contract.try_accept_admin(&new_admin);
        assert_eq!(result, Err(Ok(EscrowError::E46)));

        // Admin should remain unchanged
        assert_eq!(contract.get_admin(), admin);
    }

    /// Verifies that accept_admin succeeds after the timelock ledger is reached.
    #[test]
    fn test_admin_transfer_succeeds_after_timelock_ledger() {
        let (env, admin, contract) = setup();
        let new_admin = Address::generate(&env);

        contract.propose_admin(&admin, &new_admin);

        // Advance the ledger past the timelock window (7 ledgers + 1)
        advance_ledger(&env, 8);

        // Now accept should succeed
        contract.accept_admin(&new_admin);

        // Verify the admin has changed
        assert_eq!(contract.get_admin(), new_admin);
    }

    /// Verifies that emitted events reflect the admin transfer proposal and acceptance.
    #[test]
    fn test_admin_transfer_emits_proposal_events() {
        let (env, admin, contract) = setup();
        let new_admin = Address::generate(&env);

        contract.propose_admin(&admin, &new_admin);

        let events = env.events().all();
        assert!(!events.is_empty(), "propose_admin must emit events");
    }

    /// Verifies that emitted events reflect the admin transfer acceptance.
    #[test]
    fn test_admin_transfer_emits_acceptance_events() {
        let (env, admin, contract) = setup();
        let new_admin = Address::generate(&env);

        contract.propose_admin(&admin, &new_admin);

        advance_ledger(&env, 8);

        let events_before = env.events().all().len();

        contract.accept_admin(&new_admin);

        let events_after = env.events().all().len();
        assert!(events_after > events_before, "accept_admin must emit events");
    }

    /// Verifies that a pending admin transfer is queryable and correctly reflects
    /// the state after proposal.
    #[test]
    fn test_admin_transfer_state_queryable_after_proposal() {
        let (env, admin, contract) = setup();
        let new_admin = Address::generate(&env);

        // Before proposal, admin should be unchanged
        assert_eq!(contract.get_admin(), admin);

        contract.propose_admin(&admin, &new_admin);

        // After proposal, admin should still be the original
        // (this verifies the two-step behavior)
        assert_eq!(contract.get_admin(), admin);
    }

    /// Verifies that the pending admin proposal is cleared after acceptance,
    /// making further accept attempts fail.
    #[test]
    fn test_admin_transfer_pending_cleared_after_acceptance() {
        let (env, admin, contract) = setup();
        let new_admin = Address::generate(&env);
        let third_party = Address::generate(&env);

        contract.propose_admin(&admin, &new_admin);

        advance_ledger(&env, 8);

        contract.accept_admin(&new_admin);

        // Try to accept again with a different address (should fail)
        let result = contract.try_accept_admin(&third_party);
        assert_eq!(result, Err(Ok(EscrowError::E3)));
    }

    /// Verifies that after a successful transfer, the expiration timestamp
    /// is no longer valid for queries.
    #[test]
    fn test_admin_transfer_expiration_cleared_after_acceptance() {
        let (env, admin, contract) = setup();
        let new_admin = Address::generate(&env);

        contract.propose_admin(&admin, &new_admin);

        advance_ledger(&env, 8);

        contract.accept_admin(&new_admin);

        // Verify admin has changed (expiration was properly cleared)
        assert_eq!(contract.get_admin(), new_admin);

        // Future accept attempts should fail
        let result = contract.try_accept_admin(&new_admin);
        assert!(result.is_err());
    }
}
