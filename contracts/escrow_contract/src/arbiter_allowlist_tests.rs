#[cfg(test)]
#[allow(clippy::module_inception)]
mod arbiter_allowlist_tests {
    use soroban_sdk::{testutils::Address as _, Address, Env};

    use crate::{EscrowContract, EscrowContractClient, EscrowError};

    fn setup() -> (Env, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);

        (env, admin, client)
    }

    #[test]
    fn test_add_to_allowlist_requires_admin() {
        let (env, admin, contract) = setup();
        let arbiter = Address::generate(&env);
        let non_admin = Address::generate(&env);

        let result = contract.try_add_to_arbiter_allowlist(&non_admin, &arbiter);
        assert!(result.is_err());
    }

    #[test]
    fn test_add_to_allowlist_happy_path() {
        let (env, admin, contract) = setup();
        let arbiter = Address::generate(&env);

        contract.add_to_arbiter_allowlist(&admin, &arbiter);
        assert!(contract.is_arbiter_allowed(&arbiter));
    }

    #[test]
    fn test_add_to_allowlist_prevents_duplicates() {
        let (env, admin, contract) = setup();
        let arbiter = Address::generate(&env);

        contract.add_to_arbiter_allowlist(&admin, &arbiter);
        let result = contract.try_add_to_arbiter_allowlist(&admin, &arbiter);
        assert!(result.is_err());
    }

    #[test]
    fn test_remove_from_allowlist_requires_admin() {
        let (env, admin, contract) = setup();
        let arbiter = Address::generate(&env);
        let non_admin = Address::generate(&env);

        contract.add_to_arbiter_allowlist(&admin, &arbiter);
        let result = contract.try_remove_from_arbiter_allowlist(&non_admin, &arbiter);
        assert!(result.is_err());
    }

    #[test]
    fn test_remove_from_allowlist_happy_path() {
        let (env, admin, contract) = setup();
        let arbiter = Address::generate(&env);

        contract.add_to_arbiter_allowlist(&admin, &arbiter);
        contract.remove_from_arbiter_allowlist(&admin, &arbiter);
        assert!(!contract.is_arbiter_allowed(&arbiter));
    }

    #[test]
    fn test_remove_from_allowlist_not_found() {
        let (env, admin, contract) = setup();
        let arbiter = Address::generate(&env);

        let result = contract.try_remove_from_arbiter_allowlist(&admin, &arbiter);
        assert!(result.is_err());
    }

    #[test]
    fn test_is_arbiter_allowed_default_false() {
        let (env, _admin, contract) = setup();
        let arbiter = Address::generate(&env);

        assert!(!contract.is_arbiter_allowed(&arbiter));
    }
}
