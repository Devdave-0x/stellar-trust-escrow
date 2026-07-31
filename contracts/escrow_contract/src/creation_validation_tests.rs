//! # Creation-time validation tests
//!
//! Covers configuration that `create_escrow` accepted but never enforced:
//! - a timelock passed at creation is stored and gates release
//! - the timelock duration is bounded, and its start is never caller-controlled
//! - an all-zero brief hash is rejected
//! - `split_escrow` children inherit the parent's timelock

#[cfg(test)]
#[allow(clippy::module_inception)]
mod creation_validation_tests {
    use soroban_sdk::{
        testutils::Address as _, testutils::Ledger as _, Address, BytesN, Env, String,
    };

    use crate::{
        EscrowContract, EscrowContractClient, EscrowError, MultisigConfig, OptionalTimelock,
        Timelock, MAX_TIMELOCK_DURATION_SECONDS,
    };

    const ESCROW_AMOUNT: i128 = 10_000;
    const MILESTONE_AMOUNT: i128 = 4_000;
    const ONE_DAY: u64 = 24 * 60 * 60;

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn setup() -> (
        Env,
        Address,
        Address,
        Address,
        EscrowContractClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let contract_id = env.register_contract(None, EscrowContract);
        let contract = EscrowContractClient::new(&env, &contract_id);
        contract.initialize(&admin);

        (env, admin, client_addr, freelancer, contract)
    }

    fn register_token(env: &Env, admin: &Address, recipient: &Address, amount: i128) -> Address {
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let sac = soroban_sdk::token::StellarAssetClient::new(env, &token_id.address());
        sac.mint(recipient, &amount);
        token_id.address()
    }

