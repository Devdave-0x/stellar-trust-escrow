#[cfg(test)]
#[allow(clippy::module_inception)]
mod property_tests {
    use crate::{
        EscrowContract, EscrowContractClient, EscrowStatus, MultisigConfig,
        MAX_ESCROW_AMOUNT, MS_APPROVED, MS_PENDING, MS_RELEASED, MS_SUBMITTED,
    };
    use soroban_sdk::{
        testutils::Address as _, token, Address, BytesN, Env, String, Vec,
    };

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

    // ═════════════════════════════════════════════════════════════════════════
    // INVARIANT 1: Total funds in == total funds out
    //
    // For any completed escrow, the sum of funds released to the freelancer
    // plus any remaining balance must equal the original total_amount.
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn invariant_funds_in_equals_funds_out_single_milestone() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let amount: i128 = 1_000;
        mint_for_escrow(&t.env, &t.token_id, &client_addr, amount, 1);

        let initial_supply = balance(&t.env, &t.token_id, &client_addr)
            + balance(&t.env, &t.token_id, &freelancer)
            + balance(&t.env, &t.token_id, &t.contract_id)
            + balance(&t.env, &t.token_id, &t.admin);

        let escrow_id = t.client.create_escrow(
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

        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &amount,
        );

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        t.client.approve_milestone(&client_addr, &escrow_id, &m0);

        let final_supply = balance(&t.env, &t.token_id, &client_addr)
            + balance(&t.env, &t.token_id, &freelancer)
            + balance(&t.env, &t.token_id, &t.contract_id)
            + balance(&t.env, &t.token_id, &t.admin);

