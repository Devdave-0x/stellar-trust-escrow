# Escrow contract ABI reference

Source of truth: `contracts/escrow_contract/src/lib.rs`, `types.rs`, `errors.rs`, `storage.rs`, `oracle.rs`, and `bridge/`. This document covers every function exported by the `#[contractimpl]` on `EscrowContract`.

The contract currently exports **96 entry points**. Rust's implicit `env: Env` parameter is omitted below because callers never supply it.

## ABI conventions

- `Address`: Stellar account or contract address.
- `String`: Soroban string, not arbitrary JSON.
- `BytesN<32>` / `BytesN<64>`: exactly 32/64 bytes, usually passed as hexadecimal through the CLI.
- `i128`: token amounts in the token contract's base units.
- `u64` timestamps: ledger Unix timestamps in seconds unless a field explicitly says ledger sequence.
- `Option<T>`: CLI values use `null` for `None`; complex `Some` values use the contract-spec JSON representation.
- `Vec<T>`: JSON array in CLI arguments.
- `Result<T, EscrowError>`: success returns `T`; failure raises a contract error whose numeric code is listed below.
- Milestone status is a `u32` bit flag: Pending `1`, Submitted `2`, Approved `4`, Released `8`, Rejected `16`, Disputed `32`.

## Storage notation

The per-function tables use these names:

| Short name | Storage area and concrete key |
| --- | --- |
| `Admin` | instance: `DataKey::Admin`, `AdminSigners`, `AdminThreshold`, `PendingAdmin` |
| `Config` | instance: pause, oracle, bridge, fees, governance, whitelist, milestone cap, trusted oracle, migration/version keys |
| `Counter` | instance: `EscrowCounter` or `TemplateCounter` |
| `Meta(id)` | persistent: `PackedDataKey::EscrowMeta(id)` |
| `Milestone(id,n)` | persistent: `PackedDataKey::Milestone(id,n)` |
| `Recurring(id)` | persistent: `PackedDataKey::RecurringConfig(id)` |
| `Fee(id)` | persistent: `DataKey::PlatformFeeSnapshot(id)` |
| `Frozen(id)` | persistent: `DataKey::EscrowFrozen(id)` |
| `Reputation(a)` | persistent: `DataKey::Reputation(a)` |
| `Cancellation(id)` | persistent: `DataKey::CancellationRequest(id)` |
| `Slash(id)` | persistent: `DataKey::SlashRecord(id)` |
| `Template(id)` | persistent: `DataKey::Template(id)` |
| `Indexes` | persistent participant, status, cancellation-requester, and slash-address vectors |
| `WrappedToken(a)` | persistent: `BridgeDataKey::WrappedToken(a)` |
| `BridgeConfirmation(a)` | persistent: `BridgeDataKey::BridgeConfirmation(a)` |
| `Token balance` | external Stellar Asset Contract balance/transfer, not this contract's storage |

`R` means read, `W` write, `D` delete. Most reads and writes also extend Soroban TTL. Loading `Meta(id)` generally settles prepaid rent and can therefore write the meta record or expire/delete the escrow.

## Exact exported signatures

The following index is generated from the public functions in the `#[contractimpl]` block. `env: Env` is omitted.

