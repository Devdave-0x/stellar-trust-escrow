//! Platform-managed release blocklist (e.g. sanctioned addresses).
//!
//! Admin-maintained list of addresses that are blocked from receiving
//! milestone releases. Checked via `is_blocked` before a release proceeds.

use soroban_sdk::{contractimpl, contracttype, Address, Env};

use crate::{ContractStorage, EscrowContract, EscrowError};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AllowlistKey {
    /// Blocked recipient address — key: Address, value: bool
    Blocked(Address),
}

#[contractimpl]
impl EscrowContract {
    /// Adds `address` to the release blocklist. Admin-only.
    pub fn add_to_allowlist(env: Env, caller: Address, address: Address) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_admin(&env, &caller)?;
        env.storage()
            .persistent()
            .set(&AllowlistKey::Blocked(address), &true);
        Ok(())
    }

    /// Removes `address` from the release blocklist. Admin-only.
    pub fn remove_from_allowlist(
        env: Env,
        caller: Address,
        address: Address,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_admin(&env, &caller)?;
        env.storage()
            .persistent()
            .remove(&AllowlistKey::Blocked(address));
        Ok(())
    }

    /// Returns true if `address` is on the release blocklist.
    pub fn is_blocked(env: Env, address: Address) -> bool {
        env.storage()
            .persistent()
            .get(&AllowlistKey::Blocked(address))
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use crate::{EscrowContract, EscrowContractClient, EscrowError};
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
    fn test_admin_can_add_and_remove_from_allowlist() {
        let (env, client, admin) = setup();
        let addr = Address::generate(&env);

        assert!(!client.is_blocked(&addr));
        client.add_to_allowlist(&admin, &addr);
        assert!(client.is_blocked(&addr));
        client.remove_from_allowlist(&admin, &addr);
        assert!(!client.is_blocked(&addr));
    }

    #[test]
    fn test_non_admin_cannot_add_to_allowlist() {
        let (env, client, _admin) = setup();
        let not_admin = Address::generate(&env);
        let addr = Address::generate(&env);

        let result = client.try_add_to_allowlist(&not_admin, &addr);
        assert_eq!(result, Err(Ok(EscrowError::E4)));
    }

    #[test]
    fn test_non_blocked_address_is_not_blocked() {
        let (env, client, _admin) = setup();
        let addr = Address::generate(&env);
        assert!(!client.is_blocked(&addr));
    }
}
