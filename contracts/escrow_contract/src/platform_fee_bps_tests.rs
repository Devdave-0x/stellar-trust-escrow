//! Tests for the admin-configurable platform fee rate (max 10% = 1000 bps).

#[cfg(test)]
mod platform_fee_bps_tests {
    use soroban_sdk::{testutils::Address as _, Address, Env};

    use crate::{EscrowContract, EscrowContractClient};

    fn setup(env: &Env) -> (EscrowContractClient<'_>, Address) {
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin);
        (client, admin)
    }

    #[test]
    fn test_get_returns_correct_value() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup(&env);

        assert_eq!(client.get_platform_fee_bps(), 0);
        client.set_platform_fee_bps(&admin, &250);
        assert_eq!(client.get_platform_fee_bps(), 250);
    }

    #[test]
    fn test_admin_can_update() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup(&env);

        let result = client.try_set_platform_fee_bps(&admin, &500);
        assert!(result.is_ok());
        assert_eq!(client.get_platform_fee_bps(), 500);
    }

    #[test]
    fn test_non_admin_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin) = setup(&env);
        let not_admin = Address::generate(&env);

        let result = client.try_set_platform_fee_bps(&not_admin, &500);
        assert!(result.is_err());
    }

    #[test]
    fn test_over_max_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup(&env);

        let result = client.try_set_platform_fee_bps(&admin, &1_001);
        assert!(result.is_err());
        assert_eq!(client.get_platform_fee_bps(), 0);
    }
}
