//! # Property-Based Invariant Tests
//!
//! This crate has no `proptest`/`quickcheck` dependency, so these tests
//! implement the same idea directly: a small deterministic PRNG (xorshift)
//! drives many randomized scenarios per test, and each scenario checks a
//! *general* invariant rather than one fixed example.
//!
//! Invariants covered:
//!
//! 1. **Conservation** — for any random partition of `total_amount` across
//!    1..=5 milestones, approved in any random order, the freelancer ends up
//!    with exactly `total_amount` and the escrow completes with a zero
//!    remaining balance. This must hold regardless of how the total is split
//!    or in what order milestones are approved.
//! 2. **Allocation ceiling** — milestone amounts can never be allocated past
//!    `total_amount`. For any random valid partition that already accounts
//!    for the full total, adding one more unit of milestone amount must
//!    always be rejected — for every partition shape, not just a hand-picked
//!    example.

#[cfg(test)]
#[allow(clippy::module_inception)]
mod property_invariant_tests {
    extern crate std;

    use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env, String};
    use std::vec::Vec as StdVec;

    use crate::{EscrowContract, EscrowContractClient, EscrowError, EscrowStatus, MultisigConfig};

    const RENT_RESERVE_PER_ENTRY: i128 = 30;

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    struct TestEnv {
        env: Env,
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
            client,
            token_id,
        }
    }

    fn mint(env: &Env, token_id: &Address, to: &Address, amount: i128) {
        token::StellarAssetClient::new(env, token_id).mint(to, &amount);
    }

    /// Builds a deterministic, always-nonzero 32-byte brief hash from a seed
    /// (an all-zero hash is rejected by `create_escrow` as `InvalidBriefHash`).
    fn hash(env: &Env, seed: u32) -> BytesN<32> {
        let mut bytes = [0u8; 32];
        let nonzero = seed.wrapping_add(1);
        bytes[28..32].copy_from_slice(&nonzero.to_be_bytes());
        BytesN::from_array(env, &bytes)
    }

    /// Minimal xorshift64* PRNG — deterministic, dependency-free, good enough
    /// to drive property-test input generation across many seeds.
    struct Rng(u64);

    impl Rng {
        fn new(seed: u64) -> Self {
            // xorshift requires a nonzero state.
            Rng(seed ^ 0x9E3779B97F4A7C15)
        }

        fn next_u64(&mut self) -> u64 {
            let mut x = self.0;
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            self.0 = x;
            x
        }

        /// Random integer in `[lo, hi]` inclusive.
        fn range_i128(&mut self, lo: i128, hi: i128) -> i128 {
            let span = (hi - lo + 1) as u64;
            lo + (self.next_u64() % span) as i128
        }

        fn range_u32(&mut self, lo: u32, hi: u32) -> u32 {
            let span = (hi - lo + 1) as u64;
            lo + (self.next_u64() % span) as u32
        }

        /// Splits `total` into `n` positive parts that sum exactly to `total`,
        /// via n-1 distinct random cut points in `[1, total-1]`.
        fn partition(&mut self, total: i128, n: u32) -> StdVec<i128> {
            if n == 1 {
                let mut v = StdVec::new();
                v.push(total);
                return v;
            }
            let mut points: StdVec<i128> = StdVec::new();
            while points.len() < (n - 1) as usize {
                let candidate = self.range_i128(1, total - 1);
                if !points.contains(&candidate) {
                    points.push(candidate);
                }
            }
            points.sort_unstable();

            let mut amounts = StdVec::new();
            let mut prev = 0i128;
            for p in points.iter() {
                amounts.push(*p - prev);
                prev = *p;
            }
            amounts.push(total - prev);
            amounts
        }

        /// Fisher–Yates shuffle of `0..n`.
        fn shuffled_indices(&mut self, n: u32) -> StdVec<u32> {
            let mut idx: StdVec<u32> = (0..n).collect();
            for i in (1..idx.len()).rev() {
                let j = self.range_u32(0, i as u32) as usize;
                idx.swap(i, j);
            }
            idx
        }
    }

    // ── Invariant 1: conservation, for any partition and any approval order ──

    #[test]
    fn test_property_full_release_conserves_funds_for_any_partition_and_order() {
        for seed in 0u64..20 {
            let mut rng = Rng::new(seed);
            let n = rng.range_u32(1, 5);
            let total = rng.range_i128(1_000, 10_000);
            let amounts = rng.partition(total, n);
            assert_eq!(
                amounts.iter().sum::<i128>(),
                total,
                "partition must always sum exactly to total (seed {seed})"
            );

            let t = setup();
            let client_addr = Address::generate(&t.env);
            let freelancer = Address::generate(&t.env);
            let rent_reserve = RENT_RESERVE_PER_ENTRY * (1 + i128::from(n));
            mint(&t.env, &t.token_id, &client_addr, total + rent_reserve);

            let escrow_id = t.client.create_escrow(
                &client_addr,
                &freelancer,
                &t.token_id,
                &total,
                &hash(&t.env, seed as u32 * 1000),
                &None,
                &None,
                &None,
                &None,
                &no_multisig(&t.env),
            );

            let mut milestone_ids: StdVec<u32> = StdVec::new();
            for (i, amount) in amounts.iter().enumerate() {
                let mid = t.client.add_milestone(
                    &client_addr,
                    &escrow_id,
                    &String::from_str(&t.env, "M"),
                    &hash(&t.env, seed as u32 * 1000 + i as u32 + 1),
                    amount,
                );
                milestone_ids.push(mid);
            }

            // Submit in creation order, approve in a random order — the final
            // conserved state must not depend on either order.
            for mid in milestone_ids.iter() {
                t.client.submit_milestone(&freelancer, &escrow_id, mid);
            }
            let approval_order = rng.shuffled_indices(n);
            for i in approval_order.iter() {
                let mid = milestone_ids[*i as usize];
                t.client.approve_milestone(&client_addr, &escrow_id, &mid);
            }

            let state = t.client.get_escrow(&escrow_id);
            assert_eq!(
                state.status,
                EscrowStatus::Completed,
                "seed {seed}: escrow must complete once every milestone is released"
            );
            assert_eq!(
                state.remaining_balance, 0,
                "seed {seed}: remaining_balance must be exactly zero after full release"
            );
            assert_eq!(
                token::Client::new(&t.env, &t.token_id).balance(&freelancer),
                total,
                "seed {seed}: freelancer must receive exactly total_amount, no more, no less"
            );
        }
    }

    // ── Invariant 2: milestone amounts can never be allocated past total ────

    #[test]
    fn test_property_milestone_allocation_never_exceeds_total() {
        for seed in 100u64..120 {
            let mut rng = Rng::new(seed);
            let n = rng.range_u32(1, 5);
            let total = rng.range_i128(1_000, 10_000);
            let amounts = rng.partition(total, n);

            let t = setup();
            let client_addr = Address::generate(&t.env);
            let freelancer = Address::generate(&t.env);
            // Fund one extra unit so the final over-allocation attempt fails
            // on the allocation check itself, not on insufficient balance.
            let rent_reserve = RENT_RESERVE_PER_ENTRY * (2 + i128::from(n));
            mint(&t.env, &t.token_id, &client_addr, total + rent_reserve + 1);

            let escrow_id = t.client.create_escrow(
                &client_addr,
                &freelancer,
                &t.token_id,
                &total,
                &hash(&t.env, seed as u32 * 1000),
                &None,
                &None,
                &None,
                &None,
                &no_multisig(&t.env),
            );

            for (i, amount) in amounts.iter().enumerate() {
                t.client.add_milestone(
                    &client_addr,
                    &escrow_id,
                    &String::from_str(&t.env, "M"),
                    &hash(&t.env, seed as u32 * 1000 + i as u32 + 1),
                    amount,
                );
            }

            // The partition already accounts for the full total — one more
            // unit of allocation must always be rejected, regardless of how
            // many milestones or what split was used to reach `total`.
            let result = t.client.try_add_milestone(
                &client_addr,
                &escrow_id,
                &String::from_str(&t.env, "Over"),
                &hash(&t.env, seed as u32 * 1000 + n + 1),
                &1,
            );
            assert_eq!(
                result,
                Err(Ok(EscrowError::E15)),
                "seed {seed}: allocating past total_amount must always be rejected"
            );
        }
    }
}
