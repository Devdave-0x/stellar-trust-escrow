#![no_std]
use soroban_sdk::{contract, contracttype, vec, Address, Env, String, Vec};

// ===== Event Types =====
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowEvent {
    EscrowCreated {
        id: String,
        sender: Address,
        beneficiary: Address,
        arbitrator: Address,
        asset_contract: Address,
        amount: i128,
        timelock: u64,
    },
    EscrowFunded {
        id: String,
        sender: Address,
        amount: i128,
    },
    EscrowReleased {
        id: String,
        beneficiary: Address,
        amount: i128,
    },
    EscrowRefunded {
        id: String,
        sender: Address,
        amount: i128,
    },
    EscrowDisputed {
        id: String,
        caller: Address,
    },
    EscrowResolved {
        id: String,
        arbitrator: Address,
        release_to_beneficiary: bool,
    },
    EscrowEmergencyWithdrawn {
        id: String,
        caller: Address,
        amount: i128,
    },
}

// ===== Error Types =====
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ContractError {
    Unauthorized = 1,
    OnlySender = 2,
    OnlyBeneficiary = 3,
    OnlyArbitrator = 4,
    InvalidStateTransition = 5,
    AlreadyFunded = 6,
    AlreadyReleased = 7,
    AlreadyRefunded = 8,
    AlreadyDisputed = 9,
    AlreadyResolved = 10,
    TimelockNotExpired = 11,
    TimelockExpired = 12,
    InvalidAsset = 13,
    InsufficientBalance = 14,
    TransferFailed = 15,
    EscrowNotFound = 16,
    EscrowAlreadyExists = 17,
    InvalidAmount = 18,
    InvalidDuration = 19,
    AssetMismatch = 20,
    UnsupportedAsset = 21,
}

// ===== State =====
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowState {
    Pending,
    Funded,
    Released,
    Refunded,
    Disputed,
    Resolved,
}

// ===== Escrow Struct =====
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Escrow {
    pub id: String,
    pub sender: Address,
    pub beneficiary: Address,
    pub arbitrator: Address,
    pub asset_contract: Address,
    pub amount: i128,
    pub state: EscrowState,
    pub created_at: u64,
    pub funded_at: Option<u64>,
    pub timelock: u64,
    pub released_at: Option<u64>,
    pub refunded_at: Option<u64>,
    pub disputed_at: Option<u64>,
    pub resolved_at: Option<u64>,
    pub metadata: Option<String>,
}

// ===== Storage Keys =====
#[contracttype]
#[derive(Clone)]
pub struct EscrowKey {
    pub id: String,
}

// ===== Contract =====
#[contract]
pub struct MultiAssetEscrowContract;

#[contractimpl]
impl MultiAssetEscrowContract {
    // ===== Create Escrow =====
    pub fn create_escrow(
        env: Env,
        sender: Address,
        beneficiary: Address,
        arbitrator: Address,
        asset_contract: Address,
        amount: i128,
        timelock: u64,
        metadata: Option<String>,
    ) -> Result<String, ContractError> {
        // Validate inputs
        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }
        if timelock == 0 {
            return Err(ContractError::InvalidDuration);
        }

