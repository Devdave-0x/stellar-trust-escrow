//! Contract schema version, distinct from the semantic `CONTRACT_VERSION`
//! string. Clients use this to handle version-specific fields across
//! upgrades. Bump `SCHEMA_VERSION` on every breaking schema change.

use soroban_sdk::{contractimpl, contracttype, Env};

use crate::EscrowContract;

/// Current contract schema version. Bump on every breaking schema change.
pub const SCHEMA_VERSION: u32 = 1;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SchemaVersionKey {
    /// Schema version recorded at contract initialisation — value: u32
    DeployedSchemaVersion,
}

#[contractimpl]
impl EscrowContract {
    /// Records the current schema version at deployment time. Safe to call
    /// once; subsequent calls are no-ops if already set.
    pub fn init_schema_version(env: Env) {
        if !env
            .storage()
            .instance()
            .has(&SchemaVersionKey::DeployedSchemaVersion)
        {
            env.storage()
                .instance()
                .set(&SchemaVersionKey::DeployedSchemaVersion, &SCHEMA_VERSION);
        }
    }

    /// Returns the current contract schema version.
    pub fn get_contract_version(_env: Env) -> u32 {
        SCHEMA_VERSION
    }

    /// Returns the schema version recorded at deployment time.
    pub fn get_deployed_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&SchemaVersionKey::DeployedSchemaVersion)
            .unwrap_or(SCHEMA_VERSION)
    }
}

#[cfg(test)]
mod tests {
    use super::SCHEMA_VERSION;
    use crate::{EscrowContract, EscrowContractClient};
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn setup() -> (Env, EscrowContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, client, admin)
    }

    #[test]
    fn test_get_contract_version_returns_constant() {
        let (_env, client, _admin) = setup();
        assert_eq!(client.get_contract_version(), SCHEMA_VERSION);
    }

    #[test]
    fn test_deployed_version_set_at_init() {
        let (_env, client, _admin) = setup();
        client.init_schema_version();
        assert_eq!(client.get_deployed_version(), SCHEMA_VERSION);
    }

    #[test]
    fn test_get_deployed_version_defaults_before_explicit_init() {
        let (_env, client, _admin) = setup();
        assert_eq!(client.get_deployed_version(), SCHEMA_VERSION);
    }
}
