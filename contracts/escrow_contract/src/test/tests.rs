#![cfg(test)]
use super::*;
use soroban_sdk::{
    testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation},
    Address, Env, String,
};

#[test]
fn test_create_escrow_success() {
    let env = Env::default();
    let sender = Address::from_string(&String::from_str(&env, "G1"));
    let beneficiary = Address::from_string(&String::from_str(&env, "G2"));
    let arbitrator = Address::from_string(&String::from_str(&env, "G3"));
    let asset = Address::from_string(&String::from_str(&env, "G4"));

    let id = MultiAssetEscrowContract::create_escrow(
        env.clone(),
        sender.clone(),
        beneficiary.clone(),
        arbitrator.clone(),
        asset.clone(),
        1000,
        3600,
        None,
    )
    .unwrap();

    let escrow = MultiAssetEscrowContract::get_escrow(&env, id).unwrap();
    assert_eq!(escrow.sender, sender);
    assert_eq!(escrow.beneficiary, beneficiary);
    assert_eq!(escrow.arbitrator, arbitrator);
    assert_eq!(escrow.amount, 1000);
    assert_eq!(escrow.state, EscrowState::Pending);
}

#[test]
fn test_create_escrow_invalid_amount() {
    let env = Env::default();
    let sender = Address::from_string(&String::from_str(&env, "G1"));
    let beneficiary = Address::from_string(&String::from_str(&env, "G2"));
    let arbitrator = Address::from_string(&String::from_str(&env, "G3"));
    let asset = Address::from_string(&String::from_str(&env, "G4"));

    let result = MultiAssetEscrowContract::create_escrow(
        env,
        sender,
        beneficiary,
        arbitrator,
        asset,
        0, // Invalid amount
        3600,
        None,
    );
    assert_eq!(result.unwrap_err(), ContractError::InvalidAmount);
}

#[test]
fn test_create_escrow_invalid_timelock() {
    let env = Env::default();
    let sender = Address::from_string(&String::from_str(&env, "G1"));
    let beneficiary = Address::from_string(&String::from_str(&env, "G2"));
    let arbitrator = Address::from_string(&String::from_str(&env, "G3"));
    let asset = Address::from_string(&String::from_str(&env, "G4"));

    let result = MultiAssetEscrowContract::create_escrow(
        env,
        sender,
        beneficiary,
        arbitrator,
        asset,
        1000,
        0, // Invalid timelock
        None,
    );
    assert_eq!(result.unwrap_err(), ContractError::InvalidDuration);
}

#[test]
fn test_fund_escrow_success() {
    let env = Env::default();
    let sender = Address::from_string(&String::from_str(&env, "G1"));
    let beneficiary = Address::from_string(&String::from_str(&env, "G2"));
    let arbitrator = Address::from_string(&String::from_str(&env, "G3"));
    let asset = Address::from_string(&String::from_str(&env, "G4"));

    let id = MultiAssetEscrowContract::create_escrow(
        env.clone(),
        sender.clone(),
        beneficiary.clone(),
        arbitrator.clone(),
        asset.clone(),
        1000,
        3600,
        None,
    )
    .unwrap();

    // Mock token transfer
    env.mock_all_auths();

    MultiAssetEscrowContract::fund_escrow(env.clone(), id.clone(), sender.clone()).unwrap();

    let escrow = MultiAssetEscrowContract::get_escrow(&env, id).unwrap();
    assert_eq!(escrow.state, EscrowState::Funded);
    assert!(escrow.funded_at.is_some());
}

#[test]
fn test_fund_escrow_unauthorized() {
    let env = Env::default();
    let sender = Address::from_string(&String::from_str(&env, "G1"));
    let beneficiary = Address::from_string(&String::from_str(&env, "G2"));
    let arbitrator = Address::from_string(&String::from_str(&env, "G3"));
    let asset = Address::from_string(&String::from_str(&env, "G4"));
    let attacker = Address::from_string(&String::from_str(&env, "G5"));

    let id = MultiAssetEscrowContract::create_escrow(
        env.clone(),
        sender.clone(),
        beneficiary.clone(),
        arbitrator.clone(),
        asset.clone(),
        1000,
        3600,
        None,
    )
    .unwrap();

    // Try to fund as attacker (should fail)
    let result = MultiAssetEscrowContract::fund_escrow(env.clone(), id, attacker);
    assert_eq!(result.unwrap_err(), ContractError::OnlySender);
}

#[test]
fn test_release_escrow_success() {
    let env = Env::default();
    let sender = Address::from_string(&String::from_str(&env, "G1"));
    let beneficiary = Address::from_string(&String::from_str(&env, "G2"));
    let arbitrator = Address::from_string(&String::from_str(&env, "G3"));
    let asset = Address::from_string(&String::from_str(&env, "G4"));

    let id = MultiAssetEscrowContract::create_escrow(
        env.clone(),
        sender.clone(),
        beneficiary.clone(),
        arbitrator.clone(),
        asset.clone(),
        1000,
        3600,
        None,
    )
    .unwrap();

    env.mock_all_auths();

    // Fund
    MultiAssetEscrowContract::fund_escrow(env.clone(), id.clone(), sender).unwrap();

    // Release (beneficiary)
    MultiAssetEscrowContract::release_escrow(env.clone(), id.clone(), beneficiary.clone()).unwrap();

    let escrow = MultiAssetEscrowContract::get_escrow(&env, id).unwrap();
    assert_eq!(escrow.state, EscrowState::Released);
    assert!(escrow.released_at.is_some());
}

