#[cfg(test)]
#[allow(clippy::module_inception)]
mod fuzz_tests {
    //! Fuzz-style tests for the escrow contract entry points.
    //!
    //! These tests exercise contract functions with boundary values, extreme
    //! inputs, and unexpected state combinations that a developer might not
    //! anticipate. They complement unit and property tests by exploring the
    //! input space more broadly.
    //!
    //! Categories:
    //! - Boundary value testing (min/max/zero/negative/overflow)
    //! - Invalid state combination testing
    //! - Rapid-fire operation sequences
    //! - Edge-case amount distributions

    use crate::{
        EscrowContract, EscrowContractClient, EscrowStatus, MultisigConfig, MAX_ESCROW_AMOUNT,
        MAX_MILESTONES,
    };
    use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env, String, Vec};

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
    // 1. BOUNDARY VALUE TESTS — AMOUNT EXTREMES
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn fuzz_create_escrow_amount_boundaries() {
        let t = setup();
        let _client_addr = Address::generate(&t.env);
        let _freelancer = Address::generate(&t.env);

        let boundary_amounts: [i128; 8] = [
            i128::MIN,
            -1,
            0,
            1,
            MAX_ESCROW_AMOUNT - 1,
            MAX_ESCROW_AMOUNT,
            MAX_ESCROW_AMOUNT + 1,
            i128::MAX,
        ];

        for &amount in &boundary_amounts {
            let t = setup();
            let client_addr = Address::generate(&t.env);
            let freelancer = Address::generate(&t.env);
            if amount > 0 {
                mint(
                    &t.env,
                    &t.token_id,
                    &client_addr,
                    amount.saturating_add(10_000),
                );
            }

            let result = t.client.try_create_escrow(
                &client_addr,
                &freelancer,
                &t.token_id,
                &amount,
                &hash(&t.env, 1),
                &None,
                &None,
                &None,
                &None,
                &no_multisig(&t.env),
            );

            if (1..=MAX_ESCROW_AMOUNT).contains(&amount) {
                assert!(result.is_ok(), "Should accept valid amount {amount}");
            } else {
                assert!(result.is_err(), "Should reject invalid amount {amount}");
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 2. MILESTONE AMOUNT BOUNDARY FUZZING
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn fuzz_milestone_amount_boundaries() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 10_000, 5);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &10_000,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        let invalid_amounts: [i128; 4] = [i128::MIN, -1, 0, i128::MAX];
        for &amount in &invalid_amounts {
            let result = t.client.try_add_milestone(
                &client_addr,
                &escrow_id,
                &String::from_str(&t.env, "Test"),
                &hash(&t.env, 2),
                &amount,
            );
            assert!(result.is_err(), "Should reject milestone amount {amount}");
        }

        let valid_result = t.client.try_add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Valid"),
            &hash(&t.env, 3),
            &1,
        );
        assert!(valid_result.is_ok(), "Should accept minimum valid amount");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 3. RAPID CREATE-CANCEL CYCLES
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn fuzz_rapid_create_cancel_cycles() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 50_000, 0);

        for i in 0..10_u8 {
            let escrow_id = t.client.create_escrow(
                &client_addr,
                &freelancer,
                &t.token_id,
                &100,
                &hash(&t.env, i),
                &None,
                &None,
                &None,
                &None,
                &no_multisig(&t.env),
            );
            t.client.cancel_escrow(&client_addr, &escrow_id);

            let state = t.client.get_escrow(&escrow_id);
            assert_eq!(state.status, EscrowStatus::Cancelled);
        }

        assert_eq!(t.client.escrow_count(), 10);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 4. OPERATIONS ON WRONG ESCROW IDs
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn fuzz_invalid_escrow_ids() {
        let t = setup();
        let addr = Address::generate(&t.env);
        let invalid_ids: [u64; 5] = [0, 1, 999, u64::MAX - 1, u64::MAX];

        for &id in &invalid_ids {
            let result = t.client.try_get_escrow(&id);
            assert!(result.is_err(), "Should fail for nonexistent escrow {id}");

            let add_result = t.client.try_add_milestone(
                &addr,
                &id,
                &String::from_str(&t.env, "X"),
                &hash(&t.env, 1),
                &100,
            );
            assert!(
                add_result.is_err(),
                "Should fail milestone add for nonexistent escrow {id}"
            );

            let submit_result = t.client.try_submit_milestone(&addr, &id, &0);
            assert!(
                submit_result.is_err(),
                "Should fail submit for nonexistent escrow {id}"
            );
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 5. OPERATIONS ON WRONG MILESTONE IDs
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn fuzz_invalid_milestone_ids() {
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

        t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "W"),
            &hash(&t.env, 2),
            &1_000,
        );

        let invalid_mids: [u32; 4] = [1, 99, u32::MAX - 1, u32::MAX];
        for &mid in &invalid_mids {
            let result = t.client.try_submit_milestone(&freelancer, &escrow_id, &mid);
            assert!(
                result.is_err(),
                "Should fail for invalid milestone ID {mid}"
            );

            let result = t
                .client
                .try_approve_milestone(&client_addr, &escrow_id, &mid);
            assert!(
                result.is_err(),
                "Should fail approve for invalid milestone ID {mid}"
            );
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 6. DISPUTE RESOLUTION AMOUNT FUZZING
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn fuzz_dispute_resolution_amounts() {
        let total: i128 = 10_000;

        let invalid_splits: [(i128, i128); 5] = [
            (-1, total + 1),
            (total + 1, -1),
            (0, 0),
            (total + 1, 0),
            (5_001, 5_001),
        ];

        for (client_amt, freelancer_amt) in invalid_splits {
            let t = setup();
            let client_addr = Address::generate(&t.env);
            let freelancer = Address::generate(&t.env);
            let arbiter = Address::generate(&t.env);
            mint_for_escrow(&t.env, &t.token_id, &client_addr, total, 0);

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

            t.client.raise_dispute(&client_addr, &escrow_id, &None);
            let result =
                t.client
                    .try_resolve_dispute(&arbiter, &escrow_id, &client_amt, &freelancer_amt);
            assert!(
                result.is_err(),
                "Should reject split ({client_amt}, {freelancer_amt})"
            );
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 7. UNAUTHORIZED CALLER FUZZING
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn fuzz_unauthorized_callers() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let attacker = Address::generate(&t.env);
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

        let add_result = t.client.try_add_milestone(
            &attacker,
            &escrow_id,
            &String::from_str(&t.env, "Hack"),
            &hash(&t.env, 3),
            &100,
        );
        assert!(add_result.is_err(), "Attacker should not add milestones");

        let submit_result = t.client.try_submit_milestone(&attacker, &escrow_id, &m0);
        assert!(submit_result.is_err(), "Attacker should not submit");

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);

        let approve_result = t.client.try_approve_milestone(&attacker, &escrow_id, &m0);
        assert!(approve_result.is_err(), "Attacker should not approve");

        let cancel_result = t.client.try_cancel_escrow(&attacker, &escrow_id);
        assert!(cancel_result.is_err(), "Attacker should not cancel");

        let dispute_result = t.client.try_raise_dispute(&attacker, &escrow_id, &None);
        assert!(dispute_result.is_err(), "Attacker should not dispute");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 8. ADMIN FUNCTIONS — UNAUTHORIZED
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn fuzz_admin_functions_unauthorized() {
        let t = setup();
        let attacker = Address::generate(&t.env);

        let pause_result = t
            .client
            .try_pause(&attacker, &soroban_sdk::String::from_str(&t.env, ""));
        assert!(pause_result.is_err(), "Non-admin should not pause");

        let unpause_result = t.client.try_unpause(&attacker);
        assert!(unpause_result.is_err(), "Non-admin should not unpause");

        let propose_result = t
            .client
            .try_propose_admin(&attacker, &Address::generate(&t.env));
        assert!(
            propose_result.is_err(),
            "Non-admin should not propose admin"
        );

        let whitelist_result = t.client.try_set_token_whitelist_enabled(&attacker, &true);
        assert!(
            whitelist_result.is_err(),
            "Non-admin should not set whitelist"
        );

        let max_ms_result = t.client.try_set_max_milestones(&attacker, &5);
        assert!(
            max_ms_result.is_err(),
            "Non-admin should not set max milestones"
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 9. DOUBLE-SUBMIT SAME MILESTONE
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn fuzz_double_submit_same_milestone() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 1);

        let escrow_id = t.client.create_escrow(
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
        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &500,
        );

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        let result = t.client.try_submit_milestone(&freelancer, &escrow_id, &m0);
        assert!(result.is_err(), "Double-submit should be rejected");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 10. DOUBLE-APPROVE SAME MILESTONE
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn fuzz_double_approve_same_milestone() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 1_000, 2);

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
            &String::from_str(&t.env, "W1"),
            &hash(&t.env, 2),
            &500,
        );
        let _m1 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "W2"),
            &hash(&t.env, 3),
            &500,
        );

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        t.client.approve_milestone(&client_addr, &escrow_id, &m0);

        let result = t
            .client
            .try_approve_milestone(&client_addr, &escrow_id, &m0);
        assert!(result.is_err(), "Double-approve should be rejected");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 11. RAPID MILESTONE ADD UP TO CAPACITY
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn fuzz_milestone_capacity_limit() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let total: i128 = 1_000_000;
        mint_for_escrow(
            &t.env,
            &t.token_id,
            &client_addr,
            total,
            (MAX_MILESTONES + 5) as i128,
        );

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

        let per_milestone = total / (MAX_MILESTONES as i128);
        for i in 0..MAX_MILESTONES {
            let result = t.client.try_add_milestone(
                &client_addr,
                &escrow_id,
                &String::from_str(&t.env, "M"),
                &hash(&t.env, (i % 250) as u8),
                &per_milestone,
            );
            assert!(
                result.is_ok(),
                "Should accept milestone {i} within capacity"
            );
        }

        let over_result = t.client.try_add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Over"),
            &hash(&t.env, 255),
            &1,
        );
        assert!(
            over_result.is_err(),
            "Should reject milestone beyond capacity"
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 12. OPERATIONS AFTER CANCEL
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn fuzz_operations_after_cancel() {
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
        t.client.cancel_escrow(&client_addr, &escrow_id);

        let add_ms = t.client.try_add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "X"),
            &hash(&t.env, 2),
            &100,
        );
        assert!(add_ms.is_err(), "Add milestone on cancelled escrow");

        let dispute = t.client.try_raise_dispute(&client_addr, &escrow_id, &None);
        assert!(dispute.is_err(), "Dispute on cancelled escrow");

        let cancel2 = t.client.try_cancel_escrow(&client_addr, &escrow_id);
        assert!(cancel2.is_err(), "Double cancel");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 13. OPERATIONS AFTER COMPLETION
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn fuzz_operations_after_completion() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 1);

        let escrow_id = t.client.create_escrow(
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
        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "W"),
            &hash(&t.env, 2),
            &500,
        );
        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        t.client.approve_milestone(&client_addr, &escrow_id, &m0);

        assert_eq!(
            t.client.get_escrow(&escrow_id).status,
            EscrowStatus::Completed
        );

        let cancel = t.client.try_cancel_escrow(&client_addr, &escrow_id);
        assert!(cancel.is_err(), "Cancel on completed escrow");

        let dispute = t.client.try_raise_dispute(&client_addr, &escrow_id, &None);
        assert!(dispute.is_err(), "Dispute on completed escrow");

        let submit = t.client.try_submit_milestone(&freelancer, &escrow_id, &m0);
        assert!(submit.is_err(), "Submit on completed escrow");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 14. MANY ADDRESSES AS ESCROW PARTICIPANTS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn fuzz_many_distinct_participants() {
        let t = setup();

        for i in 0..5_u8 {
            let client_addr = Address::generate(&t.env);
            let freelancer = Address::generate(&t.env);
            mint_for_escrow(&t.env, &t.token_id, &client_addr, 100, 1);

            let escrow_id = t.client.create_escrow(
                &client_addr,
                &freelancer,
                &t.token_id,
                &100,
                &hash(&t.env, i),
                &None,
                &None,
                &None,
                &None,
                &no_multisig(&t.env),
            );

            let m0 = t.client.add_milestone(
                &client_addr,
                &escrow_id,
                &String::from_str(&t.env, "W"),
                &hash(&t.env, i + 100),
                &100,
            );

            t.client.submit_milestone(&freelancer, &escrow_id, &m0);
            t.client.approve_milestone(&client_addr, &escrow_id, &m0);

            let state = t.client.get_escrow(&escrow_id);
            assert_eq!(state.status, EscrowStatus::Completed);
            assert_eq!(balance(&t.env, &t.token_id, &freelancer), 100);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 15. UNEVEN MILESTONE AMOUNT DISTRIBUTIONS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn fuzz_uneven_milestone_distributions() {
        let distributions: [(i128, &[i128]); 4] = [
            (10_000, &[1, 9_999]),
            (10_000, &[9_999, 1]),
            (10_000, &[3_333, 3_333, 3_334]),
            (10_000, &[1, 1, 1, 1, 9_996]),
        ];

        for (total, amounts) in distributions {
            let t = setup();
            let client_addr = Address::generate(&t.env);
            let freelancer = Address::generate(&t.env);
            mint_for_escrow(
                &t.env,
                &t.token_id,
                &client_addr,
                total,
                amounts.len() as i128,
            );

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

            for (i, &amt) in amounts.iter().enumerate() {
                let mid = t.client.add_milestone(
                    &client_addr,
                    &escrow_id,
                    &String::from_str(&t.env, "M"),
                    &hash(&t.env, (i + 10) as u8),
                    &amt,
                );
                t.client.submit_milestone(&freelancer, &escrow_id, &mid);
                t.client.approve_milestone(&client_addr, &escrow_id, &mid);
            }

            let state = t.client.get_escrow(&escrow_id);
            assert_eq!(state.status, EscrowStatus::Completed);
            assert_eq!(
                balance(&t.env, &t.token_id, &freelancer),
                total,
                "Freelancer should receive full amount for distribution {:?}",
                amounts
            );
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 16. INTERLEAVED OPERATIONS ON MULTIPLE ESCROWS
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn fuzz_interleaved_multi_escrow_ops() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 10_000, 4);

        let e1 = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &2_000,
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
            &t.token_id,
            &3_000,
            &hash(&t.env, 2),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        let m1 = t.client.add_milestone(
            &client_addr,
            &e1,
            &String::from_str(&t.env, "A"),
            &hash(&t.env, 3),
            &2_000,
        );
        let m2 = t.client.add_milestone(
            &client_addr,
            &e2,
            &String::from_str(&t.env, "B"),
            &hash(&t.env, 4),
            &3_000,
        );

        t.client.submit_milestone(&freelancer, &e2, &m2);
        t.client.submit_milestone(&freelancer, &e1, &m1);

        t.client.approve_milestone(&client_addr, &e1, &m1);
        t.client.approve_milestone(&client_addr, &e2, &m2);

        assert_eq!(t.client.get_escrow(&e1).status, EscrowStatus::Completed);
        assert_eq!(t.client.get_escrow(&e2).status, EscrowStatus::Completed);
        assert_eq!(balance(&t.env, &t.token_id, &freelancer), 5_000);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 17. MAX ESCROW AMOUNT BOUNDARY
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn fuzz_max_escrow_amount_exactly() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint(
            &t.env,
            &t.token_id,
            &client_addr,
            MAX_ESCROW_AMOUNT + 10_000,
        );

        let result = t.client.try_create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &MAX_ESCROW_AMOUNT,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );
        assert!(result.is_ok(), "Should accept exactly MAX_ESCROW_AMOUNT");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 18. REJECT THEN DISPUTE ON SAME MILESTONE
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn fuzz_reject_then_dispute_interplay() {
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
        t.client.reject_milestone(&client_addr, &escrow_id, &m0);

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        t.client.raise_dispute(&freelancer, &escrow_id, &Some(m0));

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Disputed);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 19. FREEZE + PAUSE INTERACTION
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn fuzz_freeze_and_pause_combined() {
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
        t.client
            .pause(&t.admin, &soroban_sdk::String::from_str(&t.env, ""));

        let result = t.client.try_add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "W"),
            &hash(&t.env, 2),
            &500,
        );
        assert!(result.is_err(), "Should block when both paused and frozen");

        t.client.unpause(&t.admin);
        let result2 = t.client.try_add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "W"),
            &hash(&t.env, 2),
            &500,
        );
        assert!(result2.is_err(), "Still frozen even after unpause");

        {
            let mut __v = soroban_sdk::Vec::new(&t.env);
            __v.push_back(t.admin.clone());
            t.client.unfreeze_escrow(&escrow_id, &__v);
        }
        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "W"),
            &hash(&t.env, 2),
            &1_000,
        );
        assert_eq!(m0, 0, "Should work after both unpaused and unfrozen");
    }
}
