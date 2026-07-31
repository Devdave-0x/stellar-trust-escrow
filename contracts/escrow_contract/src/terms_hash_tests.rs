//! # Terms hash and DEX swap tests
//!
//! Tests for off-chain terms acceptance binding and DEX swap simulation.
//!
//! Closes #121, #123

#[cfg(test)]
#[allow(clippy::module_inception)]
mod terms_hash_tests {
    use crate::terms_hash::{
        check_terms_accepted, record_terms_acceptance, validate_terms_hash, get_dex_config,
        load_dex_swap, record_dex_swap, set_dex_config,
    };
    use crate::{
        DexConfig, DexSwapRecord, EscrowContract, EscrowContractClient, EscrowError,
        MultisigConfig, TermsAcceptance,
    };

    use soroban_sdk::{
        testutils::Address as _, token, Address, BytesN, Env, Vec as SorobanVec,
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

    fn register_token(
        env: &Env,
        admin: &Address,
        recipient: &Address,
        amount: i128,
    ) -> Address {
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let sac = token::StellarAssetClient::new(env, &token_id.address());
        sac.mint(recipient, &amount);
        token_id.address()
    }

    fn hash32(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[7u8; 32])
    }

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: SorobanVec::new(env),
            weights: SorobanVec::new(env),
            threshold: 0,
        }
    }

    // ── Terms hash validation ─────────────────────────────────────────────

    #[test]
    fn test_validate_terms_hash_rejects_zero() {
        let env = Env::default();
        let zero = BytesN::from_array(&env, &[0u8; 32]);
        assert!(matches!(
            validate_terms_hash(&env, &zero),
            Err(EscrowError::TermsHashEmpty)
        ));
    }

    #[test]
    fn test_validate_terms_hash_accepts_nonzero() {
        let env = Env::default();
        let h = BytesN::from_array(&env, &[1u8; 32]);
        assert!(validate_terms_hash(&env, &h).is_ok());
    }

    // ── Terms acceptance flow ─────────────────────────────────────────────

    #[test]
    fn test_terms_acceptance_flow() {
        let (env, admin, client, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client, 20_000);
        let terms_hash = hash32(&env);

        let escrow_id = contract.create_escrow(
            &client,
            &freelancer,
            &token,
            &10_000_i128,
            &terms_hash,
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
            &Some(terms_hash.clone()),
        );

        assert!(escrow_id.is_ok());

        let accepted = contract.check_terms_accepted(escrow_id.unwrap());
        assert!(matches!(accepted, Err(Ok(EscrowError::ClientHasNotAcceptedTerms))));

        let accept_result = contract.accept_terms(&client, escrow_id.unwrap());
        assert!(accept_result.is_ok());

        let accepted = contract.check_terms_accepted(escrow_id.unwrap());
        assert!(accepted.is_ok() && accepted.unwrap());
    }

    #[test]
    fn test_accept_terms_twice_fails() {
        let (env, admin, client, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client, 20_000);
        let terms_hash = hash32(&env);

        let escrow_id = contract.create_escrow(
            &client,
            &freelancer,
            &token,
            &10_000_i128,
            &terms_hash,
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
            &Some(terms_hash.clone()),
        );

        let _ = contract.accept_terms(&client, escrow_id.unwrap());
        let second = contract.accept_terms(&client, escrow_id.unwrap());
        assert!(matches!(second, Err(Ok(EscrowError::ClientAlreadyAcceptedTerms))));
    }

    // ── DEX swap flow ────────────────────────────────────────────────────

    #[test]
    fn test_dex_swap_flow() {
        let (env, admin, client, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client, 50_000);
        let token_out = register_token(&env, &admin, &freelancer, 50_000);

        let escrow_id = contract.create_escrow(
            &client,
            &freelancer,
            &token,
            &30_000_i128,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
            &None,
        );

        set_dex_config(
            &env,
            &DexConfig {
                dex_contract_id: Address::generate(&env),
                supported_pairs: SorobanVec::from_array(
                    &env,
                    [(token.clone(), token_out.clone())],
                ),
            },
        );

        let record = contract.swap_asset_via_dex(
            &client,
            escrow_id.unwrap(),
            &token,
            &token_out,
            &5_000_i128,
            &4_000_i128,
        );

        assert!(record.is_ok());
        let rec = record.unwrap();
        assert_eq!(rec.token_in, token);
        assert_eq!(rec.token_out, token_out);
        assert_eq!(rec.amount_in, 5_000_i128);
        assert!(rec.success);
    }

    #[test]
    fn test_dex_swap_rejects_unsupported_pair() {
        let (env, admin, client, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client, 50_000);
        let token_out = register_token(&env, &admin, &freelancer, 50_000);
        let unsupported = register_token(&env, &admin, &freelancer, 50_000);

        let escrow_id = contract.create_escrow(
            &client,
            &freelancer,
            &token,
            &30_000_i128,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
            &None,
        );

        set_dex_config(
            &env,
            &DexConfig {
                dex_contract_id: Address::generate(&env),
                supported_pairs: SorobanVec::from_array(
                    &env,
                    [(token.clone(), token_out.clone())],
                ),
            },
        );

        let result = contract.swap_asset_via_dex(
            &client,
            escrow_id.unwrap(),
            &token,
            &unsupported,
            &5_000_i128,
            &4_000_i128,
        );
        assert!(matches!(result, Err(Ok(EscrowError::InvalidSwapParameters))));
    }

    #[test]
    fn test_dex_swap_rejects_non_client() {
        let (env, admin, client, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client, 50_000);
        let token_out = register_token(&env, &admin, &freelancer, 50_000);

        let escrow_id = contract.create_escrow(
            &client,
            &freelancer,
            &token,
            &30_000_i128,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
            &None,
        );

        set_dex_config(
            &env,
            &DexConfig {
                dex_contract_id: Address::generate(&env),
                supported_pairs: SorobanVec::from_array(
                    &env,
                    [(token.clone(), token_out.clone())],
                ),
            },
        );

        let result = contract.swap_asset_via_dex(
            &freelancer,
            escrow_id.unwrap(),
            &token,
            &token_out,
            &5_000_i128,
            &4_000_i128,
        );
        assert!(matches!(result, Err(Ok(EscrowError::E5))));
    }
}
