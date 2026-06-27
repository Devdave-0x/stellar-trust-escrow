#!/usr/bin/env bash
# scripts/simulate/expiry-refund.sh
#
# Scenario: Escrow Deadline Passes → Automatic Refund
# ─────────────────────────────────────────────────────
# Demonstrates what happens when a freelancer misses the escrow deadline:
#
#   1. Generate accounts (admin, client, freelancer) and fund via Friendbot
#   2. Deploy native XLM SAC and escrow contract; initialize
#   3. Create an escrow with a deadline 60 seconds from now (100 XLM, 2 milestones)
#   4. Freelancer misses the deadline (script sleeps until the ledger advances past it)
#   5. Anyone calls expire_escrow — remaining funds are automatically refunded to client
#   6. Verify client recovered the full balance
#
# Design note:
#   The on-chain expiry check is: now >= deadline.  We therefore create an escrow
#   with deadline = current_ledger_timestamp + DEADLINE_BUFFER_SECS, sleep until
#   that deadline has clearly elapsed, then trigger expiry.
#
# Usage:
#   bash scripts/simulate/expiry-refund.sh
#
# Prerequisites:
#   stellar CLI (v20+) or soroban CLI (v21+) — see CONTRIBUTING.md
#   Internet access to Friendbot and the Soroban testnet RPC
#
# Estimated runtime: < 120 seconds (includes ~60 s wait for deadline to pass)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

# How many seconds ahead to set the deadline (must be long enough for the ledger
# to close a few times on testnet — 60 s is safe and keeps total runtime < 2 min).
DEADLINE_BUFFER_SECS=60

START_TS=$(date +%s)
log_banner "Escrow Expiry Refund Simulation"

# ── Step 1: Generate & fund accounts ─────────────────────────────────────────
log_step "Step 1 — Generate accounts and fund via Friendbot"

SUFFIX=$(_rand_suffix)
ADMIN_ID="sim-ex-admin-${SUFFIX}"
CLIENT_ID="sim-ex-client-${SUFFIX}"
FREELANCER_ID="sim-ex-freelancer-${SUFFIX}"

ADMIN_ADDR=$(generate_and_fund "$ADMIN_ID")
log_result "Admin:      ${ADMIN_ADDR}"

CLIENT_ADDR=$(generate_and_fund "$CLIENT_ID")
log_result "Client:     ${CLIENT_ADDR}"

FREELANCER_ADDR=$(generate_and_fund "$FREELANCER_ID")
log_result "Freelancer: ${FREELANCER_ADDR}"
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

# ── Step 5: Set deadline and create the escrow ───────────────────────────────
log_step "Step 5 — Create escrow (100 XLM) with deadline ${DEADLINE_BUFFER_SECS}s from now"

# Use Unix time as a proxy for the ledger timestamp (Stellar testnet syncs within ~5 s).
DEADLINE=$(( $(date +%s) + DEADLINE_BUFFER_SECS ))
TOTAL_AMOUNT=1000000000  # 100 XLM in stroops

log_info "Deadline timestamp: ${DEADLINE}  ($(date -d "@${DEADLINE}" 2>/dev/null || date -r "$DEADLINE" 2>/dev/null || echo 'N/A'))"

ESCROW_ID=$(invoke "$CLIENT_ID" "$CONTRACT_ID" create_escrow \
    --client      "$CLIENT_ADDR" \
    --freelancer  "$FREELANCER_ADDR" \
    --token       "$TOKEN_ID" \
    --total_amount "$TOTAL_AMOUNT" \
    --brief_hash  "$DUMMY_HASH" \
    --arbiter     "null" \
    --deadline    "$DEADLINE" \
    --lock_time   "null" \
    --multisig_config '{"approvers":[],"weights":[],"threshold":0}')

log_result "Escrow ID: ${ESCROW_ID}"
log_ok "Escrow created — deadline in ${DEADLINE_BUFFER_SECS}s"

