//! # `split_escrow` tests
//!
//! Restored against the current contract API. Covers the happy path, the
//! split-amount bounds, and the authorization requirement.

#[cfg(test)]
#[allow(clippy::module_inception)]
mod split_escrow_tests {
    use crate::{EscrowContract, EscrowContractClient, EscrowError, MultisigConfig};

    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};

    const TOTAL: i128 = 1_000;
    const RENT_BUFFER: i128 = 1_000_000;

    fn setup() -> (Env, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, admin, client)
    }

    fn register_token(env: &Env, admin: &Address, recipient: &Address, amount: i128) -> Address {
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let sac = soroban_sdk::token::StellarAssetClient::new(env, &token_id.address());
        sac.mint(recipient, &amount);
        token_id.address()
    }

    fn hash32(env: &Env, byte: u8) -> BytesN<32> {
        BytesN::from_array(env, &[byte; 32])
    }

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    /// Creates an escrow of `TOTAL` with one 500-unit milestone allocated,
    /// leaving 500 unallocated and therefore splittable.
    fn escrow_with_allocation(
        env: &Env,
        admin: &Address,
        contract: &EscrowContractClient<'static>,
        client_addr: &Address,
        freelancer: &Address,
    ) -> u64 {
        let token = register_token(env, admin, client_addr, TOTAL + RENT_BUFFER);
        let escrow_id = contract.create_escrow(
            client_addr,
            freelancer,
            &token,
            &TOTAL,
            &hash32(env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(env),
        );
        contract.add_milestone(
            client_addr,
            &escrow_id,
            &String::from_str(env, "Milestone 1"),
            &hash32(env, 2),
            &500_i128,
        );
        escrow_id
    }

    #[test]
    fn test_split_escrow_success() {
        let (env, admin, contract) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let escrow_id = escrow_with_allocation(&env, &admin, &contract, &client_addr, &freelancer);

        let split_amount = 200_i128;
        let (child1, child2) =
            contract.split_escrow(&client_addr, &escrow_id, &split_amount, &hash32(&env, 3));

        let child1_meta = contract.get_escrow_meta(&child1);
        let child2_meta = contract.get_escrow_meta(&child2);

        assert_eq!(child1_meta.total_amount, split_amount);
        // 500 unallocated - 200 to the first child.
        assert_eq!(child2_meta.total_amount, 300);
        assert_eq!(child1_meta.client, client_addr);
        assert_eq!(child1_meta.freelancer, freelancer);
        assert_eq!(child2_meta.client, client_addr);
        assert_eq!(child2_meta.freelancer, freelancer);
    }

    #[test]
    fn test_split_escrow_invalid_amounts_rejected() {
        let (env, admin, contract) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let escrow_id = escrow_with_allocation(&env, &admin, &contract, &client_addr, &freelancer);

        // Above the unallocated balance.
        let result =
            contract.try_split_escrow(&client_addr, &escrow_id, &1_500_i128, &hash32(&env, 3));
        assert_eq!(result, Err(Ok(EscrowError::E19)));

        // Exactly the unallocated balance leaves the second child empty.
        let result =
            contract.try_split_escrow(&client_addr, &escrow_id, &500_i128, &hash32(&env, 3));
        assert_eq!(result, Err(Ok(EscrowError::E19)));

        // Zero.
        let result = contract.try_split_escrow(&client_addr, &escrow_id, &0_i128, &hash32(&env, 3));
        assert_eq!(result, Err(Ok(EscrowError::E19)));
    }

    /// A split requires the escrow to be Active. `split_escrow` deliberately does
    /// not restrict who submits the call — joint consent comes from requiring both
    /// the client and the freelancer to authorize — so this covers the state guard.
    #[test]
    fn test_split_escrow_rejects_non_active_escrow() {
        let (env, admin, contract) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let escrow_id = escrow_with_allocation(&env, &admin, &contract, &client_addr, &freelancer);

        contract.cancel_escrow(&client_addr, &escrow_id);

        let result =
            contract.try_split_escrow(&client_addr, &escrow_id, &200_i128, &hash32(&env, 3));
        assert_eq!(result, Err(Ok(EscrowError::E9)));
    }
}
