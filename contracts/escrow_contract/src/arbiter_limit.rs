//! # Arbiter Count Limit
//!
//! Caps the number of arbiters that can be assigned to a single escrow so
//! dispute governance stays manageable.

use soroban_sdk::{Address, Env, Vec};

use crate::DataKey;

/// Maximum number of arbiters that may be assigned to a single escrow.
pub const MAX_ARBITERS_PER_ESCROW: u32 = 5;

pub(crate) fn load_arbiter_list(env: &Env, escrow_id: u64) -> Vec<Address> {
    env.storage()
        .persistent()
        .get(&DataKey::ArbiterList(escrow_id))
        .unwrap_or_else(|| Vec::new(env))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{EscrowContract, EscrowContractClient};
    use soroban_sdk::testutils::Address as _;

    fn setup(env: &Env) -> (EscrowContractClient<'_>, Address) {
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin);
        (client, admin)
    }

    #[test]
    fn test_assign_arbiters_up_to_limit_succeeds() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup(&env);

        for _ in 0..MAX_ARBITERS_PER_ESCROW {
            let arbiter = Address::generate(&env);
            client.assign_arbiter(&admin, &1u64, &arbiter);
        }

        assert_eq!(client.get_arbiter_count(&1u64), MAX_ARBITERS_PER_ESCROW);
    }

    #[test]
    fn test_assign_arbiter_over_limit_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup(&env);

        for _ in 0..MAX_ARBITERS_PER_ESCROW {
            let arbiter = Address::generate(&env);
            client.assign_arbiter(&admin, &1u64, &arbiter);
        }

        let extra = Address::generate(&env);
        let result = client.try_assign_arbiter(&admin, &1u64, &extra);
        assert!(result.is_err());
        assert_eq!(client.get_arbiter_count(&1u64), MAX_ARBITERS_PER_ESCROW);
    }

    #[test]
    fn test_get_arbiter_count_returns_correct_count() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup(&env);

        assert_eq!(client.get_arbiter_count(&1u64), 0);

        let a1 = Address::generate(&env);
        let a2 = Address::generate(&env);
        client.assign_arbiter(&admin, &1u64, &a1);
        client.assign_arbiter(&admin, &1u64, &a2);

        assert_eq!(client.get_arbiter_count(&1u64), 2);
        // Independent escrow is unaffected.
        assert_eq!(client.get_arbiter_count(&2u64), 0);
    }
}
