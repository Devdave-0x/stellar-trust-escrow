//! # Escrow Count By Creator
//!
//! Tracks how many escrows each address has created, so analytics can query
//! a single counter instead of scanning every escrow.

use soroban_sdk::{Address, Env};

use crate::DataKey;

/// Increments the escrow-creation counter for `creator`. Call this once per
/// successful `create_escrow`.
pub(crate) fn increment(env: &Env, creator: &Address) {
    let key = DataKey::EscrowCountByCreator(creator.clone());
    let count: u32 = env.storage().persistent().get(&key).unwrap_or(0u32);
    env.storage().persistent().set(&key, &(count + 1));
}

#[cfg(test)]
mod tests {
    use crate::{EscrowContract, EscrowContractClient, MultisigConfig};
    use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env};

    fn setup(env: &Env) -> (EscrowContractClient<'_>, Address) {
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin);
        (client, admin)
    }

    fn make_token(env: &Env, admin: &Address, holder: &Address, amount: i128) -> Address {
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        token::StellarAssetClient::new(env, &sac.address()).mint(holder, &(amount + 1_000));
        sac.address()
    }

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    #[test]
    fn test_count_is_zero_for_new_address() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin) = setup(&env);
        let someone = Address::generate(&env);

        assert_eq!(client.get_escrow_count(&someone), 0);
    }

    #[test]
    fn test_count_increments_on_each_creation_and_is_independent_per_address() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup(&env);

        let creator_a = Address::generate(&env);
        let creator_b = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = make_token(&env, &admin, &creator_a, 10_000);
        make_token(&env, &admin, &creator_b, 10_000);
        // Reuse the same token address for creator_b by minting directly.
        token::StellarAssetClient::new(&env, &token).mint(&creator_b, &10_000);

        let brief = BytesN::from_array(&env, &[1u8; 32]);
        let multisig = no_multisig(&env);
        client.create_escrow(
            &creator_a,
            &freelancer,
            &token,
            &1_000i128,
            &brief,
            &None,
            &None,
            &None,
            &None,
            &multisig,
        );
        assert_eq!(client.get_escrow_count(&creator_a), 1);
        assert_eq!(client.get_escrow_count(&creator_b), 0);

        client.create_escrow(
            &creator_a,
            &freelancer,
            &token,
            &1_000i128,
            &brief,
            &None,
            &None,
            &None,
            &None,
            &multisig,
        );
        assert_eq!(client.get_escrow_count(&creator_a), 2);
        assert_eq!(client.get_escrow_count(&creator_b), 0);
    }
}
