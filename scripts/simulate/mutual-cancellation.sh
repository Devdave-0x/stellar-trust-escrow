#!/usr/bin/env bash
# scripts/simulate/mutual-cancellation.sh
#
# Scenario: Mutual Cancellation by Both Parties
# ──────────────────────────────────────────────
# Demonstrates the cooperative cancellation flow where both the client and the
# freelancer agree to cancel the escrow before any milestones are completed:
#
#   1. Generate accounts (admin, client, freelancer) and fund via Friendbot
#   2. Deploy native XLM SAC and escrow contract; initialize
#   3. Create an escrow (100 XLM) with one milestone
#   4. Client requests cancellation with a reason
#   5. Freelancer (counterparty) explicitly approves the cancellation
#   6. Anyone executes the cancellation immediately (no dispute window required
#      when both parties have consented)
#   7. Verify remaining funds are returned to the requester (client)
#
# Design note:
#   When counterparty_approved = true, execute_cancellation skips the
#   CANCELLATION_DISPUTE_PERIOD check and settles immediately.  This lets both
#   parties exit cleanly without waiting for the 24-hour dispute window.
#
# Usage:
#   bash scripts/simulate/mutual-cancellation.sh
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
log_banner "Mutual Cancellation Simulation"

# ── Step 1: Generate & fund accounts ─────────────────────────────────────────
log_step "Step 1 — Generate accounts and fund via Friendbot"

SUFFIX=$(_rand_suffix)
ADMIN_ID="sim-mc-admin-${SUFFIX}"
CLIENT_ID="sim-mc-client-${SUFFIX}"
FREELANCER_ID="sim-mc-freelancer-${SUFFIX}"

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

# ── Step 5: Create escrow ─────────────────────────────────────────────────────
log_step "Step 5 — Create escrow (100 XLM, no arbiter, no deadline)"

TOTAL_AMOUNT=1000000000  # 100 XLM in stroops

ESCROW_ID=$(invoke "$CLIENT_ID" "$CONTRACT_ID" create_escrow \
    --client      "$CLIENT_ADDR" \
    --freelancer  "$FREELANCER_ADDR" \
    --token       "$TOKEN_ID" \
    --total_amount "$TOTAL_AMOUNT" \
    --brief_hash  "$DUMMY_HASH" \
    --arbiter     "null" \
    --deadline    "null" \
    --lock_time   "null" \
    --multisig_config '{"approvers":[],"weights":[],"threshold":0}')

log_result "Escrow ID: ${ESCROW_ID}"
log_ok "Escrow created — ${TOTAL_AMOUNT} stroops locked"

# ── Step 6: Add a milestone ───────────────────────────────────────────────────
log_step "Step 6 — Add a milestone (100 XLM)"

MILESTONE_ID=$(invoke "$CLIENT_ID" "$CONTRACT_ID" add_milestone \
    --caller           "$CLIENT_ADDR" \
    --escrow_id        "$ESCROW_ID" \
    --title            '"Project Kickoff"' \
    --description_hash "$DUMMY_HASH" \
    --amount           "$TOTAL_AMOUNT")

log_result "Milestone ID: ${MILESTONE_ID}"
log_ok "Milestone added — neither party has submitted or approved work yet"

# ── Step 7: Client requests cancellation ──────────────────────────────────────
log_step "Step 7 — Client requests cancellation"
# request_cancellation(caller, escrow_id, reason) moves the escrow to CancellationPending.
CANCEL_REASON='"Project scope changed — both parties agree to exit"'

invoke "$CLIENT_ID" "$CONTRACT_ID" request_cancellation \
    --caller    "$CLIENT_ADDR" \
    --escrow_id "$ESCROW_ID" \
    --reason    "$CANCEL_REASON"

log_ok "Cancellation requested by client"
log_info "Escrow status is now CancellationPending"
log_info "Without freelancer approval, a CANCELLATION_DISPUTE_PERIOD must elapse before execution"

# ── Step 8: Freelancer approves the cancellation ──────────────────────────────
log_step "Step 8 — Freelancer approves the cancellation (mutual consent)"
# client_approve_cancellation is called by the counterparty (freelancer in this case)
# to set counterparty_approved = true, enabling immediate execution.
invoke "$FREELANCER_ID" "$CONTRACT_ID" client_approve_cancellation \
    --caller    "$FREELANCER_ADDR" \
    --escrow_id "$ESCROW_ID"

log_ok "Freelancer approved the cancellation"
log_info "counterparty_approved = true → dispute window is bypassed"

# ── Step 9: Execute the cancellation ──────────────────────────────────────────
log_step "Step 9 — Execute cancellation immediately (no wait required)"
# execute_cancellation takes only escrow_id — no auth since counterparty has consented.
invoke "$CLIENT_ID" "$CONTRACT_ID" execute_cancellation \
    --escrow_id "$ESCROW_ID"

log_ok "Cancellation executed — remaining balance returned to requester (client)"

# ── Step 10: Verify final balances ────────────────────────────────────────────
log_step "Step 10 — Verify final balances"

CLIENT_BAL=$(token_balance "$ADMIN_ID" "$TOKEN_ID" "$CLIENT_ADDR")
log_result "Client balance:     ${CLIENT_BAL} stroops (expected ≈ initial + refund)"

FREELANCER_BAL=$(token_balance "$ADMIN_ID" "$TOKEN_ID" "$FREELANCER_ADDR")
log_result "Freelancer balance: ${FREELANCER_BAL} stroops (no payment — no work approved)"

CONTRACT_BAL=$(token_balance "$ADMIN_ID" "$TOKEN_ID" "$CONTRACT_ID")
log_result "Contract balance:   ${CONTRACT_BAL} stroops (expected 0)"

if [[ "$CONTRACT_BAL" == "0" || "$CONTRACT_BAL" == '"0"' ]]; then
    log_ok "Contract holds zero — all funds settled"
else
    log_info "Contract retains ${CONTRACT_BAL} stroops (platform fee / slash reserve)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
ELAPSED=$(elapsed_seconds "$START_TS")
echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Mutual-Cancellation simulation COMPLETE in ${ELAPSED}s${NC}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════${NC}"
echo ""
echo "  Contract:   ${CONTRACT_ID}"
echo "  Escrow ID:  ${ESCROW_ID}"
echo "  Token SAC:  ${TOKEN_ID}"
echo "  Outcome:    Cancelled by mutual consent — full refund to client"
echo ""
echo "  Accounts (testnet — do NOT reuse private keys in production):"
echo "    Admin      ${ADMIN_ADDR}"
echo "    Client     ${CLIENT_ADDR}"
echo "    Freelancer ${FREELANCER_ADDR}"
echo ""
echo "  Inspect on Stellar Expert:"
echo "  https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}"
echo ""
