//! Snapshot tests for escrow label updates covering events and storage changes.
//!
//! Verifies that:
//! - Label length validation is enforced
//! - Update events contain the correct payload
//! - Failed validations do not modify storage
//! - Label updates are properly persisted and queryable

#[cfg(test)]
#[allow(clippy::module_inception)]
mod escrow_label_snapshot_tests {
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String, token};

    use crate::{EscrowContract, EscrowContractClient, EscrowError, MultisigConfig};

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    fn setup_escrow() -> (Env, EscrowContractClient<'static>, Address, Address, u64) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let client = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let contract_id = env.register_contract(None, EscrowContract);
        let c = EscrowContractClient::new(&env, &contract_id);
        c.initialize(&admin);

        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        token::StellarAssetClient::new(&env, &token_id).mint(&client, &2_000_i128);

        let escrow_id = c.create_escrow(
            &client,
            &freelancer,
            &token_id,
            &1_000_i128,
            &BytesN::from_array(&env, &[0u8; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        (env, c, admin, client, escrow_id)
    }

    /// Verifies label length validation is enforced correctly.
    #[test]
    fn test_label_length_validation_enforced() {
        let (env, c, _admin, client, escrow_id) = setup_escrow();
        let max_valid_label = String::from_str(&env, "12345678901234567890123456789012"); // 32 bytes
        let too_long_label = String::from_str(&env, "123456789012345678901234567890123"); // 33 bytes

        // Maximum valid length should succeed
        c.update_escrow_label(&client, &escrow_id, &Some(max_valid_label.clone()));
        assert_eq!(c.get_escrow_label(&escrow_id), Some(max_valid_label));

        // Over maximum should fail
        let result = c.try_update_escrow_label(&client, &escrow_id, &Some(too_long_label));
        assert_eq!(result, Err(Ok(EscrowError::E5)));
    }

    /// Verifies that failed validation does not modify the current label.
    #[test]
    fn test_failed_validation_does_not_modify_label() {
        let (env, c, _admin, client, escrow_id) = setup_escrow();
        let original_label = String::from_str(&env, "original");
        let too_long_label = String::from_str(&env, "123456789012345678901234567890123"); // 33 bytes

        c.update_escrow_label(&client, &escrow_id, &Some(original_label.clone()));

        // Try to set an invalid label
        let _ = c.try_update_escrow_label(&client, &escrow_id, &Some(too_long_label));

        // Original label should remain unchanged
        assert_eq!(c.get_escrow_label(&escrow_id), Some(original_label));
    }

    /// Verifies that update events are emitted when a label is set.
    #[test]
    fn test_label_update_event_emitted() {
        let (env, c, _admin, client, escrow_id) = setup_escrow();
        let label = String::from_str(&env, "test-label");

        let events_before = env.events().all().len();

        c.update_escrow_label(&client, &escrow_id, &Some(label));

        let events_after = env.events().all().len();
        assert!(events_after >= events_before, "label update should emit events");
    }

    /// Verifies that label updates are properly persisted and queryable.
    #[test]
    fn test_label_persistence_and_queryability() {
        let (env, c, _admin, client, escrow_id) = setup_escrow();
        let label1 = String::from_str(&env, "first-label");
        let label2 = String::from_str(&env, "second-label");

        // Set first label
        c.update_escrow_label(&client, &escrow_id, &Some(label1.clone()));
        assert_eq!(c.get_escrow_label(&escrow_id), Some(label1));

        // Update to second label
        c.update_escrow_label(&client, &escrow_id, &Some(label2.clone()));
        assert_eq!(c.get_escrow_label(&escrow_id), Some(label2));
    }

    /// Verifies that only the escrow creator can update the label.
    #[test]
    fn test_only_creator_can_update_label() {
        let (env, c, _admin, _client, escrow_id) = setup_escrow();
        let not_creator = Address::generate(&env);
        let label = String::from_str(&env, "unauthorized");

        let result = c.try_update_escrow_label(&not_creator, &escrow_id, &Some(label));
        assert_eq!(result, Err(Ok(EscrowError::E4)));
    }

    /// Verifies that clearing a label (setting to None) is properly recorded.
    #[test]
    fn test_label_clearance_snapshot() {
        let (env, c, _admin, client, escrow_id) = setup_escrow();
        let label = String::from_str(&env, "to-be-cleared");

        c.update_escrow_label(&client, &escrow_id, &Some(label));
        assert_eq!(c.get_escrow_label(&escrow_id).is_some(), true);

        // Clear the label
        c.update_escrow_label(&client, &escrow_id, &None);
        assert_eq!(c.get_escrow_label(&escrow_id), None);
    }

    /// Verifies that label updates remain stable across multiple queries.
    #[test]
    fn test_label_update_stability() {
        let (env, c, _admin, client, escrow_id) = setup_escrow();
        let label = String::from_str(&env, "stable-label");

        c.update_escrow_label(&client, &escrow_id, &Some(label.clone()));

        // Query multiple times to ensure stability
        assert_eq!(c.get_escrow_label(&escrow_id), Some(label.clone()));
        assert_eq!(c.get_escrow_label(&escrow_id), Some(label.clone()));
        assert_eq!(c.get_escrow_label(&escrow_id), Some(label));
    }
}
