//! Tests for the `get_escrow_states` batch view function.

#[cfg(test)]
#[allow(clippy::module_inception)]
mod get_escrow_states_tests {
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

    fn make_escrow(env: &Env, admin: &Address, client: &EscrowContractClient) -> u64 {
        let escrow_client = Address::generate(env);
        let freelancer = Address::generate(env);
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        soroban_sdk::token::StellarAssetClient::new(env, &token_id.address())
            .mint(&escrow_client, &1_030);
        client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id.address(),
            &1_000,
            &BytesN::from_array(env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(env),
        )
    }

    /// A batch of 3 known escrow IDs must return all 3 in the result map.
    #[test]
    fn test_batch_of_known_ids_returns_all() {
        let (env, admin, client) = setup();
        let id1 = make_escrow(&env, &admin, &client);
        let id2 = make_escrow(&env, &admin, &client);
        let id3 = make_escrow(&env, &admin, &client);

        let mut ids = soroban_sdk::Vec::new(&env);
        ids.push_back(id1);
        ids.push_back(id2);
        ids.push_back(id3);

        let result = client.get_escrow_states(&ids);
        assert_eq!(result.len(), 3);
        assert!(result.contains_key(id1));
        assert!(result.contains_key(id2));
        assert!(result.contains_key(id3));
    }

    /// An unknown escrow ID in the batch must be omitted, not error.
    #[test]
    fn test_batch_with_unknown_id_is_omitted() {
        let (env, admin, client) = setup();
        let id1 = make_escrow(&env, &admin, &client);
        let unknown_id: u64 = 999_999;

        let mut ids = soroban_sdk::Vec::new(&env);
        ids.push_back(id1);
        ids.push_back(unknown_id);

        let result = client.get_escrow_states(&ids);
        assert_eq!(result.len(), 1);
        assert!(result.contains_key(id1));
        assert!(!result.contains_key(unknown_id));
    }

    /// A batch over MAX_BATCH_ESCROW_STATES (20) IDs must be rejected.
    #[test]
    fn test_batch_over_limit_rejected() {
        let (env, _admin, client) = setup();
        let mut ids = soroban_sdk::Vec::new(&env);
        for i in 0..21u64 {
            ids.push_back(i);
        }

        let result = client.try_get_escrow_states(&ids);
        assert_eq!(result, Err(Ok(EscrowError::BatchTooLarge)));
    }
}
