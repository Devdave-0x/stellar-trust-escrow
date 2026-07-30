#[cfg(test)]
#[allow(clippy::module_inception)]
mod amount_limits_tests {
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

    use crate::{
        EscrowContract, EscrowContractClient, EscrowError, MultisigConfig, MAX_ESCROW_AMOUNT, MIN_ESCROW_AMOUNT,
    };

    fn setup() -> (
        Env,
        Address,
        Address,
        Address,
        EscrowContractClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let client = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let contract_id = env.register_contract(None, EscrowContract);
        let contract = EscrowContractClient::new(&env, &contract_id);
        contract.initialize(&admin);

        (env, admin, client, freelancer, contract)
    }

    fn register_token(env: &Env, admin: &Address, recipient: &Address, amount: i128) -> Address {
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let sac = soroban_sdk::token::StellarAssetClient::new(env, &token_id.address());
        sac.mint(recipient, &amount);
        token_id.address()
    }

    fn hash32(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[1u8; 32])
    }

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    #[test]
    fn test_create_escrow_below_min_rejected() {
        let (env, admin, client, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client, MAX_ESCROW_AMOUNT);

        let result = contract.try_create_escrow(
            &client,
            &freelancer,
            &token,
            &(MIN_ESCROW_AMOUNT - 1),
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert_eq!(result, Err(Ok(EscrowError::E84)));
    }

    #[test]
    fn test_create_escrow_zero_rejected() {
        let (env, admin, client, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client, MAX_ESCROW_AMOUNT);

        let result = contract.try_create_escrow(
            &client,
            &freelancer,
            &token,
            &0,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert_eq!(result, Err(Ok(EscrowError::E84)));
    }

    #[test]
    fn test_create_escrow_above_max_rejected() {
        let (env, admin, client, freelancer, contract) = setup();
        let over = MAX_ESCROW_AMOUNT + 1;
        let token = register_token(&env, &admin, &client, over + 1_000_000);

        let result = contract.try_create_escrow(
            &client,
            &freelancer,
            &token,
            &over,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert_eq!(result, Err(Ok(EscrowError::E85)));
    }

    #[test]
    fn test_create_escrow_at_min_accepted() {
        let (env, admin, client, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client, MAX_ESCROW_AMOUNT);

        let result = contract.try_create_escrow(
            &client,
            &freelancer,
            &token,
            &MIN_ESCROW_AMOUNT,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert!(result.is_ok(), "MIN_ESCROW_AMOUNT should be accepted, got {:?}", result);
    }

    #[test]
    fn test_add_milestone_above_max_rejected() {
        let (env, admin, client, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client, MAX_ESCROW_AMOUNT);
        let escrow_id = contract.create_escrow(
            &client,
            &freelancer,
            &token,
            &100_000,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert!(escrow_id.is_ok());
        let escrow_id = escrow_id.unwrap();

        let result = contract.try_add_milestone(
            &client,
            escrow_id,
            &"test".to_string(),
            &hash32(&env),
            &(MAX_ESCROW_AMOUNT + 1),
        );
        assert_eq!(result, Err(Ok(EscrowError::E85)));
    }
}