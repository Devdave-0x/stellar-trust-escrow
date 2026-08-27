# Testnet Deployment Guide

This guide shows how to deploy the contract stack to Stellar testnet and verify
the main entry points from the command line.

## Prerequisites

- Stellar account funded on testnet
- `soroban` CLI installed
- `stellar` CLI configured for testnet
- `backend/.env` populated with the testnet RPC URL and contract ID after deploy

## 1. Fund a testnet account

```bash
soroban keys generate --global contributor --network testnet
soroban keys fund contributor --network testnet
```

## 2. Build the contract

```bash
cargo build --release --target wasm32-unknown-unknown -p escrow_contract
```

## 3. Deploy to testnet

Use the helper script for a repeatable deploy:

```bash
bash scripts/deploy-testnet.sh
```

Or deploy manually:

```bash
soroban contract deploy \
  --source-account contributor \
  --rpc-url "$SOROBAN_RPC_URL" \
  --network-passphrase "$SOROBAN_NETWORK_PASSPHRASE" \
  --wasm target/wasm32-unknown-unknown/release/escrow_contract.wasm
```

## 4. Invoke the deployed contract

After deployment, confirm the contract responds to its core entry points:

```bash
soroban contract invoke \
  --source-account contributor \
  --rpc-url "$SOROBAN_RPC_URL" \
  --network-passphrase "$SOROBAN_NETWORK_PASSPHRASE" \
  --id "$ESCROW_CONTRACT_ID" \
  -- initialize
```

Repeat with project-specific calls such as escrow creation, milestone approval,
and dispute resolution once your local environment variables are in place.

## 5. Update application config

Copy the deployed contract ID into `backend/.env`:

```bash
ESCROW_CONTRACT_ID=...
STELLAR_RPC_URL=...
STELLAR_NETWORK=testnet
```

## 6. Troubleshooting

- If deploy fails, verify the account is funded and the RPC URL is reachable.
- If the app cannot read contract state, confirm `ESCROW_CONTRACT_ID` matches
  the value returned by deployment.
- If testnet calls hang, check that the network passphrase matches testnet.
