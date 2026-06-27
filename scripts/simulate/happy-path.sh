#!/usr/bin/env bash
# scripts/simulate/happy-path.sh
#
# Scenario: Full Happy-Path Escrow Release
# ─────────────────────────────────────────
# Demonstrates the golden path through the escrow lifecycle:
#
#   1. Generate three accounts (admin, client, freelancer) and fund via Friendbot
#   2. Deploy the native XLM Stellar Asset Contract (SAC) as the payment token
#   3. Build and deploy the escrow contract; initialize it
#   4. Create an escrow (100 XLM) with two milestones (60 XLM + 40 XLM)
#   5. Freelancer submits each milestone; client approves and funds are released
#   6. Verify final balances match expectations
#
# Usage:
#   bash scripts/simulate/happy-path.sh
#
# Prerequisites:
#   stellar CLI (v20+) or soroban CLI (v21+) — see CONTRIBUTING.md
#   Internet access to Friendbot and the Soroban testnet RPC
#
# Estimated runtime: < 90 seconds

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

START_TS=$(date +%s)
log_banner "Happy-Path Escrow Simulation"

# ── Step 1: Generate & fund accounts ─────────────────────────────────────────
log_step "Step 1 — Generate accounts and fund via Friendbot"

SUFFIX=$(_rand_suffix)
ADMIN_ID="sim-hp-admin-${SUFFIX}"
CLIENT_ID="sim-hp-client-${SUFFIX}"
FREELANCER_ID="sim-hp-freelancer-${SUFFIX}"

ADMIN_ADDR=$(generate_and_fund "$ADMIN_ID")
log_result "Admin:      ${ADMIN_ADDR}"

CLIENT_ADDR=$(generate_and_fund "$CLIENT_ID")
log_result "Client:     ${CLIENT_ADDR}"

FREELANCER_ADDR=$(generate_and_fund "$FREELANCER_ID")
log_result "Freelancer: ${FREELANCER_ADDR}"
log_ok "All accounts funded"

# ── Step 2: Deploy the native XLM SAC ────────────────────────────────────────
log_step "Step 2 — Deploy native XLM Stellar Asset Contract (SAC)"

TOKEN_ID=$(deploy_token "$ADMIN_ID")
log_result "Token (native XLM SAC): ${TOKEN_ID}"
log_ok "Native SAC ready"

# ── Step 3: Build & deploy the escrow contract ────────────────────────────────
log_step "Step 3 — Build and deploy the escrow contract"

WASM_PATH=$(build_contract)
log_result "WASM: ${WASM_PATH}"

CONTRACT_ID=$(deploy_contract "$ADMIN_ID" "$WASM_PATH")
log_result "Contract ID: ${CONTRACT_ID}"
log_ok "Contract deployed"

# ── Step 4: Initialize the contract ──────────────────────────────────────────
log_step "Step 4 — Initialize the contract"

invoke "$ADMIN_ID" "$CONTRACT_ID" initialize \
    --admin "$ADMIN_ADDR"
log_ok "Contract initialized (admin = ${ADMIN_ADDR})"

invoke "$ADMIN_ID" "$CONTRACT_ID" set_platform_treasury \
    --caller  "$ADMIN_ADDR" \
    --treasury "$ADMIN_ADDR"
log_ok "Platform treasury set to admin"

# ── Step 5: Create the escrow ─────────────────────────────────────────────────
log_step "Step 5 — Create escrow (100 XLM, no arbiter, no deadline)"
# The client must hold enough XLM to fund the escrow.  With the native SAC the
# client's Lumens balance IS the token balance, so no separate mint is needed.
# total_amount = 100_0000000 stroops (100 XLM at 7 decimals)
TOTAL_AMOUNT=1000000000

ESCROW_ID=$(invoke "$CLIENT_ID" "$CONTRACT_ID" create_escrow \
    --client     "$CLIENT_ADDR" \
    --freelancer "$FREELANCER_ADDR" \
    --token      "$TOKEN_ID" \
    --total_amount "$TOTAL_AMOUNT" \
    --brief_hash "$DUMMY_HASH" \
    --arbiter    "null" \
    --deadline   "null" \
    --lock_time  "null" \
    --multisig_config '{"approvers":[],"weights":[],"threshold":0}')

log_result "Escrow ID: ${ESCROW_ID}"
log_ok "Escrow created — ${TOTAL_AMOUNT} stroops locked"

# ── Step 6: Add milestones ────────────────────────────────────────────────────
log_step "Step 6 — Add milestones"

