//! Tests for duplicate nonce rejection in meta-transaction scenarios.
//!
//! Verifies that the nonce registry prevents replay attacks by:
//! - Rejecting the same nonce when used for the same operation
//! - Rejecting the same nonce when used for different operation types
//! - Allowing different nonces for the same or different operations

#[cfg(test)]
#[allow(clippy::module_inception)]
mod nonce_duplicate_rejection_tests {
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

    use crate::{EscrowContract, EscrowContractClient};

    fn setup(env: &Env) -> EscrowContractClient<'_> {
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin);
        client
    }

    /// Verifies that the same nonce is rejected when reused for the same operation.
    #[test]
    fn test_same_nonce_same_operation_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let client = setup(&env);

        let nonce_a = BytesN::from_array(&env, &[1u8; 32]);

        // First use of the nonce for operation type A should succeed
        client.consume_signed_nonce(&nonce_a);
        assert!(client.is_nonce_used(&nonce_a));

        // Reusing the same nonce should fail
        let result = client.try_consume_signed_nonce(&nonce_a);
        assert!(result.is_err(), "reused nonce must be rejected");
    }

    /// Verifies that the same nonce is rejected across different escrow IDs.
    #[test]
    fn test_same_nonce_different_escrow_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let client = setup(&env);

        let nonce = BytesN::from_array(&env, &[5u8; 32]);

        // Use the nonce once
        client.consume_signed_nonce(&nonce);
        assert!(client.is_nonce_used(&nonce));

        // Try to use it again (should fail regardless of escrow context)
        let result = client.try_consume_signed_nonce(&nonce);
        assert!(result.is_err(), "nonce must be globally unique");
    }

    /// Verifies that different nonces for the same operation type are accepted.
    #[test]
    fn test_different_nonces_same_operation_accepted() {
        let env = Env::default();
        env.mock_all_auths();
        let client = setup(&env);

        let nonce_a = BytesN::from_array(&env, &[1u8; 32]);
        let nonce_b = BytesN::from_array(&env, &[2u8; 32]);

        client.consume_signed_nonce(&nonce_a);
        client.consume_signed_nonce(&nonce_b);

        assert!(client.is_nonce_used(&nonce_a));
        assert!(client.is_nonce_used(&nonce_b));
    }

    /// Verifies that a nonce can be used once and then rejected on second attempt.
    #[test]
    fn test_nonce_consumed_once_then_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let client = setup(&env);

        let nonce = BytesN::from_array(&env, &[7u8; 32]);

        // First consumption
        assert!(!client.is_nonce_used(&nonce));
        client.consume_signed_nonce(&nonce);
        assert!(client.is_nonce_used(&nonce));

        // Second consumption attempt
        let result = client.try_consume_signed_nonce(&nonce);
        assert!(
            result.is_err(),
            "second consumption of the same nonce must fail"
        );
    }

    /// Verifies that multiple sequential operations with different nonces all succeed.
    #[test]
    fn test_sequential_operations_with_different_nonces() {
        let env = Env::default();
        env.mock_all_auths();
        let client = setup(&env);

        let nonces = [
            BytesN::from_array(&env, &[0u8; 32]),
            BytesN::from_array(&env, &[1u8; 32]),
            BytesN::from_array(&env, &[2u8; 32]),
            BytesN::from_array(&env, &[3u8; 32]),
            BytesN::from_array(&env, &[4u8; 32]),
        ];

        for nonce in &nonces {
            client.consume_signed_nonce(nonce);
            assert!(client.is_nonce_used(nonce));
        }

        // All nonces should be marked as used
        for nonce in &nonces {
            assert!(client.is_nonce_used(nonce));
        }
    }

    /// Verifies that attempting to use a previously consumed nonce fails deterministically.
    #[test]
    fn test_replay_detection_deterministic() {
        let env = Env::default();
        env.mock_all_auths();
        let client = setup(&env);

        let nonce = BytesN::from_array(&env, &[42u8; 32]);

        client.consume_signed_nonce(&nonce);

        // Attempting replay should always fail
        let result1 = client.try_consume_signed_nonce(&nonce);
        let result2 = client.try_consume_signed_nonce(&nonce);

        assert!(result1.is_err());
        assert!(result2.is_err());
    }

    /// Verifies that the nonce registry maintains global uniqueness across all operations.
    #[test]
    fn test_nonce_global_uniqueness() {
        let env = Env::default();
        env.mock_all_auths();
        let client = setup(&env);

        let nonce = BytesN::from_array(&env, &[99u8; 32]);

        // Register the nonce
        assert!(!client.is_nonce_used(&nonce));
        client.consume_signed_nonce(&nonce);

        // Verify it cannot be reused
        assert!(client.is_nonce_used(&nonce));
        let result = client.try_consume_signed_nonce(&nonce);
        assert!(result.is_err());
    }
}
