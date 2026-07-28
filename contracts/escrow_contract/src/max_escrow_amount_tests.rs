//! # MAX_ESCROW_AMOUNT Boundary Tests
//!
//! Verifies that `create_escrow` and `create_recurring_escrow` enforce the
//! `MAX_ESCROW_AMOUNT` cap, and that the boundary values behave correctly:
//! - `total_amount == MAX_ESCROW_AMOUNT` → accepted
//! - `total_amount == MAX_ESCROW_AMOUNT + 1` → `InvalidEscrowAmount`

#[cfg(test)]
#[allow(clippy::module_inception)]
mod max_escrow_amount_tests {
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

    use crate::{
        EscrowContract, EscrowContractClient, EscrowError, MultisigConfig, MAX_ESCROW_AMOUNT,
    };

    // ── Helpers ───────────────────────────────────────────────────────────────

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
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let contract_id = env.register_contract(None, EscrowContract);
        let contract = EscrowContractClient::new(&env, &contract_id);
        contract.initialize(&admin);

        (env, admin, client_addr, freelancer, contract)
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

    /// A 2-of-2 policy: neither signer's weight alone reaches the threshold, so it
    /// satisfies the high-value multisig requirement.
    fn multisig_2of2(env: &Env, a: &Address, b: &Address) -> MultisigConfig {
        let mut approvers = soroban_sdk::Vec::new(env);
        approvers.push_back(a.clone());
        approvers.push_back(b.clone());
        let mut weights = soroban_sdk::Vec::new(env);
        weights.push_back(1_u32);
        weights.push_back(1_u32);
        MultisigConfig {
            approvers,
            weights,
            threshold: 2,
        }
    }

    // ── create_escrow boundary tests ──────────────────────────────────────────

    /// `total_amount == MAX_ESCROW_AMOUNT` must be accepted when the escrow carries a
    /// multisig policy. `MAX_ESCROW_AMOUNT` is above the high-value threshold, so a
    /// policy requiring more than one signer is mandatory.
    #[test]
    fn test_create_escrow_at_max_amount_accepted() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client_addr, MAX_ESCROW_AMOUNT + 1_000_000);
        let cosigner = Address::generate(&env);

        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &MAX_ESCROW_AMOUNT,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &multisig_2of2(&env, &client_addr, &cosigner),
        );
        assert!(
            result.is_ok(),
            "expected Ok at MAX_ESCROW_AMOUNT, got {result:?}"
        );
    }

    /// A high-value escrow with no multisig policy must be rejected outright —
    /// single-signature approval is not an acceptable policy at this size.
    #[test]
    fn test_create_escrow_at_max_amount_without_multisig_rejected() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client_addr, MAX_ESCROW_AMOUNT + 1_000_000);

        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &MAX_ESCROW_AMOUNT,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert_eq!(result, Err(Ok(EscrowError::MultisigRequiredForHighValue)));
    }

    /// `total_amount == MAX_ESCROW_AMOUNT + 1` must be rejected with `InvalidEscrowAmount`.
    #[test]
    fn test_create_escrow_above_max_amount_rejected() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let over = MAX_ESCROW_AMOUNT + 1;
        let token = register_token(&env, &admin, &client_addr, over + 1_000_000);

        let result = contract.try_create_escrow(
            &client_addr,
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
        assert_eq!(result, Err(Ok(EscrowError::E19)));
    }

    /// Zero `total_amount` must also be rejected with `InvalidEscrowAmount`.
    #[test]
    fn test_create_escrow_zero_amount_rejected() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client_addr, 1_000_000);

        let result = contract.try_create_escrow(
            &client_addr,
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
        assert_eq!(result, Err(Ok(EscrowError::E19)));
    }
}
