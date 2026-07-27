//! Tests for `AdminTransferred` / `AdminAccepted` events emitted during the
//! two-step admin transfer (`propose_admin` / `accept_admin`).

#[cfg(test)]
#[allow(clippy::module_inception)]
mod admin_transfer_event_tests {
    use soroban_sdk::{testutils::Address as _, Address, Env};

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

    /// `propose_admin` must emit an event (AdminTransferred) on the event stream.
    #[test]
    fn test_admin_transferred_event_emitted_on_propose() {
        let (env, admin, contract) = setup();
        let new_admin = Address::generate(&env);

        contract.propose_admin(&admin, &new_admin);

        let events = env.events().all();
        assert!(!events.is_empty());
    }

    /// `accept_admin` must emit an event (AdminAccepted) on the event stream.
    #[test]
    fn test_admin_accepted_event_emitted_on_accept() {
        let (env, admin, contract) = setup();
        let new_admin = Address::generate(&env);

        contract.propose_admin(&admin, &new_admin);
        let events_before = env.events().all().len();

        contract.accept_admin(&new_admin);

        let events_after = env.events().all().len();
        assert!(events_after > events_before);
    }

    /// A non-admin caller must not be able to initiate a transfer.
    #[test]
    fn test_non_admin_cannot_transfer() {
        let (env, _admin, contract) = setup();
        let attacker = Address::generate(&env);
        let victim = Address::generate(&env);

        let result = contract.try_propose_admin(&attacker, &victim);
        assert_eq!(result, Err(Ok(EscrowError::E4)));
    }
}
