//! # Contract Version Tracking Tests
//!
//! Covers `ContractVersionInfo`, tracked in persistent storage separately
//! from `storage::STORAGE_VERSION` (which only tracks the data layout).
//!
//! - Fresh deploy starts at `INITIAL_CONTRACT_VERSION` (1).
//! - `upgrade()` increments `version` and `upgrade_count`, and refreshes
//!   `last_upgraded_at` while leaving `deployed_at` untouched.
//! - `get_contract_version` fails before `initialize` has been called.

#[cfg(test)]
#[allow(clippy::module_inception)]
mod contract_version_tests {
    use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, BytesN, Env};

    use crate::{EscrowContract, EscrowContractClient, EscrowError, INITIAL_CONTRACT_VERSION};

    fn setup() -> (Env, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        (env, admin, client)
    }

    /// Uploads a minimal WASM blob and returns its content-addressed hash.
    /// `seed` varies the trailing byte so distinct calls yield distinct hashes,
    /// as required by `env.deployer().update_current_contract_wasm`.
    fn wasm_hash(env: &Env, seed: u8) -> BytesN<32> {
        let bytes: [u8; 9] = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, seed];
        env.deployer()
            .upload_contract_wasm(soroban_sdk::Bytes::from_slice(env, &bytes))
    }

    #[test]
    fn test_initial_version_is_one_after_initialize() {
        let (env, admin, client) = setup();
        client.initialize(&admin);

        let info = client.get_contract_version();
        assert_eq!(info.version, INITIAL_CONTRACT_VERSION);
        assert_eq!(info.upgrade_count, 0);
        assert_eq!(info.deployed_at, info.last_upgraded_at);
        let _ = env;
    }

    #[test]
    fn test_get_contract_version_fails_before_initialize() {
        let (env, _admin, client) = setup();
        let result = client.try_get_contract_version();
        assert_eq!(result, Err(Ok(EscrowError::E2)));
        let _ = env;
    }

    #[test]
    fn test_upgrade_increments_version_and_history() {
        let (env, admin, client) = setup();
        client.initialize(&admin);

        let before = client.get_contract_version();
        assert_eq!(before.version, INITIAL_CONTRACT_VERSION);

        env.ledger().with_mut(|l| l.timestamp += 1_000);
        client.upgrade(&admin, &wasm_hash(&env, 1));

        let after_first = client.get_contract_version();
        assert_eq!(after_first.version, INITIAL_CONTRACT_VERSION + 1);
        assert_eq!(after_first.upgrade_count, 1);
        assert_eq!(after_first.deployed_at, before.deployed_at);
        assert!(after_first.last_upgraded_at > before.last_upgraded_at);

        env.ledger().with_mut(|l| l.timestamp += 1_000);
        client.upgrade(&admin, &wasm_hash(&env, 2));

        let after_second = client.get_contract_version();
        assert_eq!(after_second.version, INITIAL_CONTRACT_VERSION + 2);
        assert_eq!(after_second.upgrade_count, 2);
        assert_eq!(after_second.deployed_at, before.deployed_at);
        assert!(after_second.last_upgraded_at > after_first.last_upgraded_at);
    }

    #[test]
    fn test_upgrade_by_non_admin_rejected_and_version_unchanged() {
        let (env, admin, client) = setup();
        client.initialize(&admin);
        let attacker = Address::generate(&env);

        let result = client.try_upgrade(&attacker, &wasm_hash(&env, 3));
        assert!(result.is_err(), "non-admin upgrade must be rejected");

        let info = client.get_contract_version();
        assert_eq!(
            info.version, INITIAL_CONTRACT_VERSION,
            "version must not advance on a rejected upgrade"
        );
        assert_eq!(info.upgrade_count, 0);
    }
}