    fn hash32(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[3u8; 32])
    }

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    fn create(
        env: &Env,
        contract: &EscrowContractClient<'static>,
        admin: &Address,
        client_addr: &Address,
        freelancer: &Address,
        timelock: &Option<Timelock>,
    ) -> u64 {
        let token = register_token(env, admin, client_addr, ESCROW_AMOUNT + 1_000_000);
        contract.create_escrow(
            client_addr,
            freelancer,
            &token,
            &ESCROW_AMOUNT,
            &hash32(env),
            &None,
            &None,
            &None,
            timelock,
            &no_multisig(env),
            &None,
        )
    }

    // ── Timelock is no longer discarded ───────────────────────────────────────

    /// The regression this fixes: a timelock passed to `create_escrow` was dropped,
    /// so the escrow behaved as though no timelock existed.
    #[test]
    fn test_creation_timelock_is_stored() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let timelock = Some(Timelock {
            duration_ledger: ONE_DAY,
            start_ledger: 0,
        });
        let escrow_id = create(
            &env,
            &contract,
            &admin,
            &client_addr,
            &freelancer,
            &timelock,
        );

        let state = contract.get_escrow(&escrow_id);
        match state.timelock {
            OptionalTimelock::Some(tl) => assert_eq!(tl.duration_ledger, ONE_DAY),
            OptionalTimelock::None => panic!("timelock passed at creation was discarded"),
        }
    }

    /// A stored timelock must actually block release before it expires.
    #[test]
    fn test_creation_timelock_blocks_early_release() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let timelock = Some(Timelock {
            duration_ledger: ONE_DAY,
            start_ledger: 0,
        });
        let escrow_id = create(
            &env,
            &contract,
            &admin,
            &client_addr,
            &freelancer,
            &timelock,
        );

        let milestone_id = contract.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Deliverable"),
            &hash32(&env),
            &MILESTONE_AMOUNT,
        );
        contract.submit_milestone(&freelancer, &escrow_id, &milestone_id);
        contract.approve_milestone(&client_addr, &escrow_id, &milestone_id);

        // Approval must not have paid out while the timelock is active.
        let milestone = contract.get_milestone(&escrow_id, &milestone_id);
        assert_eq!(
            milestone.status,
            crate::MS_APPROVED,
            "milestone must stay Approved, not Released, while timelocked"
        );

        let result = contract.try_release_funds(&client_addr, &escrow_id, &milestone_id);
        assert!(result.is_err(), "release must be blocked before expiry");
    }

    /// After the duration elapses, release proceeds.
    #[test]
    fn test_creation_timelock_allows_release_after_expiry() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let timelock = Some(Timelock {
            duration_ledger: ONE_DAY,
            start_ledger: 0,
        });
        let escrow_id = create(
            &env,
            &contract,
            &admin,
            &client_addr,
            &freelancer,
            &timelock,
        );

        let milestone_id = contract.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Deliverable"),
            &hash32(&env),
            &MILESTONE_AMOUNT,
        );
        contract.submit_milestone(&freelancer, &escrow_id, &milestone_id);
        contract.approve_milestone(&client_addr, &escrow_id, &milestone_id);

        env.ledger().with_mut(|l| l.timestamp += ONE_DAY + 1);

        contract.release_funds(&client_addr, &escrow_id, &milestone_id);
        assert_eq!(
            contract.get_milestone(&escrow_id, &milestone_id).status,
            crate::MS_RELEASED
        );
    }

    /// A caller-supplied `start_ledger` must be ignored. Honouring a backdated start
    /// would let the creator produce an already-expired timelock.
    #[test]
    fn test_backdated_start_ledger_is_ignored() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        env.ledger().with_mut(|l| l.timestamp = 1_000_000);

        // start_ledger far in the past: if honoured, the lock would already be over.
        let timelock = Some(Timelock {
            duration_ledger: ONE_DAY,
            start_ledger: 1,
        });
        let escrow_id = create(
            &env,
            &contract,
            &admin,
            &client_addr,
            &freelancer,
            &timelock,
        );

        let milestone_id = contract.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Deliverable"),
            &hash32(&env),
            &MILESTONE_AMOUNT,
        );
        contract.submit_milestone(&freelancer, &escrow_id, &milestone_id);
        contract.approve_milestone(&client_addr, &escrow_id, &milestone_id);

        let result = contract.try_release_funds(&client_addr, &escrow_id, &milestone_id);
        assert!(
            result.is_err(),
            "a backdated start_ledger must not shorten the timelock"
        );
    }

    #[test]
    fn test_zero_duration_timelock_rejected() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client_addr, ESCROW_AMOUNT + 1_000_000);

        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &ESCROW_AMOUNT,
            &hash32(&env),
            &None,
            &None,
            &None,
            &Some(Timelock {
                duration_ledger: 0,
                start_ledger: 0,
            }),
            &no_multisig(&env),
            &None,
        );
        assert_eq!(result, Err(Ok(EscrowError::E51)));
    }

    #[test]
    fn test_overlong_timelock_rejected() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client_addr, ESCROW_AMOUNT + 1_000_000);

        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &ESCROW_AMOUNT,
            &hash32(&env),
            &None,
            &None,
            &None,
            &Some(Timelock {
                duration_ledger: MAX_TIMELOCK_DURATION_SECONDS + 1,
                start_ledger: 0,
            }),
            &no_multisig(&env),
            &None,
        );
        assert_eq!(result, Err(Ok(EscrowError::E51)));
    }

    /// The boundary value is accepted.
    #[test]
    fn test_max_duration_timelock_accepted() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let timelock = Some(Timelock {
            duration_ledger: MAX_TIMELOCK_DURATION_SECONDS,
            start_ledger: 0,
        });
        let escrow_id = create(
            &env,
            &contract,
            &admin,
            &client_addr,
            &freelancer,
            &timelock,
        );
        assert!(matches!(
            contract.get_escrow(&escrow_id).timelock,
            OptionalTimelock::Some(_)
        ));
    }

    /// Omitting the timelock keeps the previous behaviour.
    #[test]
    fn test_no_timelock_leaves_escrow_unlocked() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let escrow_id = create(&env, &contract, &admin, &client_addr, &freelancer, &None);
        assert!(matches!(
            contract.get_escrow(&escrow_id).timelock,
            OptionalTimelock::None
        ));
    }

    // ── Brief hash validation ─────────────────────────────────────────────────

    /// An all-zero brief hash binds no agreement document to the escrow.
    #[test]
    fn test_zero_brief_hash_rejected() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client_addr, ESCROW_AMOUNT + 1_000_000);

        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &ESCROW_AMOUNT,
            &BytesN::from_array(&env, &[0u8; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
            &None,
        );
        assert_eq!(result, Err(Ok(EscrowError::InvalidBriefHash)));
    }

    #[test]
    fn test_nonzero_brief_hash_accepted() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let escrow_id = create(&env, &contract, &admin, &client_addr, &freelancer, &None);
        assert_eq!(contract.get_escrow(&escrow_id).brief_hash, hash32(&env));
    }

    /// A single non-zero byte is enough — the check rejects only the all-zero value.
    #[test]
    fn test_almost_zero_brief_hash_accepted() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client_addr, ESCROW_AMOUNT + 1_000_000);
        let mut bytes = [0u8; 32];
        bytes[31] = 1;

        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &ESCROW_AMOUNT,
            &BytesN::from_array(&env, &bytes),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
            &None,
        );
        assert!(result.is_ok(), "expected Ok, got {result:?}");
    }

    // ── Split inheritance ─────────────────────────────────────────────────────

    /// A split must not produce children that release immediately.
    #[test]
    fn test_split_children_inherit_timelock() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let timelock = Some(Timelock {
            duration_ledger: ONE_DAY,
            start_ledger: 0,
        });
        let escrow_id = create(
            &env,
            &contract,
            &admin,
            &client_addr,
            &freelancer,
            &timelock,
        );

        let split = contract.split_escrow(
            &client_addr,
            &escrow_id,
            &(ESCROW_AMOUNT / 2),
            &hash32(&env),
        );

        for child_id in [split.0, split.1] {
            match contract.get_escrow(&child_id).timelock {
                OptionalTimelock::Some(tl) => assert_eq!(tl.duration_ledger, ONE_DAY),
                OptionalTimelock::None => {
                    panic!("child escrow {child_id} dropped the parent timelock")
                }
            }
        }
    }
}
