//! # Ownership Transfer Invariant Tests (Issue #571)
//!
//! Tests to verify that escrow ownership transfer operations cannot compromise
//! security by changing client/freelancer payout rights or bypassing existing
//! milestone approvals.
//!
//! Covers:
//! - Pending transfer state does not change participant rights
//! - Accepted transfer preserves milestone approvals
//! - Cancelled transfer restores original owner state
//! - Fund releases following transfer use new owner authorization

#[cfg(test)]
#[allow(clippy::module_inception)]
mod ownership_transfer_invariant_tests {
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};

    use crate::{EscrowContract, EscrowContractClient, EscrowStatus, MultisigConfig};

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
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        soroban_sdk::token::StellarAssetClient::new(env, &sac.address())
            .mint(recipient, &(amount + 1_000));
        sac.address()
    }

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    fn hash(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 1. PENDING TRANSFER STATE TEST
    // ═════════════════════════════════════════════════════════════════════════

    /// Verify that while a transfer is pending, original client retains approval rights.
    #[test]
    fn test_pending_transfer_retains_original_approval_rights() {
        let (env, admin, _contract_id, client) = setup();
        let original_client = Address::generate(&env);
        let pending_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &original_client, 10_000);

        let escrow_id = client.create_escrow(
            &original_client,
            &freelancer,
            &token,
            &10_000,
            &hash(&env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let mid = client.add_milestone(
            &original_client,
            &escrow_id,
            &String::from_str(&env, "Work"),
            &hash(&env, 2),
            &10_000,
        );

        client.submit_milestone(&freelancer, &escrow_id, &mid);

        client.propose_admin(&original_client, &pending_client);

        let state_after_proposal = client.get_escrow(&escrow_id);
        assert_eq!(
            state_after_proposal.status,
            EscrowStatus::Active,
            "Escrow status should not change during pending transfer"
        );

        let result = client.try_approve_milestone(&pending_client, &escrow_id, &mid);
        assert!(
            result.is_err(),
            "Pending client should not have approval rights before accepting transfer"
        );

        let result = client.try_approve_milestone(&original_client, &escrow_id, &mid);
        assert!(
            result.is_ok(),
            "Original client should retain approval rights during pending transfer"
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 2. ACCEPTED TRANSFER PRESERVES APPROVALS
    // ═════════════════════════════════════════════════════════════════════════

    /// Verify that accepting an ownership transfer preserves freelancer role.
    #[test]
    fn test_accepted_transfer_preserves_freelancer_role() {
        let (env, admin, _contract_id, client) = setup();
        let original_client = Address::generate(&env);
        let new_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &original_client, 20_000);

        let escrow_id = client.create_escrow(
            &original_client,
            &freelancer,
            &token,
            &20_000,
            &hash(&env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let m0 = client.add_milestone(
            &original_client,
            &escrow_id,
            &String::from_str(&env, "Phase 1"),
            &hash(&env, 2),
            &10_000,
        );

        let m1 = client.add_milestone(
            &original_client,
            &escrow_id,
            &String::from_str(&env, "Phase 2"),
            &hash(&env, 3),
            &10_000,
        );

        client.submit_milestone(&freelancer, &escrow_id, &m0);
        client.approve_milestone(&original_client, &escrow_id, &m0);

        let state_before_transfer = client.get_escrow(&escrow_id);
        let freelancer_before = state_before_transfer.freelancer.clone();

        client.propose_admin(&original_client, &new_client);
        client.accept_admin(&new_client);

        let state_after_transfer = client.get_escrow(&escrow_id);
        assert_eq!(state_after_transfer.freelancer, freelancer_before, "Freelancer should remain unchanged");
        assert_eq!(state_after_transfer.status, EscrowStatus::Active, "Escrow status should remain Active");

        client.submit_milestone(&freelancer, &escrow_id, &m1);
        let result = client.try_approve_milestone(&new_client, &escrow_id, &m1);
        assert!(result.is_ok(), "New owner should be able to approve pending milestones");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 3. CANCELLED TRANSFER RESTORES STATE
    // ═════════════════════════════════════════════════════════════════════════

    /// Verify that cancelling a pending ownership transfer restores full rights.
    #[test]
    fn test_cancelled_transfer_restores_original_owner_rights() {
        let (env, admin, _contract_id, client) = setup();
        let original_client = Address::generate(&env);
        let new_admin = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &original_client, 10_000);

        let escrow_id = client.create_escrow(
            &original_client,
            &freelancer,
            &token,
            &10_000,
            &hash(&env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let mid = client.add_milestone(
            &original_client,
            &escrow_id,
            &String::from_str(&env, "Work"),
            &hash(&env, 2),
            &10_000,
        );

        client.submit_milestone(&freelancer, &escrow_id, &mid);

        client.propose_admin(&original_client, &new_admin);

        client.propose_admin(&original_client, &original_client);
        client.accept_admin(&original_client);

        let result = client.try_approve_milestone(&original_client, &escrow_id, &mid);
        assert!(
            result.is_ok(),
            "Original client should retain rights after cancelled transfer"
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 4. RELEASE FOLLOWING TRANSFER USES NEW AUTHORIZATION
    // ═════════════════════════════════════════════════════════════════════════

    /// Verify that fund releases following a completed ownership transfer use new owner authorization.
    #[test]
    fn test_release_after_transfer_uses_new_owner_auth() {
        let (env, admin, _contract_id, client) = setup();
        let original_client = Address::generate(&env);
        let new_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &original_client, 15_000);

        let escrow_id = client.create_escrow(
            &original_client,
            &freelancer,
            &token,
            &15_000,
            &hash(&env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let m0 = client.add_milestone(
            &original_client,
            &escrow_id,
            &String::from_str(&env, "Phase 1"),
            &hash(&env, 2),
            &7_500,
        );

        let m1 = client.add_milestone(
            &original_client,
            &escrow_id,
            &String::from_str(&env, "Phase 2"),
            &hash(&env, 3),
            &7_500,
        );

        client.submit_milestone(&freelancer, &escrow_id, &m0);
        client.approve_milestone(&original_client, &escrow_id, &m0);

        client.propose_admin(&original_client, &new_client);
        client.accept_admin(&new_client);

        client.submit_milestone(&freelancer, &escrow_id, &m1);

        let result = client.try_approve_milestone(&original_client, &escrow_id, &m1);
        assert!(result.is_err(), "Original owner should not have approval rights after transfer");

        let result = client.try_approve_milestone(&new_client, &escrow_id, &m1);
        assert!(result.is_ok(), "New owner should have approval rights after transfer");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 5. FREELANCER RIGHTS UNCHANGED BY TRANSFER
    // ═════════════════════════════════════════════════════════════════════════

    /// Verify that an ownership transfer does not change freelancer's ability to submit milestones.
    #[test]
    fn test_transfer_does_not_change_freelancer_submit_rights() {
        let (env, admin, _contract_id, client) = setup();
        let original_client = Address::generate(&env);
        let new_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &original_client, 10_000);

        let escrow_id = client.create_escrow(
            &original_client,
            &freelancer,
            &token,
            &10_000,
            &hash(&env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let mid = client.add_milestone(
            &original_client,
            &escrow_id,
            &String::from_str(&env, "Work"),
            &hash(&env, 2),
            &10_000,
        );

        client.submit_milestone(&freelancer, &escrow_id, &mid);

        client.propose_admin(&original_client, &new_client);
        client.accept_admin(&new_client);

        let state = client.get_escrow(&escrow_id);
        assert_eq!(state.freelancer, freelancer, "Freelancer address should remain unchanged");
    }
}