| Entry point | Signature |
| --- | --- |
| `initialize` | `fn(admin: Address) -> Result<(), EscrowError>` |
| `set_admin_multisig` | `fn(caller: Address, admin_signers: Vec<Address>, threshold: u32) -> Result<(), EscrowError>` |
| `freeze_escrow` | `fn(escrow_id: u64, admin_signers: Vec<Address>) -> Result<(), EscrowError>` |
| `unfreeze_escrow` | `fn(escrow_id: u64, admin_signers: Vec<Address>) -> Result<(), EscrowError>` |
| `set_oracle` | `fn(caller: Address, oracle: Address) -> Result<(), EscrowError>` |
| `set_fallback_oracle` | `fn(caller: Address, oracle: Address) -> Result<(), EscrowError>` |
| `get_price` | `fn(asset: Address) -> Result<i128, EscrowError>` |
| `convert_amount` | `fn(amount: i128, from_asset: Address, to_asset: Address) -> Result<i128, EscrowError>` |
| `create_price_indexed_milestone` | `fn(caller: Address, escrow_id: u64, title: String, description_hash: BytesN<32>, amount: i128, price_condition: PriceCondition) -> Result<u32, EscrowError>` |
| `trigger_oracle_release` | `fn(caller: Address, escrow_id: u64, milestone_id: u32) -> Result<(), EscrowError>` |
| `set_wormhole_bridge` | `fn(caller: Address, bridge_addr: Address) -> Result<(), EscrowError>` |
| `register_wrapped_token` | `fn(caller: Address, info: bridge::WrappedTokenInfo) -> Result<(), EscrowError>` |
| `get_wrapped_token_info` | `fn(token: Address) -> Option<bridge::WrappedTokenInfo>` |
| `update_bridge_confirmation` | `fn(token: Address, bridge_protocol: bridge::BridgeProtocol, confirmations: u32) -> Result<(), EscrowError>` |
| `get_bridge_confirmation` | `fn(token: Address) -> Option<bridge::BridgeConfirmation>` |
| `set_min_arbiter_reputation` | `fn(caller: Address, new_min: u64) -> Result<(), EscrowError>` |
| `get_min_arbiter_reputation` | `fn() -> u64` |
| `set_governance_contract` | `fn(caller: Address, governance_addr: Address) -> Result<(), EscrowError>` |
| `get_governance_contract` | `fn() -> Option<Address>` |
| `set_platform_treasury` | `fn(caller: Address, treasury: Address) -> Result<(), EscrowError>` |
| `get_platform_treasury` | `fn() -> Option<Address>` |
| `set_platform_fee_tiers` | `fn(caller: Address, tiers: Vec<FeeTier>) -> Result<(), EscrowError>` |
| `get_platform_fee_tiers` | `fn() -> Vec<FeeTier>` |
| `create_escrow` | `fn(client: Address, freelancer: Address, token: Address, total_amount: i128, brief_hash: BytesN<32>, arbiter: Option<Address>, deadline: Option<u64>, lock_time: Option<u64>, _timelock: Option<Timelock>, _multisig_config: MultisigConfig) -> Result<u64, EscrowError>` |
| `create_escrow_dispute_timeout` | `fn(client: Address, freelancer: Address, token: Address, total_amount: i128, brief_hash: BytesN<32>, arbiter: Option<Address>, deadline: Option<u64>, lock_time: Option<u64>, dispute_timeout_ledger: u32) -> Result<u64, EscrowError>` |
| `create_escrow_with_nft_gate` | `fn(caller: Address, nft_contract: Address, token_id: u64, freelancer: Address, token: Address, total_amount: i128, brief_hash: BytesN<32>, arbiter: Option<Address>, deadline: Option<u64>, lock_time: Option<u64>) -> Result<u64, EscrowError>` |
| `create_escrow_with_buyer_signers` | `fn(client: Address, freelancer: Address, token: Address, total_amount: i128, brief_hash: BytesN<32>, arbiter: Option<Address>, deadline: Option<u64>, lock_time: Option<u64>, buyer_signers: Vec<Address>) -> Result<u64, EscrowError>` |
| `create_recurring_escrow` | `fn(client: Address, freelancer: Address, token: Address, payment_amount: i128, interval: RecurringInterval, start_time: u64, end_date: Option<u64>, number_of_payments: Option<u32>, brief_hash: BytesN<32>) -> Result<u64, EscrowError>` |
| `add_milestone` | `fn(caller: Address, escrow_id: u64, title: String, description_hash: BytesN<32>, amount: i128) -> Result<u32, EscrowError>` |
| `update_milestone_title` | `fn(caller: Address, escrow_id: u64, milestone_id: u32, new_title: String) -> Result<(), EscrowError>` |
| `batch_add_milestones` | `fn(caller: Address, escrow_id: u64, titles: Vec<String>, description_hashes: Vec<BytesN<32>>, amounts: Vec<i128>) -> Result<u32, EscrowError>` |
| `batch_approve_milestones` | `fn(caller: Address, escrow_id: u64, milestone_ids: Vec<u32>) -> Result<i128, EscrowError>` |
| `batch_release_funds` | `fn(caller: Address, escrow_id: u64, milestone_ids: Vec<u32>) -> Result<i128, EscrowError>` |
| `process_recurring_payments` | `fn(escrow_id: u64) -> Result<u32, EscrowError>` |
| `submit_milestone` | `fn(caller: Address, escrow_id: u64, milestone_id: u32) -> Result<(), EscrowError>` |
| `approve_milestone` | `fn(caller: Address, escrow_id: u64, milestone_id: u32) -> Result<(), EscrowError>` |
| `reject_milestone` | `fn(caller: Address, escrow_id: u64, milestone_id: u32) -> Result<(), EscrowError>` |
| `set_max_milestones` | `fn(caller: Address, new_max: u32) -> Result<(), EscrowError>` |
| `reject_milestone_with_reason` | `fn(caller: Address, escrow_id: u64, milestone_id: u32, reason_hash: BytesN<32>) -> Result<(), EscrowError>` |
| `withdraw_rent_overpayment` | `fn(caller: Address, escrow_id: u64, amount: i128) -> Result<(), EscrowError>` |
| `release_funds` | `fn(caller: Address, escrow_id: u64, milestone_id: u32) -> Result<(), EscrowError>` |
| `transfer_client_role` | `fn(escrow_id: u64, new_client: Address) -> Result<(), EscrowError>` |
| `cancel_escrow` | `fn(caller: Address, escrow_id: u64) -> Result<(), EscrowError>` |
| `split_escrow` | `fn(caller: Address, escrow_id: u64, split_amount: i128, new_brief_hash: BytesN<32>) -> Result<(u64, u64), EscrowError>` |
| `partial_cancel` | `fn(caller: Address, escrow_id: u64) -> Result<i128, EscrowError>` |
| `start_timelock` | `fn(caller: Address, escrow_id: u64, duration_ledger: u64) -> Result<(), EscrowError>` |
| `extend_lock_time` | `fn(caller: Address, escrow_id: u64, new_lock_time: u64) -> Result<(), EscrowError>` |
| `raise_dispute` | `fn(caller: Address, escrow_id: u64, milestone_id: Option<u32>) -> Result<(), EscrowError>` |
| `claim_dispute_timeout` | `fn(caller: Address, escrow_id: u64) -> Result<(), EscrowError>` |
| `resolve_dispute` | `fn(caller: Address, escrow_id: u64, client_amount: i128, freelancer_amount: i128) -> Result<(), EscrowError>` |
| `escalate_dispute_to_governance` | `fn(caller: Address, escrow_id: u64) -> Result<u64, EscrowError>` |
| `set_trusted_oracle_key` | `fn(caller: Address, pubkey: BytesN<32>) -> Result<(), EscrowError>` |
| `oracle_resolve_dispute` | `fn(escrow_id: u64, payload: types::OracleResolutionPayload, grace_period_seconds: u64) -> Result<(), EscrowError>` |
| `update_reputation` | `fn(address: Address, completed: bool, disputed: bool, volume: i128) -> Result<(), EscrowError>` |
| `upgrade` | `fn(caller: Address, new_wasm_hash: BytesN<32>) -> Result<(), EscrowError>` |
| `pause` | `fn(caller: Address) -> Result<(), EscrowError>` |
| `unpause` | `fn(caller: Address) -> Result<(), EscrowError>` |
| `is_paused` | `fn() -> bool` |
| `get_admin` | `fn() -> Result<Address, EscrowError>` |
| `propose_admin` | `fn(caller: Address, new_admin: Address) -> Result<(), EscrowError>` |
| `accept_admin` | `fn(caller: Address) -> Result<(), EscrowError>` |
| `add_approved_token` | `fn(caller: Address, token: Address) -> Result<(), EscrowError>` |
| `remove_approved_token` | `fn(caller: Address, token: Address) -> Result<(), EscrowError>` |
| `set_token_whitelist_enabled` | `fn(caller: Address, enabled: bool) -> Result<(), EscrowError>` |
| `create_template` | `fn(caller: Address, name: String, milestones: Vec<MilestoneTemplate>) -> Result<u64, EscrowError>` |
| `get_template` | `fn(template_id: u64) -> Result<EscrowTemplate, EscrowError>` |
| `create_escrow_from_template` | `fn(caller: Address, template_id: u64, client: Address, freelancer: Address, token: Address, total_amount: i128, brief_hash: BytesN<32>, arbiter: Option<Address>, deadline: Option<u64>) -> Result<u64, EscrowError>` |
| `pause_recurring_schedule` | `fn(caller: Address, escrow_id: u64) -> Result<(), EscrowError>` |
| `resume_recurring_schedule` | `fn(caller: Address, escrow_id: u64) -> Result<(), EscrowError>` |
| `cancel_recurring_escrow` | `fn(caller: Address, escrow_id: u64) -> Result<(), EscrowError>` |
| `get_escrow` | `fn(escrow_id: u64) -> Result<EscrowState, EscrowError>` |
| `get_escrow_meta` | `fn(escrow_id: u64) -> Result<EscrowMeta, EscrowError>` |
| `collect_rent` | `fn(escrow_id: u64) -> Result<i128, EscrowError>` |
| `top_up_rent` | `fn(caller: Address, escrow_id: u64, additional_periods: u64) -> Result<i128, EscrowError>` |
| `get_reputation` | `fn(address: Address) -> Result<ReputationRecord, EscrowError>` |
| `get_recurring_config` | `fn(escrow_id: u64) -> Result<RecurringPaymentConfig, EscrowError>` |
| `get_recurring_schedule_status` | `fn(escrow_id: u64) -> Result<RecurringScheduleStatus, EscrowError>` |
| `escrow_count` | `fn() -> u64` |
| `get_milestone` | `fn(escrow_id: u64, milestone_id: u32) -> Result<Milestone, EscrowError>` |
| `get_milestone_approvals` | `fn(escrow_id: u64, milestone_id: u32) -> Result<Vec<ApprovalRecord>, EscrowError>` |
| `get_cancellation_request` | `fn(escrow_id: u64) -> Result<CancellationRequest, EscrowError>` |
| `get_slash_record` | `fn(escrow_id: u64) -> Result<SlashRecord, EscrowError>` |
| `get_escrow_ids_by_participant` | `fn(participant: Address, offset: u32, limit: u32) -> Vec<u64>` |
| `get_escrow_ids_by_status` | `fn(status: EscrowStatus, offset: u32, limit: u32) -> Vec<u64>` |
| `list_cancellations_by_requester` | `fn(requester: Address) -> Vec<u64>` |
| `get_slash_records_by_address` | `fn(slashed_user: Address) -> Vec<SlashRecord>` |
| `update_arbiter` | `fn(escrow_id: u64, new_arbiter: Option<Address>) -> Result<(), EscrowError>` |
| `request_cancellation` | `fn(caller: Address, escrow_id: u64, reason: String) -> Result<(), EscrowError>` |
| `client_approve_cancellation` | `fn(caller: Address, escrow_id: u64) -> Result<(), EscrowError>` |
| `execute_cancellation` | `fn(escrow_id: u64) -> Result<(), EscrowError>` |
| `dispute_cancellation` | `fn(caller: Address, escrow_id: u64) -> Result<(), EscrowError>` |
| `finalize_slash` | `fn(escrow_id: u64) -> Result<(), EscrowError>` |
| `dispute_slash` | `fn(caller: Address, escrow_id: u64) -> Result<(), EscrowError>` |
| `resolve_slash_dispute` | `fn(caller: Address, escrow_id: u64, upheld: bool) -> Result<(), EscrowError>` |
| `get_contract_balance` | `fn(token: Address) -> i128` |
| `execute_meta_transaction` | `fn(meta_tx: types::MetaTransaction) -> Result<(), EscrowError>` |

