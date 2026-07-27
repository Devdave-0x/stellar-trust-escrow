//! Tests for the `get_participants` read-only view function.

#[cfg(test)]
#[allow(clippy::module_inception)]
mod get_participants_tests {
    use crate::{EscrowContract, EscrowContractClient, EscrowError, MultisigConfig};
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

    fn setup() -> (Env, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, admin, client)
    }

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    fn make_escrow(
        env: &Env,
        admin: &Address,
        client: &EscrowContractClient,
        arbiter: Option<Address>,
    ) -> (Address, Address, u64) {
        let escrow_client = Address::generate(env);
        let freelancer = Address::generate(env);
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        soroban_sdk::token::StellarAssetClient::new(env, &token_id.address())
            .mint(&escrow_client, &1_030);
        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id.address(),
            &1_000,
            &BytesN::from_array(env, &[1; 32]),
            &arbiter,
            &None,
            &None,
            &None,
            &no_multisig(env),
        );
        (escrow_client, freelancer, escrow_id)
    }

    /// The correct buyer, seller, and arbiter must be returned.
    #[test]
    fn test_get_participants_returns_correct_parties() {
        let (env, admin, client) = setup();
        let arbiter = Address::generate(&env);
        let (buyer, seller, escrow_id) = make_escrow(&env, &admin, &client, Some(arbiter.clone()));

        let participants = client.get_participants(&escrow_id);
        assert_eq!(participants.buyer, buyer);
        assert_eq!(participants.seller, seller);
        assert_eq!(participants.arbiters.len(), 1);
        assert_eq!(participants.arbiters.get(0).unwrap(), arbiter);
    }

    /// A new escrow created without an arbiter must return an empty arbiter list.
    #[test]
    fn test_get_participants_empty_arbiters_for_new_escrow() {
        let (env, admin, client) = setup();
        let (buyer, seller, escrow_id) = make_escrow(&env, &admin, &client, None);

        let participants = client.get_participants(&escrow_id);
        assert_eq!(participants.buyer, buyer);
        assert_eq!(participants.seller, seller);
        assert_eq!(participants.arbiters.len(), 0);
    }

    /// An unknown escrow ID must return an error, not panic.
    #[test]
    fn test_get_participants_unknown_escrow_errors() {
        let (env, _admin, client) = setup();

        let result = client.try_get_participants(&999_999u64);
        assert_eq!(result, Err(Ok(EscrowError::E8)));
    }
}
