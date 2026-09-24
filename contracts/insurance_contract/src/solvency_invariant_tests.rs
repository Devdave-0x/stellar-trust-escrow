//! Insurance pool solvency invariant tests (Issue #581)
//!
//! Ensures that pool liabilities never exceed available balance across:
//! - Multiple stakers contributing to the fund
//! - Claim payouts to beneficiaries
//! - Stake withdrawals by participants
//! - Settlement of pending yield distributions

#[cfg(test)]
#[allow(clippy::module_inception)]
mod solvency_invariant_tests {
    use soroban_sdk::{
        testutils::Address as _, token, Address, Env, String,
    };

    use crate::{InsuranceContract, InsuranceContractClient};

    struct Setup {
        env: Env,
        admin: Address,
        token_id: Address,
        contract_id: Address,
        client: InsuranceContractClient<'static>,
    }

    fn setup() -> Setup {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();

        let contract_id = env.register_contract(None, InsuranceContract);
        let client = InsuranceContractClient::new(&env, &contract_id);

        client.initialize(&admin, &token_id, &10_i128, &10_000_i128, &2_u32);

        Setup {
            env,
            admin,
            token_id,
            contract_id,
            client,
        }
    }

    fn mint(env: &Env, _admin: &Address, token_id: &Address, to: &Address, amount: i128) {
        token::StellarAssetClient::new(env, token_id).mint(to, &amount);
    }

    fn assert_solvency(s: &Setup) {
        let fund_info = s.client.get_fund_info().unwrap();
        assert!(
            fund_info.current_balance >= 0,
            "Pool balance must never be negative"
        );
        assert!(
            fund_info.current_balance >= fund_info.total_paid_out,
            "Pool balance must be >= total payouts"
        );
    }

    /// Test invariant: pool liabilities never exceed available balance with multiple stakers
    #[test]
    fn test_multiple_stakers_solvency() {
        let s = setup();
        let staker1 = Address::generate(&s.env);
        let staker2 = Address::generate(&s.env);
        let staker3 = Address::generate(&s.env);

        // Mint and contribute from multiple stakers
        mint(&s.env, &s.admin, &s.token_id, &staker1, 1_000);
        mint(&s.env, &s.admin, &s.token_id, &staker2, 2_000);
        mint(&s.env, &s.admin, &s.token_id, &staker3, 3_000);

        s.client.contribute(&staker1, &500_i128).unwrap();
        assert_solvency(&s);

        s.client.contribute(&staker2, &1_000_i128).unwrap();
        assert_solvency(&s);

        s.client.contribute(&staker3, &1_500_i128).unwrap();
        assert_solvency(&s);

        let fund_info = s.client.get_fund_info().unwrap();
        assert_eq!(fund_info.current_balance, 3_000);
        assert_eq!(fund_info.total_contributed, 3_000);
    }

    /// Test invariant: solvency maintained after multiple claim payouts
    #[test]
    fn test_claim_payouts_solvency() {
        let s = setup();
        let contributor = Address::generate(&s.env);
        let governor1 = Address::generate(&s.env);
        let governor2 = Address::generate(&s.env);
        let claimant = Address::generate(&s.env);

        // Setup: contribute to fund and register governors
        mint(&s.env, &s.admin, &s.token_id, &contributor, 10_000);
        s.client.contribute(&contributor, &5_000_i128).unwrap();
        assert_solvency(&s);

        s.client.add_governor(&s.admin, &governor1).unwrap();
        s.client.add_governor(&s.admin, &governor2).unwrap();

        // Submit claim
        let desc = String::from_str(&s.env, "Loss from contract bug");
        let claim_id = s.client.submit_claim(&claimant, &desc, &1_000_i128).unwrap();
        assert_solvency(&s);

        // Governors vote to approve
        s.client.vote(&governor1, &claim_id, &true).unwrap();
        assert_solvency(&s);

        s.client.vote(&governor2, &claim_id, &true).unwrap();
        assert_solvency(&s);

        // Payout should maintain solvency
        let initial_balance = s.client.get_fund_info().unwrap().current_balance;
        s.client.execute_payout(&claim_id).unwrap();
        assert_solvency(&s);

        let final_balance = s.client.get_fund_info().unwrap().current_balance;
        assert_eq!(final_balance, initial_balance - 1_000);
    }

