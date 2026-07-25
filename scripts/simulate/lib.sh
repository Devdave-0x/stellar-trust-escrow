#!/usr/bin/env bash
# scripts/simulate/lib.sh
#
# Shared helpers sourced by every simulation script.
# Do not execute this file directly.

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_step()    { echo -e "\n${CYAN}${BOLD}▶ $*${NC}"; }
log_ok()      { echo -e "  ${GREEN}✔ $*${NC}"; }
log_info()    { echo -e "  ${YELLOW}ℹ $*${NC}"; }
log_result()  { echo -e "  ${BOLD}→ $*${NC}"; }
log_error()   { echo -e "\n${RED}✖ ERROR: $*${NC}" >&2; exit 1; }
log_banner()  {
    local title="$1"
    echo -e "\n${BOLD}${CYAN}══════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${CYAN}  $title${NC}"
    echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════${NC}"
}

# ── Stellar CLI wrapper ───────────────────────────────────────────────────────
# Prefer the `stellar` CLI (v20+) but fall back to `soroban` for older installs.
if command -v stellar &>/dev/null; then
    SOROBAN_BIN="stellar"
elif command -v soroban &>/dev/null; then
    SOROBAN_BIN="soroban"
else
    log_error "Neither 'stellar' nor 'soroban' CLI found. Install with: cargo install --locked stellar-cli"
fi

NETWORK="${SOROBAN_NETWORK:-testnet}"
RPC_URL="${SOROBAN_RPC_URL:-https://soroban-testnet.stellar.org}"
PASSPHRASE="${SOROBAN_NETWORK_PASSPHRASE:-Test SDF Network ; September 2015}"

# Generate a random identity name so parallel script runs don't collide.
_rand_suffix() { head -c 6 /dev/urandom | base64 | tr -dc 'a-z0-9' | head -c 6; }

# ── Account helpers ───────────────────────────────────────────────────────────

# generate_and_fund <identity-name>
# Creates a new key-pair, stores it in the Stellar CLI keystore, and funds it
# from Friendbot. Prints the public key.
generate_and_fund() {
    local name="$1"
    $SOROBAN_BIN keys generate --global "$name" --network "$NETWORK" --fund 2>/dev/null \
        || $SOROBAN_BIN keys generate --global "$name" 2>/dev/null && fund_account "$name"
    $SOROBAN_BIN keys address "$name"
}

# fund_account <identity-name>
# Calls Friendbot to airdrop XLM to the account.
fund_account() {
    local name="$1"
    local addr
    addr=$($SOROBAN_BIN keys address "$name")
    local fb_url="https://friendbot.stellar.org?addr=${addr}"
    curl -s --retry 5 --retry-delay 2 "$fb_url" -o /dev/null \
        && log_ok "Funded ${name} (${addr})" \
        || log_error "Friendbot failed for ${addr}"
}

# ── Contract helpers ──────────────────────────────────────────────────────────

# build_contract
# Compiles the escrow contract WASM. Skips if already built.
build_contract() {
    local wasm_path="contracts/escrow_contract/target/wasm32-unknown-unknown/release/stellar_trust_escrow_contract.wasm"
    if [[ -f "$wasm_path" ]]; then
        log_info "WASM already built — skipping rebuild"
    else
        log_step "Building escrow contract WASM…"
        cargo build -p stellar-trust-escrow-contract \
              --target wasm32-unknown-unknown \
              --release \
              --quiet
        log_ok "WASM built"
    fi
    echo "$wasm_path"
}

# deploy_contract <source-identity> <wasm-path>
# Uploads + deploys the contract and returns the contract ID.
deploy_contract() {
    local source="$1"
    local wasm_path="$2"

    local wasm_hash
    wasm_hash=$($SOROBAN_BIN contract upload \
        --source-account "$source" \
        --network         "$NETWORK" \
        --wasm            "$wasm_path" \
        2>/dev/null)

    local contract_id
    contract_id=$($SOROBAN_BIN contract deploy \
        --source-account "$source" \
        --network         "$NETWORK" \
        --wasm-hash       "$wasm_hash" \
        2>/dev/null)

    echo "$contract_id"
}

# invoke <source> <contract-id> <fn> [args...]
# Thin wrapper around `stellar contract invoke` that forwards all extra args.
invoke() {
    local source="$1"; shift
    local contract_id="$1"; shift
    local fn="$1"; shift

    $SOROBAN_BIN contract invoke \
        --source-account "$source" \
        --network         "$NETWORK" \
        --id              "$contract_id" \
        --               "$fn" "$@" 2>/dev/null
}

# ── Token helpers ─────────────────────────────────────────────────────────────

# deploy_token <source-identity>
# Deploys the native XLM Stellar Asset Contract on testnet and returns the SAC address.
deploy_token() {
    local source="$1"
    $SOROBAN_BIN contract asset deploy \
        --source-account "$source" \
        --network         "$NETWORK" \
        --asset           native \
        2>/dev/null || true

    # Retrieve the deterministic address of the native SAC
    $SOROBAN_BIN contract id asset \
        --source-account "$source" \
        --network         "$NETWORK" \
        --asset           native \
        2>/dev/null
}

# token_balance <source> <token-id> <address>
token_balance() {
    local source="$1"
    local token_id="$2"
    local addr="$3"
    invoke "$source" "$token_id" balance --id "$addr" 2>/dev/null || echo "0"
}

# ── Hash helper ───────────────────────────────────────────────────────────────

# A deterministic 32-byte hex string used as a placeholder brief/description hash.
DUMMY_HASH="0000000000000000000000000000000000000000000000000000000000000001"

# ── Timing ───────────────────────────────────────────────────────────────────

# elapsed_seconds <start-timestamp>
elapsed_seconds() {
    echo $(( $(date +%s) - $1 ))
}
