//! Total Value Locked (TVL) tracking.
//!
//! Tracks the total amount of tokens currently locked in the contract
//! across all active escrows so indexers/dashboards can query it directly
//! instead of summing every escrow.

use soroban_sdk::{symbol_short, Env, Symbol};

const TVL_KEY: Symbol = symbol_short!("TVL");

/// Returns the current total value locked (defaults to 0 if unset).
pub fn get_total_value_locked(env: &Env) -> i128 {
    env.storage().persistent().get(&TVL_KEY).unwrap_or(0i128)
}

/// Increments TVL by `amount` (called when an escrow is funded).
pub fn increase(env: &Env, amount: i128) {
    let current = get_total_value_locked(env);
    env.storage().persistent().set(&TVL_KEY, &(current + amount));
}

/// Decrements TVL by `amount` (called when funds are released or refunded).
pub fn decrease(env: &Env, amount: i128) {
    let current = get_total_value_locked(env);
    let updated = if amount > current { 0 } else { current - amount };
    env.storage().persistent().set(&TVL_KEY, &updated);
}