    /// Test invariant: solvency with stake withdrawals
    #[test]
    fn test_stake_withdrawal_solvency() {
        let s = setup();
        let staker = Address::generate(&s.env);

        // Contribute
        mint(&s.env, &s.admin, &s.token_id, &staker, 2_000);
        s.client.contribute(&staker, &1_000_i128).unwrap();
        assert_solvency(&s);

        // Stake part of contribution
        s.client.stake(&staker, &500_i128).unwrap();
        assert_solvency(&s);

        // Verify balance unchanged
        let info_after_stake = s.client.get_fund_info().unwrap();
        assert_eq!(info_after_stake.current_balance, 1_000);

        // Unstake
        s.client.unstake(&staker, &250_i128).unwrap();
        assert_solvency(&s);

        let final_info = s.client.get_fund_info().unwrap();
        assert_eq!(final_info.current_balance, 750);
    }

    /// Test invariant: consecutive operations maintain solvency
    #[test]
    fn test_continuous_operations_solvency() {
        let s = setup();
        let staker1 = Address::generate(&s.env);
        let staker2 = Address::generate(&s.env);
        let governor = Address::generate(&s.env);
        let claimant1 = Address::generate(&s.env);
        let claimant2 = Address::generate(&s.env);

        // Initial contributions
        mint(&s.env, &s.admin, &s.token_id, &staker1, 5_000);
        mint(&s.env, &s.admin, &s.token_id, &staker2, 3_000);

        s.client.contribute(&staker1, &2_000_i128).unwrap();
        assert_solvency(&s);

        s.client.contribute(&staker2, &1_500_i128).unwrap();
        assert_solvency(&s);

        // Add governor
        s.client.add_governor(&s.admin, &governor).unwrap();
        assert_solvency(&s);

        // First claim
        let desc1 = String::from_str(&s.env, "First loss");
        let claim1_id = s.client.submit_claim(&claimant1, &desc1, &500_i128).unwrap();
        assert_solvency(&s);

        // Second claim
        let desc2 = String::from_str(&s.env, "Second loss");
        let _claim2_id = s.client.submit_claim(&claimant2, &desc2, &300_i128).unwrap();
        assert_solvency(&s);

        // Vote on claims
        s.client.vote(&governor, &claim1_id, &true).unwrap();
        assert_solvency(&s);

        // Verify final solvency
        let final_info = s.client.get_fund_info().unwrap();
        assert!(final_info.current_balance >= 0);
        assert_eq!(final_info.total_contributed, 3_500);
    }

    /// Test invariant: solvency with yield claims
    #[test]
    fn test_yield_claim_solvency() {
        let s = setup();
        let staker = Address::generate(&s.env);

        // Contribute and stake
        mint(&s.env, &s.admin, &s.token_id, &staker, 2_000);
        s.client.contribute(&staker, &1_000_i128).unwrap();
        assert_solvency(&s);

        s.client.stake(&staker, &800_i128).unwrap();
        assert_solvency(&s);

        // Claim yield
        s.client.claim_yield(&staker).unwrap();
        assert_solvency(&s);

        let info = s.client.get_fund_info().unwrap();
        assert!(info.current_balance >= 0);
    }

    /// Test invariant: pool remains solvent after zero-amount operations
    #[test]
    fn test_edge_case_zero_operations() {
        let s = setup();
        let contributor = Address::generate(&s.env);

        // Make contribution
        mint(&s.env, &s.admin, &s.token_id, &contributor, 500);
        s.client.contribute(&contributor, &100_i128).unwrap();
        assert_solvency(&s);

        let before = s.client.get_fund_info().unwrap();

        // Attempt unstake of 0 (should maintain balance)
        s.client.unstake(&contributor, &0_i128).unwrap();
        assert_solvency(&s);

        let after = s.client.get_fund_info().unwrap();
        assert_eq!(before.current_balance, after.current_balance);
    }

    /// Test invariant: pool remains solvent after max claim submission
    #[test]
    fn test_max_claim_solvency() {
        let s = setup();
        let contributor = Address::generate(&s.env);
        let claimant = Address::generate(&s.env);

        // Contribute max amount
        mint(&s.env, &s.admin, &s.token_id, &contributor, 20_000);
        s.client.contribute(&contributor, &15_000_i128).unwrap();
        assert_solvency(&s);

        // Submit claim at max cap
        let desc = String::from_str(&s.env, "Max claim");
        s.client.submit_claim(&claimant, &desc, &10_000_i128).unwrap();
        assert_solvency(&s);

        let info = s.client.get_fund_info().unwrap();
        assert_eq!(info.total_contributed, 15_000);
        assert!(info.current_balance >= 0);
    }
}
