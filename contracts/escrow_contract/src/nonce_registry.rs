//! # Signed Message Nonce Registry
//!
//! Off-chain signed messages (approvals, consent) submitted to the contract
//! can be replayed unless each one carries a nonce that is checked and
//! recorded exactly once.

use soroban_sdk::{BytesN, Env};

use crate::{DataKey, EscrowError};

/// Verifies `nonce` has not been used before, then records it so it cannot
/// be replayed. Call this from any entry point that accepts an off-chain
/// signed message before acting on the payload.
pub(crate) fn consume_nonce(env: &Env, nonce: &BytesN<32>) -> Result<(), EscrowError> {
    if is_nonce_used(env, nonce) {
        return Err(EscrowError::NonceAlreadyUsed);
    }
    env.storage()
        .persistent()
        .set(&DataKey::UsedNonce(nonce.clone()), &true);
    Ok(())
}

pub(crate) fn is_nonce_used(env: &Env, nonce: &BytesN<32>) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::UsedNonce(nonce.clone()))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use crate::{EscrowContract, EscrowContractClient};
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

    fn setup(env: &Env) -> EscrowContractClient<'_> {
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin);
        client
    }

    #[test]
    fn test_first_use_of_nonce_is_accepted() {
        let env = Env::default();
        env.mock_all_auths();
        let client = setup(&env);
        let nonce = BytesN::from_array(&env, &[7u8; 32]);

        assert!(!client.is_nonce_used(&nonce));
        client.consume_signed_nonce(&nonce);
        assert!(client.is_nonce_used(&nonce));
    }

    #[test]
    fn test_replayed_nonce_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let client = setup(&env);
        let nonce = BytesN::from_array(&env, &[9u8; 32]);

        client.consume_signed_nonce(&nonce);
        let result = client.try_consume_signed_nonce(&nonce);
        assert!(result.is_err());
    }

    #[test]
    fn test_different_nonces_both_accepted() {
        let env = Env::default();
        env.mock_all_auths();
        let client = setup(&env);
        let nonce_a = BytesN::from_array(&env, &[1u8; 32]);
        let nonce_b = BytesN::from_array(&env, &[2u8; 32]);

        client.consume_signed_nonce(&nonce_a);
        client.consume_signed_nonce(&nonce_b);

        assert!(client.is_nonce_used(&nonce_a));
        assert!(client.is_nonce_used(&nonce_b));
    }
}
