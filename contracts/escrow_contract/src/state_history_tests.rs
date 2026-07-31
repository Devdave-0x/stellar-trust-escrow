#[cfg(test)]
#[allow(clippy::module_inception)]
mod state_history_tests {
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, Vec};

    use crate::{
        EscrowContract, EscrowContractClient, EscrowError, EscrowStatus, MultisigConfig,
        StateHistoryEntry, MAX_ESCROW_AMOUNT, MIN_ESCROW_AMOUNT,
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
    fn test_state_history_records_create() {
        let (env, _admin, client, freelancer, contract) = setup();
        let token = register_token(&env, &_admin, &client, MAX_ESCROW_AMOUNT);
        let result = contract.create_escrow(
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
        assert!(result.is_ok());
        let escrow_id = result.unwrap();

        let history = contract.get_state_history(escrow_id);
        // At minimum the creation should be recorded
        assert!(!history.is_empty());
    }

    #[test]
    fn test_state_history_entry_fields() {
        let env = Env::default();
        env.mock_all_auths();
        let caller = Address::generate(&env);
        let entry = StateHistoryEntry {
            escrow_id: 1,
            from_status: EscrowStatus::Active,
            to_status: EscrowStatus::Completed,
            timestamp: env.ledger().timestamp(),
            caller: caller.clone(),
        };
        assert_eq!(entry.escrow_id, 1);
        assert_eq!(entry.from_status, EscrowStatus::Active);
        assert_eq!(entry.to_status, EscrowStatus::Completed);
        assert_eq!(entry.caller, caller);
    }
}
