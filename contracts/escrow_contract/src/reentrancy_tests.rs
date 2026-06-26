#![cfg(test)]

#[allow(clippy::module_inception)]
mod reentrancy_tests {
    use crate::{DataKey, EscrowContract, EscrowContractClient, EscrowError, MultisigConfig};
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, Vec};

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: Vec::new(env),
            weights: Vec::new(env),
            threshold: 0,
        }
    }

    fn setup() -> (Env, Address, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, admin, contract_id, client)
    }

    fn register_token(env: &Env, admin: &Address, recipient: &Address, amount: i128) -> Address {
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let sac = soroban_sdk::token::StellarAssetClient::new(env, &token_id.address());
        sac.mint(recipient, &amount);
        token_id.address()
    }

    #[test]
    fn test_reentrancy_guard_blocks_concurrent_release() {
        let (env, admin, contract_id, client) = setup();
        let buyer = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &buyer, 2000);

        let escrow_id = client.create_escrow(
            &buyer,
            &freelancer,
            &token,
            &1000_i128,
            &BytesN::from_array(&env, &[1u8; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        client.add_milestone(
            &buyer,
            &escrow_id,
            &soroban_sdk::String::from_str(&env, "M1"),
            &BytesN::from_array(&env, &[2u8; 32]),
            &500_i128,
        );

        client.submit_milestone(&freelancer, &escrow_id, &0);
        client.approve_milestone(&buyer, &escrow_id, &0);

        // Simulate a re-entrant state by setting the lock before calling
        // release_funds. The guard should reject the call with E22.
        env.as_contract(&contract_id, || {
            env.storage()
                .instance()
                .set(&DataKey::ReentrancyLock, &true);
        });

        let result = client.try_release_funds(&admin, &escrow_id, &0);
        assert!(result.is_err());
    }

    #[test]
    fn test_reentrancy_guard_blocks_concurrent_cancel() {
        let (env, admin, contract_id, client) = setup();
        let buyer = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &buyer, 2000);

        let escrow_id = client.create_escrow(
            &buyer,
            &freelancer,
            &token,
            &1000_i128,
            &BytesN::from_array(&env, &[1u8; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        // Set the reentrancy lock
        env.as_contract(&contract_id, || {
            env.storage()
                .instance()
                .set(&DataKey::ReentrancyLock, &true);
        });

        let result = client.try_cancel_escrow(&buyer, &escrow_id);
        assert!(result.is_err());
    }
}
