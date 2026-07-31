//! # Re-entrancy Guard & Double-Spend Tests
//!
//! `ContractStorage::with_reentrancy_guard` sets a `DataKey::ReentrancyLock`
//! flag in instance storage for the duration of any guarded call and rejects
//! nested re-entry with `EscrowError::E22`. This suite verifies:
//!
//! 1. The lock itself blocks re-entry into every guarded fund-releasing entry
//!    point (simulating what a malicious custom token's `transfer` hook could
//!    otherwise attempt mid-call).
//! 2. Independently of the lock, milestone/escrow state transitions already
//!    prevent the same funds from being released twice (defense in depth):
//!    a milestone flips out of `MS_SUBMITTED`/`MS_APPROVED` the instant it is
//!    paid, so a second call against the same milestone is rejected by state
//!    validation even without tripping the lock.

#[cfg(test)]
#[allow(clippy::module_inception)]
mod reentrancy_guard_tests {
    use soroban_sdk::{
        testutils::Address as _, testutils::Ledger as _, token, Address, BytesN, Env, String,
    };

    use crate::{DataKey, EscrowContract, EscrowContractClient, MultisigConfig};

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    struct TestEnv {
        env: Env,
        contract_id: Address,
        client: EscrowContractClient<'static>,
        token_id: Address,
    }

    fn setup() -> TestEnv {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);

        TestEnv {
            env,
            contract_id,
            client,
            token_id,
        }
    }

    fn mint(env: &Env, token_id: &Address, to: &Address, amount: i128) {
        token::StellarAssetClient::new(env, token_id).mint(to, &amount);
    }

    fn hash(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    /// Manually engages the reentrancy lock inside the contract's own storage
    /// context, standing in for a nested call that a malicious token contract
    /// could otherwise trigger mid-transfer.
    fn engage_lock(t: &TestEnv) {
        t.env.as_contract(&t.contract_id, || {
            t.env
                .storage()
                .instance()
                .set(&DataKey::ReentrancyLock, &true);
        });
    }

    fn release_lock(t: &TestEnv) {
        t.env.as_contract(&t.contract_id, || {
            t.env.storage().instance().remove(&DataKey::ReentrancyLock);
        });
    }

    // ── 1. The lock blocks re-entry into every guarded entry point ──────────
    //
    // `with_reentrancy_guard` rejects a held lock via `panic_with_error!`
    // (a hard trap, not a normal `Result::Err`), so — matching this crate's
    // existing convention for panic-based rejections — these are asserted
    // with `#[should_panic]` on the plain (non-`try_`) client call rather
    // than by pattern-matching a `try_` result.

    #[test]
    #[should_panic]
    fn test_locked_reentrancy_blocks_approve_milestone() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint(&t.env, &t.token_id, &client_addr, 1_000);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &200,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
            &None,
        );
        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &200,
        );
        t.client.submit_milestone(&freelancer, &escrow_id, &m0);

        engage_lock(&t);
        // Must panic with EscrowError::E22 — a held reentrancy lock rejects
        // nested calls into any guarded entry point.
        t.client.approve_milestone(&client_addr, &escrow_id, &m0);
    }

    #[test]
    #[should_panic]
    fn test_locked_reentrancy_blocks_cancel_escrow() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint(&t.env, &t.token_id, &client_addr, 500);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &500,
            &hash(&t.env, 3),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
            &None,
        );

        engage_lock(&t);
        t.client.cancel_escrow(&client_addr, &escrow_id);
    }

    #[test]
    #[should_panic]
    fn test_locked_reentrancy_blocks_batch_approve_milestones() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint(&t.env, &t.token_id, &client_addr, 1_000);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &300,
            &hash(&t.env, 4),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
            &None,
        );
        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 5),
            &300,
        );
        t.client.submit_milestone(&freelancer, &escrow_id, &m0);

        let mut ids: soroban_sdk::Vec<u32> = soroban_sdk::Vec::new(&t.env);
        ids.push_back(m0);

        engage_lock(&t);
        t.client
            .batch_approve_milestones(&client_addr, &escrow_id, &ids);
    }

    /// The lock is scoped to a single guarded call: releasing it (as
    /// `with_reentrancy_guard` does on every successful exit) must let a
    /// subsequent call through normally.
    #[test]
    fn test_reentrancy_lock_does_not_block_calls_once_released() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint(&t.env, &t.token_id, &client_addr, 500);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &500,
            &hash(&t.env, 15),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
            &None,
        );

        // Engage and release the lock without ever calling a guarded entry
        // point while it is held — this isolates the assertion to "a
        // released lock does not interfere," independent of whichever
        // mechanism (panic vs. Result) an engaged lock uses to reject calls.
        engage_lock(&t);
        release_lock(&t);

        t.client.cancel_escrow(&client_addr, &escrow_id);
    }

    // ── 2. State transitions independently prevent double-spend ────────────

    /// Once a milestone is released via `approve_milestone`, a second approval
    /// attempt against the same (now non-Submitted) milestone must fail —
    /// this holds even without the reentrancy lock engaged, because the
    /// milestone status check itself rejects the replay.
    #[test]
    fn test_double_approve_same_milestone_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint(&t.env, &t.token_id, &client_addr, 1_000);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &400,
            &hash(&t.env, 6),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
            &None,
        );
        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 7),
            &400,
        );
        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        t.client.approve_milestone(&client_addr, &escrow_id, &m0);

        assert_eq!(
            token::Client::new(&t.env, &t.token_id).balance(&freelancer),
            400,
            "freelancer must be paid exactly once"
        );

        let replay = t
            .client
            .try_approve_milestone(&client_addr, &escrow_id, &m0);
        assert!(
            replay.is_err(),
            "approving an already-released milestone again must fail"
        );
        assert_eq!(
            token::Client::new(&t.env, &t.token_id).balance(&freelancer),
            400,
            "a rejected replay must not pay the freelancer a second time"
        );
    }

    /// `release_with_timelock` must reject a second release of the same
    /// milestone once it has already transitioned to `MS_RELEASED`.
    #[test]
    fn test_double_release_with_timelock_rejected() {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint(&t.env, &t.token_id, &client_addr, 1_000);

        t.env.ledger().with_mut(|l| l.timestamp = 1_000);

        let escrow_id = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &300,
            &hash(&t.env, 8),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
            &None,
        );
        // Start a long-duration timelock (`meta.timelock`) so approve_milestone
        // leaves the milestone Approved with no immediate transfer. This is a
        // separate mechanism from the `TimelockReleaseTime` configured below,
        // which is what `release_with_timelock` actually enforces.
        t.client
            .start_timelock(&client_addr, &escrow_id, &100_000_u64);
        t.client.set_timelock(&client_addr, &escrow_id, &1_001_u64);

        let m0 = t.client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 9),
            &300,
        );
        t.client.submit_milestone(&freelancer, &escrow_id, &m0);
        t.client.approve_milestone(&client_addr, &escrow_id, &m0);

        t.env.ledger().with_mut(|l| l.timestamp = 1_002);

        t.client.release_with_timelock(&freelancer, &escrow_id, &m0);
        assert_eq!(
            token::Client::new(&t.env, &t.token_id).balance(&freelancer),
            300
        );

        let replay = t
            .client
            .try_release_with_timelock(&freelancer, &escrow_id, &m0);
        assert!(
            replay.is_err(),
            "releasing an already-released milestone again must fail"
        );
        assert_eq!(
            token::Client::new(&t.env, &t.token_id).balance(&freelancer),
            300,
            "a rejected replay must not pay the freelancer a second time"
        );
    }
}
