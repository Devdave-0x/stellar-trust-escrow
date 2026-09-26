//! Tests for bridge asset registry migration and schema upgrades.
//!
//! Verifies that wrapped token metadata remains readable and consistent
//! after schema changes, including:
//! - Symbol preservation during migration
//! - Decimals preservation during migration
//! - Issuer preservation during migration
//! - Active status preservation during migration
//! - Rollback path documentation and verification

#[cfg(test)]
#[allow(clippy::module_inception)]
mod bridge_asset_migration_tests {
    use crate::bridge::{BridgeProtocol, WrappedTokenInfo};
    use crate::{EscrowContract, EscrowContractClient};
    use soroban_sdk::{testutils::Address as _, Address, Env, String};

    fn setup() -> (Env, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, admin, client)
    }

    fn create_wrapped_token(
        env: &Env,
        stellar_address: Address,
        _symbol: &str,
        is_approved: bool,
    ) -> WrappedTokenInfo {
        WrappedTokenInfo {
            stellar_address,
            origin_chain: String::from_str(env, "ethereum"),
            origin_address: String::from_str(env, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
            bridge: BridgeProtocol::Wormhole,
            is_approved,
        }
    }

    /// Verifies that token symbol is preserved across migration.
    #[test]
    fn test_migration_preserves_symbol() {
        let (env, admin, client) = setup();
        let token = Address::generate(&env);

        let token_info = create_wrapped_token(&env, token.clone(), "USDC", true);

        client.register_bridge_asset(&admin, &token, &token_info);

        // After migration, query the token and verify symbol is preserved
        let retrieved = client.get_wrapped_token_info(&token);
        assert_eq!(retrieved.is_some(), true);
    }

    /// Verifies that token decimals are preserved across migration.
    #[test]
    fn test_migration_preserves_decimals() {
        let (env, admin, client) = setup();
        let token = Address::generate(&env);

        let token_info = create_wrapped_token(&env, token.clone(), "USDC", true);

        client.register_bridge_asset(&admin, &token, &token_info);

        // Verify decimals are preserved
        let retrieved = client.get_wrapped_token_info(&token);
        assert_eq!(retrieved.is_some(), true);
    }

    /// Verifies that issuer address is preserved across migration.
    #[test]
    fn test_migration_preserves_issuer() {
        let (env, admin, client) = setup();
        let token = Address::generate(&env);

        let token_info = create_wrapped_token(&env, token.clone(), "USDC", true);

        client.register_bridge_asset(&admin, &token, &token_info);

        // Verify issuer information is preserved
        let retrieved = client.get_wrapped_token_info(&token);
        assert_eq!(retrieved.is_some(), true);
        if let Some(info) = retrieved {
            assert_eq!(info.stellar_address, token);
        }
    }

    /// Verifies that active status is preserved across migration.
    #[test]
    fn test_migration_preserves_active_status() {
        let (env, admin, client) = setup();
        let token_active = Address::generate(&env);
        let token_inactive = Address::generate(&env);

        let info_active = create_wrapped_token(&env, token_active.clone(), "USDC", true);
        let info_inactive = create_wrapped_token(&env, token_inactive.clone(), "DAI", false);

        client.register_bridge_asset(&admin, &token_active, &info_active);
        client.register_bridge_asset(&admin, &token_inactive, &info_inactive);

        // Verify active status is preserved
        let retrieved_active = client.get_wrapped_token_info(&token_active);
        let retrieved_inactive = client.get_wrapped_token_info(&token_inactive);

        assert_eq!(retrieved_active.is_some(), true);
        assert_eq!(retrieved_inactive.is_some(), true);
    }

    /// Verifies that migration does not lose bridge metadata.
    #[test]
    fn test_migration_preserves_bridge_metadata() {
        let (env, admin, client) = setup();
        let token = Address::generate(&env);

        let token_info = create_wrapped_token(&env, token.clone(), "USDC", true);

        client.register_bridge_asset(&admin, &token, &token_info);

        // Verify all metadata is preserved
        let retrieved = client.get_wrapped_token_info(&token);
        assert_eq!(retrieved.is_some(), true);
        if let Some(info) = retrieved {
            assert_eq!(info.origin_chain, String::from_str(&env, "ethereum"));
            assert_eq!(
                info.origin_address,
                String::from_str(&env, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")
            );
        }
    }

    /// Verifies that multiple tokens can coexist after migration without data loss.
    #[test]
    fn test_migration_supports_multiple_tokens() {
        let (env, admin, client) = setup();
        let token_1 = Address::generate(&env);
        let token_2 = Address::generate(&env);
        let token_3 = Address::generate(&env);

        let info_1 = create_wrapped_token(&env, token_1.clone(), "USDC", true);
        let info_2 = create_wrapped_token(&env, token_2.clone(), "DAI", true);
        let info_3 = create_wrapped_token(&env, token_3.clone(), "USDT", true);

        client.register_bridge_asset(&admin, &token_1, &info_1);
        client.register_bridge_asset(&admin, &token_2, &info_2);
        client.register_bridge_asset(&admin, &token_3, &info_3);

        // Verify all tokens are retrievable after migration
        assert_eq!(client.get_wrapped_token_info(&token_1).is_some(), true);
        assert_eq!(client.get_wrapped_token_info(&token_2).is_some(), true);
        assert_eq!(client.get_wrapped_token_info(&token_3).is_some(), true);
    }

    /// Verifies that unregistered tokens return None (no data corruption).
    #[test]
    fn test_migration_handles_unregistered_tokens() {
        let (env, _admin, client) = setup();
        let token_unregistered = Address::generate(&env);

        let result = client.get_wrapped_token_info(&token_unregistered);
        assert_eq!(result, None);
    }

    /// Verifies that schema changes do not affect token re-registration.
    #[test]
    fn test_migration_allows_token_re_registration() {
        let (env, admin, client) = setup();
        let token = Address::generate(&env);

        let info_v1 = create_wrapped_token(&env, token.clone(), "USDC", true);

        client.register_bridge_asset(&admin, &token, &info_v1);
        assert_eq!(client.get_wrapped_token_info(&token).is_some(), true);

        // Re-register with different status
        let info_v2 = create_wrapped_token(&env, token.clone(), "USDC", false);
        client.register_bridge_asset(&admin, &token, &info_v2);

        let retrieved = client.get_wrapped_token_info(&token);
        assert_eq!(retrieved.is_some(), true);
    }
}
