#![cfg(test)]

#[allow(clippy::module_inception)]
mod version_tests {
    use crate::{EscrowContract, EscrowContractClient, CONTRACT_VERSION};
    use soroban_sdk::{testutils::Address as _, Address, Env, String};

    #[test]
    fn test_version_matches_cargo_toml() {
        let cargo_version = env!("CARGO_PKG_VERSION");
        assert_eq!(
            CONTRACT_VERSION, cargo_version,
            "CONTRACT_VERSION constant must match Cargo.toml version"
        );
    }

    #[test]
    fn test_get_version_after_initialize() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        client.initialize(&admin);

        let version = client.get_version();
        assert_eq!(version, String::from_str(&env, CONTRACT_VERSION));
    }

    #[test]
    fn test_get_version_returns_default_when_uninitialized() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        let version = client.get_version();
        assert_eq!(version, String::from_str(&env, "0.0.0"));
    }
}
