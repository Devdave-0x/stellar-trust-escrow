# Soroban Testnet Deployment Guide

This guide walks you through deploying all four `stellar-trust-escrow` smart contracts to
the Stellar testnet using the Soroban CLI. By the end you will have four live contract
instances that you can invoke against the public testnet RPC.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Set Up Environment Variables](#2-set-up-environment-variables)
3. [Fund Your Testnet Account via Friendbot](#3-fund-your-testnet-account-via-friendbot)
4. [Build the WASM Artifacts](#4-build-the-wasm-artifacts)
5. [Upload WASM to the Network](#5-upload-wasm-to-the-network)
6. [Deploy Contract Instances](#6-deploy-contract-instances)
7. [Initialize the Contracts](#7-initialize-the-contracts)
8. [Verify Deployment](#8-verify-deployment)
9. [Environment Variable Reference](#9-environment-variable-reference)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

| Tool | Minimum Version | Install |
|------|----------------|---------|
| Rust | 1.74 | `curl https://sh.rustup.rs -sSf \| sh` |
| `wasm32-unknown-unknown` target | — | `rustup target add wasm32-unknown-unknown` |
| Soroban CLI (`stellar`) | 21.0.0 | `cargo install --locked stellar-cli@21` |
| `jq` | any | `apt install jq` / `brew install jq` |

Verify your Soroban CLI version:

```bash
stellar --version
# stellar 21.x.x
```

Clone the repository if you have not already:

```bash
git clone https://github.com/DevCM-D/Stellar-Crowd-Fund-Escrow.git
cd Stellar-Crowd-Fund-Escrow
```

---

## 2. Set Up Environment Variables

Export these variables in your shell before running any deployment commands.
Replace the placeholder values with your own.

```bash
# Your testnet deployer key (never use a mainnet key here)
export STELLAR_SECRET_KEY="SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

# Derived from STELLAR_SECRET_KEY — shown by `stellar keys address`
export ADMIN_ADDRESS="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

# Stellar testnet Soroban RPC endpoint
export SOROBAN_RPC_URL="https://soroban-testnet.stellar.org"

# Testnet network passphrase (do not change this value)
export SOROBAN_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

# Platform fee in basis points (50 bps = 0.5 %)
export PLATFORM_FEE_BPS=50
```

Generate a fresh testnet keypair if you do not already have one:

```bash
stellar keys generate --no-fund testnet-deployer
stellar keys address testnet-deployer
# Copy the public key into ADMIN_ADDRESS above
stellar keys show testnet-deployer
# Copy the secret key into STELLAR_SECRET_KEY above
```

> **Security:** Never commit `STELLAR_SECRET_KEY` to version control. Keep it in
> your shell session or a `.env` file that is listed in `.gitignore`.

---

## 3. Fund Your Testnet Account via Friendbot

The Stellar Friendbot faucet sends 10 000 XLM to any testnet address on request.
You need at least ~100 XLM to cover transaction fees and minimum balance reserves
across four contract deployments.

```bash
# Fund via curl
curl -s "https://friendbot.stellar.org?addr=${ADMIN_ADDRESS}" | jq .

# Or via the Stellar CLI (requires network config)
stellar network fund "${ADMIN_ADDRESS}" --network testnet
```

Confirm the balance before proceeding:

```bash
curl -s "https://horizon-testnet.stellar.org/accounts/${ADMIN_ADDRESS}" \
  | jq '.balances[] | select(.asset_type=="native") | .balance'
# Should show ≥ 10000.0000000
```

---

## 4. Build the WASM Artifacts

The workspace `Cargo.toml` includes `[profile.release]` settings optimised for
Soroban: `opt-level = "z"`, `lto = true`, `codegen-units = 1`. These keep WASM
binary size small and within the Soroban upload limit.

Build all four contracts at once from the workspace root:

```bash
# From the repository root
cargo build --release --target wasm32-unknown-unknown \
  --package escrow_contract \
  --package escrow_extensions \
  --package governance \
  --package insurance_contract
```

Or build them individually:

```bash
cd contracts/escrow_contract
cargo build --release --target wasm32-unknown-unknown
cd ../escrow_extensions
cargo build --release --target wasm32-unknown-unknown
cd ../governance
cargo build --release --target wasm32-unknown-unknown
cd ../insurance_contract
cargo build --release --target wasm32-unknown-unknown
cd ../..
```

After a successful build, the WASM files appear here:

```
contracts/escrow_contract/target/wasm32-unknown-unknown/release/escrow_contract.wasm
contracts/escrow_extensions/target/wasm32-unknown-unknown/release/escrow_extensions.wasm
contracts/governance/target/wasm32-unknown-unknown/release/governance.wasm
contracts/insurance_contract/target/wasm32-unknown-unknown/release/insurance_contract.wasm
```

> Alternatively, run the convenience wrapper that builds and deploys `escrow_contract`
> in one step: `bash scripts/deploy/testnet.sh` (requires `ADMIN_SECRET_KEY` and
> `ADMIN_ADDRESS` to be exported).

---

## 5. Upload WASM to the Network

Uploading stores the compiled WASM blob on-chain and returns a 32-byte hash.
The hash is used in the next step to instantiate a contract.

```bash
# escrow_contract
ESCROW_WASM_HASH=$(stellar contract upload \
  --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" \
  --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --wasm contracts/escrow_contract/target/wasm32-unknown-unknown/release/escrow_contract.wasm)
echo "escrow_contract WASM hash: ${ESCROW_WASM_HASH}"

# escrow_extensions
EXTENSIONS_WASM_HASH=$(stellar contract upload \
  --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" \
  --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --wasm contracts/escrow_extensions/target/wasm32-unknown-unknown/release/escrow_extensions.wasm)
echo "escrow_extensions WASM hash: ${EXTENSIONS_WASM_HASH}"

# governance
GOVERNANCE_WASM_HASH=$(stellar contract upload \
  --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" \
  --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --wasm contracts/governance/target/wasm32-unknown-unknown/release/governance.wasm)
echo "governance WASM hash: ${GOVERNANCE_WASM_HASH}"

# insurance_contract
INSURANCE_WASM_HASH=$(stellar contract upload \
  --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" \
  --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --wasm contracts/insurance_contract/target/wasm32-unknown-unknown/release/insurance_contract.wasm)
echo "insurance_contract WASM hash: ${INSURANCE_WASM_HASH}"
```

> If you re-upload an identical WASM blob, the CLI returns the same hash (upload
> is idempotent). Re-deploying with the same hash does **not** cost an extra fee.

---

## 6. Deploy Contract Instances

Deploying creates a new contract instance (an `Address`) from the uploaded WASM hash.
You can deploy multiple independent instances from the same WASM hash.

```bash
ESCROW_CONTRACT_ID=$(stellar contract deploy \
  --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" \
  --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --wasm-hash "${ESCROW_WASM_HASH}")
echo "EscrowContract ID: ${ESCROW_CONTRACT_ID}"

EXTENSIONS_CONTRACT_ID=$(stellar contract deploy \
  --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" \
  --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --wasm-hash "${EXTENSIONS_WASM_HASH}")
echo "EscrowExtensions ID: ${EXTENSIONS_CONTRACT_ID}"

GOVERNANCE_CONTRACT_ID=$(stellar contract deploy \
  --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" \
  --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --wasm-hash "${GOVERNANCE_WASM_HASH}")
echo "Governance ID: ${GOVERNANCE_CONTRACT_ID}"

INSURANCE_CONTRACT_ID=$(stellar contract deploy \
  --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" \
  --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --wasm-hash "${INSURANCE_WASM_HASH}")
echo "InsuranceContract ID: ${INSURANCE_CONTRACT_ID}"
```

---

## 7. Initialize the Contracts

Each contract must be initialized exactly once after deployment.
Calling `initialize` a second time returns `E1` (`AlreadyInitialized`).

### 7.1 EscrowContract

```bash
stellar contract invoke \
  --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" \
  --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --id "${ESCROW_CONTRACT_ID}" \
  -- initialize \
  --admin "${ADMIN_ADDRESS}"
```

The `initialize` call sets the admin, zeroes the escrow counter, and writes the
contract version (`CONTRACT_VERSION = "0.1.0"`) to instance storage.

Optional: set the platform fee at initialization time by calling `set_platform_fee_bps`
immediately after:

```bash
stellar contract invoke \
  --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" \
  --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --id "${ESCROW_CONTRACT_ID}" \
  -- set_platform_fee_bps \
  --caller "${ADMIN_ADDRESS}" \
  --fee_bps "${PLATFORM_FEE_BPS}"
```

### 7.2 EscrowExtensions

```bash
stellar contract invoke \
  --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" \
  --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --id "${EXTENSIONS_CONTRACT_ID}" \
  -- initialize \
  --admin "${ADMIN_ADDRESS}" \
  --fee_bps "${PLATFORM_FEE_BPS}"
```

`fee_bps` must be ≤ 200 (2 %). Passing a larger value returns `FeeTooHigh`.

### 7.3 Governance

```bash
stellar contract invoke \
  --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" \
  --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --id "${GOVERNANCE_CONTRACT_ID}" \
  -- initialize \
  --admin "${ADMIN_ADDRESS}"
```

### 7.4 InsuranceContract

```bash
stellar contract invoke \
  --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" \
  --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --id "${INSURANCE_CONTRACT_ID}" \
  -- initialize \
  --admin "${ADMIN_ADDRESS}"
```

---

## 8. Verify Deployment

### 8.1 EscrowContract — Check `escrow_count` and `is_paused`

```bash
# Should return 0 (no escrows created yet)
stellar contract invoke \
  --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" \
  --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --id "${ESCROW_CONTRACT_ID}" \
  -- escrow_count

# Should return false (contract is active)
stellar contract invoke \
  --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" \
  --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --id "${ESCROW_CONTRACT_ID}" \
  -- is_paused

# Should return "0.1.0"
stellar contract invoke \
  --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" \
  --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --id "${ESCROW_CONTRACT_ID}" \
  -- get_version
```

### 8.2 EscrowExtensions — Check `get_fee_bps`

```bash
# Should return the fee_bps value you passed to initialize (e.g. 50)
stellar contract invoke \
  --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" \
  --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --id "${EXTENSIONS_CONTRACT_ID}" \
  -- get_fee_bps
```

### 8.3 Save the Deployment Record

Keep a record of the deployed contract IDs for use in your `.env` file:

```bash
cat > deployments/testnet.env << EOF
ESCROW_CONTRACT_ID=${ESCROW_CONTRACT_ID}
EXTENSIONS_CONTRACT_ID=${EXTENSIONS_CONTRACT_ID}
GOVERNANCE_CONTRACT_ID=${GOVERNANCE_CONTRACT_ID}
INSURANCE_CONTRACT_ID=${INSURANCE_CONTRACT_ID}
ESCROW_WASM_HASH=${ESCROW_WASM_HASH}
EXTENSIONS_WASM_HASH=${EXTENSIONS_WASM_HASH}
GOVERNANCE_WASM_HASH=${GOVERNANCE_WASM_HASH}
INSURANCE_WASM_HASH=${INSURANCE_WASM_HASH}
DEPLOYED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
cat deployments/testnet.env
```

Then copy `ESCROW_CONTRACT_ID` into `backend/.env` as `CONTRACT_ID`.

---

## 9. Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `STELLAR_SECRET_KEY` | Yes | Stellar secret key (`S...`) of the deploying admin. Never share or commit this value. |
| `ADMIN_ADDRESS` | Yes | Public key (`G...`) corresponding to `STELLAR_SECRET_KEY`. Becomes the initial admin of all contracts. |
| `SOROBAN_RPC_URL` | Yes | Soroban JSON-RPC endpoint. Testnet: `https://soroban-testnet.stellar.org` |
| `SOROBAN_NETWORK_PASSPHRASE` | Yes | Network passphrase. Testnet: `Test SDF Network ; September 2015`. Mainnet: `Public Global Stellar Network ; September 2015`. |
| `PLATFORM_FEE_BPS` | No | Protocol fee in basis points (default: `50` = 0.5 %). Maximum: `200` (2 %). |

---

## 10. Troubleshooting

### `WasmHashNotFound`

The WASM hash passed to `stellar contract deploy` does not exist on the network.

**Cause:** The upload step did not complete or used a different RPC endpoint.

**Fix:** Re-run the upload step (§5) and verify you are using the same
`SOROBAN_RPC_URL` for both upload and deploy:

```bash
# Re-upload and capture the hash
ESCROW_WASM_HASH=$(stellar contract upload \
  --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" \
  --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --wasm contracts/escrow_contract/target/wasm32-unknown-unknown/release/escrow_contract.wasm)
```

### Insufficient Balance / `txINSUFFICIENT_BALANCE`

**Cause:** Your deployer account does not have enough XLM for the transaction fee
or minimum balance reserve.

**Fix:** Fund the account again via Friendbot:

```bash
curl "https://friendbot.stellar.org?addr=${ADMIN_ADDRESS}"
```

Each contract deployment costs approximately 0.01–0.1 XLM in fees plus a minimum
balance reserve (~1 XLM per contract instance). Having ≥ 200 XLM covers all four
deployments comfortably.

### `AlreadyInitialized` (E1)

**Cause:** `initialize` was called twice on the same contract instance.

**Fix:** This is a guard — the contract is already initialized. Skip the
`initialize` call and proceed to verification (§8). If you want a fresh deployment,
deploy a new instance with `stellar contract deploy` (§6).

### `HostError: Error(Auth, InvalidAction)`

**Cause:** The `--source` key does not match the `--admin` / `--caller` address, or
the transaction was not properly signed.

**Fix:** Ensure `STELLAR_SECRET_KEY` corresponds to `ADMIN_ADDRESS`:

```bash
stellar keys address "${STELLAR_SECRET_KEY}"
# Must match ADMIN_ADDRESS
```

### Contract invocation returns `null` or empty JSON

**Cause:** The function returned `()` (unit type), which the CLI renders as `null`.
This is expected for void-returning functions like `initialize`.

### Build fails: `error[E0463]: can't find crate for 'std'`

**Cause:** The WASM target is not installed.

**Fix:**

```bash
rustup target add wasm32-unknown-unknown
```

### TTL / Ledger Entry Expired Error

**Cause:** If you wait too long between deploy and initialize (multiple ledger
TTL windows), the contract's instance storage entry may expire.

**Fix:** Always initialize immediately after deploying. The deploy and initialize
steps can be run in the same shell session without any wait.

---

## Quick Reference — All Commands

```bash
# 0. Prerequisites
rustup target add wasm32-unknown-unknown
cargo install --locked stellar-cli@21

# 1. Fund
curl "https://friendbot.stellar.org?addr=${ADMIN_ADDRESS}"

# 2. Build
cargo build --release --target wasm32-unknown-unknown \
  --package escrow_contract --package escrow_extensions \
  --package governance --package insurance_contract

# 3. Upload
ESCROW_WASM_HASH=$(stellar contract upload --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --wasm contracts/escrow_contract/target/wasm32-unknown-unknown/release/escrow_contract.wasm)

# 4. Deploy
ESCROW_CONTRACT_ID=$(stellar contract deploy --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --wasm-hash "${ESCROW_WASM_HASH}")

# 5. Initialize
stellar contract invoke --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --id "${ESCROW_CONTRACT_ID}" -- initialize --admin "${ADMIN_ADDRESS}"

# 6. Verify
stellar contract invoke --source "${STELLAR_SECRET_KEY}" \
  --rpc-url "${SOROBAN_RPC_URL}" --network-passphrase "${SOROBAN_NETWORK_PASSPHRASE}" \
  --id "${ESCROW_CONTRACT_ID}" -- escrow_count
```

Repeat the upload → deploy → initialize sequence for `escrow_extensions`,
`governance`, and `insurance_contract`.
