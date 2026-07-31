#[cfg(test)]
mod deployment_tests {
    use soroban_sdk::{testutils::Address as _, Address, Env, Vec};

    use crate::{EscrowContract, EscrowContractClient, EscrowError};

    fn setup() -> (Env, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        (env, admin, client)
    }

    #[test]
    fn test_initialize_with_admin_signers_sets_admin_config() {
        let (env, admin, client) = setup();
        let signer_a = Address::generate(&env);
        let signer_b = Address::generate(&env);
        let mut signers = Vec::new(&env);
        signers.push_back(signer_a.clone());
        signers.push_back(signer_b.clone());

        let result = client.try_initialize_with_admin_signers(&admin, &signers, &2u32);
        assert_eq!(result, Ok(Ok(())));

        assert_eq!(client.get_admin(), admin);
        assert_eq!(client.get_admin_threshold(), 2u32);
        let stored_signers = client.get_admin_signers();
        assert_eq!(stored_signers.len(), 2);
        assert_eq!(stored_signers.get(0).unwrap(), signer_a);
        assert_eq!(stored_signers.get(1).unwrap(), signer_b);
        let _ = env;
    }

    #[test]
    fn test_initialize_with_admin_signers_rejects_duplicate_init() {
        let (_env, admin, client) = setup();
        let signers = Vec::new(&client.env());

        let first = client.try_initialize_with_admin_signers(&admin, &signers, &1u32);
        assert_eq!(first, Ok(Ok(())));

        let second = client.try_initialize_with_admin_signers(&admin, &signers, &1u32);
        assert_eq!(second, Ok(Err(EscrowError::E1)));
    }

    #[test]
    fn test_initialize_with_admin_signers_rejects_invalid_threshold() {
        let (_env, admin, client) = setup();
        let signer = Address::generate(&client.env());
        let mut signers = Vec::new(&client.env());
        signers.push_back(signer);

        let result = client.try_initialize_with_admin_signers(&admin, &signers, &0u32);
        assert_eq!(result, Ok(Err(EscrowError::E63)));
    }
}