## Entry points

### Initialization, administration, and configuration

| Function | Arguments → return | Access control | Storage read/write |
| --- | --- | --- | --- |
| `initialize` | `admin: Address` → `Result<(), EscrowError>` | Permissionless first call; notably does **not** require `admin` auth | W `Admin`, `Counter`, platform treasury, storage version |
| `set_admin_multisig` | `caller: Address, admin_signers: Vec<Address>, threshold: u32` → `Result<()>` | Current admin signature | R `Admin`; W admin signer set/threshold |
| `freeze_escrow` | `escrow_id: u64, admin_signers: Vec<Address>` → `Result<()>` | Configured admin threshold signatures | R `Admin` signer config, `Meta(id)`; W `Frozen(id)` |
| `unfreeze_escrow` | same as `freeze_escrow` → `Result<()>` | Configured admin threshold signatures | R signer config, `Meta(id)`; W `Frozen(id)=false` |
| `set_oracle` | `caller, oracle: Address` → `Result<()>` | Admin signature | R `Admin`; W primary oracle config |
| `set_fallback_oracle` | `caller, oracle: Address` → `Result<()>` | Admin signature | R `Admin`; W fallback oracle config |
| `set_wormhole_bridge` | `caller, bridge_addr: Address` → `Result<()>` | Admin signature | R `Admin`; W Wormhole config |
| `set_min_arbiter_reputation` | `caller: Address, new_min: u64` → `Result<()>` | Admin signature | R `Admin`; W minimum-reputation config |
| `get_min_arbiter_reputation` | no arguments → `u64` | Public view | R minimum-reputation config; default `100` |
| `set_governance_contract` | `caller, governance_addr: Address` → `Result<()>` | Admin signature | R `Admin`; W governance config |
| `get_governance_contract` | no arguments → `Option<Address>` | Public view | R governance config |
| `set_platform_treasury` | `caller, treasury: Address` → `Result<()>` | Admin signature | R `Admin`; W treasury config |
| `get_platform_treasury` | no arguments → `Option<Address>` | Public view | R treasury config |
| `set_platform_fee_tiers` | `caller: Address, tiers: Vec<FeeTier>` → `Result<()>` | Admin signature | R `Admin`; W fee-tier config |
| `get_platform_fee_tiers` | no arguments → `Vec<FeeTier>` | Public view | R fee tiers; returns defaults if absent |
| `set_max_milestones` | `caller: Address, new_max: u32` → `Result<()>` | Admin signature | R `Admin`; W milestone-cap config |
| `upgrade` | `caller: Address, new_wasm_hash: BytesN<32>` → `Result<()>` | Admin signature | R `Admin`, version/migration cursor and legacy escrows; migration may W/D `Meta`, milestones, legacy keys; updates contract Wasm |
| `pause` | `caller: Address` → `Result<()>` | Admin signature | R `Admin`, pause flag; W pause flag |
| `unpause` | `caller: Address` → `Result<()>` | Admin signature | R `Admin`, pause flag; W pause flag |
| `is_paused` | no arguments → `bool` | Public view | R pause flag |
| `get_admin` | no arguments → `Result<Address>` | Public view | R `Admin` |
| `propose_admin` | `caller, new_admin: Address` → `Result<()>` | Current admin signature | R `Admin`; W pending admin |
| `accept_admin` | `caller: Address` → `Result<()>` | Pending-admin signature | R pending/current admin; W current admin; D pending admin |
| `add_approved_token` | `caller, token: Address` → `Result<()>` | Admin signature | R `Admin`; W approved-token config |
| `remove_approved_token` | `caller, token: Address` → `Result<()>` | Admin signature | R `Admin`; D approved-token config |
| `set_token_whitelist_enabled` | `caller: Address, enabled: bool` → `Result<()>` | Admin signature | R `Admin`; W whitelist-enabled flag |
| `set_trusted_oracle_key` | `caller: Address, pubkey: BytesN<32>` → `Result<()>` | Admin signature | R `Admin`; W trusted oracle key |

