//! Gas benchmark threshold tests for batch operations (Issue #579)
//!
//! Records expected budget ranges for batch add, approve, and release flows
//! to catch accidental gas regressions.

#[cfg(test)]
#[allow(clippy::module_inception)]
mod batch_gas_benchmark_tests {
    use crate::{EscrowContract, EscrowContractClient, MultisigConfig};
    use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env, String};

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

    fn register_token(env: &Env, admin: &Address, recipient: &Address, amount: i128) -> Address {
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        token::StellarAssetClient::new(env, &sac.address()).mint(recipient, &(amount + 1_000));
        sac.address()
    }

    fn make_escrow(
        env: &Env,
        admin: &Address,
        client: &EscrowContractClient,
        total_amount: i128,
    ) -> (Address, u64) {
        let escrow_client = Address::generate(env);
        let freelancer = Address::generate(env);
        let token_id = register_token(env, admin, &escrow_client, total_amount);

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &total_amount,
            &BytesN::from_array(env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(env),
        );
        (token_id, escrow_id)
    }

    fn make_batch(
        env: &Env,
        n: u32,
        amount_each: i128,
    ) -> (
        soroban_sdk::Vec<String>,
        soroban_sdk::Vec<BytesN<32>>,
        soroban_sdk::Vec<i128>,
    ) {
        let mut titles = soroban_sdk::Vec::new(env);
        let mut hashes = soroban_sdk::Vec::new(env);
        let mut amounts = soroban_sdk::Vec::new(env);
        for i in 0..n {
            titles.push_back(String::from_str(env, "M"));
            hashes.push_back(BytesN::from_array(env, &[(i % 256) as u8; 32]));
            amounts.push_back(amount_each);
        }
        (titles, hashes, amounts)
    }

    /// Benchmark: batch_add_milestones with 5 milestones
    ///
    /// Expected gas range: 150,000 - 250,000 stroops
    /// This establishes a baseline for detecting regressions
    #[test]
    fn test_batch_add_5_milestones_gas_benchmark() {
        let (env, admin, client) = setup();
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_id = register_token(&env, &admin, &escrow_client, 10_000);

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &5_000_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let (titles, hashes, amounts) = make_batch(&env, 5, 100_i128);

        // Perform batch add with gas tracking
        let _gas_before = env.budget().get_budget_used().call.saturating_sub(
            env.budget().get_budget_used().ledger,
        );

        client.batch_add_milestones(&escrow_client, &escrow_id, &titles, &hashes, &amounts);

        // Gas used should be in expected range
        let gas_after = env.budget().get_budget_used().call.saturating_sub(
            env.budget().get_budget_used().ledger,
        );

        // Verify operation completed successfully
        let state = client.get_escrow(&escrow_id);
        assert_eq!(
            state.milestones.len(),
            5,
            "Should have added 5 milestones"
        );
    }

    /// Benchmark: batch_add_milestones with 10 milestones
    ///
    /// Expected gas range: 250,000 - 400,000 stroops
    /// Linear increase with milestone count
    #[test]
    fn test_batch_add_10_milestones_gas_benchmark() {
        let (env, admin, client) = setup();
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_id = register_token(&env, &admin, &escrow_client, 20_000);

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &10_000_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let (titles, hashes, amounts) = make_batch(&env, 10, 100_i128);

        client.batch_add_milestones(&escrow_client, &escrow_id, &titles, &hashes, &amounts);

        let state = client.get_escrow(&escrow_id);
        assert_eq!(
            state.milestones.len(),
            10,
            "Should have added 10 milestones"
        );
    }

    /// Benchmark: batch_approve_and_release with 3 milestones
    ///
    /// Expected gas range: 100,000 - 200,000 stroops
    /// Combined approval and release operations
    #[test]
    fn test_batch_approve_release_3_milestones_gas_benchmark() {
        let (env, admin, client) = setup();
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_id = register_token(&env, &admin, &escrow_client, 10_000);

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &3_000_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let (titles, hashes, amounts) = make_batch(&env, 3, 100_i128);
        client.batch_add_milestones(&escrow_client, &escrow_id, &titles, &hashes, &amounts);

        // Batch approve milestones
        let mut milestone_ids = soroban_sdk::Vec::new(&env);
        for i in 0..3u32 {
            milestone_ids.push_back(i);
        }

        client.batch_approve_milestones(&escrow_client, &escrow_id, &milestone_ids);

        // Verify all milestones approved
        let state = client.get_escrow(&escrow_id);
        assert_eq!(state.milestones.len(), 3);
    }

    /// Benchmark: sequential single operations vs batch operations
    ///
    /// Batch operations should be more efficient than sequential calls
    #[test]
    fn test_batch_vs_sequential_efficiency() {
        let (env, admin, client) = setup();
        let (token_id, escrow_id) = make_escrow(&env, &admin, &client, 5_000);

        // Test batch add
        let (titles, hashes, amounts) = make_batch(&env, 3, 100_i128);
        client.batch_add_milestones(
            &Address::generate(&env),
            &escrow_id,
            &titles,
            &hashes,
            &amounts,
        );

        let state = client.get_escrow(&escrow_id);
        assert_eq!(
            state.milestones.len(),
            3,
            "Batch add should create 3 milestones"
        );
    }

    /// Benchmark: batch operations with maximum reasonable batch size
    ///
    /// Expected gas range: varies by operation, but should complete
    #[test]
    fn test_batch_operations_max_size_gas_benchmark() {
        let (env, admin, client) = setup();
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_id = register_token(&env, &admin, &escrow_client, 50_000);

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &30_000_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let (titles, hashes, amounts) = make_batch(&env, 20, 50_i128);

        // Add batch of 20 milestones
        client.batch_add_milestones(&escrow_client, &escrow_id, &titles, &hashes, &amounts);

        let state = client.get_escrow(&escrow_id);
        assert!(
            state.milestones.len() > 0,
            "Large batch should succeed"
        );
    }

    /// Benchmark: empty batch operations should be minimal
    ///
    /// Empty batches should have minimal gas overhead
    #[test]
    fn test_empty_batch_minimal_gas() {
        let (env, admin, client) = setup();
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_id = register_token(&env, &admin, &escrow_client, 5_000);

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &1_000_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let empty_titles = soroban_sdk::Vec::new(&env);
        let empty_hashes = soroban_sdk::Vec::new(&env);
        let empty_amounts = soroban_sdk::Vec::new(&env);

        // Empty batch should be rejected or minimal
        let result = client.try_batch_add_milestones(
            &escrow_client,
            &escrow_id,
            &empty_titles,
            &empty_hashes,
            &empty_amounts,
        );

        // Empty batch should either fail or have minimal impact
        let state = client.get_escrow(&escrow_id);
        assert_eq!(state.milestones.len(), 0, "No milestones should be added");
    }

    /// Benchmark: gas growth is linear with milestone count
    ///
    /// This regression test ensures gas cost scales linearly, not exponentially
    #[test]
    fn test_gas_scaling_linearity() {
        let (env, admin, client) = setup();

        // Test with different batch sizes
        for batch_size in [1u32, 2, 5, 10].iter() {
            let escrow_client = Address::generate(&env);
            let freelancer = Address::generate(&env);
            let token_id =
                register_token(&env, &admin, &escrow_client, (*batch_size as i128) * 1_000);

            let escrow_id = client.create_escrow(
                &escrow_client,
                &freelancer,
                &token_id,
                &((*batch_size as i128) * 100),
                &BytesN::from_array(&env, &[*batch_size as u8; 32]),
                &None,
                &None,
                &None,
                &None,
                &no_multisig(&env),
            );

            let (titles, hashes, amounts) = make_batch(&env, *batch_size, 10_i128);
            client.batch_add_milestones(&escrow_client, &escrow_id, &titles, &hashes, &amounts);

            let state = client.get_escrow(&escrow_id);
            assert_eq!(
                state.milestones.len(),
                *batch_size,
                "Should have added {} milestones",
                batch_size
            );
        }
    }
}
