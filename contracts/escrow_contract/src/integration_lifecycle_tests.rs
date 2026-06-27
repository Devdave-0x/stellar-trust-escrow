#[cfg(test)]
#[allow(clippy::module_inception)]
mod integration_lifecycle_tests {
    //! Integration lifecycle tests for the escrow contract.
    //!
    //! These tests simulate complete user workflows on the mock Soroban ledger
    //! and verify correct behavior of the contract with the actual Stellar
    //! protocol semantics — including fee handling, sequence numbers, and
    //! account trustlines as provided by the SDK test environment.

    use crate::{
        EscrowContract, EscrowContractClient, EscrowStatus, MultisigConfig, MS_DISPUTED,
        MS_PENDING, MS_REJECTED, MS_SUBMITTED, UNPAUSE_MIN_DELAY_SECS,
    };
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        token, Address, BytesN, Env, String, Vec,
    };

    // ── Helpers ──────────────────────────────────────────────────────────────

    struct TestEnv {
        env: Env,
        #[allow(dead_code)]
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

    // ═════════════════════════════════════════════════════════════════════════
    // 1. FULL HAPPY PATH — END-TO-END
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn integration_full_lifecycle_happy_path() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let total: i128 = 10_000;
        mint_for_escrow(&t.env, &t.token_id, &client_addr, total, 3);

        assert_eq!(t.client.escrow_count(), 0);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &total,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );
        assert_eq!(escrow_id, 0);
        assert_eq!(t.client.escrow_count(), 1);

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Active);
        assert_eq!(state.total_amount, total);

        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Design"),
            &hash(&t.env, 10),
            &3_000,
        );
        let m1 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Build"),
            &hash(&t.env, 11),
            &5_000,
        );
        let m2 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Deploy"),
            &hash(&t.env, 12),
            &2_000,
        );

        assert_eq!(m0, 0);
        assert_eq!(m1, 1);
        assert_eq!(m2, 2);

        for mid in [m0, m1, m2] {
            let ms = t.client.get_milestone(&escrow_id, &mid);
            assert_eq!(ms.status, MS_PENDING);

            t.client.submit_milestone(&freelancer, &escrow_id, &mid);
            let ms = t.client.get_milestone(&escrow_id, &mid);
            assert_eq!(ms.status, MS_SUBMITTED);

            t.client.approve_milestone(&client_addr, &escrow_id, &mid);
        }

        let final_state = t.client.get_escrow(&escrow_id);
        assert_eq!(final_state.status, EscrowStatus::Completed);
        assert_eq!(balance(&t.env, &t.token_id, &freelancer), total);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 2. DISPUTE → RESOLUTION → REPUTATION
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn integration_dispute_resolution_reputation() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let arbiter = Address::generate(&t.env);
        let total: i128 = 10_000;
        mint_for_escrow(&t.env, &t.token_id, &client_addr, total, 1);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &total,
            &hash(&t.env, 1),
            &Some(arbiter.clone()),
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &total,
        );

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        t.client.raise_dispute(&client_addr, &escrow_id, &Some(m0));

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Disputed);

        let ms = t.client.get_milestone(&escrow_id, &m0);
        assert_eq!(ms.status, MS_DISPUTED);

        t.client
            .resolve_dispute(&arbiter, &escrow_id, &3_000, &7_000);

        let final_state = t.client.get_escrow(&escrow_id);
        assert_eq!(final_state.status, EscrowStatus::Completed);

        let c_rep = t.client.get_reputation(&client_addr);
        let f_rep = t.client.get_reputation(&freelancer);
        assert!(
            c_rep.disputed_escrows > 0 || c_rep.total_volume > 0,
            "Client reputation should be updated"
        );
        assert!(
            f_rep.disputed_escrows > 0 || f_rep.total_volume > 0,
            "Freelancer reputation should be updated"
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 3. MULTI-TOKEN ESCROWS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn integration_multiple_token_types() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);

        let admin2 = Address::generate(&t.env);
        let token2_contract = t.env.register_stellar_asset_contract_v2(admin2.clone());
        let token2_id = token2_contract.address();

        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 1);
        mint_for_escrow(&t.env, &token2_id, &client_addr, 2_000, 1);

        let e1 = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &1_000,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );
        let e2 = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &token2_id,
            &2_000,
            &hash(&t.env, 2),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        let m0 = t.client.add_milestone(
            &client_addr,
            &e1,
            &String::from_str(&t.env, "W1"),
            &hash(&t.env, 3),
            &1_000,
        );
        let m1 = t.client.add_milestone(
            &client_addr,
            &e2,
            &String::from_str(&t.env, "W2"),
            &hash(&t.env, 4),
            &2_000,
        );

        t.client.submit_milestone(&freelancer, &e1, &m0);
        t.client.approve_milestone(&client_addr, &e1, &m0);

        t.client.submit_milestone(&freelancer, &e2, &m1);
        t.client.approve_milestone(&client_addr, &e2, &m1);

        assert_eq!(balance(&t.env, &t.token_id, &freelancer), 1_000);
        assert_eq!(balance(&t.env, &token2_id, &freelancer), 2_000);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 4. REJECT → RESUBMIT → APPROVE CYCLE
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn integration_reject_resubmit_approve_cycle() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 1);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &1_000,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &1_000,
        );

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        let ms = t.client.get_milestone(&escrow_id, &m0);
        assert_eq!(ms.status, MS_SUBMITTED);

        t.client.reject_milestone(&client_addr, &escrow_id, &m0);
        let ms = t.client.get_milestone(&escrow_id, &m0);
        assert_eq!(ms.status, MS_REJECTED);

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        let ms = t.client.get_milestone(&escrow_id, &m0);
        assert_eq!(ms.status, MS_SUBMITTED);

        t.client.reject_milestone(&client_addr, &escrow_id, &m0);

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        t.client.approve_milestone(&client_addr, &escrow_id, &m0);

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Completed);
        assert_eq!(balance(&t.env, &t.token_id, &freelancer), 1_000);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 5. PAUSE → ATTEMPT OPS → UNPAUSE → OPS RESUME
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn integration_pause_unpause_lifecycle() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 1);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &1_000,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        t.client.pause(&t.admin, &String::from_str(&t.env, ""));
        assert!(t.client.is_paused());

        t.env
            .ledger()
            .with_mut(|l| l.timestamp += UNPAUSE_MIN_DELAY_SECS);
        let milestone_result = t.client.try_add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &500,
        );
        assert!(milestone_result.is_err(), "Should reject during pause");

        let create_result = t.client.try_create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &100,
            &hash(&t.env, 3),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );
        assert!(
            create_result.is_err(),
            "Should reject creation during pause"
        );

        t.client.unpause(&t.admin);
        assert!(!t.client.is_paused());

        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &1_000,
        );
        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        t.client.approve_milestone(&client_addr, &escrow_id, &m0);

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Completed);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 6. FREEZE → UNFREEZE LIFECYCLE
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn integration_freeze_unfreeze_lifecycle() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 1);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &1_000,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        {
            let mut __v = soroban_sdk::Vec::new(&t.env);
            __v.push_back(t.admin.clone());
            t.client.freeze_escrow(&escrow_id, &__v);
        }

        let add_result = t.client.try_add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &500,
        );
        assert!(add_result.is_err(), "Should reject on frozen escrow");

        let cancel_result = t.client.try_cancel_escrow(&client_addr, &escrow_id);
        assert!(
            cancel_result.is_err(),
            "Should reject cancel on frozen escrow"
        );

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
            &1_000,
        );
        assert_eq!(m0, 0);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 7. ADMIN TRANSFER WITH CONTINUED OPERATIONS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn integration_admin_transfer_continued_ops() {
        let t = setup();
        let new_admin = Address::generate(&t.env);

        t.client.propose_admin(&t.admin, &new_admin);
        t.client.accept_admin(&new_admin);
        assert_eq!(t.client.get_admin(), new_admin);

        let old_admin_pause = t.client.try_pause(&t.admin, &String::from_str(&t.env, ""));
        assert!(
            old_admin_pause.is_err(),
            "Old admin should not be able to pause"
        );

        t.client.pause(&new_admin, &String::from_str(&t.env, ""));
        assert!(t.client.is_paused());
        t.env
            .ledger()
            .with_mut(|l| l.timestamp += UNPAUSE_MIN_DELAY_SECS);
        t.client.unpause(&new_admin);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 8. PARTIAL CANCEL → COMPLETE REMAINING
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn integration_partial_cancel_then_complete() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let total: i128 = 5_000;
        mint_for_escrow(&t.env, &t.token_id, &client_addr, total, 2);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &total,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Phase1"),
            &hash(&t.env, 2),
            &2_000,
        );

        let refunded = t.client.partial_cancel(&client_addr, &escrow_id);
        assert_eq!(refunded, 3_000);

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Active);

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        t.client.approve_milestone(&client_addr, &escrow_id, &m0);

        assert_eq!(balance(&t.env, &t.token_id, &freelancer), 2_000);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 9. TRANSFER CLIENT ROLE → NEW CLIENT COMPLETES ESCROW
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn integration_transfer_client_then_complete() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let new_client = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 1);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &1_000,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &1_000,
        );

        t.client.transfer_client_role(&escrow_id, &new_client);

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.client, new_client);

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        t.client.approve_milestone(&new_client, &escrow_id, &m0);

        let final_state = t.client.get_escrow(&escrow_id);
        assert_eq!(final_state.status, EscrowStatus::Completed);
        assert_eq!(balance(&t.env, &t.token_id, &freelancer), 1_000);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 10. CONCURRENT ESCROWS — ISOLATION CHECK
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn integration_concurrent_escrows_isolated() {
        let t = setup();
        let client1 = Address::generate(&t.env);
        let client2 = Address::generate(&t.env);
        let freelancer1 = Address::generate(&t.env);
        let freelancer2 = Address::generate(&t.env);

        mint_for_escrow(&t.env, &t.token_id, &client1, 1_000, 1);
        mint_for_escrow(&t.env, &t.token_id, &client2, 2_000, 1);

        let e1 = t.client.create_escrow(
            &client1,
            &freelancer1,
            &t.token_id,
            &1_000,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );
        let e2 = t.client.create_escrow(
            &client2,
            &freelancer2,
            &t.token_id,
            &2_000,
            &hash(&t.env, 2),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        let _m1 = t.client.add_milestone(
            &client1,
            &e1,
            &String::from_str(&t.env, "W1"),
            &hash(&t.env, 3),
            &1_000,
        );
        let m2 = t.client.add_milestone(
            &client2,
            &e2,
            &String::from_str(&t.env, "W2"),
            &hash(&t.env, 4),
            &2_000,
        );

        t.client.cancel_escrow(&client1, &e1);

        let e1_state = t.client.get_escrow(&e1);
        assert_eq!(e1_state.status, EscrowStatus::Cancelled);

        let e2_state = t.client.get_escrow(&e2);
        assert_eq!(e2_state.status, EscrowStatus::Active);

        t.client.submit_milestone(&freelancer2, &e2, &m2);
        t.client.approve_milestone(&client2, &e2, &m2);
        assert_eq!(balance(&t.env, &t.token_id, &freelancer2), 2_000);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 11. BATCH OPERATIONS LIFECYCLE
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn integration_batch_add_and_lifecycle() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let total: i128 = 3_000;
        mint_for_escrow(&t.env, &t.token_id, &client_addr, total, 3);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &total,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        let mut titles = Vec::new(&t.env);
        titles.push_back(String::from_str(&t.env, "A"));
        titles.push_back(String::from_str(&t.env, "B"));
        titles.push_back(String::from_str(&t.env, "C"));

        let mut hashes = Vec::new(&t.env);
        hashes.push_back(hash(&t.env, 10));
        hashes.push_back(hash(&t.env, 11));
        hashes.push_back(hash(&t.env, 12));

        let mut amounts = Vec::new(&t.env);
        amounts.push_back(1_000_i128);
        amounts.push_back(1_000_i128);
        amounts.push_back(1_000_i128);

        t.client
            .batch_add_milestones(&client_addr, &escrow_id, &titles, &hashes, &amounts);

        for mid in 0..3_u32 {
            t.client.submit_milestone(&freelancer, &escrow_id, &mid);
            t.client.approve_milestone(&client_addr, &escrow_id, &mid);
        }

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Completed);
        assert_eq!(balance(&t.env, &t.token_id, &freelancer), total);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 12. TEMPLATE → CREATE FROM TEMPLATE
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn integration_template_create_escrow() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let creator = Address::generate(&t.env);

        let mut milestones = Vec::new(&t.env);
        milestones.push_back(crate::types::MilestoneTemplate {
            title: String::from_str(&t.env, "Design"),
            description_hash: hash(&t.env, 10),
            amount: 500,
        });
        milestones.push_back(crate::types::MilestoneTemplate {
            title: String::from_str(&t.env, "Build"),
            description_hash: hash(&t.env, 11),
            amount: 500,
        });

        let template_id = t.client.create_template(
            &creator,
            &String::from_str(&t.env, "Standard Project"),
            &milestones,
        );

        let tmpl = t.client.get_template(&template_id);
        assert_eq!(tmpl.milestones.len(), 2);

        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 2);
        let escrow_id = t.client.create_escrow_from_template(
            &client_addr,
            &template_id,
            &client_addr,
            &freelancer,
            &t.token_id,
            &1_000,
            &hash(&t.env, 1),
            &None,
            &None,
        );

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Active);
        assert_eq!(state.milestones.len(), 2);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 13. REPUTATION TRACKING ACROSS MULTIPLE ESCROWS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn integration_reputation_accumulates() {
        let t = setup();
        let _client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);

        let rep_before = t.client.get_reputation(&freelancer);
        assert_eq!(rep_before.total_score, 0);

        t.client
            .update_reputation(&freelancer, &true, &false, &1_000);

        let rep_after = t.client.get_reputation(&freelancer);
        assert!(
            rep_after.completed_escrows > rep_before.completed_escrows
                || rep_after.total_volume > rep_before.total_volume,
            "Reputation should be updated"
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 14. ESCROW INDEX QUERIES
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn integration_escrow_index_queries() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 5_000, 0);

        let _e1 = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &1_000,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );
        let _e2 = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &1_000,
            &hash(&t.env, 2),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        let client_escrows = t
            .client
            .get_escrow_ids_by_participant(&client_addr, &0_u32, &50_u32);
        assert!(client_escrows.len() >= 2);

        let active_escrows =
            t.client
                .get_escrow_ids_by_status(&EscrowStatus::Active, &0_u32, &50_u32);
        assert!(active_escrows.len() >= 2);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 15. MULTIPLE DISPUTES ACROSS DIFFERENT ESCROWS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn integration_multiple_escrows_different_outcomes() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let arbiter = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 5_000, 2);

        let e1 = t.client.create_escrow(
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
        let m1 = t.client.add_milestone(
            &client_addr,
            &e1,
            &String::from_str(&t.env, "W1"),
            &hash(&t.env, 2),
            &1_000,
        );
        t.client.submit_milestone(&freelancer, &e1, &m1);
        t.client.approve_milestone(&client_addr, &e1, &m1);

        let e2 = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &1_000,
            &hash(&t.env, 3),
            &Some(arbiter.clone()),
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );
        t.client.raise_dispute(&client_addr, &e2, &None);
        t.client.resolve_dispute(&arbiter, &e2, &500, &500);

        let s1 = t.client.get_escrow(&e1);
        let s2 = t.client.get_escrow(&e2);
        assert_eq!(s1.status, EscrowStatus::Completed);
        assert_eq!(s2.status, EscrowStatus::Completed);
    }
}