### Oracle and bridge operations

| Function | Arguments → return | Access control | Storage read/write |
| --- | --- | --- | --- |
| `get_price` | `asset: Address` → `Result<i128>` | Public; contract must be initialized | R primary/fallback oracle config; invokes external oracle |
| `convert_amount` | `amount: i128, from_asset: Address, to_asset: Address` → `Result<i128>` | Public; initialized | R oracle config; invokes oracle twice |
| `register_wrapped_token` | `caller: Address, info: WrappedTokenInfo` → `Result<()>` | Admin signature | R `Admin`; W `WrappedToken(info.stellar_address)` |
| `get_wrapped_token_info` | `token: Address` → `Option<WrappedTokenInfo>` | Public view | R `WrappedToken(token)` |
| `update_bridge_confirmation` | `token: Address, bridge_protocol: BridgeProtocol, confirmations: u32` → `Result<()>` | Permissionless | W `BridgeConfirmation(token)` |
| `get_bridge_confirmation` | `token: Address` → `Option<BridgeConfirmation>` | Public view | R `BridgeConfirmation(token)` |
| `create_price_indexed_milestone` | `caller, escrow_id, title, description_hash, amount, price_condition` → `Result<u32>` | Client signature | R/W `Meta(id)`; W new `Milestone(id,n)` |
| `trigger_oracle_release` | `caller, escrow_id, milestone_id` → `Result<()>` | Any authenticated caller | R/W `Meta`, milestone; R oracle config; W `Token balance` payout |

### Escrow creation and templates

| Function | Arguments → return | Access control | Storage read/write |
| --- | --- | --- | --- |
| `create_escrow` | `client, freelancer, token, total_amount, brief_hash, arbiter, deadline, lock_time, timelock, multisig_config` → `Result<u64>` | Client signature (inside shared creation path) | R config/reputation/whitelist; W `Counter`, `Meta`, `Indexes`; transfers total plus rent from client |
| `create_escrow_dispute_timeout` | previous core fields plus `dispute_timeout_ledger: u32` → `Result<u64>` | Client signature | Same creation storage; stores dispute timeout in `Meta` |
| `create_escrow_with_nft_gate` | `caller, nft_contract, token_id, freelancer, token, total_amount, brief_hash, arbiter, deadline, lock_time` → `Result<u64>` | Caller signature; caller must own NFT | Invokes NFT balance; then normal creation storage |
| `create_escrow_with_buyer_signers` | `client, freelancer, token, total_amount, brief_hash, arbiter, deadline, lock_time, buyer_signers` → `Result<u64>` | Client plus buyer-signer validation; client signature in creation path | Normal creation storage; buyer signers stored in `Meta` |
| `create_recurring_escrow` | `client, freelancer, token, payment_amount, interval, start_time, end_date, number_of_payments, brief_hash` → `Result<u64>` | Client signature | W `Counter`, `Meta`, `Recurring`, `Indexes`; transfers schedule total plus rent |
| `create_template` | `caller, name: String, milestones: Vec<MilestoneTemplate>` → `Result<u64>` | Caller signature | R/W template counter; W `Template(id)` |
| `get_template` | `template_id: u64` → `Result<EscrowTemplate>` | Public view | R `Template(id)` |
| `create_escrow_from_template` | `caller, template_id, client, freelancer, token, total_amount, brief_hash, arbiter, deadline` → `Result<u64>` | Caller signature and `caller == client` | R template/config; W normal creation keys plus one milestone key per template item |