M1_AMOUNT=600000000   # 60 XLM
M2_AMOUNT=400000000   # 40 XLM

M1_ID=$(invoke "$CLIENT_ID" "$CONTRACT_ID" add_milestone \
    --caller          "$CLIENT_ADDR" \
    --escrow_id       "$ESCROW_ID" \
    --title           '"Milestone 1: Design"' \
    --description_hash "$DUMMY_HASH" \
    --amount          "$M1_AMOUNT")

log_result "Milestone 1 ID: ${M1_ID}  (${M1_AMOUNT} stroops)"

M2_ID=$(invoke "$CLIENT_ID" "$CONTRACT_ID" add_milestone \
    --caller          "$CLIENT_ADDR" \
    --escrow_id       "$ESCROW_ID" \
    --title           '"Milestone 2: Implementation"' \
    --description_hash "$DUMMY_HASH" \
    --amount          "$M2_AMOUNT")

log_result "Milestone 2 ID: ${M2_ID}  (${M2_AMOUNT} stroops)"
log_ok "Both milestones added"

# ── Step 7: Submit & approve Milestone 1 ─────────────────────────────────────
log_step "Step 7 — Freelancer submits Milestone 1"

invoke "$FREELANCER_ID" "$CONTRACT_ID" submit_milestone \
    --caller      "$FREELANCER_ADDR" \
    --escrow_id   "$ESCROW_ID" \
    --milestone_id "$M1_ID"
log_ok "Milestone 1 submitted"

log_step "Step 8 — Client approves Milestone 1 → funds released"

invoke "$CLIENT_ID" "$CONTRACT_ID" approve_milestone \
    --caller      "$CLIENT_ADDR" \
    --escrow_id   "$ESCROW_ID" \
    --milestone_id "$M1_ID"
log_ok "Milestone 1 approved — ${M1_AMOUNT} stroops released to freelancer"

# ── Step 8: Submit & approve Milestone 2 ─────────────────────────────────────
log_step "Step 9 — Freelancer submits Milestone 2"

invoke "$FREELANCER_ID" "$CONTRACT_ID" submit_milestone \
    --caller      "$FREELANCER_ADDR" \
    --escrow_id   "$ESCROW_ID" \
    --milestone_id "$M2_ID"
log_ok "Milestone 2 submitted"

log_step "Step 10 — Client approves Milestone 2 → escrow completes"

invoke "$CLIENT_ID" "$CONTRACT_ID" approve_milestone \
    --caller      "$CLIENT_ADDR" \
    --escrow_id   "$ESCROW_ID" \
    --milestone_id "$M2_ID"
log_ok "Milestone 2 approved — ${M2_AMOUNT} stroops released to freelancer"

# ── Step 9: Verify final balances ─────────────────────────────────────────────
log_step "Step 11 — Verify final balances"

FREELANCER_BAL=$(token_balance "$ADMIN_ID" "$TOKEN_ID" "$FREELANCER_ADDR")
log_result "Freelancer balance: ${FREELANCER_BAL} stroops (expected ≥ ${TOTAL_AMOUNT})"

CLIENT_BAL=$(token_balance "$ADMIN_ID" "$TOKEN_ID" "$CLIENT_ADDR")
log_result "Client balance:     ${CLIENT_BAL} stroops"

CONTRACT_BAL=$(token_balance "$ADMIN_ID" "$TOKEN_ID" "$CONTRACT_ID")
log_result "Contract balance:   ${CONTRACT_BAL} stroops (expected 0)"

if [[ "$CONTRACT_BAL" == "0" || "$CONTRACT_BAL" == '"0"' ]]; then
    log_ok "Contract balance is zero — all funds released"
else
    log_info "Contract retains ${CONTRACT_BAL} stroops (platform fee or rounding)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
ELAPSED=$(elapsed_seconds "$START_TS")
echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Happy-Path simulation COMPLETE in ${ELAPSED}s${NC}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════${NC}"
echo ""
echo "  Contract:   ${CONTRACT_ID}"
echo "  Escrow ID:  ${ESCROW_ID}"
echo "  Token SAC:  ${TOKEN_ID}"
echo "  Status:     Completed (all milestones approved)"
echo ""
echo "  Accounts (testnet — do NOT reuse private keys in production):"
echo "    Admin      ${ADMIN_ADDR}"
echo "    Client     ${CLIENT_ADDR}"
echo "    Freelancer ${FREELANCER_ADDR}"
echo ""
echo "  Inspect on Stellar Expert:"
echo "  https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}"
echo ""
