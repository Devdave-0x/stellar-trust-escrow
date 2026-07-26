//! Minimum economical release amount ("dust threshold").
//!
//! Releasing very small amounts can cost more in network fees than the
//! value transferred. `MIN_RELEASE_AMOUNT` sets a floor that callers can
//! validate a release amount against via `validate_release_amount`.

use soroban_sdk::{contractimpl, Env};

use crate::{EscrowContract, EscrowError};

/// Minimum release amount, in stroops (0.1 XLM).
pub const MIN_RELEASE_AMOUNT: i128 = 1_000_000;

impl EscrowContract {
    /// Returns Err(AmountBelowDustThreshold) if `amount` is below the minimum.
    pub(crate) fn validate_release_amount(amount: i128) -> Result<(), EscrowError> {
        if amount < MIN_RELEASE_AMOUNT {
            return Err(EscrowError::AmountBelowDustThreshold);
        }
        Ok(())
    }
}

#[contractimpl]
impl EscrowContract {
    /// Returns the minimum release amount (in stroops) below which a
    /// release is considered uneconomical dust.
    pub fn get_min_release_amount(_env: Env) -> i128 {
        MIN_RELEASE_AMOUNT
    }
}

#[cfg(test)]
mod tests {
    use super::MIN_RELEASE_AMOUNT;
    use crate::{EscrowContract, EscrowContractClient, EscrowError};
    use soroban_sdk::{testutils::Address as _, Address, Env};

    #[test]
    fn test_get_min_release_amount_view() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);

        assert_eq!(client.get_min_release_amount(), MIN_RELEASE_AMOUNT);
    }

    #[test]
    fn test_exact_minimum_passes() {
        assert_eq!(EscrowContract::validate_release_amount(MIN_RELEASE_AMOUNT), Ok(()));
    }

    #[test]
    fn test_one_below_minimum_fails() {
        assert_eq!(
            EscrowContract::validate_release_amount(MIN_RELEASE_AMOUNT - 1),
            Err(EscrowError::AmountBelowDustThreshold)
        );
    }
}
