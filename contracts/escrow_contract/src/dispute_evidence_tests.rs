#[cfg(test)]
#[allow(clippy::module_inception)]
mod dispute_evidence_tests {
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String, Vec};

    use crate::{DisputeEvidence, EscrowContract, EscrowContractClient, EscrowStatus};

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
        let client = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let contract_id = env.register_contract(None, EscrowContract);
        let client_escrow = EscrowContractClient::new(&env, &contract_id);
        client_escrow.initialize(&admin);

        (env, admin, client, freelancer, client_escrow)
    }

    fn create_disputed_escrow(
        env: &Env,
        admin: &Address,
        client: &Address,
        freelancer: &Address,
        contract: &EscrowContractClient,
    ) -> u64 {
        let token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let brief = BytesN::from_array(env, &[1u8; 32]);

        let escrow_id = contract.create_escrow(
            client,
            freelancer,
            &token,
            &100_000,
            &brief,
            &None,
            &None,
            &None,
            &None,
            &crate::no_multisig(env),
        );

        contract.raise_dispute(client, &escrow_id, &None);
        escrow_id
    }

    #[test]
    fn test_add_evidence_requires_disputed_status() {
        let (env, admin, client, freelancer, contract) = setup();
        let token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let brief = BytesN::from_array(&env, &[1u8; 32]);

        let escrow_id = contract.create_escrow(
            &client,
            &freelancer,
            &token,
            &100_000,
            &brief,
            &None,
            &None,
            &None,
            &None,
            &crate::no_multisig(&env),
        );

        let evidence_hash = BytesN::from_array(&env, &[2u8; 32]);
        let description = String::from_str(&env, "test evidence");

        let result = contract.try_add_evidence(&client, &escrow_id, &evidence_hash, &description);
        assert!(result.is_err());
    }

    #[test]
    fn test_add_evidence_requires_party() {
        let (env, admin, client, freelancer, contract) = setup();
        let escrow_id = create_disputed_escrow(&env, &admin, &client, &freelancer, &contract);

        let third_party = Address::generate(&env);
        let evidence_hash = BytesN::from_array(&env, &[2u8; 32]);
        let description = String::from_str(&env, "test evidence");

        let result =
            contract.try_add_evidence(&third_party, &escrow_id, &evidence_hash, &description);
        assert!(result.is_err());
    }

    #[test]
    fn test_add_evidence_rejects_empty_hash() {
        let (env, admin, client, freelancer, contract) = setup();
        let escrow_id = create_disputed_escrow(&env, &admin, &client, &freelancer, &contract);

        let zero_hash = BytesN::from_array(&env, &[0u8; 32]);
        let description = String::from_str(&env, "test evidence");

        let result = contract.try_add_evidence(&client, &escrow_id, &zero_hash, &description);
        assert!(result.is_err());
    }

    #[test]
    fn test_add_evidence_rejects_empty_description() {
        let (env, admin, client, freelancer, contract) = setup();
        let escrow_id = create_disputed_escrow(&env, &admin, &client, &freelancer, &contract);

        let evidence_hash = BytesN::from_array(&env, &[2u8; 32]);
        let description = String::from_str(&env, "");

        let result = contract.try_add_evidence(&client, &escrow_id, &evidence_hash, &description);
        assert!(result.is_err());
    }

    #[test]
    fn test_add_evidence_rejects_long_description() {
        let (env, admin, client, freelancer, contract) = setup();
        let escrow_id = create_disputed_escrow(&env, &admin, &client, &freelancer, &contract);

        let evidence_hash = BytesN::from_array(&env, &[2u8; 32]);
        let long_desc = String::from_str(&env, &"x".repeat(257));

        let result = contract.try_add_evidence(&client, &escrow_id, &evidence_hash, &long_desc);
        assert!(result.is_err());
    }

    #[test]
    fn test_add_evidence_happy_path() {
        let (env, admin, client, freelancer, contract) = setup();
        let escrow_id = create_disputed_escrow(&env, &admin, &client, &freelancer, &contract);

        let evidence_hash = BytesN::from_array(&env, &[2u8; 32]);
        let description = String::from_str(&env, "test evidence");

        let count = contract.add_evidence(&client, &escrow_id, &evidence_hash, &description);
        assert_eq!(count, 1);
    }

    #[test]
    fn test_add_evidence_multiple_entries() {
        let (env, admin, client, freelancer, contract) = setup();
        let escrow_id = create_disputed_escrow(&env, &admin, &client, &freelancer, &contract);

        let hash1 = BytesN::from_array(&env, &[2u8; 32]);
        let desc1 = String::from_str(&env, "first evidence");
        contract.add_evidence(&client, &escrow_id, &hash1, &desc1);

        let hash2 = BytesN::from_array(&env, &[3u8; 32]);
        let desc2 = String::from_str(&env, "second evidence");
        contract.add_evidence(&freelancer, &escrow_id, &hash2, &desc2);

        let evidences = contract.get_evidence(&escrow_id);
        assert_eq!(evidences.len(), 2);
    }

    #[test]
    fn test_get_evidence_empty() {
        let (env, admin, client, freelancer, contract) = setup();
        let token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let brief = BytesN::from_array(&env, &[1u8; 32]);

        let escrow_id = contract.create_escrow(
            &client,
            &freelancer,
            &token,
            &100_000,
            &brief,
            &None,
            &None,
            &None,
            &None,
            &crate::no_multisig(&env),
        );

        let evidences = contract.get_evidence(&escrow_id);
        assert_eq!(evidences.len(), 0);
    }

    #[test]
    fn test_add_evidence_freelancer() {
        let (env, admin, client, freelancer, contract) = setup();
        let escrow_id = create_disputed_escrow(&env, &admin, &client, &freelancer, &contract);

        let evidence_hash = BytesN::from_array(&env, &[2u8; 32]);
        let description = String::from_str(&env, "freelancer evidence");

        let count = contract.add_evidence(&freelancer, &escrow_id, &evidence_hash, &description);
        assert_eq!(count, 1);
    }
}
