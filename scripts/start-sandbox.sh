#!/bin/bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS=("escrow_contract" "insurance_contract")
FRONTEND_ENV_FILE="$ROOT_DIR/frontend/.env.local"
SANDBOX_RPC_URL="http://localhost:8000/soroban/rpc"
SANDBOX_PASSPHRASE="Standalone Network ; February 2017"

echo -e "${YELLOW}Starting local Stellar Quickstart (Soroban sandbox)...${NC}"
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d soroban-sandbox

echo -e "${YELLOW}Waiting for Soroban RPC to be ready...${NC}"
for i in {1..30}; do
  if curl -sf "$SANDBOX_RPC_URL" >/dev/null 2>&1; then
    echo -e "${GREEN}Soroban RPC is up${NC}"
    break
  fi
  sleep 2
  if [[ "$i" -eq 30 ]]; then
    echo -e "${RED}Soroban RPC did not become ready in time${NC}"
    exit 1
  fi
done

echo -e "${YELLOW}Generating dev keypair...${NC}"
KEYPAIR_JSON=$(soroban keys generate local-dev --network-passphrase "$SANDBOX_PASSPHRASE" --rpc-url "$SANDBOX_RPC_URL" 2>/dev/null || true)
if [[ -z "${KEYPAIR_JSON:-}" ]]; then
  echo -e "${YELLOW}Key 'local-dev' may already exist, fetching public key...${NC}"
  DEV_PUBLIC_KEY=$(soroban keys address local-dev)
else
  DEV_PUBLIC_KEY=$(echo "$KEYPAIR_JSON" | grep -E '"public_key"' | sed -E 's/.*"public_key"\s*:\s*"([^"]+)".*/\1/')
fi

if [[ -z "${DEV_PUBLIC_KEY:-}" ]]; then
  echo -e "${RED}Failed to determine dev public key${NC}"
  exit 1
fi

echo -e "${YELLOW}Funding dev account on sandbox...${NC}"
docker exec stellar-sandbox soroban lab fund --account "$DEV_PUBLIC_KEY" >/dev/null

ENV_FILE="$ROOT_DIR/.env.sandbox"
echo -e "${YELLOW}Writing sandbox backend env to $ENV_FILE...${NC}"
cat > "$ENV_FILE" <<EOF
SOROBAN_RPC_URL=$SANDBOX_RPC_URL
SOROBAN_NETWORK_PASSPHRASE=$SANDBOX_PASSPHRASE
STELLAR_SECRET_KEY=local-dev
EOF

export SOROBAN_RPC_URL="$SANDBOX_RPC_URL"
export SOROBAN_NETWORK_PASSPHRASE="$SANDBOX_PASSPHRASE"
export STELLAR_SECRET_KEY="local-dev"

DEPLOYED_ENV_FILE="$ROOT_DIR/.env.sandbox.deployed"
> "$DEPLOYED_ENV_FILE"

for contract in "${CONTRACTS[@]}"; do
  contract_path="$ROOT_DIR/contracts/$contract"
  if [[ ! -d "$contract_path" ]]; then
    echo -e "${YELLOW}Skipping missing contract directory $contract_path${NC}"
    continue
  fi

  echo -e "\n${YELLOW}Building and deploying $contract to sandbox...${NC}"
  (cd "$contract_path" && cargo build --release --target wasm32-unknown-unknown)

  wasm_path="$contract_path/target/wasm32-unknown-unknown/release/${contract}.wasm"
  hash=$(soroban contract upload \
    --source-account "$STELLAR_SECRET_KEY" \
    --rpc-url "$SOROBAN_RPC_URL" \
    --network-passphrase "$SOROBAN_NETWORK_PASSPHRASE" \
    --wasm "$wasm_path")

  contract_id=$(soroban contract deploy \
    --source-account "$STELLAR_SECRET_KEY" \
    --rpc-url "$SOROBAN_RPC_URL" \
    --network-passphrase "$SOROBAN_NETWORK_PASSPHRASE" \
    --wasm-hash "$hash")

  echo "${contract^^}_ID=$contract_id" >> "$DEPLOYED_ENV_FILE"

  soroban contract invoke \
    --source-account "$STELLAR_SECRET_KEY" \
    --rpc-url "$SOROBAN_RPC_URL" \
    --network-passphrase "$SOROBAN_NETWORK_PASSPHRASE" \
    --id "$contract_id" \
    -- initialize
done

echo -e "${YELLOW}Writing frontend Soroban env to $FRONTEND_ENV_FILE...${NC}"
mkdir -p "$(dirname "$FRONTEND_ENV_FILE")"

{
  echo "NEXT_PUBLIC_SOROBAN_RPC_URL=$SANDBOX_RPC_URL"
  echo "NEXT_PUBLIC_SOROBAN_NETWORK_PASSPHRASE=$SANDBOX_PASSPHRASE"
  if [[ -f "$DEPLOYED_ENV_FILE" ]]; then
    grep '_ID=' "$DEPLOYED_ENV_FILE" | sed 's/^/NEXT_PUBLIC_/' || true
  fi
} > "$FRONTEND_ENV_FILE"

echo -e "${GREEN}Local Soroban sandbox is ready.${NC}"
echo -e "${GREEN}Contracts deployed and frontend .env.local updated.${NC}"