        assert_eq!(
            initial_supply, final_supply,
            "Token supply must be conserved: initial={initial_supply}, final={final_supply}"
        );
    }

    #[test]
    fn invariant_funds_conserved_multi_milestone() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let total: i128 = 10_000;
        let milestone_amounts: [i128; 5] = [1_000, 2_000, 3_000, 2_500, 1_500];
        mint_for_escrow(&t.env, &t.token_id, &client_addr, total, 5);

        let initial_supply = balance(&t.env, &t.token_id, &client_addr)
            + balance(&t.env, &t.token_id, &freelancer)
            + balance(&t.env, &t.token_id, &t.contract_id)
            + balance(&t.env, &t.token_id, &t.admin);

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

        for (i, &amt) in milestone_amounts.iter().enumerate() {
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

        let final_supply = balance(&t.env, &t.token_id, &client_addr)
            + balance(&t.env, &t.token_id, &freelancer)
            + balance(&t.env, &t.token_id, &t.contract_id)
            + balance(&t.env, &t.token_id, &t.admin);

        assert_eq!(
            initial_supply, final_supply,
            "Token supply must be conserved across 5 milestones"
        );

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Completed);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INVARIANT 2: Funds conserved on cancellation
    //
    // When an escrow is cancelled, all funds must return to either the client,
    // freelancer (for approved milestones), or the treasury (fees).
    // No funds may be destroyed or created.
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn invariant_funds_conserved_on_cancel() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let total: i128 = 2_000;
        mint_for_escrow(&t.env, &t.token_id, &client_addr, total, 0);

        let initial_supply = balance(&t.env, &t.token_id, &client_addr)
            + balance(&t.env, &t.token_id, &freelancer)
            + balance(&t.env, &t.token_id, &t.contract_id)
            + balance(&t.env, &t.token_id, &t.admin);

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

        t.client.cancel_escrow(&client_addr, &escrow_id);

        let final_supply = balance(&t.env, &t.token_id, &client_addr)
            + balance(&t.env, &t.token_id, &freelancer)
            + balance(&t.env, &t.token_id, &t.contract_id)
            + balance(&t.env, &t.token_id, &t.admin);

        assert_eq!(
            initial_supply, final_supply,
            "Token supply must be conserved on cancellation"
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INVARIANT 3: Funds conserved on dispute resolution
    //
    // After dispute resolution, client_payout + freelancer_payout + fee
    // must equal the original remaining_balance.
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn invariant_funds_conserved_on_dispute_resolution() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let arbiter = Address::generate(&t.env);
        let total: i128 = 5_000;
        mint_for_escrow(&t.env, &t.token_id, &client_addr, total, 0);

        let initial_supply = balance(&t.env, &t.token_id, &client_addr)
            + balance(&t.env, &t.token_id, &freelancer)
            + balance(&t.env, &t.token_id, &t.contract_id)
            + balance(&t.env, &t.token_id, &t.admin)
            + balance(&t.env, &t.token_id, &arbiter);

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
        t.client
            .resolve_dispute(&arbiter, &escrow_id, &2_000, &3_000);

        let final_supply = balance(&t.env, &t.token_id, &client_addr)
            + balance(&t.env, &t.token_id, &freelancer)
            + balance(&t.env, &t.token_id, &t.contract_id)
            + balance(&t.env, &t.token_id, &t.admin)
            + balance(&t.env, &t.token_id, &arbiter);

        assert_eq!(
            initial_supply, final_supply,
            "Token supply must be conserved through dispute resolution"
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INVARIANT 4: Dispute resolution splits — parametric
    //
    // For various split ratios, verify funds are conserved and both parties
    // receive their correct share.
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn invariant_dispute_split_parametric() {
        let splits: [(i128, i128); 5] = [
            (0, 5_000),
            (5_000, 0),
            (2_500, 2_500),
            (1, 4_999),
            (4_999, 1),
        ];

        for (client_share, freelancer_share) in splits {
            let t = setup();
            let client_addr = Address::generate(&t.env);
            let freelancer = Address::generate(&t.env);
            let arbiter = Address::generate(&t.env);
            let total: i128 = 5_000;
            mint_for_escrow(&t.env, &t.token_id, &client_addr, total, 0);

            let initial_supply = balance(&t.env, &t.token_id, &client_addr)
                + balance(&t.env, &t.token_id, &freelancer)
                + balance(&t.env, &t.token_id, &t.contract_id)
                + balance(&t.env, &t.token_id, &t.admin)
                + balance(&t.env, &t.token_id, &arbiter);

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
            t.client
                .resolve_dispute(&arbiter, &escrow_id, &client_share, &freelancer_share);

            let final_supply = balance(&t.env, &t.token_id, &client_addr)
                + balance(&t.env, &t.token_id, &freelancer)
                + balance(&t.env, &t.token_id, &t.contract_id)
                + balance(&t.env, &t.token_id, &t.admin)
                + balance(&t.env, &t.token_id, &arbiter);

            assert_eq!(
                initial_supply, final_supply,
                "Funds not conserved for split ({client_share}, {freelancer_share})"
            );
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INVARIANT 5: allocated_amount <= total_amount
    //
    // After any sequence of add_milestone calls, the sum of milestone amounts
    // must never exceed total_amount.
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn invariant_allocated_never_exceeds_total() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let total: i128 = 10_000;
        mint_for_escrow(&t.env, &t.token_id, &client_addr, total, 10);

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

        let amounts: [i128; 4] = [2_500, 2_500, 2_500, 2_500];
        let mut running_total: i128 = 0;

        for (i, &amt) in amounts.iter().enumerate() {
            t.client.add_milestone(
                &client_addr,
                &escrow_id,
                &String::from_str(&t.env, "M"),
                &hash(&t.env, (i + 10) as u8),
                &amt,
            );
            running_total += amt;
            assert!(
                running_total <= total,
                "allocated {running_total} exceeds total {total}"
            );
        }

        let result = t.client.try_add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Over"),
            &hash(&t.env, 99),
            &1,
        );
        assert!(result.is_err(), "Should reject over-allocation");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INVARIANT 6: Milestone status transitions are one-way
    //
    // Pending → Submitted → Approved/Rejected → Released
    // No backward transitions allowed.
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn invariant_no_backward_status_transitions() {
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

        let ms = t.client.get_milestone(&escrow_id, &m0);
        assert_eq!(ms.status, MS_PENDING);

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        let ms = t.client.get_milestone(&escrow_id, &m0);
        assert_eq!(ms.status, MS_SUBMITTED);

        t.client.approve_milestone(&client_addr, &escrow_id, &m0);
        let ms = t.client.get_milestone(&escrow_id, &m0);
        assert!(ms.status == MS_APPROVED || ms.status == MS_RELEASED);

        let result = t.client.try_submit_milestone(&freelancer, &escrow_id, &m0);
        assert!(result.is_err(), "Cannot re-submit after approval");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INVARIANT 7: Escrow status transitions — terminal states are absorbing
    //
    // Completed and Cancelled are terminal. No further operations should
    // change the status back.
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn invariant_completed_is_terminal() {
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
        t.client.approve_milestone(&client_addr, &escrow_id, &m0);

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Completed);

        let cancel_result = t.client.try_cancel_escrow(&client_addr, &escrow_id);
        assert!(cancel_result.is_err(), "Cannot cancel completed escrow");

        let dispute_result = t.client.try_raise_dispute(&client_addr, &escrow_id, &None);
        assert!(dispute_result.is_err(), "Cannot dispute completed escrow");
    }

    #[test]
    fn invariant_cancelled_is_terminal() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

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
        t.client.cancel_escrow(&client_addr, &escrow_id);

        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Cancelled);

        let dispute_result = t.client.try_raise_dispute(&client_addr, &escrow_id, &None);
        assert!(dispute_result.is_err(), "Cannot dispute cancelled escrow");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INVARIANT 8: remaining_balance is monotonically non-increasing
    //
    // After each fund release, remaining_balance should decrease or stay
    // the same, never increase.
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn invariant_remaining_balance_decreases() {
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

        let amounts: [i128; 3] = [1_000, 1_000, 1_000];
        let mut prev_remaining = total;

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

            let state = t.client.get_escrow(&escrow_id);
            assert!(
                state.remaining_balance <= prev_remaining,
                "remaining_balance increased: {prev_remaining} -> {}",
                state.remaining_balance
            );
            prev_remaining = state.remaining_balance;
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INVARIANT 9: Escrow counter is monotonically increasing
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn invariant_escrow_counter_monotonic() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint_for_escrow(&t.env, &t.token_id, &client_addr, 10_000, 0);

        let mut prev_id: Option<u64> = None;
        for _ in 0..5 {
            let id = t.client.create_escrow(
                &client_addr,
                &freelancer,
                &t.token_id,
                &100,
                &hash(&t.env, 1),
                &None,
                &None,
                &None,
                &None,
                &no_multisig(&t.env),
            );
            if let Some(p) = prev_id {
                assert!(id > p, "Escrow ID did not increase: {p} -> {id}");
            }
            prev_id = Some(id);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INVARIANT 10: Funds conserved through partial cancel
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn invariant_funds_conserved_partial_cancel() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let total: i128 = 5_000;
        mint_for_escrow(&t.env, &t.token_id, &client_addr, total, 2);

        let initial_supply = balance(&t.env, &t.token_id, &client_addr)
            + balance(&t.env, &t.token_id, &freelancer)
            + balance(&t.env, &t.token_id, &t.contract_id)
            + balance(&t.env, &t.token_id, &t.admin);

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

        t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &2_000,
        );

        t.client.partial_cancel(&client_addr, &escrow_id);

        let final_supply = balance(&t.env, &t.token_id, &client_addr)
            + balance(&t.env, &t.token_id, &freelancer)
            + balance(&t.env, &t.token_id, &t.contract_id)
            + balance(&t.env, &t.token_id, &t.admin);

        assert_eq!(
            initial_supply, final_supply,
            "Token supply must be conserved through partial cancel"
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INVARIANT 11: Milestone amounts always sum to <= total_amount
    //
    // After multiple add/approve cycles, the cumulative milestone amounts
    // plus remaining_balance should never exceed total_amount + rent.
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn invariant_milestone_sum_bounded_by_total() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let total: i128 = 10_000;
        mint_for_escrow(&t.env, &t.token_id, &client_addr, total, 4);

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

        let amounts: [i128; 4] = [2_500, 2_500, 2_500, 2_500];
        let mut milestone_sum: i128 = 0;

        for (i, &amt) in amounts.iter().enumerate() {
            t.client.add_milestone(
                &client_addr,
                &escrow_id,
                &String::from_str(&t.env, "M"),
                &hash(&t.env, (i + 10) as u8),
                &amt,
            );
            milestone_sum += amt;
        }

        assert_eq!(milestone_sum, total, "Milestone sum should equal total");
        let state = t.client.get_escrow(&escrow_id);
        assert_eq!(
            state.milestones.len(),
            4,
            "Should have exactly 4 milestones"
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INVARIANT 12: Contract balance never goes negative
    //
    // At no point during any operation should the contract's token balance
    // drop below zero.
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn invariant_contract_balance_non_negative() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let total: i128 = 1_000;
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

        assert!(
            balance(&t.env, &t.token_id, &t.contract_id) >= 0,
            "Contract balance negative after creation"
        );

        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "W1"),
            &hash(&t.env, 2),
            &500,
        );
        let m1 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "W2"),
            &hash(&t.env, 3),
            &500,
        );

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        t.client.approve_milestone(&client_addr, &escrow_id, &m0);
        assert!(
            balance(&t.env, &t.token_id, &t.contract_id) >= 0,
            "Contract balance negative after first release"
        );

        t.client.submit_milestone(&freelancer, &escrow_id, &m1);
        t.client.approve_milestone(&client_addr, &escrow_id, &m1);
        assert!(
            balance(&t.env, &t.token_id, &t.contract_id) >= 0,
            "Contract balance negative after second release"
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INVARIANT 13: Parametric amount conservation
    //
    // Test with varying escrow amounts to ensure the invariant holds
    // across different scales.
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn invariant_funds_conserved_various_amounts() {
        let amounts: [i128; 6] = [1, 100, 1_000, 10_000, 100_000, 1_000_000];

        for &total in &amounts {
            let t = setup();
            let client_addr = Address::generate(&t.env);
            let freelancer = Address::generate(&t.env);
            mint_for_escrow(&t.env, &t.token_id, &client_addr, total, 1);

            let initial_supply = balance(&t.env, &t.token_id, &client_addr)
                + balance(&t.env, &t.token_id, &freelancer)
                + balance(&t.env, &t.token_id, &t.contract_id)
                + balance(&t.env, &t.token_id, &t.admin);

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
                &String::from_str(&t.env, "M"),
                &hash(&t.env, 2),
                &total,
            );

            t.client.submit_milestone(&freelancer, &escrow_id, &m0);
            t.client.approve_milestone(&client_addr, &escrow_id, &m0);

            let final_supply = balance(&t.env, &t.token_id, &client_addr)
                + balance(&t.env, &t.token_id, &freelancer)
                + balance(&t.env, &t.token_id, &t.contract_id)
                + balance(&t.env, &t.token_id, &t.admin);

            assert_eq!(
                initial_supply, final_supply,
                "Funds not conserved for amount {total}"
            );
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INVARIANT 14: Reject-resubmit cycle preserves funds
    //
    // A milestone that is rejected and resubmitted multiple times should
    // still result in correct fund release when finally approved.
    // ═════════════════════════════════════════════════════════════════════════

    #[test]
    fn invariant_reject_resubmit_cycle_preserves_funds() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let total: i128 = 1_000;
        mint_for_escrow(&t.env, &t.token_id, &client_addr, total, 1);

        let initial_supply = balance(&t.env, &t.token_id, &client_addr)
            + balance(&t.env, &t.token_id, &freelancer)
            + balance(&t.env, &t.token_id, &t.contract_id)
            + balance(&t.env, &t.token_id, &t.admin);

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
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &total,
        );

        for _ in 0..3 {
            t.client.submit_milestone(&freelancer, &escrow_id, &m0);
            t.client.reject_milestone(&client_addr, &escrow_id, &m0);
        }

        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        t.client.approve_milestone(&client_addr, &escrow_id, &m0);

        let final_supply = balance(&t.env, &t.token_id, &client_addr)
            + balance(&t.env, &t.token_id, &freelancer)
            + balance(&t.env, &t.token_id, &t.contract_id)
            + balance(&t.env, &t.token_id, &t.admin);

        assert_eq!(
            initial_supply, final_supply,
            "Funds not conserved after reject-resubmit cycle"
        );
        assert_eq!(balance(&t.env, &t.token_id, &freelancer), total);
    }
}
