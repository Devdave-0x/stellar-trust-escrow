#!/usr/bin/env bash
# scripts/simulate/dispute-resolution.sh
#
# Scenario: Dispute Raised → Arbiter Rules in Buyer's (Client's) Favour
# ──────────────────────────────────────────────────────────────────────
# Demonstrates the full arbiter dispute flow:
#
#   1. Generate four accounts (admin, client, freelancer, arbiter) via Friendbot
#   2. Deploy native XLM SAC and escrow contract; initialize
#   3. Create an escrow (100 XLM) with an arbiter and one milestone (100 XLM)
#   4. Freelancer submits the milestone
#   5. Client raises a dispute (dissatisfied with the delivery)
#   6. Arbiter resolves in the client's favour: 100% refunded to client
#   7. Verify final balances — client recovers funds, freelancer receives nothing
#
# Usage:
#   bash scripts/simulate/dispute-resolution.sh
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
log_banner "Dispute Resolution Simulation (Arbiter Rules for Client)"

# ── Step 1: Generate & fund accounts ─────────────────────────────────────────
log_step "Step 1 — Generate accounts and fund via Friendbot"

SUFFIX=$(_rand_suffix)
ADMIN_ID="sim-dr-admin-${SUFFIX}"
CLIENT_ID="sim-dr-client-${SUFFIX}"
FREELANCER_ID="sim-dr-freelancer-${SUFFIX}"
ARBITER_ID="sim-dr-arbiter-${SUFFIX}"

ADMIN_ADDR=$(generate_and_fund "$ADMIN_ID")
log_result "Admin:      ${ADMIN_ADDR}"

CLIENT_ADDR=$(generate_and_fund "$CLIENT_ID")
log_result "Client:     ${CLIENT_ADDR}"

FREELANCER_ADDR=$(generate_and_fund "$FREELANCER_ID")
log_result "Freelancer: ${FREELANCER_ADDR}"

ARBITER_ADDR=$(generate_and_fund "$ARBITER_ID")
log_result "Arbiter:    ${ARBITER_ADDR}"
log_ok "All accounts funded"

# ── Step 2: Deploy native XLM SAC ────────────────────────────────────────────
log_step "Step 2 — Deploy native XLM Stellar Asset Contract (SAC)"

TOKEN_ID=$(deploy_token "$ADMIN_ID")
log_result "Token (native XLM SAC): ${TOKEN_ID}"
log_ok "Native SAC ready"

# ── Step 3: Build & deploy the escrow contract ────────────────────────────────
log_step "Step 3 — Build and deploy the escrow contract"

WASM_PATH=$(build_contract)
CONTRACT_ID=$(deploy_contract "$ADMIN_ID" "$WASM_PATH")
log_result "Contract ID: ${CONTRACT_ID}"
log_ok "Contract deployed"

# ── Step 4: Initialize ───────────────────────────────────────────────────────
log_step "Step 4 — Initialize the contract"

invoke "$ADMIN_ID" "$CONTRACT_ID" initialize \
    --admin "$ADMIN_ADDR"
log_ok "Contract initialized"

invoke "$ADMIN_ID" "$CONTRACT_ID" set_platform_treasury \
    --caller   "$ADMIN_ADDR" \
    --treasury "$ADMIN_ADDR"
log_ok "Platform treasury set"

# Approve the arbiter address on-chain so the contract validates it.
invoke "$ADMIN_ID" "$CONTRACT_ID" add_approved_arbiter \
    --caller  "$ADMIN_ADDR" \
    --arbiter "$ARBITER_ADDR"
log_ok "Arbiter ${ARBITER_ADDR} added to approved list"

# ── Step 5: Create escrow with arbiter ───────────────────────────────────────
log_step "Step 5 — Create escrow (100 XLM) with arbiter assigned"

TOTAL_AMOUNT=1000000000  # 100 XLM in stroops

ESCROW_ID=$(invoke "$CLIENT_ID" "$CONTRACT_ID" create_escrow \
    --client     "$CLIENT_ADDR" \
    --freelancer "$FREELANCER_ADDR" \
    --token      "$TOKEN_ID" \
    --total_amount "$TOTAL_AMOUNT" \
    --brief_hash "$DUMMY_HASH" \
    --arbiter    "$ARBITER_ADDR" \
    --deadline   "null" \
    --lock_time  "null" \
    --multisig_config '{"approvers":[],"weights":[],"threshold":0}')

