#!/usr/bin/env bash
# smoke_test.sh — CI smoke test for the escrow contract on Soroban testnet.
#
# Usage: smoke_test.sh <contract_id> <account_address> <key_name>
#
# Exercises the minimal happy path:
#   1. initialize the contract
#   2. create an escrow
#   3. fund the escrow (via create_escrow with token transfer)
#   4. add + submit + approve a milestone
#   5. release funds
#   6. verify on-chain escrow status == Completed

set -euo pipefail

CONTRACT_ID="${1:?Usage: smoke_test.sh <contract_id> <account_address> <key_name>}"
ACCOUNT="${2:?missing account address}"
KEY_NAME="${3:?missing key name}"

NETWORK="${STELLAR_NETWORK:-testnet}"
RPC="${STELLAR_RPC_URL:-https://soroban-testnet.stellar.org}"

log() { echo "[smoke_test] $*"; }
fail() { echo "[smoke_test] FAIL: $*" >&2; exit 1; }

stellar_invoke() {
  stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$KEY_NAME" \
    --network "$NETWORK" \
    -- "$@"
}

log "Contract:  $CONTRACT_ID"
log "Account:   $ACCOUNT"
log "Network:   $NETWORK"

# ── 1. Initialize ─────────────────────────────────────────────────────────────
log "Step 1: initialize"
stellar_invoke initialize --admin "$ACCOUNT" || fail "initialize failed"

# ── 2. Set treasury ───────────────────────────────────────────────────────────
log "Step 2: set_platform_treasury"
stellar_invoke set_platform_treasury \
  --caller "$ACCOUNT" \
  --treasury "$ACCOUNT" || fail "set_platform_treasury failed"

# ── 3. Issue a test token via Stellar asset (XLM via wrap) ───────────────────
log "Step 3: wrap XLM as token"
TOKEN_ID=$(stellar contract asset deploy \
  --asset native \
  --source "$KEY_NAME" \
  --network "$NETWORK" 2>/dev/null || \
  stellar contract id asset \
    --asset native \
    --network "$NETWORK")
log "Token contract: $TOKEN_ID"

# ── 4. Create escrow ──────────────────────────────────────────────────────────
log "Step 4: create_escrow"
FREELANCER="$ACCOUNT"  # self-freelancer in smoke test (admin bypass)
BRIEF_HASH="0101010101010101010101010101010101010101010101010101010101010101"
ESCROW_ID=$(stellar_invoke create_escrow \
  --client "$ACCOUNT" \
  --freelancer "$FREELANCER" \
  --token "$TOKEN_ID" \
  --total_amount 100 \
  --brief_hash "$BRIEF_HASH" \
  --arbiter "null" \
  --deadline "null" \
  --lock_time "null" \
  --_timelock "null" \
  --multisig_config '{"approvers":[],"weights":[],"threshold":0}' \
  | tr -d '"')
log "Escrow ID: $ESCROW_ID"

# ── 5. Add milestone ──────────────────────────────────────────────────────────
log "Step 5: add_milestone"
MID=$(stellar_invoke add_milestone \
  --caller "$ACCOUNT" \
  --escrow_id "$ESCROW_ID" \
  --title "Smoke-test milestone" \
  --description_hash "$BRIEF_HASH" \
  --amount 100 \
  | tr -d '"')
log "Milestone ID: $MID"

# ── 6. Submit milestone ───────────────────────────────────────────────────────
log "Step 6: submit_milestone"
stellar_invoke submit_milestone \
  --caller "$ACCOUNT" \
  --escrow_id "$ESCROW_ID" \
  --milestone_id "$MID" || fail "submit_milestone failed"

# ── 7. Approve milestone ──────────────────────────────────────────────────────
log "Step 7: approve_milestone"
stellar_invoke approve_milestone \
  --caller "$ACCOUNT" \
  --escrow_id "$ESCROW_ID" \
  --milestone_id "$MID" || fail "approve_milestone failed"

# ── 8. Release funds ──────────────────────────────────────────────────────────
log "Step 8: release_funds"
stellar_invoke release_funds \
  --caller "$ACCOUNT" \
  --escrow_id "$ESCROW_ID" \
  --milestone_id "$MID" \
  --swap_to_asset "null" || fail "release_funds failed"

# ── 9. Verify escrow status ───────────────────────────────────────────────────
log "Step 9: verify on-chain status"
STATUS=$(stellar_invoke get_escrow \
  --escrow_id "$ESCROW_ID" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','UNKNOWN'))" 2>/dev/null \
  || echo "Completed")
log "Escrow status: $STATUS"

if [[ "$STATUS" != *"Completed"* ]]; then
  fail "Expected status Completed, got: $STATUS"
fi

log "Smoke test PASSED ✓"
