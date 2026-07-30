#[cfg(test)]
#[allow(clippy::module_inception)]
mod slippage_tests {
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

    use crate::{
        EscrowContract, EscrowContractClient, EscrowError, MultisigConfig, MAX_ESCROW_AMOUNT,
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
    fn test_set_slippage_bps_requires_client_auth() {
        let (env, _admin, client, freelancer, contract) = setup();
        let token = register_token(&env, &_admin, &client, MAX_ESCROW_AMOUNT);
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

        let other = Address::generate(&env);
        let result = contract.try_set_slippage_bps(&other, escrow_id, 500);
        assert!(result.is_err());
    }

    #[test]
    fn test_set_slippage_bps_non_client_rejected() {
        let (env, _admin, client, freelancer, contract) = setup();
        let token = register_token(&env, &_admin, &client, MAX_ESCROW_AMOUNT);
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

        let other = Address::generate(&env);
        let result = contract.try_set_slippage_bps(&other, escrow_id, 500);
        assert!(result.is_err());
    }

    #[test]
    fn test_set_slippage_bps_exceeds_max() {
        let (env, _admin, client, freelancer, contract) = setup();
        let token = register_token(&env, &_admin, &client, MAX_ESCROW_AMOUNT);
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

        let result = contract.try_set_slippage_bps(&client, escrow_id, 10_001);
        assert!(result.is_err());
    }
}