`create_escrow` currently accepts `timelock` and `multisig_config` in the ABI, but its shared creation call does not pass those values through; integrators should verify deployed Wasm behavior before relying on them.

### Milestones and payouts

| Function | Arguments → return | Access control | Storage read/write |
| --- | --- | --- | --- |
| `add_milestone` | `caller, escrow_id, title, description_hash, amount` → `Result<u32>` | Client signature | R/W `Meta`; W milestone; R milestone cap; transfers additional rent |
| `update_milestone_title` | `caller, escrow_id, milestone_id, new_title` → `Result<()>` | Client signature | R `Meta`; R/W milestone |
| `batch_add_milestones` | `caller, escrow_id, titles, description_hashes, amounts` → `Result<u32>` | Client signature | R/W `Meta`; W multiple milestones; transfers rent |
| `batch_approve_milestones` | `caller, escrow_id, milestone_ids` → `Result<i128>` | Client or buyer-signer signature | R/W `Meta` and milestones; possibly W token payout/status index |
| `batch_release_funds` | `caller, escrow_id, milestone_ids` → `Result<i128>` | Admin signature | R admin/meta/milestones/fee; W milestones/meta/fee/indexes and token payout |
| `submit_milestone` | `caller, escrow_id, milestone_id` → `Result<()>` | Freelancer signature | R/W `Meta` and milestone; may extend deadline |
| `approve_milestone` | `caller, escrow_id, milestone_id` → `Result<()>` | Client or buyer-signer signature | R/W meta/milestone/indexes; may transfer token |
| `reject_milestone` | `caller, escrow_id, milestone_id` → `Result<()>` | Client signature | R/W meta and milestone |
| `reject_milestone_with_reason` | previous plus `reason_hash: BytesN<32>` → `Result<()>` | Client signature | R/W meta and milestone |
| `release_funds` | `caller, escrow_id, milestone_id` → `Result<()>` | Admin signature, except an expired timelock permits the freelancer path implemented in source | R admin/meta/milestone/fee/frozen; W milestone/meta/fee/indexes and token payout |
| `withdraw_rent_overpayment` | `caller, escrow_id, amount` → `Result<()>` | Client signature | R/W `Meta`; token refund |

### Escrow lifecycle, locking, and disputes

| Function | Arguments → return | Access control | Storage read/write |
| --- | --- | --- | --- |
| `transfer_client_role` | `escrow_id: u64, new_client: Address` → `Result<()>` | Current client signature | R/W `Meta` |
| `cancel_escrow` | `caller, escrow_id` → `Result<()>` | Client signature; cancellation rules apply | R/W meta/milestones/fee/status indexes/config; token payouts |
| `split_escrow` | `caller, escrow_id, split_amount, new_brief_hash` → `Result<(u64,u64)>` | Caller signature **and** client and freelancer signatures | R parent meta; creates two children (`Counter`, meta, fee, indexes, token transfers) |
| `partial_cancel` | `caller, escrow_id` → `Result<i128>` | Client signature | R frozen/meta; W meta; token refund |
| `start_timelock` | `caller, escrow_id, duration_ledger` → `Result<()>` | Client or freelancer signature | R frozen/meta; W timelock in meta |
| `extend_lock_time` | `caller, escrow_id, new_lock_time` → `Result<()>` | Client signature | R/W meta |
| `raise_dispute` | `caller, escrow_id, milestone_id: Option<u32>` → `Result<()>` | Client or freelancer signature | R frozen/meta/optional milestone; W meta/milestone/status indexes |
| `claim_dispute_timeout` | `caller, escrow_id` → `Result<()>` | Client or freelancer signature after timeout | R frozen/meta/fee; W meta/fee/status indexes and split token payouts |
| `resolve_dispute` | `caller, escrow_id, client_amount, freelancer_amount` → `Result<()>` | Arbiter signature, otherwise admin signature | R frozen/meta/fee/admin; W meta/fee/reputation/indexes and payouts |
| `escalate_dispute_to_governance` | `caller, escrow_id` → `Result<u64>` | Client or freelancer signature | R meta/governance config; invokes governance contract |
| `oracle_resolve_dispute` | `escrow_id, payload: OracleResolutionPayload, grace_period_seconds` → `Result<()>` | Permissionless after grace period; Ed25519 payload authorization | R trusted key/meta; W meta/reputation/status indexes and payouts |
| `update_arbiter` | `escrow_id, new_arbiter: Option<Address>` → `Result<()>` | **Both** client and freelancer signatures | R/W meta |

### Recurring payments

| Function | Arguments → return | Access control | Storage read/write |
| --- | --- | --- | --- |
| `process_recurring_payments` | `escrow_id: u64` → `Result<u32>` | Permissionless keeper call | R/W meta, recurring config, generated milestones; token payout |
| `pause_recurring_schedule` | `caller, escrow_id` → `Result<()>` | Client signature | R meta; R/W recurring config |
| `resume_recurring_schedule` | `caller, escrow_id` → `Result<()>` | Client signature | R meta; R/W recurring config |
| `cancel_recurring_escrow` | `caller, escrow_id` → `Result<()>` | Client signature | R/W meta and recurring config; token refund |

### Cancellation and slashing

