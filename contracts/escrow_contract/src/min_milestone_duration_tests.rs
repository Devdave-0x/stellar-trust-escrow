//! Tests for `create_milestone`'s minimum-duration guard.

#[cfg(test)]
#[allow(clippy::module_inception)]
mod min_milestone_duration_tests {
    use crate::{
        EscrowContract, EscrowContractClient, EscrowError, MultisigConfig,
        MIN_MILESTONE_DURATION_LEDGERS,
    };
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};

    fn setup() -> (Env, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, admin, client)
    }

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    fn make_escrow(
        env: &Env,
        admin: &Address,
        client: &EscrowContractClient,
        total_amount: i128,
    ) -> (Address, u64) {
        let escrow_client = Address::generate(env);
        let freelancer = Address::generate(env);
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let mint_amount = total_amount + 30;
        soroban_sdk::token::StellarAssetClient::new(env, &token_id.address())
            .mint(&escrow_client, &mint_amount);
        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id.address(),
            &total_amount,
            &BytesN::from_array(env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(env),
        );
        (escrow_client, escrow_id)
    }

    /// A deadline exactly at MIN_MILESTONE_DURATION_LEDGERS away must succeed.
    #[test]
    fn test_create_milestone_at_minimum_duration_succeeds() {
        let (env, admin, client) = setup();
        let (escrow_client, escrow_id) = make_escrow(&env, &admin, &client, 100);

        let current_ledger = env.ledger().sequence();
        let deadline = current_ledger + MIN_MILESTONE_DURATION_LEDGERS;

        let result = client.create_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "M"),
            &BytesN::from_array(&env, &[1; 32]),
            &100,
            &Some(deadline),
        );
        assert_eq!(result, 0);
    }

    /// A deadline one ledger below the minimum must be rejected.
    #[test]
    fn test_create_milestone_below_minimum_duration_fails() {
        let (env, admin, client) = setup();
        let (escrow_client, escrow_id) = make_escrow(&env, &admin, &client, 100);

        let current_ledger = env.ledger().sequence();
        let deadline = current_ledger + MIN_MILESTONE_DURATION_LEDGERS - 1;

        let result = client.try_create_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "M"),
            &BytesN::from_array(&env, &[1; 32]),
            &100,
            &Some(deadline),
        );
        assert_eq!(result, Err(Ok(EscrowError::MilestoneTooShort)));
    }

    /// No deadline provided must skip the duration check entirely.
    #[test]
    fn test_create_milestone_no_deadline_skips_check() {
        let (env, admin, client) = setup();
        let (escrow_client, escrow_id) = make_escrow(&env, &admin, &client, 100);

        let result = client.create_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "M"),
            &BytesN::from_array(&env, &[1; 32]),
            &100,
            &None,
        );
        assert_eq!(result, 0);
    }
}