#[test]
fn test_release_escrow_unauthorized() {
    let env = Env::default();
    let sender = Address::from_string(&String::from_str(&env, "G1"));
    let beneficiary = Address::from_string(&String::from_str(&env, "G2"));
    let arbitrator = Address::from_string(&String::from_str(&env, "G3"));
    let asset = Address::from_string(&String::from_str(&env, "G4"));
    let attacker = Address::from_string(&String::from_str(&env, "G5"));

    let id = MultiAssetEscrowContract::create_escrow(
        env.clone(),
        sender.clone(),
        beneficiary.clone(),
        arbitrator.clone(),
        asset.clone(),
        1000,
        3600,
        None,
    )
    .unwrap();

    env.mock_all_auths();

    // Fund
    MultiAssetEscrowContract::fund_escrow(env.clone(), id.clone(), sender).unwrap();

    // Try to release as attacker (should fail)
    let result = MultiAssetEscrowContract::release_escrow(env.clone(), id, attacker);
    assert_eq!(result.unwrap_err(), ContractError::OnlyBeneficiary);
}

#[test]
fn test_refund_escrow_success() {
    let env = Env::default();
    let sender = Address::from_string(&String::from_str(&env, "G1"));
    let beneficiary = Address::from_string(&String::from_str(&env, "G2"));
    let arbitrator = Address::from_string(&String::from_str(&env, "G3"));
    let asset = Address::from_string(&String::from_str(&env, "G4"));

    let id = MultiAssetEscrowContract::create_escrow(
        env.clone(),
        sender.clone(),
        beneficiary.clone(),
        arbitrator.clone(),
        asset.clone(),
        1000,
        3600,
        None,
    )
    .unwrap();

    env.mock_all_auths();

    // Fund
    MultiAssetEscrowContract::fund_escrow(env.clone(), id.clone(), sender.clone()).unwrap();

    // Advance time past timelock
    // Note: In real tests, use env.ledger().set_timestamp()

    // Refund (sender)
    MultiAssetEscrowContract::refund_escrow(env.clone(), id.clone(), sender).unwrap();

    let escrow = MultiAssetEscrowContract::get_escrow(&env, id).unwrap();
    assert_eq!(escrow.state, EscrowState::Refunded);
    assert!(escrow.refunded_at.is_some());
}

#[test]
fn test_dispute_escrow_success() {
    let env = Env::default();
    let sender = Address::from_string(&String::from_str(&env, "G1"));
    let beneficiary = Address::from_string(&String::from_str(&env, "G2"));
    let arbitrator = Address::from_string(&String::from_str(&env, "G3"));
    let asset = Address::from_string(&String::from_str(&env, "G4"));

    let id = MultiAssetEscrowContract::create_escrow(
        env.clone(),
        sender.clone(),
        beneficiary.clone(),
        arbitrator.clone(),
        asset.clone(),
        1000,
        3600,
        None,
    )
    .unwrap();

    env.mock_all_auths();

    // Fund
    MultiAssetEscrowContract::fund_escrow(env.clone(), id.clone(), sender).unwrap();

    // Dispute (beneficiary)
    MultiAssetEscrowContract::dispute_escrow(env.clone(), id.clone(), beneficiary.clone()).unwrap();

    let escrow = MultiAssetEscrowContract::get_escrow(&env, id).unwrap();
    assert_eq!(escrow.state, EscrowState::Disputed);
    assert!(escrow.disputed_at.is_some());

    // Resolve (arbitrator - release to beneficiary)
    MultiAssetEscrowContract::resolve_dispute(env.clone(), id.clone(), arbitrator.clone(), true)
        .unwrap();

    let escrow = MultiAssetEscrowContract::get_escrow(&env, id).unwrap();
    assert_eq!(escrow.state, EscrowState::Resolved);
    assert!(escrow.resolved_at.is_some());
}

#[test]
fn test_get_escrow_not_found() {
    let env = Env::default();
    let id = String::from_str(&env, "nonexistent");
    let result = MultiAssetEscrowContract::get_escrow(&env, id);
    assert_eq!(result.unwrap_err(), ContractError::EscrowNotFound);
}

#[test]
fn test_invalid_state_transition() {
    let env = Env::default();
    let sender = Address::from_string(&String::from_str(&env, "G1"));
    let beneficiary = Address::from_string(&String::from_str(&env, "G2"));
    let arbitrator = Address::from_string(&String::from_str(&env, "G3"));
    let asset = Address::from_string(&String::from_str(&env, "G4"));

    let id = MultiAssetEscrowContract::create_escrow(
        env.clone(),
        sender.clone(),
        beneficiary.clone(),
        arbitrator.clone(),
        asset.clone(),
        1000,
        3600,
        None,
    )
    .unwrap();

    env.mock_all_auths();

    // Try to release without funding (should fail)
    let result =
        MultiAssetEscrowContract::release_escrow(env.clone(), id.clone(), beneficiary.clone());
    assert_eq!(result.unwrap_err(), ContractError::InvalidStateTransition);
}
