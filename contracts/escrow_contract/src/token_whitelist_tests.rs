#[cfg(test)]
mod token_whitelist_tests {
    use crate::{EscrowContract, EscrowContractClient, EscrowError};

    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Address, Env,
    };

    use crate::{types::DataKey, ADMIN_TRANSFER_TIMELOCK_LEDGERS};

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
    fn test_add_remove_approved_token_admin_only() {
        let (env, admin, _, client) = setup();
        let non_admin = Address::generate(&env);
        let token = register_token(&env, &admin, &admin, 1000);

        // Non-admin cannot add token
        let result = client.try_add_approved_token(&non_admin, &token);
        assert!(result.is_err());

        // Admin can add token
        client.add_approved_token(&admin, &token);

        // Non-admin cannot remove token
        let result = client.try_remove_approved_token(&non_admin, &token);
        assert!(result.is_err());

        let result = client.try_set_token_whitelist_enabled(&non_admin, &true);
        assert!(result.is_err());

        // Admin can remove token
        client.remove_approved_token(&admin, &token);
    }

    #[test]
    fn test_set_token_whitelist_enabled_admin_only() {
        let (env, admin, _, client) = setup();
        let non_admin = Address::generate(&env);

        // Non-admin cannot enable whitelist
        let result = client.try_set_token_whitelist_enabled(&non_admin, &true);
        assert!(result.is_err());

        // Admin can enable
        client.set_token_whitelist_enabled(&admin, &true);

        // Admin can disable
        client.set_token_whitelist_enabled(&admin, &false);
    }

    #[test]
    fn test_whitelist_enforcement() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let approved_token = register_token(&env, &admin, &client_addr, 1000);
        let unapproved_token = register_token(&env, &admin, &client_addr, 1000);
        let amount = 100;
        let brief_hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);

        // Enable whitelist
        client.set_token_whitelist_enabled(&admin, &true);

        // Add approved token
        client.add_approved_token(&admin, &approved_token);

        // Create escrow with approved token should succeed
        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &approved_token,
            &amount,
            &brief_hash,
            &None::<Address>,
            &None::<u64>,
            &None::<u64>,
        );
        assert!(escrow_id > 0);

        // Create escrow with unapproved token should fail
        let result = client.try_create_escrow(
            &client_addr,
            &freelancer,
            &unapproved_token,
            &amount,
            &brief_hash,
            &None::<Address>,
            &None::<u64>,
            &None::<u64>,
        );
        assert!(result.is_err());
        assert_eq!(result.err().unwrap(), EscrowError::E3);

        // Disable whitelist
        client.set_token_whitelist_enabled(&admin, &false);

        // Now unapproved token should work
        let escrow_id2 = client.create_escrow(
            &client_addr,
            &freelancer,
            &unapproved_token,
            &amount,
            &brief_hash,
            &None::<Address>,
            &None::<u64>,
            &None::<u64>,
        );
        assert!(escrow_id2 > escrow_id);
    }

    #[test]
    fn test_allowlist_mutators_require_authorization() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        let token = Address::generate(&env);

        assert!(client.try_add_approved_token(&admin, &token).is_err());
        assert!(client.try_remove_approved_token(&admin, &token).is_err());
        assert!(client
            .try_set_token_whitelist_enabled(&admin, &true)
            .is_err());
    }

    #[test]
    fn test_former_admin_cannot_manage_token_allowlist() {
        let (env, admin, _, client) = setup();
        let new_admin = Address::generate(&env);
        let token = Address::generate(&env);

        client.propose_admin(&admin, &new_admin);
        env.ledger()
            .set_sequence(env.ledger().sequence() + ADMIN_TRANSFER_TIMELOCK_LEDGERS + 1);
        client.accept_admin(&new_admin);

        assert!(client.try_add_approved_token(&admin, &token).is_err());
        assert!(client.try_remove_approved_token(&admin, &token).is_err());
        assert!(client
            .try_set_token_whitelist_enabled(&admin, &true)
            .is_err());
    }

    #[test]
    fn test_approved_token_allowlist_storage_growth_budget() {
        let (env, admin, contract_id, client) = setup();
        let token_count = 32_u32;
        let mut tokens = soroban_sdk::Vec::new(&env);

        for _ in 0..token_count {
            let token = Address::generate(&env);
            client.add_approved_token(&admin, &token);
            tokens.push_back(token);
        }

        let stored_token_keys = env.as_contract(&contract_id, || {
            tokens
                .iter()
                .filter(|token| {
                    env.storage()
                        .instance()
                        .has(&DataKey::ApprovedToken(token.clone()))
                })
                .count()
        });
        assert_eq!(stored_token_keys, token_count as usize);

        let first_token = tokens.get(0).expect("benchmark token list is non-empty");
        client.add_approved_token(&admin, &first_token);
        let duplicate_did_not_grow_storage = env.as_contract(&contract_id, || {
            tokens
                .iter()
                .filter(|token| {
                    env.storage()
                        .instance()
                        .has(&DataKey::ApprovedToken(token.clone()))
                })
                .count()
        });
        assert_eq!(duplicate_did_not_grow_storage, token_count as usize);

        client.remove_approved_token(&admin, &first_token);
        let removed_key_count = env.as_contract(&contract_id, || {
            tokens
                .iter()
                .filter(|token| {
                    env.storage()
                        .instance()
                        .has(&DataKey::ApprovedToken(token.clone()))
                })
                .count()
        });
        assert_eq!(removed_key_count, token_count as usize - 1);
    }
}
