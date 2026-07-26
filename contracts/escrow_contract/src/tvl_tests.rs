#![cfg(test)]

use crate::tvl;
use soroban_sdk::Env;

#[test]
fn tvl_starts_at_zero() {
    let env = Env::default();
    env.as_contract(&env.register(crate::EscrowContract, ()), || {
        assert_eq!(tvl::get_total_value_locked(&env), 0);
    });
}

#[test]
fn tvl_increases_on_fund() {
    let env = Env::default();
    env.as_contract(&env.register(crate::EscrowContract, ()), || {
        tvl::increase(&env, 1_000);
        assert_eq!(tvl::get_total_value_locked(&env), 1_000);
    });
}

#[test]
fn tvl_decreases_on_release() {
    let env = Env::default();
    env.as_contract(&env.register(crate::EscrowContract, ()), || {
        tvl::increase(&env, 1_000);
        tvl::decrease(&env, 400);
        assert_eq!(tvl::get_total_value_locked(&env), 600);
    });
}

#[test]
fn tvl_correct_after_multiple_concurrent_escrows() {
    let env = Env::default();
    env.as_contract(&env.register(crate::EscrowContract, ()), || {
        tvl::increase(&env, 1_000); // escrow A funded
        tvl::increase(&env, 2_500); // escrow B funded
        tvl::increase(&env, 500); // escrow C funded
        tvl::decrease(&env, 1_000); // escrow A released
        assert_eq!(tvl::get_total_value_locked(&env), 3_000);
        tvl::decrease(&env, 2_500); // escrow B refunded
        tvl::decrease(&env, 500); // escrow C released
        assert_eq!(tvl::get_total_value_locked(&env), 0);
    });
}