| Function | Arguments → return | Access control | Storage read/write |
| --- | --- | --- | --- |
| `request_cancellation` | `caller, escrow_id, reason` → `Result<()>` | Client or freelancer signature | R/W meta; W cancellation/indexes; transfers rent |
| `client_approve_cancellation` | `caller, escrow_id` → `Result<()>` | Counterparty (non-requester) signature | R meta; R/W cancellation |
| `execute_cancellation` | `escrow_id: u64` → `Result<()>` | Permissionless after window or counterparty approval | R/W/D meta, cancellation, fee, reputation, slash, indexes; token movement |
| `dispute_cancellation` | `caller, escrow_id` → `Result<()>` | Non-requester signature before deadline | R/W meta/cancellation/status indexes |
| `finalize_slash` | `escrow_id: u64` → `Result<()>` | Permissionless after slash dispute window | R meta/slash; D slash; token transfer |
| `dispute_slash` | `caller, escrow_id` → `Result<()>` | Slashed-user signature before deadline | R meta/slash; W slash |
| `resolve_slash_dispute` | `caller, escrow_id, upheld: bool` → `Result<()>` | Arbiter signature, otherwise admin signature | R meta/slash/admin/reputation; W reputation; D slash; possible token reversal |

### Reputation, rent, views, and meta-transactions

| Function | Arguments → return | Access control | Storage read/write |
| --- | --- | --- | --- |
| `update_reputation` | `address, completed: bool, disputed: bool, volume: i128` → `Result<()>` | **Permissionless** | R/W `Reputation(address)` |
| `get_escrow` | `escrow_id` → `Result<EscrowState>` | Public | R/W `Meta` for rent; R all milestones |
| `get_escrow_meta` | `escrow_id` → `Result<EscrowMeta>` | Public | R/W meta for rent |
| `collect_rent` | `escrow_id` → `Result<i128>` | Permissionless | R/W or D meta and dependent keys; possible token rent/refund transfers |
| `top_up_rent` | `caller, escrow_id, additional_periods` → `Result<i128>` | Client signature | R/W meta; token transfer into reserve |
| `get_reputation` | `address` → `Result<ReputationRecord>` | Public | R reputation; missing key returns zero record |
| `get_recurring_config` | `escrow_id` → `Result<RecurringPaymentConfig>` | Public | R/W meta for rent; R recurring config |
| `get_recurring_schedule_status` | `escrow_id` → `Result<RecurringScheduleStatus>` | Public | R/W meta for rent; R recurring config |
| `escrow_count` | no arguments → `u64` | Public | R counter |
| `get_milestone` | `escrow_id, milestone_id` → `Result<Milestone>` | Public | R/W meta for rent; R milestone |
| `get_milestone_approvals` | `escrow_id, milestone_id` → `Result<Vec<ApprovalRecord>>` | Public | R/W meta for rent; R milestone |
| `get_cancellation_request` | `escrow_id` → `Result<CancellationRequest>` | Public | R/W meta for rent; R cancellation |
| `get_slash_record` | `escrow_id` → `Result<SlashRecord>` | Public | R/W meta for rent; R slash |
| `get_escrow_ids_by_participant` | `participant, offset, limit` → `Vec<u64>` | Public | R participant index; limit capped at 50 |
| `get_escrow_ids_by_status` | `status, offset, limit` → `Vec<u64>` | Public | R status index; limit capped at 50 |
| `list_cancellations_by_requester` | `requester` → `Vec<u64>` | Public | R cancellation-requester index |
| `get_slash_records_by_address` | `slashed_user` → `Vec<SlashRecord>` | Public | R slash-address index and each slash record |
| `get_contract_balance` | `token` → `i128` | Public | Reads external token balance |
| `execute_meta_transaction` | `meta_tx: MetaTransaction` → `Result<()>` | Permissionless; currently checks deadline only | No storage today; nonce/signature/dispatch are explicitly stubbed |

## Custom error codes

`errors.rs` exports compact variants named `E1`, `E2`, etc. The semantic names below describe their actual uses. Codes absent from the enum are marked unused; reserved variants exist but may not currently be returned.

