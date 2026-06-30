#![allow(dead_code)]
//! # Stellar DEX Router Integration
//!
//! Thin cross-contract client for the Stellar DEX liquidity-pool router.
//! Used by `release_funds` to optionally swap the escrowed token into a
//! different asset before transferring to the beneficiary.
//!
//! The interface matches the minimal subset of the Soroban DEX router ABI
//! that this contract needs:
//!
//! - `swap_exact_in(from, to, amount_in, min_out, to_addr) -> i128`
//!
//! If the on-chain router does not exist at the configured address or the
//! swap reverts (e.g. slippage exceeded), the `try_swap_exact_in` call
//! returns `Err(_)` and the caller falls back to the original asset.

use soroban_sdk::{contractclient, Address, Env};

/// Minimal DEX router interface for swap-on-release.
///
/// Implementations must execute a swap of exactly `amount_in` units of
/// `from_token` for at least `min_amount_out` units of `to_token`, crediting
/// the result directly to `recipient`.  Returns the actual output amount.
#[contractclient(name = "DexRouterClient")]
pub trait DexRouterInterface {
    /// Swap an exact input amount and send the output to `recipient`.
    ///
    /// # Arguments
    /// * `from_token`     - Source asset (the escrowed token)
    /// * `to_token`       - Target asset the beneficiary wants to receive
    /// * `amount_in`      - Exact amount of `from_token` to swap
    /// * `min_amount_out` - Minimum acceptable output (slippage guard)
    /// * `recipient`      - Address that receives the output tokens
    ///
    /// # Returns
    /// Actual `to_token` amount received by `recipient`.
    fn swap_exact_in(
        env: Env,
        from_token: Address,
        to_token: Address,
        amount_in: i128,
        min_amount_out: i128,
        recipient: Address,
    ) -> i128;
}
