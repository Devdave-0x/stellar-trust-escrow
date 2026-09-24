//! Referral registry duplicate claims tests (Issue #580)
//!
//! Ensures that referral codes cannot be claimed repeatedly by the same address
//! or cycled between referrer and referee.
//!
//! Test scenarios:
//! - Self-referral attempts fail
//! - Duplicate claim attempts fail
//! - Code reassignment scenarios fail
//! - Valid first-time claims succeed

#[cfg(test)]
#[allow(clippy::module_inception)]
mod referral_registry_tests {
    use crate::{EscrowContract, EscrowContractClient, EscrowError};
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn setup() -> (Env, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, admin, client)
    }

    /// Test that self-referral attempts fail
    ///
    /// A user cannot refer themselves as they cannot be both referrer and referee
    #[test]
    fn test_self_referral_fails() {
        let (_env, _admin, client) = setup();
        let user = Address::generate(&_env);

        // Attempt to claim self-referral should fail
        let result = client.try_claim_referral(&user, &user);
        assert!(
            result.is_err(),
            "Self-referral should fail with InvalidReferral"
        );
    }

    /// Test that duplicate claim attempts by same address fail
    ///
    /// Once a referee has claimed a referral code, they cannot claim it again
    #[test]
    fn test_duplicate_claim_fails() {
        let (_env, _admin, client) = setup();
        let referrer = Address::generate(&_env);
        let referee = Address::generate(&_env);

        // First claim should succeed
        let result1 = client.try_claim_referral(&referee, &referrer);
        assert!(result1.is_ok(), "First referral claim should succeed");

        // Duplicate claim by same referee should fail
        let result2 = client.try_claim_referral(&referee, &referrer);
        assert!(
            result2.is_err(),
            "Duplicate referral claim should fail with AlreadyClaimed"
        );
    }

    /// Test that cycling referral codes between two addresses fails
    ///
    /// Address A cannot refer address B and then have address B refer address A
    #[test]
    fn test_referral_cycling_fails() {
        let (_env, _admin, client) = setup();
        let address_a = Address::generate(&_env);
        let address_b = Address::generate(&_env);

        // Address B claims referral from A (valid first-time claim)
        let result1 = client.try_claim_referral(&address_b, &address_a);
        assert!(result1.is_ok(), "First referral claim should succeed");

        // Now attempt to have A claim referral from B (should fail)
        let result2 = client.try_claim_referral(&address_a, &address_b);
        assert!(
            result2.is_err(),
            "Cycling referral codes should fail: A cannot claim B after B claimed A"
        );
    }

    /// Test that referral code cannot be reassigned to different user
    ///
    /// Once a referrer-referee pair is established, the code cannot be reassigned
    #[test]
    fn test_code_reassignment_fails() {
        let (_env, _admin, client) = setup();
        let referrer = Address::generate(&_env);
        let referee1 = Address::generate(&_env);
        let referee2 = Address::generate(&_env);

        // First user claims the referral code
        let result1 = client.try_claim_referral(&referee1, &referrer);
        assert!(result1.is_ok(), "First user should claim referral successfully");

        // Second user cannot claim the same referral code from same referrer
        let result2 = client.try_claim_referral(&referee2, &referrer);
        assert!(
            result2.is_err(),
            "Code should not be reassignable to different user"
        );
    }

    /// Test that valid first-time referral claims succeed
    ///
    /// New valid referrer-referee pairs should be able to claim successfully
    #[test]
    fn test_valid_first_time_claim_succeeds() {
        let (_env, _admin, client) = setup();
        let referrer = Address::generate(&_env);
        let referee = Address::generate(&_env);

        // Valid first-time claim should succeed
        let result = client.try_claim_referral(&referee, &referrer);
        assert!(
            result.is_ok(),
            "Valid first-time referral claim should succeed"
        );

        // Verify the claim was recorded
        let is_claimed = client.is_referral_claimed(&referee, &referrer);
        assert!(
            is_claimed,
            "Claimed referral should be recorded in registry"
        );
    }

    /// Test multiple valid referrals don't interfere with each other
    ///
    /// Different referrer-referee pairs should not conflict
    #[test]
    fn test_multiple_valid_referrals_independent() {
        let (_env, _admin, client) = setup();
        let referrer1 = Address::generate(&_env);
        let referrer2 = Address::generate(&_env);
        let referee1 = Address::generate(&_env);
        let referee2 = Address::generate(&_env);

        // Pair 1: referee1 claims from referrer1
        let result1 = client.try_claim_referral(&referee1, &referrer1);
        assert!(result1.is_ok(), "First valid referral should succeed");

        // Pair 2: referee2 claims from referrer2 (different pair)
        let result2 = client.try_claim_referral(&referee2, &referrer2);
        assert!(result2.is_ok(), "Second valid referral should succeed");

        // Pair 3: referee1 can also claim from referrer2 (different referrer)
        let result3 = client.try_claim_referral(&referee1, &referrer2);
        assert!(
            result3.is_ok(),
            "Same referee can claim from different referrer"
        );

        // Pair 4: referee2 can also claim from referrer1 (different referrer)
        let result4 = client.try_claim_referral(&referee2, &referrer1);
        assert!(
            result4.is_ok(),
            "Same referee can claim from different referrer"
        );
    }

    /// Test that only one-directional claims are valid
    ///
    /// If A refers B, then B cannot refer A in any order
    #[test]
    fn test_one_directional_claims_only() {
        let (_env, _admin, client) = setup();
        let user_a = Address::generate(&_env);
        let user_b = Address::generate(&_env);

        // Valid: B claims with A as referrer
        let result1 = client.try_claim_referral(&user_b, &user_a);
        assert!(result1.is_ok(), "B should claim A as referrer");

        // Invalid: A cannot claim with B as referrer after B used A
        let result2 = client.try_claim_referral(&user_a, &user_b);
        assert!(
            result2.is_err(),
            "One-way relationship enforced: A cannot refer B after being referred by B"
        );

        // Invalid: A cannot even claim B again (duplicate)
        let result3 = client.try_claim_referral(&user_b, &user_a);
        assert!(
            result3.is_err(),
            "Duplicate claims should be rejected"
        );
    }

    /// Test edge case: referral claim with same address twice in code lifecycle
    #[test]
    fn test_claim_persistence() {
        let (_env, _admin, client) = setup();
        let referrer = Address::generate(&_env);
        let referee = Address::generate(&_env);

        // Make initial claim
        let result1 = client.try_claim_referral(&referee, &referrer);
        assert!(result1.is_ok());

        // Query if claim exists
        let is_claimed_1 = client.is_referral_claimed(&referee, &referrer);
        assert!(is_claimed_1, "Claim should persist");

        // Try to claim again (should fail)
        let result2 = client.try_claim_referral(&referee, &referrer);
        assert!(result2.is_err(), "Duplicate claim should fail");

        // Claim should still exist
        let is_claimed_2 = client.is_referral_claimed(&referee, &referrer);
        assert!(is_claimed_2, "Claim should still persist after failed reattempt");
    }
}
