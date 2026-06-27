#[cfg(test)]
#[allow(clippy::module_inception)]
mod unit_coverage_tests {
    use crate::{
        EscrowContract, EscrowContractClient, EscrowStatus, MultisigConfig, MAX_ESCROW_AMOUNT,
        MS_DISPUTED, MS_PENDING, MS_REJECTED, MS_SUBMITTED,
    };
    use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env, String, Vec};

    // ── Helpers ──────────────────────────────────────────────────────────────

    struct TestEnv {
        env: Env,
        contract_id: Address,
        client: EscrowContractClient<'static>,
        admin: Address,
        token_id: Address,
    }

    fn setup() -> TestEnv {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        client.set_platform_treasury(&admin, &admin);
        TestEnv {
            env,
            contract_id,
            client,
            admin,
            token_id,
        }
    }

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: Vec::new(env),
            weights: Vec::new(env),
            threshold: 0,
        }
    }

    fn mint(env: &Env, token_id: &Address, to: &Address, amount: i128) {
        token::StellarAssetClient::new(env, token_id).mint(to, &amount);
    }

    fn hash(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    fn balance(env: &Env, token_id: &Address, addr: &Address) -> i128 {
        token::Client::new(env, token_id).balance(addr)
    }

    const RENT_RESERVE_PER_ENTRY: i128 = 30;

    fn mint_for_escrow(
        env: &Env,
        token_id: &Address,
        to: &Address,
        amount: i128,
        expected_milestones: i128,
    ) {
        mint(
            env,
            token_id,
            to,
            amount + RENT_RESERVE_PER_ENTRY * (1 + expected_milestones),
        );
    }

    fn create_basic_escrow(
        t: &TestEnv,
        client_addr: &Address,
        freelancer: &Address,
        amount: i128,
    ) -> u64 {
        t.client.create_escrow(
            client_addr,
            freelancer,
            &t.token_id,
            &amount,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        )
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 1. INITIALIZATION TESTS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_double_initialize_fails() {
        let t = setup();
        let result = t.client.try_initialize(&t.admin);
        assert!(result.is_err());
    }

    #[test]
    fn test_get_admin_returns_correct_admin() {
        let t = setup();
        let admin = t.client.get_admin();
        assert_eq!(admin, t.admin);
    }

    #[test]
    fn test_escrow_count_starts_at_zero() {
        let t = setup();
        assert_eq!(t.client.escrow_count(), 0);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 2. ESCROW CREATION TESTS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_create_escrow_basic() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 0);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 1_000);
        assert_eq!(escrow_id, 0);
        assert_eq!(t.client.escrow_count(), 1);

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Active);
        assert_eq!(state.total_amount, 1_000);
        assert_eq!(state.client, client_addr);
        assert_eq!(state.freelancer, freelancer);
    }

    #[test]
    fn test_create_escrow_self_escrow_rejected() {
        let t = setup();
        let addr = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &addr, 1_000, 0);

        let result = t.client.try_create_escrow(
            &addr,
            &addr,
            &t.token_id,
            &1_000,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_create_escrow_zero_amount_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);

        let result = t.client.try_create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &0,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_create_escrow_negative_amount_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);

        let result = t.client.try_create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &-100,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_create_escrow_exceeds_max_amount_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let over_max = MAX_ESCROW_AMOUNT + 1;
        mint(&t.env, &t.token_id, &client_addr, over_max + 10_000);

        let result = t.client.try_create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &over_max,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_create_escrow_with_arbiter_same_as_client_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

        let result = t.client.try_create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &500,
            &hash(&t.env, 1),
            &Some(client_addr.clone()),
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_create_escrow_with_arbiter_same_as_freelancer_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

        let result = t.client.try_create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &500,
            &hash(&t.env, 1),
            &Some(freelancer.clone()),
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_create_multiple_escrows_increments_counter() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 3_000, 0);

        let id0 = create_basic_escrow(&t, &client_addr, &freelancer, 100);
        let id1 = create_basic_escrow(&t, &client_addr, &freelancer, 100);
        let id2 = create_basic_escrow(&t, &client_addr, &freelancer, 100);

        assert_eq!(id0, 0);
        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
        assert_eq!(t.client.escrow_count(), 3);
    }

    #[test]
    fn test_create_escrow_with_valid_arbiter() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let arbiter = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &500,
            &hash(&t.env, 1),
            &Some(arbiter.clone()),
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.arbiter, Some(arbiter));
    }

    #[test]
    fn test_create_escrow_minimum_amount() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1, 0);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 1);
        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.total_amount, 1);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 3. MILESTONE LIFECYCLE TESTS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_add_milestone_success() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 2);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 1_000);
        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Design"),
            &hash(&t.env, 2),
            &500,
        );

        assert_eq!(m0, 0);
        let ms = t.client.get_milestone(&escrow_id, &m0);
        assert_eq!(ms.status, MS_PENDING);
        assert_eq!(ms.amount, 500);
    }

    #[test]
    fn test_add_milestone_zero_amount_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 1);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 1_000);
        let result = t.client.try_add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Bad"),
            &hash(&t.env, 2),
            &0,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_add_milestone_negative_amount_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 1);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 1_000);
        let result = t.client.try_add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Bad"),
            &hash(&t.env, 2),
            &-100,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_add_milestone_exceeds_total_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 2);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 1_000);
        t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Full"),
            &hash(&t.env, 2),
            &1_000,
        );

        let result = t.client.try_add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Over"),
            &hash(&t.env, 3),
            &1,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_add_milestone_by_non_client_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 1);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 1_000);
        let result = t.client.try_add_milestone(
            &freelancer,
            &escrow_id,
            &String::from_str(&t.env, "Hack"),
            &hash(&t.env, 2),
            &100,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_submit_milestone_by_freelancer() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 1);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &500,
        );

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        let ms = t.client.get_milestone(&escrow_id, &m0);
        assert_eq!(ms.status, MS_SUBMITTED);
        assert!(ms.submitted_at.is_some());
    }

    #[test]
    fn test_submit_milestone_by_non_freelancer_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 1);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &500,
        );

        let result = t.client.try_submit_milestone(&client_addr, &escrow_id, &m0);
        assert!(result.is_err());
    }

    #[test]
    fn test_approve_milestone_releases_funds() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 1);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &500,
        );

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        t.client.approve_milestone(&client_addr, &escrow_id, &m0);

        assert_eq!(balance(&t.env, &t.token_id, &freelancer), 500);

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Completed);
    }

    #[test]
    fn test_approve_unapproved_milestone_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 1);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &500,
        );

        let result = t
            .client
            .try_approve_milestone(&client_addr, &escrow_id, &m0);
        assert!(result.is_err());
    }

    #[test]
    fn test_reject_milestone_sets_status() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 1);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &500,
        );

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        t.client.reject_milestone(&client_addr, &escrow_id, &m0);

        let ms = t.client.get_milestone(&escrow_id, &m0);
        assert_eq!(ms.status, MS_REJECTED);
        assert!(ms.resolved_at.is_some());
    }

    #[test]
    fn test_reject_not_submitted_milestone_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 1);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &500,
        );

        let result = t.client.try_reject_milestone(&client_addr, &escrow_id, &m0);
        assert!(result.is_err());
    }

    #[test]
    fn test_resubmit_after_rejection() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 1);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &500,
        );

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        t.client.reject_milestone(&client_addr, &escrow_id, &m0);
        t.client.submit_milestone(&freelancer, &escrow_id, &m0);

        let ms = t.client.get_milestone(&escrow_id, &m0);
        assert_eq!(ms.status, MS_SUBMITTED);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 4. DISPUTE LIFECYCLE TESTS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_raise_dispute_by_client() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        t.client.raise_dispute(&client_addr, &escrow_id, &None);

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Disputed);
    }

    #[test]
    fn test_raise_dispute_by_freelancer() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        t.client.raise_dispute(&freelancer, &escrow_id, &None);

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Disputed);
    }

    #[test]
    fn test_raise_dispute_by_outsider_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let outsider = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        let result = t.client.try_raise_dispute(&outsider, &escrow_id, &None);
        assert!(result.is_err());
    }

    #[test]
    fn test_double_dispute_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        t.client.raise_dispute(&client_addr, &escrow_id, &None);

        let result = t.client.try_raise_dispute(&freelancer, &escrow_id, &None);
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_dispute_by_arbiter() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let arbiter = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 0);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &1_000,
            &hash(&t.env, 1),
            &Some(arbiter.clone()),
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        t.client.raise_dispute(&client_addr, &escrow_id, &None);
        t.client.resolve_dispute(&arbiter, &escrow_id, &400, &600);

        assert_eq!(balance(&t.env, &t.token_id, &client_addr), 400);
        assert_eq!(balance(&t.env, &t.token_id, &freelancer), 600);
    }

    #[test]
    fn test_resolve_dispute_amounts_must_equal_remaining() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let arbiter = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 0);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &1_000,
            &hash(&t.env, 1),
            &Some(arbiter.clone()),
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        t.client.raise_dispute(&client_addr, &escrow_id, &None);
        let result = t
            .client
            .try_resolve_dispute(&arbiter, &escrow_id, &400, &400);
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_non_disputed_escrow_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let arbiter = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 0);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &1_000,
            &hash(&t.env, 1),
            &Some(arbiter.clone()),
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        let result = t
            .client
            .try_resolve_dispute(&arbiter, &escrow_id, &500, &500);
        assert!(result.is_err());
    }

    #[test]
    fn test_raise_dispute_on_specific_milestone() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 1);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &500,
        );

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        t.client.raise_dispute(&client_addr, &escrow_id, &Some(m0));

        let ms = t.client.get_milestone(&escrow_id, &m0);
        assert_eq!(ms.status, MS_DISPUTED);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 5. CANCELLATION TESTS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_cancel_escrow_refunds_client() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        t.client.cancel_escrow(&client_addr, &escrow_id);

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Cancelled);
        assert!(balance(&t.env, &t.token_id, &client_addr) > 0);
    }

    #[test]
    fn test_cancel_escrow_by_non_client_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        let result = t.client.try_cancel_escrow(&freelancer, &escrow_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_cancel_completed_escrow_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 1);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &500,
        );
        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        t.client.approve_milestone(&client_addr, &escrow_id, &m0);

        let result = t.client.try_cancel_escrow(&client_addr, &escrow_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_cancel_disputed_escrow_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        t.client.raise_dispute(&client_addr, &escrow_id, &None);

        let result = t.client.try_cancel_escrow(&client_addr, &escrow_id);
        assert!(result.is_err());
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 6. PAUSE / UNPAUSE TESTS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_pause_blocks_create_escrow() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

        t.client
            .pause(&t.admin, &soroban_sdk::String::from_str(&t.env, ""));
        assert!(t.client.is_paused());

        let result = t.client.try_create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &500,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_unpause_resumes_operations() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

        t.client
            .pause(&t.admin, &soroban_sdk::String::from_str(&t.env, ""));
        t.client.unpause(&t.admin);
        assert!(!t.client.is_paused());

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        assert_eq!(escrow_id, 0);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 7. REPUTATION TESTS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_reputation_default_new_address() {
        let t = setup();
        let user = Address::generate(&t.env);
        let rep = t.client.get_reputation(&user);
        assert_eq!(rep.total_score, 0);
        assert_eq!(rep.completed_escrows, 0);
        assert_eq!(rep.disputed_escrows, 0);
        assert_eq!(rep.total_volume, 0);
    }

    #[test]
    fn test_reputation_updated_after_dispute_resolution() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let arbiter = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 0);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &1_000,
            &hash(&t.env, 1),
            &Some(arbiter.clone()),
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        t.client.raise_dispute(&client_addr, &escrow_id, &None);
        t.client.resolve_dispute(&arbiter, &escrow_id, &500, &500);

        let c_rep = t.client.get_reputation(&client_addr);
        assert!(c_rep.disputed_escrows > 0 || c_rep.total_volume > 0);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 8. ADMIN TRANSFER TESTS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_two_step_admin_transfer() {
        let t = setup();
        let new_admin = Address::generate(&t.env);

        t.client.propose_admin(&t.admin, &new_admin);
        t.client.accept_admin(&new_admin);

        assert_eq!(t.client.get_admin(), new_admin);
    }

    #[test]
    fn test_accept_admin_by_wrong_address_rejected() {
        let t = setup();
        let new_admin = Address::generate(&t.env);
        let wrong_addr = Address::generate(&t.env);

        t.client.propose_admin(&t.admin, &new_admin);
        let result = t.client.try_accept_admin(&wrong_addr);
        assert!(result.is_err());
    }

    #[test]
    fn test_propose_admin_by_non_admin_rejected() {
        let t = setup();
        let non_admin = Address::generate(&t.env);
        let new_admin = Address::generate(&t.env);

        let result = t.client.try_propose_admin(&non_admin, &new_admin);
        assert!(result.is_err());
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 9. FREEZE / UNFREEZE TESTS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_freeze_blocks_milestone_operations() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 1);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        {
            let mut __v = soroban_sdk::Vec::new(&t.env);
            __v.push_back(t.admin.clone());
            t.client.freeze_escrow(&escrow_id, &__v);
        }

        let result = t.client.try_add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &500,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_unfreeze_resumes_operations() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 1);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        {
            let mut __v = soroban_sdk::Vec::new(&t.env);
            __v.push_back(t.admin.clone());
            t.client.freeze_escrow(&escrow_id, &__v);
        }
        {
            let mut __v = soroban_sdk::Vec::new(&t.env);
            __v.push_back(t.admin.clone());
            t.client.unfreeze_escrow(&escrow_id, &__v);
        }

        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &500,
        );
        assert_eq!(m0, 0);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 10. MULTI-MILESTONE & FULL LIFECYCLE TESTS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_multi_milestone_lifecycle() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 3);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 1_000);

        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Design"),
            &hash(&t.env, 2),
            &300,
        );
        let m1 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Build"),
            &hash(&t.env, 3),
            &400,
        );
        let m2 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Test"),
            &hash(&t.env, 4),
            &300,
        );

        for mid in [m0, m1, m2] {
            t.client.submit_milestone(&freelancer, &escrow_id, &mid);
            t.client.approve_milestone(&client_addr, &escrow_id, &mid);
        }

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Completed);
        assert_eq!(balance(&t.env, &t.token_id, &freelancer), 1_000);
    }

    #[test]
    fn test_partial_milestone_completion() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 2);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 1_000);

        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Part1"),
            &hash(&t.env, 2),
            &600,
        );
        let _m1 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Part2"),
            &hash(&t.env, 3),
            &400,
        );

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        t.client.approve_milestone(&client_addr, &escrow_id, &m0);

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Active);
        assert_eq!(balance(&t.env, &t.token_id, &freelancer), 600);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 11. TRANSFER CLIENT ROLE
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_transfer_client_role() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let new_client = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        t.client.transfer_client_role(&escrow_id, &new_client);

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.client, new_client);
    }

    #[test]
    fn test_transfer_client_role_to_freelancer_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        let result = t.client.try_transfer_client_role(&escrow_id, &freelancer);
        assert!(result.is_err());
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 12. BATCH OPERATIONS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_batch_add_milestones() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 3);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 1_000);

        let mut titles = Vec::new(&t.env);
        titles.push_back(String::from_str(&t.env, "A"));
        titles.push_back(String::from_str(&t.env, "B"));
        titles.push_back(String::from_str(&t.env, "C"));

        let mut hashes = Vec::new(&t.env);
        hashes.push_back(hash(&t.env, 10));
        hashes.push_back(hash(&t.env, 11));
        hashes.push_back(hash(&t.env, 12));

        let mut amounts = Vec::new(&t.env);
        amounts.push_back(300_i128);
        amounts.push_back(300_i128);
        amounts.push_back(400_i128);

        t.client
            .batch_add_milestones(&client_addr, &escrow_id, &titles, &hashes, &amounts);

        let ms0 = t.client.get_milestone(&escrow_id, &0);
        let ms1 = t.client.get_milestone(&escrow_id, &1);
        let ms2 = t.client.get_milestone(&escrow_id, &2);
        assert_eq!(ms0.amount, 300);
        assert_eq!(ms1.amount, 300);
        assert_eq!(ms2.amount, 400);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 13. TOKEN WHITELIST
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_token_whitelist_enable_and_add() {
        let t = setup();
        t.client.set_token_whitelist_enabled(&t.admin, &true);

        let token = Address::generate(&t.env);
        t.client.add_approved_token(&t.admin, &token);

        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &token, &client_addr, 500, 0);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &500,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );
        assert_eq!(escrow_id, 0);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 14. PARTIAL CANCEL
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_partial_cancel_returns_unallocated() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 1);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 1_000);
        t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Part"),
            &hash(&t.env, 2),
            &400,
        );

        let refunded = t.client.partial_cancel(&client_addr, &escrow_id);
        assert_eq!(refunded, 600);

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Active);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 15. ESCROW QUERY TESTS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_get_nonexistent_escrow_fails() {
        let t = setup();
        let result = t.client.try_get_escrow(&999);
        assert!(result.is_err());
    }

    #[test]
    fn test_get_nonexistent_milestone_fails() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        let result = t.client.try_get_milestone(&escrow_id, &99);
        assert!(result.is_err());
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 16. TEMPLATE TESTS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_create_and_get_template() {
        let t = setup();
        let creator = Address::generate(&t.env);
        let name = String::from_str(&t.env, "Standard");
        let mut milestones = Vec::new(&t.env);
        milestones.push_back(crate::types::MilestoneTemplate {
            title: String::from_str(&t.env, "Phase 1"),
            description_hash: hash(&t.env, 1),
            amount: 500,
        });

        let template_id = t.client.create_template(&creator, &name, &milestones);
        let tmpl = t.client.get_template(&template_id);
        assert_eq!(tmpl.creator, creator);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 17. EDGE CASE BALANCE CHECKS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_funds_correctly_locked_on_create() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 0);

        let initial = balance(&t.env, &t.token_id, &client_addr);
        create_basic_escrow(&t, &client_addr, &freelancer, 1_000);

        let after = balance(&t.env, &t.token_id, &client_addr);
        assert!(after < initial);
        let contract_bal = balance(&t.env, &t.token_id, &t.contract_id);
        assert!(contract_bal >= 1_000);
    }

    #[test]
    fn test_resolve_dispute_all_to_client() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let arbiter = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 0);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &1_000,
            &hash(&t.env, 1),
            &Some(arbiter.clone()),
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );
        t.client.raise_dispute(&client_addr, &escrow_id, &None);
        t.client.resolve_dispute(&arbiter, &escrow_id, &1_000, &0);

        assert!(balance(&t.env, &t.token_id, &client_addr) > 0);
        assert_eq!(balance(&t.env, &t.token_id, &freelancer), 0);
    }

    #[test]
    fn test_resolve_dispute_all_to_freelancer() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let arbiter = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 0);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &1_000,
            &hash(&t.env, 1),
            &Some(arbiter.clone()),
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );
        t.client.raise_dispute(&client_addr, &escrow_id, &None);
        t.client.resolve_dispute(&arbiter, &escrow_id, &0, &1_000);

        assert!(balance(&t.env, &t.token_id, &freelancer) > 0);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 18. SET MAX MILESTONES
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_set_max_milestones_admin_only() {
        let t = setup();
        let non_admin = Address::generate(&t.env);
        let result = t.client.try_set_max_milestones(&non_admin, &5);
        assert!(result.is_err());

        t.client.set_max_milestones(&t.admin, &5);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 19. CONTRACT BALANCE QUERY
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_get_contract_balance() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 0);

        create_basic_escrow(&t, &client_addr, &freelancer, 1_000);
        let bal = t.client.get_contract_balance(&t.token_id);
        assert!(bal >= 1_000);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 20. ADD MILESTONE TO CANCELLED ESCROW REJECTED
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_add_milestone_to_cancelled_escrow_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 1);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        t.client.cancel_escrow(&client_addr, &escrow_id);

        let result = t.client.try_add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Late"),
            &hash(&t.env, 2),
            &100,
        );
        assert!(result.is_err());
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 21. SUBMIT MILESTONE ON NON-ACTIVE ESCROW
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_submit_milestone_on_disputed_escrow_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 1);

        let escrow_id = create_basic_escrow(&t, &client_addr, &freelancer, 500);
        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &500,
        );
        t.client.raise_dispute(&client_addr, &escrow_id, &None);

        let result = t.client.try_submit_milestone(&freelancer, &escrow_id, &m0);
        assert!(result.is_err());
    }
}
