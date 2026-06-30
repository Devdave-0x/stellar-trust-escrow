# Contract Upgrade Procedure

StellarTrustEscrow uses Soroban's `update_current_contract_wasm` host function to upgrade contract logic without redeploying or migrating live escrow state.

## How It Works

1. **Upload** — the new WASM binary is uploaded to the Stellar network and a 32-byte hash is returned.
2. **Call `upgrade(caller, new_wasm_hash)`** — the admin calls the on-chain `upgrade` entry point.
3. **Storage migration** — `StorageManager::migrate()` runs before the WASM swap to convert any stale storage entries to the current schema.
4. **Version bump** — `DataKey::MigrationVersion` (a `u32` counter) is incremented atomically. `DataKey::ContractVersion` is updated to the new semver string baked into the binary.
5. **Event** — a `ContractUpgraded(old_version, new_version, admin)` event is published for indexers.
6. **WASM swap** — `env.deployer().update_current_contract_wasm(new_wasm_hash)` replaces the contract's executing code. All persistent storage is preserved.

## Access Control

Only the address stored in `DataKey::Admin` may call `upgrade`. Any other caller receives `EscrowError::E2` (unauthorized).

## Step-by-Step Guide

### Prerequisites

- Stellar CLI installed (`stellar --version`)
- Admin secret key with sufficient XLM for fees
- New contract WASM compiled for `wasm32-unknown-unknown`

### 1. Build the new WASM

```bash
cd contracts/escrow_contract
cargo build --release --target wasm32-unknown-unknown
```

### 2. Upload the WASM to the network

```bash
WASM_HASH=$(stellar contract upload \
  --source "$ADMIN_SECRET_KEY" \
  --rpc-url "$NETWORK_RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  --wasm target/wasm32-unknown-unknown/release/escrow_contract.wasm)

echo "New WASM hash: $WASM_HASH"
```

### 3. Call `upgrade` on the live contract

```bash
stellar contract invoke \
  --source "$ADMIN_SECRET_KEY" \
  --rpc-url "$NETWORK_RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  --id "$CONTRACT_ID" \
  -- upgrade \
  --caller "$ADMIN_ADDRESS" \
  --new_wasm_hash "$WASM_HASH"
```

### 4. Verify the upgrade

```bash
# Check contract version
stellar contract invoke \
  --source "$ADMIN_SECRET_KEY" \
  --rpc-url "$NETWORK_RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  --id "$CONTRACT_ID" \
  -- get_version

# Check migration counter
stellar contract invoke \
  --source "$ADMIN_SECRET_KEY" \
  --rpc-url "$NETWORK_RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  --id "$CONTRACT_ID" \
  -- get_migration_version
```

## Rollback

To roll back to a previous WASM, call `upgrade` again with the hash of the previously uploaded binary. All persistent storage survives both forward upgrades and rollbacks — the `MigrationVersion` counter continues to increment even on rollback, preserving an auditable history of upgrade events.

## Storage Compatibility

Every schema change to `DataKey`, `EscrowMeta`, or `Milestone` **must** include a corresponding migration step in `StorageManager::migrate()` (`contracts/escrow_contract/src/storage.rs`). The migration cursor (`DataKey::MigrationCursor`) tracks which escrows have been converted so that large state sets can be migrated lazily across multiple transactions.

## Event Schema

| Topic                    | Data                                      |
|--------------------------|-------------------------------------------|
| `(upgraded, new_version)` | `(old_version: u32, admin: Address)` |

Events are indexed by the backend `escrowIndexer` service and surfaced in the admin dashboard under **Contract History**.
