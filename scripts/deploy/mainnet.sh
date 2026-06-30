#!/usr/bin/env bash
# scripts/deploy/mainnet.sh — Deploy escrow_contract to Stellar Mainnet (Public Network)
#
# Required env vars:
#   ADMIN_SECRET_KEY   — Stellar secret key of the deploying admin account
#   ADMIN_ADDRESS      — Public key / strkey of the admin account
#
# Optional env vars:
#   NETWORK_RPC_URL    — Soroban RPC endpoint (default: Stellar mainnet)
#   PLATFORM_FEE_BPS   — Platform fee in basis points (default: 50)
#   CONTRACT_WASM      — Path to pre-built WASM (skips build step when set)
#
# WARNING: This deploys to the live Stellar Public Network.
# Ensure ADMIN_SECRET_KEY controls a funded account before running.

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
NETWORK_RPC_URL="${NETWORK_RPC_URL:-https://soroban-rpc.stellar.org}"
NETWORK_PASSPHRASE="${NETWORK_PASSPHRASE:-Public Global Stellar Network ; September 2015}"
PLATFORM_FEE_BPS="${PLATFORM_FEE_BPS:-50}"
CONTRACT_DIR="contracts/escrow_contract"
WASM_PATH="${CONTRACT_WASM:-${CONTRACT_DIR}/target/wasm32-unknown-unknown/release/escrow_contract.wasm}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ── Safety gate ───────────────────────────────────────────────────────────────
echo -e "${RED}WARNING: You are deploying to the Stellar PUBLIC NETWORK (mainnet).${NC}"
echo -e "${RED}This action is irreversible. Type 'yes' to proceed:${NC}"
read -r CONFIRM
if [[ "${CONFIRM}" != "yes" ]]; then
  echo "Aborted."
  exit 1
fi

# ── Validate required vars ────────────────────────────────────────────────────
for var in ADMIN_SECRET_KEY ADMIN_ADDRESS; do
  if [[ -z "${!var:-}" ]]; then
    echo -e "${RED}Error: $var is not set${NC}" >&2
    exit 1
  fi
done

echo -e "${YELLOW}=== StellarTrustEscrow — Mainnet Deployment ===${NC}"
echo "RPC URL        : ${NETWORK_RPC_URL}"
echo "Admin address  : ${ADMIN_ADDRESS}"
echo "Fee (bps)      : ${PLATFORM_FEE_BPS}"

# ── 1. Build ──────────────────────────────────────────────────────────────────
if [[ -z "${CONTRACT_WASM:-}" ]]; then
  echo -e "\n${YELLOW}[1/4] Building WASM...${NC}"
  (cd "${CONTRACT_DIR}" && cargo build --release --target wasm32-unknown-unknown --quiet)
  echo -e "${GREEN}Build complete: ${WASM_PATH}${NC}"
else
  echo -e "\n${YELLOW}[1/4] Using pre-built WASM: ${WASM_PATH}${NC}"
fi

# ── 2. Upload ─────────────────────────────────────────────────────────────────
echo -e "\n${YELLOW}[2/4] Uploading WASM to network...${NC}"
WASM_HASH=$(stellar contract upload \
  --source "${ADMIN_SECRET_KEY}" \
  --rpc-url "${NETWORK_RPC_URL}" \
  --network-passphrase "${NETWORK_PASSPHRASE}" \
  --wasm "${WASM_PATH}")
echo -e "${GREEN}WASM hash: ${WASM_HASH}${NC}"

# ── 3. Deploy (instantiate) ───────────────────────────────────────────────────
echo -e "\n${YELLOW}[3/4] Deploying contract instance...${NC}"
CONTRACT_ID=$(stellar contract deploy \
  --source "${ADMIN_SECRET_KEY}" \
  --rpc-url "${NETWORK_RPC_URL}" \
  --network-passphrase "${NETWORK_PASSPHRASE}" \
  --wasm-hash "${WASM_HASH}")
echo -e "${GREEN}Contract ID: ${CONTRACT_ID}${NC}"

# ── 4. Initialize ─────────────────────────────────────────────────────────────
echo -e "\n${YELLOW}[4/4] Calling initialize()...${NC}"
stellar contract invoke \
  --source "${ADMIN_SECRET_KEY}" \
  --rpc-url "${NETWORK_RPC_URL}" \
  --network-passphrase "${NETWORK_PASSPHRASE}" \
  --id "${CONTRACT_ID}" \
  -- initialize \
  --admin "${ADMIN_ADDRESS}"

echo -e "${GREEN}Contract initialized.${NC}"

# ── Post-deploy smoke test ────────────────────────────────────────────────────
echo -e "\n${YELLOW}[Smoke Test] Calling get_version()...${NC}"
VERSION=$(stellar contract invoke \
  --source "${ADMIN_SECRET_KEY}" \
  --rpc-url "${NETWORK_RPC_URL}" \
  --network-passphrase "${NETWORK_PASSPHRASE}" \
  --id "${CONTRACT_ID}" \
  -- get_version)
echo -e "${GREEN}Contract version: ${VERSION}${NC}"

echo -e "\n${YELLOW}[Smoke Test] Verifying admin...${NC}"
STORED_ADMIN=$(stellar contract invoke \
  --source "${ADMIN_SECRET_KEY}" \
  --rpc-url "${NETWORK_RPC_URL}" \
  --network-passphrase "${NETWORK_PASSPHRASE}" \
  --id "${CONTRACT_ID}" \
  -- get_admin)
echo -e "${GREEN}Admin: ${STORED_ADMIN}${NC}"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}=== Mainnet Deployment Complete ===${NC}"
echo "CONTRACT_ID=${CONTRACT_ID}"
echo "WASM_HASH=${WASM_HASH}"
echo "VERSION=${VERSION}"

# Write deployment record
DEPLOY_RECORD="deployments/mainnet-$(date +%Y%m%d-%H%M%S).env"
mkdir -p deployments
{
  echo "NETWORK=mainnet"
  echo "CONTRACT_ID=${CONTRACT_ID}"
  echo "WASM_HASH=${WASM_HASH}"
  echo "VERSION=${VERSION}"
  echo "ADMIN_ADDRESS=${ADMIN_ADDRESS}"
  echo "DEPLOYED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "${DEPLOY_RECORD}"
echo -e "${GREEN}Deployment record saved: ${DEPLOY_RECORD}${NC}"
