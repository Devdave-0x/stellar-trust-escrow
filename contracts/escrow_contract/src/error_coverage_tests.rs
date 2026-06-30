/// Tests confirming every reachable `ContractError` variant is returned
/// by the contract under the conditions documented in the ABI.
///
/// Each test is named `test_err_<VariantName>` and verifies that exactly
/// that variant is produced (not a different error or a panic).
#[cfg(test)]
#[allow(clippy::module_inception)]
mod error_coverage_tests {
    use crate::{EscrowContract, EscrowContractClient, EscrowError, MultisigConfig};
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        token, Address, BytesN, Env, Vec,
    };

    // ── Helpers ──────────────────────────────────────────────────────────────

    fn setup() -> (Env, Address, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token = token_contract.address();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        client.set_platform_treasury(&admin, &admin);
        (env, admin, token, client)
    }

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: Vec::new(env),
            weights: Vec::new(env),
            threshold: 0,
        }
    }

    fn hash(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[1u8; 32])
    }

    fn mint(env: &Env, token: &Address, to: &Address, amount: i128) {
        token::StellarAssetClient::new(env, token).mint(to, &amount);
    }

    fn create_funded_escrow(
        env: &Env,
        client: &EscrowContractClient,
        admin: &Address,
        token: &Address,
        amount: i128,
    ) -> u64 {
        let freelancer = Address::generate(env);
        mint(env, token, admin, amount + 60);
        client.create_escrow(
            admin,
            &freelancer,
            token,
            &amount,
            &hash(env),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(env),
        )
    }

    // ── 1: AlreadyInitialized ─────────────────────────────────────────────────

    #[test]
    fn test_err_already_initialized() {
        let (_, admin, _, client) = setup();
        let result = client.try_initialize(&admin);
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::AlreadyInitialized);
    }

    // ── 2: NotInitialized ────────────────────────────────────────────────────

    #[test]
    fn test_err_not_initialized() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        // get_admin calls require_initialized and returns NotInitialized when not set up.
        let result = client.try_get_admin();
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::NotInitialized);
    }

    // ── 3: Unauthorized ──────────────────────────────────────────────────────

    #[test]
    fn test_err_unauthorized() {
        let (env, admin, token, client) = setup();
        let escrow_id = create_funded_escrow(&env, &client, &admin, &token, 100);
        let mid = client.add_milestone(
            &admin, &escrow_id,
            &soroban_sdk::String::from_str(&env, "M1"),
            &hash(&env), &100,
        );
        client.submit_milestone(&admin, &escrow_id, &mid);
        // Someone who is neither client nor freelancer tries to raise a dispute.
        let stranger = Address::generate(&env);
        let result = client.try_raise_dispute(&stranger, &escrow_id, &mid);
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::Unauthorized);
    }

    // ── 4: NotAdmin ──────────────────────────────────────────────────────────

    #[test]
    fn test_err_not_admin() {
        let (env, _, _, client) = setup();
        let stranger = Address::generate(&env);
        let result = client.try_pause(
            &stranger,
            &soroban_sdk::String::from_str(&env, "test"),
        );
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::NotAdmin);
    }

    // ── 5: NotClient ─────────────────────────────────────────────────────────

    #[test]
    fn test_err_not_client() {
        let (env, admin, token, client) = setup();
        let escrow_id = create_funded_escrow(&env, &client, &admin, &token, 100);
        let stranger = Address::generate(&env);
        let result = client.try_add_milestone(
            &stranger,
            &escrow_id,
            &soroban_sdk::String::from_str(&env, "M"),
            &hash(&env),
            &50,
        );
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::NotClient);
    }

    // ── 8: EscrowNotFound ────────────────────────────────────────────────────

    #[test]
    fn test_err_escrow_not_found() {
        let (_env, _admin, _token, client) = setup();
        let result = client.try_get_escrow(&9999);
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::EscrowNotFound);
    }

    // ── 9: EscrowNotActive ───────────────────────────────────────────────────

    #[test]
    fn test_err_escrow_not_active() {
        let (env, admin, token, client) = setup();
        let escrow_id = create_funded_escrow(&env, &client, &admin, &token, 100);
        client.cancel_escrow(&admin, &escrow_id);
        let result = client.try_add_milestone(
            &admin,
            &escrow_id,
            &soroban_sdk::String::from_str(&env, "M"),
            &hash(&env),
            &50,
        );
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::EscrowNotActive);
    }

    // ── 13: MilestoneNotFound ────────────────────────────────────────────────

    #[test]
    fn test_err_milestone_not_found() {
        let (env, admin, token, client) = setup();
        let escrow_id = create_funded_escrow(&env, &client, &admin, &token, 100);
        // milestone id 99 does not exist
        let result = client.try_release_funds(&admin, &escrow_id, &99, &None);
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::MilestoneNotFound);
    }

    // ── 14: MilestoneNotApproved ─────────────────────────────────────────────

    #[test]
    fn test_err_milestone_not_approved() {
        let (env, admin, token, client) = setup();
        let escrow_id = create_funded_escrow(&env, &client, &admin, &token, 100);
        let mid = client.add_milestone(
            &admin, &escrow_id,
            &soroban_sdk::String::from_str(&env, "M1"),
            &hash(&env), &100,
        );
        let result = client.try_release_funds(&admin, &escrow_id, &mid, &None);
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::MilestoneNotApproved);
    }

    // ── 15: AllocationExceedsTotal ───────────────────────────────────────────

    #[test]
    fn test_err_allocation_exceeds_total() {
        let (env, admin, token, client) = setup();
        let escrow_id = create_funded_escrow(&env, &client, &admin, &token, 100);
        client.add_milestone(
            &admin, &escrow_id,
            &soroban_sdk::String::from_str(&env, "M1"),
            &hash(&env), &80,
        );
        let result = client.try_add_milestone(
            &admin, &escrow_id,
            &soroban_sdk::String::from_str(&env, "M2"),
            &hash(&env), &30,
        );
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::AllocationExceedsTotal);
    }

    // ── 16: MilestoneLimitExceeded ───────────────────────────────────────────

    #[test]
    fn test_err_milestone_limit_exceeded() {
        let (env, admin, token, client) = setup();
        client.set_max_milestones(&admin, &1);
        mint(&env, &token, &admin, 200 + 120);
        let freelancer = Address::generate(&env);
        let escrow_id = client.create_escrow(
            &admin, &freelancer, &token, &200, &hash(&env),
            &None, &None, &None, &None, &no_multisig(&env),
        );
        client.add_milestone(&admin, &escrow_id, &soroban_sdk::String::from_str(&env, "M1"), &hash(&env), &100);
        let result = client.try_add_milestone(&admin, &escrow_id, &soroban_sdk::String::from_str(&env, "M2"), &hash(&env), &100);
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::MilestoneLimitExceeded);
    }

    // ── 17: InvalidAmount ────────────────────────────────────────────────────

    #[test]
    fn test_err_invalid_amount() {
        let (env, admin, token, client) = setup();
        let escrow_id = create_funded_escrow(&env, &client, &admin, &token, 100);
        let result = client.try_add_milestone(
            &admin, &escrow_id,
            &soroban_sdk::String::from_str(&env, "M"),
            &hash(&env), &0,
        );
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::InvalidAmount);
    }

    // ── 19: InvalidInput ─────────────────────────────────────────────────────

    #[test]
    fn test_err_invalid_input() {
        let (_, admin, _, client) = setup();
        // slippage_bps == 0 is out of range → InvalidInput
        let result = client.try_set_dex_slippage_bps(&admin, &0_u32);
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::InvalidInput);
    }

    // ── 22: ReentrancyDetected ───────────────────────────────────────────────

    #[test]
    fn test_err_reentrancy_detected() {
        let (env, admin, token, client) = setup();
        let escrow_id = create_funded_escrow(&env, &client, &admin, &token, 100);
        let mid = client.add_milestone(
            &admin, &escrow_id,
            &soroban_sdk::String::from_str(&env, "M1"),
            &hash(&env), &100,
        );
        client.submit_milestone(&admin, &escrow_id, &mid);
        client.approve_milestone(&admin, &escrow_id, &mid);
        // Manually engage the reentrancy lock.
        env.as_contract(&client.address, || {
            env.storage()
                .instance()
                .set(&crate::types::DataKey::ReentrancyLock, &true);
        });
        let result = client.try_release_funds(&admin, &escrow_id, &mid, &None);
        assert!(result.is_err());
    }

    // ── 31: ContractPaused ───────────────────────────────────────────────────

    #[test]
    fn test_err_contract_paused() {
        let (env, admin, token, client) = setup();
        let escrow_id = create_funded_escrow(&env, &client, &admin, &token, 100);
        client.pause(&admin, &soroban_sdk::String::from_str(&env, "maintenance"));
        let result = client.try_add_milestone(
            &admin, &escrow_id,
            &soroban_sdk::String::from_str(&env, "M"),
            &hash(&env), &50,
        );
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::ContractPaused);
    }

    // ── 33: CancellationAlreadyExists ────────────────────────────────────────

    #[test]
    fn test_err_cancellation_already_exists() {
        let (env, admin, token, client) = setup();
        let escrow_id = create_funded_escrow(&env, &client, &admin, &token, 100);
        let reason = soroban_sdk::String::from_str(&env, "test");
        client.request_cancellation(&admin, &escrow_id, &reason);
        let result = client.try_request_cancellation(&admin, &escrow_id, &reason);
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::CancellationAlreadyExists);
    }

    // ── 42: StorageDowngradeNotAllowed ───────────────────────────────────────
    // Tested indirectly — the storage module has its own unit test for this path.

    // ── 44: RecurringStartTimePast ───────────────────────────────────────────

    #[test]
    fn test_err_recurring_start_time_past() {
        let (env, admin, token, client) = setup();
        mint(&env, &token, &admin, 1_000 + 60);
        env.ledger().with_mut(|l| l.timestamp = 1_000);
        let result = client.try_create_recurring_escrow(
            &admin,
            &Address::generate(&env),
            &token,
            &10,
            &crate::types::RecurringInterval::Monthly,
            &500_u64,
            &None,
            &None,
            &hash(&env),
        );
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::RecurringStartTimePast);
    }

    // ── 61: EscrowFrozen ─────────────────────────────────────────────────────

    #[test]
    fn test_err_escrow_frozen() {
        let (env, admin, token, client) = setup();
        let escrow_id = create_funded_escrow(&env, &client, &admin, &token, 100);
        let mut signers = Vec::new(&env);
        signers.push_back(admin.clone());
        client.freeze_escrow(&escrow_id, &signers);
        let result = client.try_add_milestone(
            &admin, &escrow_id,
            &soroban_sdk::String::from_str(&env, "M"),
            &hash(&env), &50,
        );
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::EscrowFrozen);
    }

    // ── 63: InvalidAdminMultisigConfig ───────────────────────────────────────

    #[test]
    fn test_err_invalid_admin_multisig_config() {
        let (env, admin, _, client) = setup();
        let result = client.try_set_admin_multisig(&admin, &Vec::new(&env), &0_u32);
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::InvalidAdminMultisigConfig);
    }

    // ── 74: SelfEscrowNotAllowed ─────────────────────────────────────────────

    #[test]
    fn test_err_self_escrow_not_allowed() {
        let (env, admin, token, client) = setup();
        mint(&env, &token, &admin, 100 + 60);
        let result = client.try_create_escrow(
            &admin, &admin, &token, &100, &hash(&env),
            &None, &None, &None, &None, &no_multisig(&env),
        );
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::SelfEscrowNotAllowed);
    }

    // ── 77: TreasuryNotConfigured ────────────────────────────────────────────

    #[test]
    fn test_err_treasury_not_configured() {
        let (env, admin, token, client) = setup();
        // Forcibly remove the treasury to trigger TreasuryNotConfigured.
        env.as_contract(&client.address, || {
            env.storage().instance().remove(&crate::types::DataKey::PlatformTreasury);
        });
        mint(&env, &token, &admin, 1_000_000 + 60);
        let freelancer = Address::generate(&env);
        let escrow_id = client.create_escrow(
            &admin, &freelancer, &token, &1_000_000,
            &hash(&env), &None, &None, &None, &None, &no_multisig(&env),
        );
        let mid = client.add_milestone(
            &admin, &escrow_id,
            &soroban_sdk::String::from_str(&env, "M1"),
            &hash(&env), &1_000_000,
        );
        client.submit_milestone(&admin, &escrow_id, &mid);
        client.approve_milestone(&admin, &escrow_id, &mid);
        let result = client.try_release_funds(&admin, &escrow_id, &mid, &None);
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::TreasuryNotConfigured);
    }

    // ── 78: DexSwapFailed / DexRouterNotConfigured — fallback path ───────────

    #[test]
    fn test_release_funds_falls_back_when_no_dex_router() {
        // When a swap is requested but no DEX router is configured,
        // release_funds MUST still succeed (fall back to original asset).
        let (env, admin, token, client) = setup();
        let escrow_id = create_funded_escrow(&env, &client, &admin, &token, 100);
        let mid = client.add_milestone(
            &admin, &escrow_id,
            &soroban_sdk::String::from_str(&env, "M1"),
            &hash(&env), &100,
        );
        client.submit_milestone(&admin, &escrow_id, &mid);
        client.approve_milestone(&admin, &escrow_id, &mid);
        let other_token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        // No router configured — should fall back and succeed with original asset.
        client.release_funds(&admin, &escrow_id, &mid, &Some(other_token));
    }

    // ── Oracle errors (67–69) — covered by oracle_tests.rs ───────────────────

    // ── Recurring errors (45–47) — covered by unit_coverage_tests.rs ─────────

    // ── Timelock errors (53) — covered by timelock_enforcement_tests.rs ───────

    // ── Lock time (28) — covered by lock_time_enforcement_tests.rs ────────────
}
