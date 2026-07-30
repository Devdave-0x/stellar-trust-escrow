#![allow(dead_code)]
#![cfg(test)]

use soroban_sdk::{
    testutils::Address as _, token, Address, BytesN, Env, Vec as SorobanVec,
};

use crate::{EscrowContract, EscrowContractClient, EscrowError, MultisigConfig};

/// Runs a full escrow lifecycle simulation in a test environment.
///
/// Steps:
/// 1. Create escrow
/// 2. Add milestone
/// 3. Submit milestone
/// 4. Approve milestone
/// 5. Release funds
/// 6. Complete escrow
///
/// Returns the escrow ID on success.
pub fn run_lifecycle_simulation(env: &Env) -> Result<u64, EscrowError> {
    env.mock_all_auths();

    let admin = Address::generate(env);
    let client = Address::generate(env);
    let freelancer = Address::generate(env);

    let contract_id = env.register_contract(None, EscrowContract);
    let contract = EscrowContractClient::new(env, &contract_id);
    contract.initialize(&admin);

    let token_id = env.register_stellar_asset_contract_v2(admin.clone());
    let token = token_id.address();
    let amount = 10_000_i128;
    token::StellarAssetClient::new(env, &token).mint(&client, &(amount + 1_000_000));

    let escrow_id = contract.create_escrow(
        &client,
        &freelancer,
        &token,
        &amount,
        &BytesN::from_array(env, &[1u8; 32]),
        &None,
        &None,
        &None,
        &None,
        &MultisigConfig {
            approvers: SorobanVec::new(env),
            weights: SorobanVec::new(env),
            threshold: 0,
        },
    )?;

    let milestone_amount = amount / 2;
    contract.add_milestone(
        client.clone(),
        escrow_id,
        soroban_sdk::String::from_str(env, "Design"),
        BytesN::from_array(env, &[2u8; 32]),
        milestone_amount,
    )?;

    contract.submit_milestone(freelancer.clone(), escrow_id, 0)?;

    contract.approve_milestone(client.clone(), escrow_id, 0)?;

    contract.release_funds(admin.clone(), escrow_id, 0)?;

    let state = contract.get_escrow(escrow_id);
    assert_eq!(state.status, crate::EscrowStatus::Completed);

    Ok(escrow_id)
}
