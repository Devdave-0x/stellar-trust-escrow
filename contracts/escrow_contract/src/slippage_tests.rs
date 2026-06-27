/// Tests for slippage protection on `create_escrow_with_slippage` (#109).
///
/// Deviation formula: deviation_bps = |actual − expected| × 10_000 / expected
/// Rejected when: deviation_bps > max_price_deviation_bps  →  SlippageExceeded (E78)
#[cfg(test)]
mod slippage_tests {
    use crate::oracle::PriceData;
    use crate::{EscrowContract, EscrowContractClient, EscrowError};
    use soroban_sdk::{
        contract, contractimpl, testutils::Address as _, testutils::Ledger, Address, BytesN, Env,
    };

    #[contract]
    pub struct MockOracle;

    #[contractimpl]
    impl MockOracle {
        pub fn set_price(env: Env, asset: Address, price: i128) {
            env.storage().instance().set(&asset, &price);
        }
        pub fn lastprice(env: Env, asset: Address) -> Option<PriceData> {
            env.storage().instance().get(&asset).map(|p| PriceData {
                price: p,
                timestamp: env.ledger().timestamp(),
            })
        }
    }

    struct Setup {
        env: Env,
        client: EscrowContractClient<'static>,
        token: Address,
        depositor: Address,
        freelancer: Address,
        brief_hash: BytesN<32>,
        oracle: Address,
    }

    fn setup() -> Setup {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|l| l.timestamp = 1_000_000);

        let admin = Address::generate(&env);
        let id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &id);
        client.initialize(&admin);

        let oracle = env.register_contract(None, MockOracle);
        client.set_oracle(&admin, &oracle);

        let token_admin = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(token_admin);
        let token = sac.address();

        let depositor = Address::generate(&env);
        let freelancer = Address::generate(&env);
        soroban_sdk::token::StellarAssetClient::new(&env, &token).mint(&depositor, &1_000_000);

        let brief_hash = BytesN::from_array(&env, &[0u8; 32]);

        Setup { env, client, token, depositor, freelancer, brief_hash, oracle }
    }

    /// No slippage params → check skipped, oracle not consulted.
    #[test]
    fn test_no_slippage_params_skips_check() {
        let s = setup();
        let result = s.client.try_create_escrow_with_slippage(
            &s.depositor, &s.freelancer, &s.token, &10_000i128,
            &s.brief_hash, &None, &None, &None, &None, &None,
        );
        assert!(result.is_ok());
    }

    /// Exact price → 0 bps deviation → passes with 0 bps tolerance.
    #[test]
    fn test_exact_price_passes() {
        let s = setup();
        MockOracleClient::new(&s.env, &s.oracle).set_price(&s.token, &1_000_000i128);
        let result = s.client.try_create_escrow_with_slippage(
            &s.depositor, &s.freelancer, &s.token, &10_000i128,
            &s.brief_hash, &None, &None, &None, &Some(0u32), &Some(1_000_000i128),
        );
        assert!(result.is_ok());
    }

    /// +1% actual, 2% tolerance → passes.
    #[test]
    fn test_within_tolerance_passes() {
        let s = setup();
        MockOracleClient::new(&s.env, &s.oracle).set_price(&s.token, &1_010_000i128);
        let result = s.client.try_create_escrow_with_slippage(
            &s.depositor, &s.freelancer, &s.token, &10_000i128,
            &s.brief_hash, &None, &None, &None, &Some(200u32), &Some(1_000_000i128),
        );
        assert!(result.is_ok());
    }

    /// +2% actual, 200 bps tolerance → boundary inclusive → passes.
    #[test]
    fn test_at_boundary_passes() {
        let s = setup();
        MockOracleClient::new(&s.env, &s.oracle).set_price(&s.token, &1_020_000i128);
        let result = s.client.try_create_escrow_with_slippage(
            &s.depositor, &s.freelancer, &s.token, &10_000i128,
            &s.brief_hash, &None, &None, &None, &Some(200u32), &Some(1_000_000i128),
        );
        assert!(result.is_ok());
    }

    /// +3% actual, 2% tolerance → SlippageExceeded.
    #[test]
    fn test_exceeds_tolerance_fails() {
        let s = setup();
        MockOracleClient::new(&s.env, &s.oracle).set_price(&s.token, &1_030_000i128);
        let err = s.client.try_create_escrow_with_slippage(
            &s.depositor, &s.freelancer, &s.token, &10_000i128,
            &s.brief_hash, &None, &None, &None, &Some(200u32), &Some(1_000_000i128),
        ).unwrap_err().unwrap();
        assert_eq!(err, EscrowError::SlippageExceeded);
    }

    /// -3% actual, 2% tolerance → absolute deviation → SlippageExceeded.
    #[test]
    fn test_negative_deviation_fails() {
        let s = setup();
        MockOracleClient::new(&s.env, &s.oracle).set_price(&s.token, &970_000i128);
        let err = s.client.try_create_escrow_with_slippage(
            &s.depositor, &s.freelancer, &s.token, &10_000i128,
            &s.brief_hash, &None, &None, &None, &Some(200u32), &Some(1_000_000i128),
        ).unwrap_err().unwrap();
        assert_eq!(err, EscrowError::SlippageExceeded);
    }

    /// expected_price = 0 → guard before divide → SlippageExceeded.
    #[test]
    fn test_zero_expected_price_rejected() {
        let s = setup();
        MockOracleClient::new(&s.env, &s.oracle).set_price(&s.token, &1_000_000i128);
        let err = s.client.try_create_escrow_with_slippage(
            &s.depositor, &s.freelancer, &s.token, &10_000i128,
            &s.brief_hash, &None, &None, &None, &Some(100u32), &Some(0i128),
        ).unwrap_err().unwrap();
        assert_eq!(err, EscrowError::SlippageExceeded);
    }
}
