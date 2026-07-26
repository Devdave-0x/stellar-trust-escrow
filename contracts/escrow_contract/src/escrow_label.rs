//! Optional human-readable escrow label for off-chain indexers.
//!
//! Stored separately from `EscrowMeta` to avoid altering the existing
//! persistent schema. Settable only by the escrow's creator (client).

use soroban_sdk::{contractimpl, contracttype, Address, Env, String};

use crate::{ContractStorage, EscrowContract, EscrowError};

/// Maximum label length, in bytes.
pub const MAX_LABEL_LEN: u32 = 32;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LabelKey {
    /// Optional short label for an escrow — key: u64, value: String
    EscrowLabel(u64),
}

#[contractimpl]
impl EscrowContract {
    /// Sets or clears the label on an existing escrow. Only the escrow's
    /// creator (client) may call this. Passing `None` clears the label.
    pub fn update_escrow_label(
        env: Env,
        caller: Address,
        escrow_id: u64,
        label: Option<String>,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        let meta = ContractStorage::load_escrow_meta(&env, escrow_id)?;
        if caller != meta.client {
            return Err(EscrowError::E4);
        }

        match label {
            Some(l) => {
                if l.len() > MAX_LABEL_LEN {
                    return Err(EscrowError::E5);
                }
                env.storage()
                    .persistent()
                    .set(&LabelKey::EscrowLabel(escrow_id), &l);
            }
            None => {
                env.storage()
                    .persistent()
                    .remove(&LabelKey::EscrowLabel(escrow_id));
            }
        }
        Ok(())
    }

    /// Returns the label set on an escrow, if any.
    pub fn get_escrow_label(env: Env, escrow_id: u64) -> Option<String> {
        env.storage()
            .persistent()
            .get(&LabelKey::EscrowLabel(escrow_id))
    }
}

#[cfg(test)]
mod tests {
    use crate::{EscrowContract, EscrowContractClient, EscrowError, MultisigConfig};
    use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env, String};

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    fn setup_escrow() -> (Env, EscrowContractClient<'static>, Address, Address, u64) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let client = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let contract_id = env.register_contract(None, EscrowContract);
        let c = EscrowContractClient::new(&env, &contract_id);
        c.initialize(&admin);

        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        token::StellarAssetClient::new(&env, &token_id).mint(&client, &2_000_i128);

        let escrow_id = c.create_escrow(
            &client,
            &freelancer,
            &token_id,
            &1_000_i128,
            &BytesN::from_array(&env, &[0u8; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        (env, c, admin, client, escrow_id)
    }

    #[test]
    fn test_set_and_get_label() {
        let (env, c, _admin, client, escrow_id) = setup_escrow();
        let label = String::from_str(&env, "invoice-42");
        c.update_escrow_label(&client, &escrow_id, &Some(label.clone()));
        assert_eq!(c.get_escrow_label(&escrow_id), Some(label));
    }

    #[test]
    fn test_too_long_label_rejected() {
        let (env, c, _admin, client, escrow_id) = setup_escrow();
        let long_label = String::from_str(&env, "this-label-is-definitely-longer-than-32-bytes");
        let result = c.try_update_escrow_label(&client, &escrow_id, &Some(long_label));
        assert_eq!(result, Err(Ok(EscrowError::E5)));
    }

    #[test]
    fn test_update_by_non_creator_rejected() {
        let (env, c, _admin, _client, escrow_id) = setup_escrow();
        let not_creator = Address::generate(&env);
        let label = String::from_str(&env, "nope");
        let result = c.try_update_escrow_label(&not_creator, &escrow_id, &Some(label));
        assert_eq!(result, Err(Ok(EscrowError::E4)));
    }

    #[test]
    fn test_clear_label_with_none() {
        let (env, c, _admin, client, escrow_id) = setup_escrow();
        let label = String::from_str(&env, "temp");
        c.update_escrow_label(&client, &escrow_id, &Some(label));
        c.update_escrow_label(&client, &escrow_id, &None);
        assert_eq!(c.get_escrow_label(&escrow_id), None);
    }
}