| Code | Rust variant | Semantic name | Plain-English meaning |
| ---: | --- | --- | --- |
| 1 | `E1` | Already initialized | `initialize` was called after an admin already existed. |
| 2 | `E2` | Not initialized/config missing | Required global state such as admin, treasury, governance, or migration state is absent. |
| 3 | `E3` | Unauthorized | Caller/party/signature, self-escrow, NFT ownership, arbiter, signer list, or nonce authorization failed. |
| 4 | `E4` | Admin only | Caller is not the current admin. |
| 5 | `E5` | Client only | Operation requires the escrow client. |
| 6 | — | Unused | No variant. |
| 7 | `E7` | Reserved | Present in enum; no current return site. |
| 8 | `E8` | Escrow/template not found or rent expired | Requested escrow/template is absent; expired escrow rent is surfaced as not found. |
| 9 | `E9` | Invalid escrow state | Escrow is not Active or otherwise not in the state required by the operation. |
| 10 | `E10` | Escrow not disputed | Dispute-only operation called for a non-disputed escrow. |
| 11 | `E11` | Reserved | Present in enum; no current return site. |
| 12 | `E12` | Pending funds | Reserved by prior documentation; no current return site. |
| 13 | `E13` | Milestone not found | Requested milestone ID does not exist. |
| 14 | `E14` | Invalid milestone/condition state | Milestone state, dependency, oracle condition, title state, or payout state is invalid. |
| 15 | `E15` | Milestone allocation exceeds escrow | Adding milestone amounts would exceed total escrow funds. |
| 16 | `E16` | Milestone/count overflow | Maximum milestone count or checked count increment was exceeded. |
| 17 | `E17` | Invalid milestone/batch input | Amount is non-positive, a batch is empty/mismatched, or max-milestone configuration is invalid. |
| 18 | — | Unused | No variant. |
| 19 | `E19` | Invalid amount/configuration | Generic validation failure for escrow amount, strings, fee tiers, split, NFT/arbiter config, rent withdrawal, or duplicate stake. |
| 20 | `E20` | Amount mismatch/arithmetic overflow | Checked arithmetic failed or payout totals do not equal available balance. |
| 21 | — | Unused | No variant. |
| 22 | `E22` | Reentrancy blocked | A guarded token-transfer flow was re-entered. |
| 23 | `E23` | Dispute timeout unavailable/not reached | Timeout metadata is missing or the ledger deadline has not elapsed. |
| 24 | `E24` | Reserved | Present in enum; no current return site. |
| 25 | — | Unused | No variant. |
| 26 | `E26` | Deadline expired | Meta-transaction deadline has passed. |
| 27 | — | Unused | No variant. |
| 28 | `E28` | Lock time not expired | Funds remain time-locked. |
| 29 | — | Unused | No variant. |
| 30 | `E30` | Invalid lock extension | New lock time is not future-valid or exceeds its extension bound. |
| 31 | `E31` | Contract paused | Mutating operation is disabled by emergency pause. |
| 32 | `E32` | Cancellation not found | No cancellation request exists for the escrow. |
| 33 | `E33` | Cancellation already exists | A second cancellation request was attempted. |
| 34 | `E34` | Cancellation already disputed | Cancellation dispute was submitted twice. |
| 35 | `E35` | Cancellation window active | Permissionless execution attempted before deadline without counterparty approval. |
| 36 | `E36` | Cancellation deadline expired | Attempted to dispute cancellation after its deadline. |
| 37 | `E37` | Cancellation disputed | Execution is blocked because cancellation is disputed. |
| 38 | `E38` | Slash not found/not disputed | Slash record is absent, or dispute resolution was requested for an undisputed slash. |
| 39 | `E39` | Slash already disputed | Slash cannot be finalized/disputed in its current disputed state. |
| 40 | `E40` | Slash dispute timing invalid | Finalization is too early or dispute submission is too late. |
| 41 | `E41` | Slash already applied | Duplicate slash record for an escrow was blocked. |
| 42 | `E42` | Migration failed/unsupported | Storage version is newer than this Wasm or migration cannot proceed safely. |
| 43 | `E43` | Recurring config not found | Escrow has no recurring schedule. |
| 44 | `E44` | Invalid recurring schedule | Invalid dates/counts/interval calculation or arithmetic. |
| 45 | `E45` | No recurring payment due | Keeper call occurred before the next due timestamp. |
| 46 | `E46` | Recurring schedule paused | Payment processing attempted while paused. |
| 47 | `E47` | Recurring schedule cancelled | Operation attempted after recurring cancellation. |
| 48–50 | — | Unused | No variants in the exported enum. |
| 51 | `E51` | Invalid timelock | Duration is invalid, timelock already exists, or timelock arithmetic overflowed. |
| 52 | — | Unused | No variant. |
| 53 | `E53` | Timelock not expired | Funds cannot yet be released. |
| 54 | `E54` | Oracle/bridge data invalid | Oracle missing/stale/zero, conversion failed, wrapped token unapproved, bridge not finalized, or trusted key missing. |
| 55 | `E55` | Invalid title length | Milestone title exceeds the configured maximum. |
| 56 | `E56` | Oracle grace period active | Fallback oracle resolution was submitted too early. |
| 57 | `E57` | Oracle key mismatch | Payload public key differs from the trusted key. |
| 58 | `E58` | Oracle payload expired | Signed resolution payload is stale. |
| 59 | `E59` | Invalid payout basis points | Client and freelancer shares do not total 10,000 bps. |
| 60 | `E60` | Dispute timestamp missing | Fallback resolution cannot determine when the dispute started. |
| 61 | `E61` | Escrow frozen | A freeze-protected operation was attempted. |
| 62 | `E62` | Admin threshold not met | Supplied admin signer set did not satisfy configured multisig authorization. |
| 63 | `E63` | Invalid admin threshold | Threshold is zero or exceeds the signer count. |

## Public contract types

The complete serialized definitions live in `types.rs` and `bridge/types.rs`. Important invocation shapes are:

```text
FeeTier { min_total_amount: i128, fee_bps: u32 }
MultisigConfig { approvers: Vec<Address>, weights: Vec<u32>, threshold: u32 }
Timelock { duration_ledger: u64, start_ledger: u64 }
PriceCondition { asset: Address, target_price_usd: i128, direction: Above|Below }
MilestoneTemplate { title: String, description_hash: BytesN<32>, amount: i128 }
WrappedTokenInfo { stellar_address, origin_chain, origin_address, bridge, is_approved }
OracleResolutionPayload { escrow_id, client_bps, freelancer_bps, expires_at, signature, oracle_pubkey }
MetaTransaction { signer, nonce, deadline, function_name, function_args, signature }
```

Recurring interval variants are `Daily`, `Weekly`, and `Monthly`. Escrow statuses are `Active`, `Completed`, `Disputed`, `Cancelled`, and `CancellationPending`. Bridge protocols are `Wormhole` and `Allbridge`.

## Stellar CLI examples

New Stellar CLI releases use `stellar`; older installations expose equivalent commands through `soroban`. Replace `$CLI` as appropriate:

```bash
CLI=stellar
CONTRACT_ID=C...
NETWORK=testnet
```

### Initialize

`initialize` is permissionless on first call, so deploy and initialize atomically in operational tooling whenever possible.

```bash
$CLI contract invoke \
  --id "$CONTRACT_ID" \
  --source-account admin \
  --network "$NETWORK" \
  -- \
  initialize \
  --admin "$(stellar keys address admin)"
```

