#!/usr/bin/env bash
# deploy.sh
#
# Builds the Soroban escrow contract, deploys it to Stellar testnet,
# and prints the contract address.
#
# Prerequisites:
#   - soroban CLI installed (>= 21.0.0)
#   - Stellar keypair configured (run: soroban keys generate my-key --network testnet)
#   - Account funded (run: soroban keys fund my-key --network testnet)
#
# Usage:
#   bash scripts/deploy.sh
#
# TODO (contributor — medium, Issue #43):
# - Add --network flag to deploy to mainnet
# - Save contract address to backend/.env automatically
# - Add contract initialization call after deployment
# - Add --upgrade flag for upgrading an existing deployment

set -euo pipefail

NETWORK="${STELLAR_NETWORK:-testnet}"
KEY="${STELLAR_KEY:-my-key}"
CONTRACT_DIR="contracts/escrow_contract"
WASM_PATH="target/wasm32-unknown-unknown/release/stellar_trust_escrow_contract.wasm"

echo ""
echo "🚀 StellarTrustEscrow — Contract Deployment"
echo "==========================================="
echo "Network: $NETWORK"
echo "Key:     $KEY"
echo ""

# Step 1: Build the contract
echo "📦 Building WASM contract…"
cd "$CONTRACT_DIR"
cargo build --release --target wasm32-unknown-unknown
cd - > /dev/null
echo "   ✅ Build complete"
echo ""

# Step 2: Deploy
echo "🌐 Deploying to $NETWORK…"
CONTRACT_ADDRESS=$(soroban contract deploy \
  --wasm "$WASM_PATH" \
  --source "$KEY" \
  --network "$NETWORK")

echo "   ✅ Deployed!"
echo "   Contract address: $CONTRACT_ADDRESS"
echo ""

# Step 3: Initialize
ADMIN_ADDRESS="$(soroban keys address "$KEY" 2>/dev/null || true)"
if [[ -z "$ADMIN_ADDRESS" ]]; then
  echo "⚠️  Unable to resolve admin address from key '$KEY'; skipping initialization"
else
  echo "⚙️  Initializing contract…"
  soroban contract invoke \
    --id "$CONTRACT_ADDRESS" \
    --source "$KEY" \
    --network "$NETWORK" \
    -- initialize \
    --admin "$ADMIN_ADDRESS"
  echo "   ✅ Initialized"
fi

echo "==========================================="
echo "✅ Deployment complete!"
echo ""
echo "Add this to your .env files:"
echo "  CONTRACT_ADDRESS=$CONTRACT_ADDRESS"
echo "  NEXT_PUBLIC_CONTRACT_ADDRESS=$CONTRACT_ADDRESS"
echo ""
echo "TODO: Update backend/.env and frontend/.env.local with the above values"