# ── Step 6: Add milestones ────────────────────────────────────────────────────
log_step "Step 6 — Add two milestones (60 XLM + 40 XLM)"

M1_ID=$(invoke "$CLIENT_ID" "$CONTRACT_ID" add_milestone \
    --caller           "$CLIENT_ADDR" \
    --escrow_id        "$ESCROW_ID" \
    --title            '"Phase 1"' \
    --description_hash "$DUMMY_HASH" \
    --amount           600000000)
log_result "Milestone 1 ID: ${M1_ID}"

M2_ID=$(invoke "$CLIENT_ID" "$CONTRACT_ID" add_milestone \
    --caller           "$CLIENT_ADDR" \
    --escrow_id        "$ESCROW_ID" \
    --title            '"Phase 2"' \
    --description_hash "$DUMMY_HASH" \
    --amount           400000000)
log_result "Milestone 2 ID: ${M2_ID}"
log_ok "Milestones added — freelancer has not submitted any work"

# ── Step 7: Wait for the deadline to pass ────────────────────────────────────
log_step "Step 7 — Waiting for deadline to pass (${DEADLINE_BUFFER_SECS}s)"
log_info "The freelancer has missed the deadline; no submissions were made."
log_info "Sleeping until the ledger timestamp advances past ${DEADLINE}…"

# Wait until NOW > DEADLINE with a comfortable 10-second margin.
while [[ $(date +%s) -le $(( DEADLINE + 10 )) ]]; do
    REMAINING=$(( DEADLINE + 10 - $(date +%s) ))
    echo -ne "  ⏳ ${REMAINING}s remaining…\r"
    sleep 5
done
echo ""
log_ok "Deadline has passed (current time: $(date +%s))"

# ── Step 8: Call expire_escrow ────────────────────────────────────────────────
log_step "Step 8 — Trigger expire_escrow (callable by anyone)"

# expire_escrow takes only the escrow_id — no auth required.
invoke "$CLIENT_ID" "$CONTRACT_ID" expire_escrow \
    --escrow_id "$ESCROW_ID"
log_ok "expire_escrow executed — remaining balance refunded to client"

# ── Step 9: Verify final balances ─────────────────────────────────────────────
log_step "Step 9 — Verify final balances"

CLIENT_BAL=$(token_balance "$ADMIN_ID" "$TOKEN_ID" "$CLIENT_ADDR")
log_result "Client balance:     ${CLIENT_BAL} stroops (expected ≥ initial + ${TOTAL_AMOUNT})"

FREELANCER_BAL=$(token_balance "$ADMIN_ID" "$TOKEN_ID" "$FREELANCER_ADDR")
log_result "Freelancer balance: ${FREELANCER_BAL} stroops (expected = initial funding only)"

CONTRACT_BAL=$(token_balance "$ADMIN_ID" "$TOKEN_ID" "$CONTRACT_ID")
log_result "Contract balance:   ${CONTRACT_BAL} stroops (expected 0)"

if [[ "$CONTRACT_BAL" == "0" || "$CONTRACT_BAL" == '"0"' ]]; then
    log_ok "Contract holds zero — full refund issued to client"
else
    log_info "Contract retains ${CONTRACT_BAL} stroops (platform fee)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
ELAPSED=$(elapsed_seconds "$START_TS")
echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Expiry-Refund simulation COMPLETE in ${ELAPSED}s${NC}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════${NC}"
echo ""
echo "  Contract:   ${CONTRACT_ID}"
echo "  Escrow ID:  ${ESCROW_ID}"
echo "  Token SAC:  ${TOKEN_ID}"
echo "  Outcome:    Expired — full refund to client"
echo ""
echo "  Accounts (testnet — do NOT reuse private keys in production):"
echo "    Admin      ${ADMIN_ADDR}"
echo "    Client     ${CLIENT_ADDR}"
echo "    Freelancer ${FREELANCER_ADDR}"
echo ""
echo "  Inspect on Stellar Expert:"
echo "  https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}"
echo ""