### Create an escrow

Complex values are JSON encoded according to the generated contract spec. `null` is `Option::None`.

```bash
$CLI contract invoke \
  --id "$CONTRACT_ID" \
  --source-account client \
  --network "$NETWORK" \
  -- \
  create_escrow \
  --client "$(stellar keys address client)" \
  --freelancer "$(stellar keys address freelancer)" \
  --token "$TOKEN_CONTRACT" \
  --total_amount 2500000000 \
  --brief_hash 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 \
  --arbiter null \
  --deadline null \
  --lock_time null \
  --_timelock null \
  --_multisig_config '{"approvers":[],"weights":[],"threshold":0}'
```

The client must have approved/authorized the token transfer required by the Stellar Asset Contract.

### Add and submit a milestone

```bash
$CLI contract invoke --id "$CONTRACT_ID" --source-account client --network "$NETWORK" -- \
  add_milestone \
  --caller "$(stellar keys address client)" \
  --escrow_id 0 \
  --title 'Design delivery' \
  --description_hash 6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b \
  --amount 750000000

$CLI contract invoke --id "$CONTRACT_ID" --source-account freelancer --network "$NETWORK" -- \
  submit_milestone \
  --caller "$(stellar keys address freelancer)" \
  --escrow_id 0 \
  --milestone_id 0
```

### Approve and query

```bash
$CLI contract invoke --id "$CONTRACT_ID" --source-account client --network "$NETWORK" -- \
  approve_milestone --caller "$(stellar keys address client)" --escrow_id 0 --milestone_id 0

$CLI contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- \
  get_escrow --escrow_id 0
```

### Complex enum/struct example

```bash
$CLI contract invoke --id "$CONTRACT_ID" --source-account client --network "$NETWORK" -- \
  create_price_indexed_milestone \
  --caller "$(stellar keys address client)" \
  --escrow_id 0 \
  --title 'Release when XLM reaches target' \
  --description_hash 6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b \
  --amount 500000000 \
  --price_condition '{"asset":"'$XLM_SAC'","target_price_usd":"2500000","direction":"Above"}'
```

Use `$CLI contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- --help` to print the deployed contract's generated argument syntax. This is authoritative if CLI JSON encoding differs by version.

## JavaScript SDK examples

The project uses `@stellar/stellar-sdk` 12.x. Generated bindings from the deployed contract spec are preferred for production integrations because they encode structs and enums safely. The lower-level pattern is:

```js
import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

const rpc = new SorobanRpc.Server('https://soroban-testnet.stellar.org');
const contract = new Contract(process.env.CONTRACT_ID);
const signer = Keypair.fromSecret(process.env.CLIENT_SECRET);

async function invoke(operation) {
  const account = await rpc.getAccount(signer.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(operation)
    .setTimeout(60)
    .build();

  const prepared = await rpc.prepareTransaction(tx);
  prepared.sign(signer);
  const sent = await rpc.sendTransaction(prepared);
  if (sent.status === 'ERROR') throw new Error(JSON.stringify(sent.errorResult));

  let result;
  do {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    result = await rpc.getTransaction(sent.hash);
  } while (result.status === 'NOT_FOUND');

  if (result.status !== 'SUCCESS') throw new Error(`transaction ${result.status}`);
  return result.returnValue ? scValToNative(result.returnValue) : undefined;
}
```

### Read escrow state

```js
const escrow = await invoke(
  contract.call('get_escrow', nativeToScVal(0, { type: 'u64' })),
);
console.log(escrow);
```

For a read-only integration, simulate the transaction and decode `simulation.result.retval` instead of signing/sending it.

### Create an escrow

```js
const none = xdr.ScVal.scvVoid(); // Soroban Option::None
const zeroMultisig = nativeToScVal({
  approvers: [],
  weights: [],
  threshold: 0,
});

const escrowId = await invoke(
  contract.call(
    'create_escrow',
    Address.fromString(signer.publicKey()).toScVal(),
    Address.fromString(process.env.FREELANCER_ADDRESS).toScVal(),
    Address.fromString(process.env.TOKEN_CONTRACT).toScVal(),
    nativeToScVal(2500000000n, { type: 'i128' }),
    xdr.ScVal.scvBytes(Buffer.from(process.env.BRIEF_HASH_HEX, 'hex')),
    none, // arbiter
    none, // deadline
    none, // lock_time
    none, // timelock
    zeroMultisig,
  ),
);
console.log('created escrow', escrowId);
```

If `nativeToScVal()` cannot infer a custom struct with your SDK version, generate JavaScript bindings from the contract spec or construct an `ScMap` with symbol keys matching the Rust field names.

### Submit a milestone

```js
await invoke(
  contract.call(
    'submit_milestone',
    Address.fromString(signer.publicKey()).toScVal(),
    nativeToScVal(escrowId, { type: 'u64' }),
    nativeToScVal(0, { type: 'u32' }),
  ),
);
```

## Integration cautions

- `initialize` is first-caller-wins and lacks `admin.require_auth()`.
- `update_reputation` is permissionless and mutates reputation directly.
- `update_bridge_confirmation` is permissionless.
- `execute_meta_transaction` currently validates only the deadline; signature, nonce, and dispatch are stubbed.
- `oracle_resolve_dispute` is permissionless by design but requires a valid trusted-key signature after the grace period.
- Public “view” functions that load escrow metadata may settle storage rent and therefore mutate storage or expire an escrow.
- Error variants are exported as opaque `E<number>` names. Integrations should map the numeric discriminant, not depend on semantic Rust names from older documentation.
- Always simulate before signing and submitting a Soroban transaction; simulation supplies the resource footprint and minimum resource fee.