        // Validate asset contract
        if asset_contract
            == Address::from_string(&String::from_str(
                &env,
                "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            ))
        {
            return Err(ContractError::InvalidAsset);
        }

        // Generate unique ID
        let id = String::from_str(
            &env,
            &format!(
                "escrow_{}_{}",
                env.ledger().timestamp(),
                sender.to_string().as_slice()
            ),
        );

        if Self::escrow_exists(&env, id.clone()) {
            return Err(ContractError::EscrowAlreadyExists);
        }

        let escrow = Escrow {
            id: id.clone(),
            sender: sender.clone(),
            beneficiary: beneficiary.clone(),
            arbitrator: arbitrator.clone(),
            asset_contract: asset_contract.clone(),
            amount,
            state: EscrowState::Pending,
            created_at: env.ledger().timestamp(),
            funded_at: None,
            timelock,
            released_at: None,
            refunded_at: None,
            disputed_at: None,
            resolved_at: None,
            metadata,
        };

        env.storage().set(&EscrowKey { id: id.clone() }, &escrow);

        // Emit event
        env.events().publish(
            ("EscrowCreated", "v1"),
            EscrowEvent::EscrowCreated {
                id: id.clone(),
                sender,
                beneficiary,
                arbitrator,
                asset_contract,
                amount,
                timelock,
            },
        );

        Ok(id)
    }

    // ===== Fund Escrow =====
    pub fn fund_escrow(env: Env, id: String, sender: Address) -> Result<(), ContractError> {
        let mut escrow = Self::get_escrow(&env, id.clone())?;

        if escrow.sender != sender {
            return Err(ContractError::OnlySender);
        }

        if escrow.state != EscrowState::Pending {
            return Err(ContractError::InvalidStateTransition);
        }

        // Transfer tokens
        Self::transfer_tokens(
            &env,
            &escrow.asset_contract,
            &sender,
            &env.current_contract_address(),
            escrow.amount,
        )?;

        escrow.state = EscrowState::Funded;
        escrow.funded_at = Some(env.ledger().timestamp());

        env.storage().set(&EscrowKey { id: id.clone() }, &escrow);

        // Emit event
        env.events().publish(
            ("EscrowFunded", "v1"),
            EscrowEvent::EscrowFunded {
                id: id.clone(),
                sender,
                amount: escrow.amount,
            },
        );

        Ok(())
    }

    // ===== Release Escrow =====
    pub fn release_escrow(env: Env, id: String, beneficiary: Address) -> Result<(), ContractError> {
        let mut escrow = Self::get_escrow(&env, id.clone())?;

        if escrow.beneficiary != beneficiary {
            return Err(ContractError::OnlyBeneficiary);
        }

        if escrow.state != EscrowState::Funded && escrow.state != EscrowState::Resolved {
            return Err(ContractError::InvalidStateTransition);
        }

        Self::transfer_tokens(
            &env,
            &escrow.asset_contract,
            &env.current_contract_address(),
            &beneficiary,
            escrow.amount,
        )?;

        escrow.state = EscrowState::Released;
        escrow.released_at = Some(env.ledger().timestamp());

        env.storage().set(&EscrowKey { id: id.clone() }, &escrow);

        // Emit event
        env.events().publish(
            ("EscrowReleased", "v1"),
            EscrowEvent::EscrowReleased {
                id: id.clone(),
                beneficiary,
                amount: escrow.amount,
            },
        );

        Ok(())
    }

    // ===== Refund Escrow =====
    pub fn refund_escrow(env: Env, id: String, sender: Address) -> Result<(), ContractError> {
        let mut escrow = Self::get_escrow(&env, id.clone())?;

        if escrow.sender != sender {
            return Err(ContractError::OnlySender);
        }

        if escrow.state != EscrowState::Funded {
            return Err(ContractError::InvalidStateTransition);
        }

        let current_time = env.ledger().timestamp();
        let timelock_time = escrow.created_at + escrow.timelock;
        if current_time < timelock_time {
            return Err(ContractError::TimelockNotExpired);
        }

        Self::transfer_tokens(
            &env,
            &escrow.asset_contract,
            &env.current_contract_address(),
            &sender,
            escrow.amount,
        )?;

        escrow.state = EscrowState::Refunded;
        escrow.refunded_at = Some(env.ledger().timestamp());

        env.storage().set(&EscrowKey { id: id.clone() }, &escrow);

        // Emit event
        env.events().publish(
            ("EscrowRefunded", "v1"),
            EscrowEvent::EscrowRefunded {
                id: id.clone(),
                sender,
                amount: escrow.amount,
            },
        );

        Ok(())
    }

    // ===== Dispute Escrow =====
    pub fn dispute_escrow(env: Env, id: String, caller: Address) -> Result<(), ContractError> {
        let mut escrow = Self::get_escrow(&env, id.clone())?;

        if escrow.sender != caller && escrow.beneficiary != caller {
            return Err(ContractError::Unauthorized);
        }

        if escrow.state != EscrowState::Funded {
            return Err(ContractError::InvalidStateTransition);
        }

        escrow.state = EscrowState::Disputed;
        escrow.disputed_at = Some(env.ledger().timestamp());

        env.storage().set(&EscrowKey { id: id.clone() }, &escrow);

        // Emit event
        env.events().publish(
            ("EscrowDisputed", "v1"),
            EscrowEvent::EscrowDisputed {
                id: id.clone(),
                caller,
            },
        );

        Ok(())
    }

    // ===== Resolve Dispute =====
    pub fn resolve_dispute(
        env: Env,
        id: String,
        arbitrator: Address,
        release_to_beneficiary: bool,
    ) -> Result<(), ContractError> {
        let mut escrow = Self::get_escrow(&env, id.clone())?;

        if escrow.arbitrator != arbitrator {
            return Err(ContractError::OnlyArbitrator);
        }

        if escrow.state != EscrowState::Disputed {
            return Err(ContractError::InvalidStateTransition);
        }

        if release_to_beneficiary {
            Self::transfer_tokens(
                &env,
                &escrow.asset_contract,
                &env.current_contract_address(),
                &escrow.beneficiary,
                escrow.amount,
            )?;
            escrow.state = EscrowState::Resolved;
        } else {
            Self::transfer_tokens(
                &env,
                &escrow.asset_contract,
                &env.current_contract_address(),
                &escrow.sender,
                escrow.amount,
            )?;
            escrow.state = EscrowState::Refunded;
        }

        escrow.resolved_at = Some(env.ledger().timestamp());

        env.storage().set(&EscrowKey { id: id.clone() }, &escrow);

        // Emit event
        env.events().publish(
            ("EscrowResolved", "v1"),
            EscrowEvent::EscrowResolved {
                id: id.clone(),
                arbitrator,
                release_to_beneficiary,
            },
        );

        Ok(())
    }

    // ===== Emergency Withdraw =====
    pub fn emergency_withdraw(env: Env, id: String, caller: Address) -> Result<(), ContractError> {
        let escrow = Self::get_escrow(&env, id.clone())?;

        if escrow.sender != caller && escrow.beneficiary != caller {
            return Err(ContractError::Unauthorized);
        }

        let current_time = env.ledger().timestamp();
        let emergency_time = escrow.created_at + escrow.timelock * 2;
        if current_time < emergency_time {
            return Err(ContractError::TimelockNotExpired);
        }

        Self::transfer_tokens(
            &env,
            &escrow.asset_contract,
            &env.current_contract_address(),
            &caller,
            escrow.amount,
        )?;

        let mut updated_escrow = escrow.clone();
        updated_escrow.state = EscrowState::Refunded;
        updated_escrow.refunded_at = Some(env.ledger().timestamp());
        env.storage()
            .set(&EscrowKey { id: id.clone() }, &updated_escrow);

        // Emit event
        env.events().publish(
            ("EscrowEmergencyWithdrawn", "v1"),
            EscrowEvent::EscrowEmergencyWithdrawn {
                id: id.clone(),
                caller,
                amount: escrow.amount,
            },
        );

        Ok(())
    }

    // ===== Helper: Get Escrow =====
    pub fn get_escrow(env: &Env, id: String) -> Result<Escrow, ContractError> {
        env.storage()
            .get(&EscrowKey { id: id.clone() })
            .ok_or(ContractError::EscrowNotFound)
    }

    // ===== Helper: Check Escrow Exists =====
    fn escrow_exists(env: &Env, id: String) -> bool {
        env.storage().has(&EscrowKey { id })
    }

    // ===== Helper: Transfer Tokens =====
    fn transfer_tokens(
        env: &Env,
        asset_contract: &Address,
        from: &Address,
        to: &Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        let result: Result<(), soroban_sdk::Error> =
            env.invoke_contract(asset_contract, &("transfer", from, to, &amount));

        match result {
            Ok(_) => Ok(()),
            Err(_) => Err(ContractError::TransferFailed),
        }
    }

    // ===== Helper: Get Balance =====
    pub fn get_balance(env: &Env, asset_contract: &Address, account: &Address) -> i128 {
        let result: Result<i128, soroban_sdk::Error> =
            env.invoke_contract(asset_contract, &("balance_of", account));
        result.unwrap_or(0)
    }
}

// ===== Tests =====
#[cfg(test)]
mod test;
