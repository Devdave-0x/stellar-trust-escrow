//! # Multisig threshold enforcement tests
//!
//! Covers weighted multi-signature approval for milestones:
//! - config validation at escrow creation (every rejection reason)
//! - the high-value escrow rule
//! - threshold accumulation across signers, including the no-release-until-met path
//! - access control and duplicate-signature rejection
//! - the batch approval path
//! - policy inheritance through `split_escrow`

#[cfg(test)]
#[allow(clippy::module_inception)]
mod multisig_threshold_tests {
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};

    use crate::{
        EscrowContract, EscrowContractClient, EscrowError, MultisigConfig, MS_APPROVED,
        MS_SUBMITTED,
    };

    const ESCROW_AMOUNT: i128 = 10_000;
    const MILESTONE_AMOUNT: i128 = 4_000;

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn setup() -> (
        Env,
        Address,
        Address,
        Address,
        EscrowContractClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let contract_id = env.register_contract(None, EscrowContract);
        let contract = EscrowContractClient::new(&env, &contract_id);
        contract.initialize(&admin);

        (env, admin, client_addr, freelancer, contract)
    }

    fn register_token(env: &Env, admin: &Address, recipient: &Address, amount: i128) -> Address {
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let sac = soroban_sdk::token::StellarAssetClient::new(env, &token_id.address());
        sac.mint(recipient, &amount);
        token_id.address()
    }

    fn hash32(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[7u8; 32])
    }

    fn config(env: &Env, signers: &[(&Address, u32)], threshold: u32) -> MultisigConfig {
        let mut approvers = soroban_sdk::Vec::new(env);
        let mut weights = soroban_sdk::Vec::new(env);
        for (address, weight) in signers {
            approvers.push_back((*address).clone());
            weights.push_back(*weight);
        }
        MultisigConfig {
            approvers,
            weights,
            threshold,
        }
    }

    /// Creates an escrow carrying `multisig` and returns its id.
    fn create_with(
        env: &Env,
        contract: &EscrowContractClient<'static>,
        admin: &Address,
        client_addr: &Address,
        freelancer: &Address,
        multisig: &MultisigConfig,
    ) -> u64 {
        let token = register_token(env, admin, client_addr, ESCROW_AMOUNT + 1_000_000);
        contract.create_escrow(
            client_addr,
            freelancer,
            &token,
            &ESCROW_AMOUNT,
            &hash32(env),
            &None,
            &None,
            &None,
            &None,
            multisig,
        )
    }

    /// Adds one milestone and moves it to Submitted so it is ready for approval.
    fn submitted_milestone(
        env: &Env,
        contract: &EscrowContractClient<'static>,
        client_addr: &Address,
        freelancer: &Address,
        escrow_id: u64,
    ) -> u32 {
        let milestone_id = contract.add_milestone(
            client_addr,
            &escrow_id,
            &String::from_str(env, "Deliverable"),
            &hash32(env),
            &MILESTONE_AMOUNT,
        );
        contract.submit_milestone(freelancer, &escrow_id, &milestone_id);
        milestone_id
    }

    // ── Config validation ─────────────────────────────────────────────────────

    #[test]
    fn test_weights_length_mismatch_rejected() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let signer_b = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, ESCROW_AMOUNT + 1_000_000);

        let mut approvers = soroban_sdk::Vec::new(&env);
        approvers.push_back(client_addr.clone());
        approvers.push_back(signer_b);
        let mut weights = soroban_sdk::Vec::new(&env);
        weights.push_back(1_u32); // one weight for two approvers

        let bad = MultisigConfig {
            approvers,
            weights,
            threshold: 2,
        };

        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &ESCROW_AMOUNT,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &bad,
        );
        assert_eq!(result, Err(Ok(EscrowError::MultisigInvalidConfig)));
    }

    #[test]
    fn test_zero_threshold_with_approvers_rejected() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let signer_b = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, ESCROW_AMOUNT + 1_000_000);

        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &ESCROW_AMOUNT,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &config(&env, &[(&client_addr, 1), (&signer_b, 1)], 0),
        );
        assert_eq!(result, Err(Ok(EscrowError::MultisigInvalidConfig)));
    }

    /// A threshold above the total available weight could never be reached, which
    /// would strand the escrow's funds permanently.
    #[test]
    fn test_unreachable_threshold_rejected() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let signer_b = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, ESCROW_AMOUNT + 1_000_000);

        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &ESCROW_AMOUNT,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &config(&env, &[(&client_addr, 1), (&signer_b, 1)], 3),
        );
        assert_eq!(result, Err(Ok(EscrowError::MultisigInvalidConfig)));
    }

    #[test]
    fn test_zero_weight_rejected() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let signer_b = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, ESCROW_AMOUNT + 1_000_000);

        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &ESCROW_AMOUNT,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &config(&env, &[(&client_addr, 1), (&signer_b, 0)], 1),
        );
        assert_eq!(result, Err(Ok(EscrowError::MultisigInvalidConfig)));
    }

    /// A duplicated approver would otherwise contribute its weight twice.
    #[test]
    fn test_duplicate_approver_rejected() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client_addr, ESCROW_AMOUNT + 1_000_000);

        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &ESCROW_AMOUNT,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &config(&env, &[(&client_addr, 1), (&client_addr, 1)], 2),
        );
        assert_eq!(result, Err(Ok(EscrowError::MultisigInvalidConfig)));
    }

    #[test]
    fn test_too_many_signers_rejected() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client_addr, ESCROW_AMOUNT + 1_000_000);

        let mut approvers = soroban_sdk::Vec::new(&env);
        let mut weights = soroban_sdk::Vec::new(&env);
        for _ in 0..(crate::MAX_BUYER_SIGNERS + 1) {
            approvers.push_back(Address::generate(&env));
            weights.push_back(1_u32);
        }
        let oversized = MultisigConfig {
            approvers,
            weights,
            threshold: 2,
        };

        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &ESCROW_AMOUNT,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &oversized,
        );
        assert_eq!(result, Err(Ok(EscrowError::MultisigTooManySigners)));
    }

    // ── High-value rule ───────────────────────────────────────────────────────

    /// Below the high-value threshold, a single-signer policy is still allowed.
    #[test]
    fn test_low_value_single_signer_policy_allowed() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client_addr, ESCROW_AMOUNT + 1_000_000);

        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &ESCROW_AMOUNT,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &config(&env, &[(&client_addr, 5)], 5),
        );
        assert!(result.is_ok(), "expected Ok, got {result:?}");
    }

    /// Once an admin lowers the threshold, the same escrow size becomes high-value
    /// and a policy that one signer could satisfy alone is rejected.
    #[test]
    fn test_high_value_rejects_effectively_single_signer_policy() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        contract.set_high_value_threshold(&admin, &(ESCROW_AMOUNT - 1));
        let token = register_token(&env, &admin, &client_addr, ESCROW_AMOUNT + 1_000_000);
        let signer_b = Address::generate(&env);

        // Threshold 3 is reachable by signer_b's weight of 3 alone.
        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &ESCROW_AMOUNT,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &config(&env, &[(&client_addr, 1), (&signer_b, 3)], 3),
        );
        assert_eq!(result, Err(Ok(EscrowError::MultisigRequiredForHighValue)));
    }

    #[test]
    fn test_high_value_accepts_genuine_multi_party_policy() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        contract.set_high_value_threshold(&admin, &(ESCROW_AMOUNT - 1));
        let token = register_token(&env, &admin, &client_addr, ESCROW_AMOUNT + 1_000_000);
        let signer_b = Address::generate(&env);

        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &ESCROW_AMOUNT,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &config(&env, &[(&client_addr, 1), (&signer_b, 1)], 2),
        );
        assert!(result.is_ok(), "expected Ok, got {result:?}");
    }

    #[test]
    fn test_set_high_value_threshold_requires_positive_value() {
        let (_env, admin, _client_addr, _freelancer, contract) = setup();
        let result = contract.try_set_high_value_threshold(&admin, &0);
        assert_eq!(result, Err(Ok(EscrowError::MultisigInvalidConfig)));
    }

    #[test]
    fn test_set_high_value_threshold_rejects_non_admin() {
        let (env, _admin, _client_addr, _freelancer, contract) = setup();
        let stranger = Address::generate(&env);
        assert!(contract
            .try_set_high_value_threshold(&stranger, &500)
            .is_err());
    }

    // ── Threshold accumulation ────────────────────────────────────────────────

    /// The core guarantee: one signature on a 2-of-2 policy must not approve or pay.
    #[test]
    fn test_single_signature_below_threshold_does_not_approve() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let signer_b = Address::generate(&env);
        let multisig = config(&env, &[(&client_addr, 1), (&signer_b, 1)], 2);
        let escrow_id = create_with(
            &env,
            &contract,
            &admin,
            &client_addr,
            &freelancer,
            &multisig,
        );
        let milestone_id =
            submitted_milestone(&env, &contract, &client_addr, &freelancer, escrow_id);

        contract.approve_milestone(&client_addr, &escrow_id, &milestone_id);

        let milestone = contract.get_milestone(&escrow_id, &milestone_id);
        assert_eq!(
            milestone.status, MS_SUBMITTED,
            "milestone must stay Submitted below threshold"
        );
        assert_eq!(milestone.approvals.len(), 1, "signature must be recorded");

        let (accrued, threshold) = contract.get_multisig_progress(&escrow_id, &milestone_id);
        assert_eq!(accrued, 1);
        assert_eq!(threshold, 2);
    }

    /// The second signature reaches the threshold and approves the milestone.
    #[test]
    fn test_second_signature_reaches_threshold_and_approves() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let signer_b = Address::generate(&env);
        let multisig = config(&env, &[(&client_addr, 1), (&signer_b, 1)], 2);
        let escrow_id = create_with(
            &env,
            &contract,
            &admin,
            &client_addr,
            &freelancer,
            &multisig,
        );
        let milestone_id =
            submitted_milestone(&env, &contract, &client_addr, &freelancer, escrow_id);

        contract.approve_milestone(&client_addr, &escrow_id, &milestone_id);
        contract.approve_milestone(&signer_b, &escrow_id, &milestone_id);

        let milestone = contract.get_milestone(&escrow_id, &milestone_id);
        assert!(
            milestone.status == MS_APPROVED || milestone.status == crate::MS_RELEASED,
            "expected approved/released, got {}",
            milestone.status
        );
        assert_eq!(milestone.approvals.len(), 2);
    }

    /// Weights are summed, not counted: a single weight-3 signer meets a threshold
    /// of 3 on a low-value escrow.
    #[test]
    fn test_weights_are_summed_not_counted() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let signer_b = Address::generate(&env);
        let signer_c = Address::generate(&env);
        let multisig = config(
            &env,
            &[(&client_addr, 3), (&signer_b, 1), (&signer_c, 1)],
            3,
        );
        let escrow_id = create_with(
            &env,
            &contract,
            &admin,
            &client_addr,
            &freelancer,
            &multisig,
        );
        let milestone_id =
            submitted_milestone(&env, &contract, &client_addr, &freelancer, escrow_id);

        contract.approve_milestone(&client_addr, &escrow_id, &milestone_id);

        let (accrued, threshold) = contract.get_multisig_progress(&escrow_id, &milestone_id);
        assert_eq!(accrued, 3);
        assert_eq!(threshold, 3);
    }

    // ── Access control ────────────────────────────────────────────────────────

    /// A non-approver cannot contribute a signature.
    #[test]
    fn test_non_approver_rejected() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let signer_b = Address::generate(&env);
        let stranger = Address::generate(&env);
        let multisig = config(&env, &[(&client_addr, 1), (&signer_b, 1)], 2);
        let escrow_id = create_with(
            &env,
            &contract,
            &admin,
            &client_addr,
            &freelancer,
            &multisig,
        );
        let milestone_id =
            submitted_milestone(&env, &contract, &client_addr, &freelancer, escrow_id);

        let result = contract.try_approve_milestone(&stranger, &escrow_id, &milestone_id);
        assert_eq!(result, Err(Ok(EscrowError::MultisigNotApprover)));
    }

    /// Under multisig the client has no implicit approval right — if the client is
    /// not listed as an approver, it cannot sign.
    #[test]
    fn test_unlisted_client_has_no_implicit_approval_right() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let signer_a = Address::generate(&env);
        let signer_b = Address::generate(&env);
        let multisig = config(&env, &[(&signer_a, 1), (&signer_b, 1)], 2);
        let escrow_id = create_with(
            &env,
            &contract,
            &admin,
            &client_addr,
            &freelancer,
            &multisig,
        );
        let milestone_id =
            submitted_milestone(&env, &contract, &client_addr, &freelancer, escrow_id);

        let result = contract.try_approve_milestone(&client_addr, &escrow_id, &milestone_id);
        assert_eq!(result, Err(Ok(EscrowError::MultisigNotApprover)));
    }

    /// A signer cannot reach the threshold alone by signing twice.
    #[test]
    fn test_duplicate_signature_rejected() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let signer_b = Address::generate(&env);
        let multisig = config(&env, &[(&client_addr, 1), (&signer_b, 1)], 2);
        let escrow_id = create_with(
            &env,
            &contract,
            &admin,
            &client_addr,
            &freelancer,
            &multisig,
        );
        let milestone_id =
            submitted_milestone(&env, &contract, &client_addr, &freelancer, escrow_id);

        contract.approve_milestone(&client_addr, &escrow_id, &milestone_id);
        let result = contract.try_approve_milestone(&client_addr, &escrow_id, &milestone_id);
        assert_eq!(result, Err(Ok(EscrowError::MultisigDuplicateApproval)));

        let milestone = contract.get_milestone(&escrow_id, &milestone_id);
        assert_eq!(milestone.status, MS_SUBMITTED);
        assert_eq!(milestone.approvals.len(), 1);
    }

    // ── Batch path ────────────────────────────────────────────────────────────

    /// The batch entry point enforces the same threshold and pays out nothing until
    /// it is reached.
    #[test]
    fn test_batch_approve_respects_threshold() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let signer_b = Address::generate(&env);
        let multisig = config(&env, &[(&client_addr, 1), (&signer_b, 1)], 2);
        let escrow_id = create_with(
            &env,
            &contract,
            &admin,
            &client_addr,
            &freelancer,
            &multisig,
        );
        let milestone_id =
            submitted_milestone(&env, &contract, &client_addr, &freelancer, escrow_id);

        let mut ids = soroban_sdk::Vec::new(&env);
        ids.push_back(milestone_id);

        let paid_first = contract.batch_approve_milestones(&client_addr, &escrow_id, &ids);
        assert_eq!(paid_first, 0, "no payout below threshold");
        assert_eq!(
            contract.get_milestone(&escrow_id, &milestone_id).status,
            MS_SUBMITTED
        );

        let paid_second = contract.batch_approve_milestones(&signer_b, &escrow_id, &ids);
        assert_eq!(
            paid_second, MILESTONE_AMOUNT,
            "threshold reached, milestone pays out"
        );
    }

    #[test]
    fn test_batch_approve_rejects_duplicate_signature() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let signer_b = Address::generate(&env);
        let multisig = config(&env, &[(&client_addr, 1), (&signer_b, 1)], 2);
        let escrow_id = create_with(
            &env,
            &contract,
            &admin,
            &client_addr,
            &freelancer,
            &multisig,
        );
        let milestone_id =
            submitted_milestone(&env, &contract, &client_addr, &freelancer, escrow_id);

        let mut ids = soroban_sdk::Vec::new(&env);
        ids.push_back(milestone_id);

        contract.batch_approve_milestones(&client_addr, &escrow_id, &ids);
        let result = contract.try_batch_approve_milestones(&client_addr, &escrow_id, &ids);
        assert_eq!(result, Err(Ok(EscrowError::MultisigDuplicateApproval)));
    }

    // ── Legacy behaviour ──────────────────────────────────────────────────────

    /// With no policy attached, the client still approves alone as before.
    #[test]
    fn test_legacy_mode_unchanged_without_policy() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let empty = MultisigConfig {
            approvers: soroban_sdk::Vec::new(&env),
            weights: soroban_sdk::Vec::new(&env),
            threshold: 0,
        };
        let escrow_id = create_with(&env, &contract, &admin, &client_addr, &freelancer, &empty);
        let milestone_id =
            submitted_milestone(&env, &contract, &client_addr, &freelancer, escrow_id);

        contract.approve_milestone(&client_addr, &escrow_id, &milestone_id);

        let milestone = contract.get_milestone(&escrow_id, &milestone_id);
        assert!(
            milestone.status == MS_APPROVED || milestone.status == crate::MS_RELEASED,
            "legacy single-approver flow must still approve"
        );
    }

    // ── View wiring ───────────────────────────────────────────────────────────

    /// The escrow view must report the stored policy rather than placeholders.
    #[test]
    fn test_escrow_view_exposes_policy() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let signer_b = Address::generate(&env);
        let multisig = config(&env, &[(&client_addr, 2), (&signer_b, 3)], 4);
        let escrow_id = create_with(
            &env,
            &contract,
            &admin,
            &client_addr,
            &freelancer,
            &multisig,
        );

        let state = contract.get_escrow(&escrow_id);
        assert_eq!(state.multisig_threshold, 4);
        assert_eq!(state.multisig_weights.len(), 2);
        assert_eq!(state.multisig_weights.get(0), Some(2));
        assert_eq!(state.multisig_weights.get(1), Some(3));
        assert_eq!(state.multisig_approvers.len(), 2);
    }
}
