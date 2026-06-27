#![cfg(test)]

#[allow(clippy::module_inception)]
mod dispute_cooldown_tests {
    use crate::{
        EscrowContract, EscrowContractClient, EscrowError, MultisigConfig,
        DEFAULT_DISPUTE_COOLDOWN_SECS,
    };
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String, Vec};

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: Vec::new(env),
            weights: Vec::new(env),
            threshold: 0,
        }
    }

    fn setup() -> (Env, Address, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, admin, contract_id, client)
    }

    fn register_token(env: &Env, admin: &Address, recipient: &Address, amount: i128) -> Address {
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let sac = soroban_sdk::token::StellarAssetClient::new(env, &token_id.address());
        sac.mint(recipient, &amount);
        token_id.address()
    }

    fn advance(env: &Env, secs: u64) {
        let mut ledger = env.ledger().get();
        ledger.timestamp += secs;
        ledger.sequence_number += (secs / 5) as u32;
        env.ledger().set(ledger);
    }

    fn create_disputed_escrow(
        env: &Env,
        client: &EscrowContractClient,
        admin: &Address,
    ) -> (u64, Address, Address, Address) {
        let buyer = Address::generate(env);
        let freelancer = Address::generate(env);
        let arbiter = Address::generate(env);
        let token = register_token(env, admin, &buyer, 5000);

        client.add_approved_arbiter(admin, &arbiter);

        let escrow_id = client.create_escrow(
            &buyer,
            &freelancer,
            &token,
            &1000_i128,
            &BytesN::from_array(env, &[1u8; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(env),
        );

        client.raise_dispute(&buyer, &escrow_id, &None);
        client.assign_dispute_arbiter(admin, &escrow_id, &arbiter);

        (escrow_id, buyer, freelancer, arbiter)
    }

    #[test]
    fn test_submit_ruling_rejected_during_cooldown() {
        let (env, admin, _, client) = setup();
        let (escrow_id, _, _, arbiter) = create_disputed_escrow(&env, &client, &admin);

        // Immediately try ruling — should fail (cooldown not elapsed)
        let result = client.try_submit_ruling(&arbiter, &escrow_id, &50, &50);
        assert!(result.is_err());
    }

    #[test]
    fn test_submit_ruling_succeeds_after_cooldown() {
        let (env, admin, _, client) = setup();
        let (escrow_id, _, _, arbiter) = create_disputed_escrow(&env, &client, &admin);

        advance(&env, DEFAULT_DISPUTE_COOLDOWN_SECS + 1);

        client.submit_ruling(&arbiter, &escrow_id, &60, &40);

        let info = client.get_dispute_info(&escrow_id);
        assert!(!info.is_disputed);
    }

    #[test]
    fn test_custom_cooldown_period() {
        let (env, admin, _, client) = setup();

        let custom_cooldown: u64 = 3600; // 1 hour
        client.set_dispute_cooldown(&admin, &custom_cooldown);
        assert_eq!(client.get_dispute_cooldown(), custom_cooldown);

        let (escrow_id, _, _, arbiter) = create_disputed_escrow(&env, &client, &admin);

        advance(&env, custom_cooldown - 1);
        let result = client.try_submit_ruling(&arbiter, &escrow_id, &50, &50);
        assert!(result.is_err());

        advance(&env, 2);
        client.submit_ruling(&arbiter, &escrow_id, &50, &50);
    }

    #[test]
    fn test_get_dispute_info_shows_cooldown_end() {
        let (env, admin, _, client) = setup();
        let (escrow_id, _, _, _) = create_disputed_escrow(&env, &client, &admin);

        let info = client.get_dispute_info(&escrow_id);
        assert!(info.is_disputed);
        assert!(info.disputed_at.is_some());
        assert!(info.cooldown_ends_at.is_some());
        assert!(!info.cooldown_elapsed);
        assert_eq!(info.cooldown_secs, DEFAULT_DISPUTE_COOLDOWN_SECS);

        advance(&env, DEFAULT_DISPUTE_COOLDOWN_SECS + 1);

        let info = client.get_dispute_info(&escrow_id);
        assert!(info.cooldown_elapsed);
    }

    #[test]
    fn test_default_cooldown_is_24_hours() {
        let (_, _, _, client) = setup();
        assert_eq!(client.get_dispute_cooldown(), 86_400);
    }
}