log_result "Escrow ID: ${ESCROW_ID}"
log_ok "Escrow created — ${TOTAL_AMOUNT} stroops locked, arbiter = ${ARBITER_ADDR}"

# ── Step 6: Add one milestone covering the full amount ───────────────────────
log_step "Step 6 — Add a single milestone (100 XLM)"

MILESTONE_ID=$(invoke "$CLIENT_ID" "$CONTRACT_ID" add_milestone \
    --caller           "$CLIENT_ADDR" \
    --escrow_id        "$ESCROW_ID" \
    --title            '"Full Delivery"' \
    --description_hash "$DUMMY_HASH" \
    --amount           "$TOTAL_AMOUNT")

log_result "Milestone ID: ${MILESTONE_ID}  (${TOTAL_AMOUNT} stroops)"
log_ok "Milestone added"

# ── Step 7: Freelancer submits work ──────────────────────────────────────────
log_step "Step 7 — Freelancer submits the milestone"

invoke "$FREELANCER_ID" "$CONTRACT_ID" submit_milestone \
    --caller      "$FREELANCER_ADDR" \
    --escrow_id   "$ESCROW_ID" \
    --milestone_id "$MILESTONE_ID"
log_ok "Milestone submitted by freelancer"

# ── Step 8: Client raises a dispute ──────────────────────────────────────────
log_step "Step 8 — Client raises a dispute on the milestone"
# Passing None for milestone_id raises the escrow-level dispute (funds frozen).
invoke "$CLIENT_ID" "$CONTRACT_ID" raise_dispute \
    --caller      "$CLIENT_ADDR" \
    --escrow_id   "$ESCROW_ID" \
    --milestone_id "null"
log_ok "Dispute raised — escrow status is now Disputed"
log_info "All funds are frozen pending arbiter resolution"

# ── Step 9: Arbiter rules entirely in client's favour ────────────────────────
log_step "Step 9 — Arbiter rules: 100% to client, 0% to freelancer"
# resolve_dispute(client_amount, freelancer_amount) — must sum to remaining_balance
CLIENT_RECEIVES=$TOTAL_AMOUNT
FREELANCER_RECEIVES=0

invoke "$ARBITER_ID" "$CONTRACT_ID" resolve_dispute \
    --caller            "$ARBITER_ADDR" \
    --escrow_id         "$ESCROW_ID" \
    --client_amount     "$CLIENT_RECEIVES" \
    --freelancer_amount "$FREELANCER_RECEIVES"
log_ok "Dispute resolved — ${CLIENT_RECEIVES} stroops refunded to client"
log_ok "Freelancer receives ${FREELANCER_RECEIVES} stroops"

# ── Step 10: Verify final balances ────────────────────────────────────────────
log_step "Step 10 — Verify final balances"

CLIENT_BAL=$(token_balance "$ADMIN_ID" "$TOKEN_ID" "$CLIENT_ADDR")
log_result "Client balance:     ${CLIENT_BAL} stroops (expected ≥ initial)"

FREELANCER_BAL=$(token_balance "$ADMIN_ID" "$TOKEN_ID" "$FREELANCER_ADDR")
log_result "Freelancer balance: ${FREELANCER_BAL} stroops (expected = initial funding only)"

CONTRACT_BAL=$(token_balance "$ADMIN_ID" "$TOKEN_ID" "$CONTRACT_ID")
log_result "Contract balance:   ${CONTRACT_BAL} stroops (expected 0)"

if [[ "$CONTRACT_BAL" == "0" || "$CONTRACT_BAL" == '"0"' ]]; then
    log_ok "Contract holds zero — all funds distributed"
else
    log_info "Contract retains ${CONTRACT_BAL} stroops (platform fee)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
ELAPSED=$(elapsed_seconds "$START_TS")
echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Dispute-Resolution simulation COMPLETE in ${ELAPSED}s${NC}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════${NC}"
echo ""
echo "  Contract:   ${CONTRACT_ID}"
echo "  Escrow ID:  ${ESCROW_ID}"
echo "  Token SAC:  ${TOKEN_ID}"
echo "  Outcome:    Arbiter ruled for client — full refund"
echo ""
echo "  Accounts (testnet — do NOT reuse private keys in production):"
echo "    Admin      ${ADMIN_ADDR}"
echo "    Client     ${CLIENT_ADDR}"
echo "    Freelancer ${FREELANCER_ADDR}"
echo "    Arbiter    ${ARBITER_ADDR}"
echo ""
echo "  Inspect on Stellar Expert:"
echo "  https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}"
echo ""
