# Runbook: Relayer Account Funding

How to monitor and top up the transaction relayer account on testnet and production (mainnet), how to respond to low-balance alerts, and how to recover from funding the wrong network.

The relayer (`backend/services/relayerService.js`, routes in `backend/api/routes/relayerRoutes.js`) submits meta-transactions on behalf of users and **pays every transaction fee from its own XLM balance**. If the balance runs out, `/api/relayer/execute` fails and gasless flows stop.

## Contents

- [Background](#background)
- [Current capabilities and gaps](#current-capabilities-and-gaps)
- [Find the relayer account](#find-the-relayer-account)
- [Check the balance](#check-the-balance)
- [Thresholds](#thresholds)
- [Scheduled balance check](#scheduled-balance-check)
- [Top up: testnet](#top-up-testnet)
- [Top up: production](#top-up-production)
- [Alert response](#alert-response)
- [Rollback: wrong-network funding](#rollback-wrong-network-funding)
- [Related runbooks](#related-runbooks)

## Background

| Item                | Value                                                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signing key         | `RELAYER_SECRET_KEY` (env or Vault, see `backend/config/vault-setup.sh`)                                                                                                               |
| Network selection   | `STELLAR_NETWORK=mainnet` uses the public network passphrase and `horizon.stellar.org`; any other value uses testnet and `horizon-testnet.stellar.org`                                 |
| Contract            | `ESCROW_CONTRACT_ID`                                                                                                                                                                   |
| Fee per transaction | Horizon `fee_stats` p50 `fee_charged` plus a 1000 stroop buffer (`RELAYER_FEE_BUFFER`). Soroban resource fees come on top of this, so real spend per call is higher than the estimate. |
| Minimum balance     | Stellar base reserve: 2 × 0.5 XLM = **1 XLM**, plus 0.5 XLM per trustline, offer, or data entry. XLM below the reserve cannot be spent.                                                |
| Status endpoint     | `GET /api/relayer/status` (no auth) returns `status`, `network`, `contractId`, `relayerAddress`                                                                                        |

Use a **different keypair per network**. Reusing one secret on testnet and mainnet makes wrong-network mistakes harder to spot and riskier to recover from.

## Current capabilities and gaps

| Capability                           | Status                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Relayer status endpoint              | Available (`/api/relayer/status`).                                                             |
| Relayer execution errors metric      | Available: `errorsTotal{type="relayer_error"}` and `errorsTotal{type="fee_estimation_error"}`. |
| **Balance metric or built-in alert** | **Not implemented.** Use the [scheduled balance check](#scheduled-balance-check) below.        |
| **Automatic top-up**                 | **Not implemented.** Top-ups are manual.                                                       |

## Find the relayer account

```bash
# Replace the host with the environment you are checking
curl -sS https://api.example.com/api/relayer/status | jq .
```

```json
{
  "status": "active",
  "network": "mainnet",
  "contractId": "C...",
  "relayerAddress": "GRELAYER..."
}
```

- `status: "unconfigured"` means `RELAYER_SECRET_KEY` is not set in that environment.
- Confirm `network` is what you expect **before** sending funds. This is the main defence against wrong-network funding.

```bash
export RELAYER=$(curl -sS https://api.example.com/api/relayer/status | jq -r .relayerAddress)
export NETWORK=$(curl -sS https://api.example.com/api/relayer/status | jq -r .network)
```

## Check the balance

```bash
# Production (mainnet)
curl -sS "https://horizon.stellar.org/accounts/$RELAYER" \
  | jq -r '.balances[] | select(.asset_type=="native") | .balance'

# Testnet
curl -sS "https://horizon-testnet.stellar.org/accounts/$RELAYER" \
  | jq -r '.balances[] | select(.asset_type=="native") | .balance'
```

A `404` from Horizon means the account does not exist on that network (never funded, or funded on the other network).

Estimate daily spend from recent transactions the relayer paid for:

```bash
curl -sS "https://horizon.stellar.org/accounts/$RELAYER/transactions?order=desc&limit=200" \
  | jq '[._embedded.records[] | select(.fee_account=="'"$RELAYER"'") | (.fee_charged|tonumber)] | {tx_count: length, total_stroops: add, total_xlm: ((add // 0) / 10000000)}'
```

Compare the time span of those 200 records to the total to get XLM per day.

## Thresholds

Express production thresholds in **days of runway** (balance divided by average daily spend over the last 7 days), with absolute floors so a quiet week does not hide a low balance.

| Environment | Warning                                           | Critical                                         | Target after top-up                   |
| ----------- | ------------------------------------------------- | ------------------------------------------------ | ------------------------------------- |
| Production  | Runway under 14 days **or** balance under 500 XLM | Runway under 3 days **or** balance under 100 XLM | 30 days of runway, minimum 1,000 XLM  |
| Testnet     | Balance under 1,000 XLM                           | Balance under 100 XLM                            | 10,000 XLM (Friendbot limit per call) |

Review production thresholds each quarter or after any sustained change in traffic.

## Scheduled balance check

Until a balance metric exists, run this check every 15 minutes from cron or a CI schedule and route non-zero exits to the on-call channel.

```bash
#!/usr/bin/env bash
# relayer-balance-check.sh <status-url> <warn-xlm> <crit-xlm>
set -euo pipefail

STATUS_URL=$1
WARN=$2
CRIT=$3

status=$(curl -sS --fail "$STATUS_URL")
relayer=$(jq -r .relayerAddress <<<"$status")
network=$(jq -r .network <<<"$status")

if [ "$relayer" = "null" ]; then
  echo "CRITICAL: relayer unconfigured at $STATUS_URL"; exit 2
fi

if [ "$network" = "mainnet" ]; then
  horizon=https://horizon.stellar.org
else
  horizon=https://horizon-testnet.stellar.org
fi

balance=$(curl -sS --fail "$horizon/accounts/$relayer" \
  | jq -r '.balances[] | select(.asset_type=="native") | .balance')

if awk "BEGIN{exit !($balance < $CRIT)}"; then
  echo "CRITICAL: relayer $relayer on $network has $balance XLM (< $CRIT)"; exit 2
elif awk "BEGIN{exit !($balance < $WARN)}"; then
  echo "WARNING: relayer $relayer on $network has $balance XLM (< $WARN)"; exit 1
fi
echo "OK: relayer $relayer on $network has $balance XLM"
```

```bash
./relayer-balance-check.sh https://api.example.com/api/relayer/status 500 100
./relayer-balance-check.sh https://staging-api.example.com/api/relayer/status 1000 100
```

## Top up: testnet

Testnet XLM is free from Friendbot. Each call funds 10,000 XLM.

```bash
# 1. Confirm you are pointed at a testnet deployment
curl -sS https://staging-api.example.com/api/relayer/status | jq -r .network   # must NOT be "mainnet"

# 2. Fund
curl -sS "https://friendbot.stellar.org/?addr=$RELAYER" | jq -r .successful

# 3. Verify
curl -sS "https://horizon-testnet.stellar.org/accounts/$RELAYER" \
  | jq -r '.balances[] | select(.asset_type=="native") | .balance'
```

Testnet is periodically reset by SDF. After a reset the relayer account no longer exists (Horizon returns `404`) and must be funded again with Friendbot. Contracts must also be redeployed, so update `ESCROW_CONTRACT_ID` at the same time.

## Top up: production

Production top-ups move real funds and follow a two-person rule: one person prepares, a second verifies the destination and network before signing.

1. **Confirm the target.**

   ```bash
   curl -sS https://api.example.com/api/relayer/status | jq '{network, relayerAddress}'
   ```

   `network` must be `mainnet`. Copy `relayerAddress` from this output; never from chat or a ticket.

2. **Record the starting balance** (see [Check the balance](#check-the-balance)).
3. **Send XLM from the treasury account** using the Stellar CLI. `--amount` is in stroops (1 XLM = 10,000,000 stroops); the example sends 1,000 XLM.

   ```bash
   stellar tx new payment \
     --source-account treasury \
     --destination "$RELAYER" \
     --asset native \
     --amount 10000000000 \
     --network mainnet
   ```

   The treasury key must be a mainnet identity held by the signer (hardware wallet or offline signing preferred). Never top up from a personal account.

4. **Verify** the new balance on `horizon.stellar.org` and confirm the payment appears in `https://horizon.stellar.org/accounts/$RELAYER/payments?order=desc&limit=1`.
5. **Record** the transaction hash, amount, and both operators in the treasury log.

## Alert response

### Warning (low runway)

1. Confirm the balance and network with the commands above.
2. Estimate daily spend. If spend jumped, check for abuse before topping up: look at recent `/api/relayer/execute` volume per user and the `errorsTotal{type="relayer_error"}` rate.
3. Schedule a top-up within one business day.

### Critical (under the floor)

1. Top up immediately (testnet: Friendbot; production: [top-up procedure](#top-up-production)).
2. If spend is abnormal (a single user or signer dominates recent relayed transactions), treat it as abuse: rate-limit or block that caller at the gateway before refilling, otherwise the new funds drain too.
3. Post in the incident channel with balance before and after, and the cause.

### Relayer failing with an empty balance

Symptoms: `POST /api/relayer/execute` returns `400` with `tx_insufficient_balance` or `op_underfunded` in `error`, or Horizon returns `404` for the relayer account.

1. Top up as above.
2. No restart is needed: the relayer loads the account from Horizon on each request.
3. Ask clients to retry failed meta-transactions that have not passed their `deadline`. Expired ones must be re-signed by the user.

### Relayer unconfigured

`/api/relayer/status` returns `"status": "unconfigured"`: `RELAYER_SECRET_KEY` is missing. Restore it from Vault, then `pm2 reload stellar-escrow-api`.

## Rollback: wrong-network funding

Stellar payments are final and there is no chargeback. "Rollback" means sending the funds back from the account that received them, which is only possible if you hold that account's secret key. Stop and assess before sending anything else.

| What happened                                                                                 | Impact                                                                                         | Recovery                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production relayer funded via Friendbot / on testnet                                          | No funds lost; production relayer is still empty.                                              | Fund it correctly on mainnet. Nothing to reverse.                                                                                                                                                                                                                                                                                                      |
| Mainnet XLM sent to the **testnet** relayer's address                                         | Real XLM now sits on mainnet in an account whose key is your testnet relayer key.              | Using the **testnet** relayer secret, send the balance (minus 1 XLM reserve and fees) back to the treasury on **mainnet**, or merge the account into treasury: `stellar tx new account-merge --source-account <testnet-relayer-identity> --account <treasury-address> --network mainnet`. Then rotate that testnet key, as it now has mainnet history. |
| Mainnet XLM sent to an address you do not control (typo, wrong copy)                          | Funds are not recoverable by you.                                                              | Contact the owner of the address if known. File an incident and a post-mortem. Tighten the two-person check.                                                                                                                                                                                                                                           |
| Payment to a non-existent mainnet address with less than 1 XLM                                | Payment fails (`op_no_destination`); nothing moves.                                            | No rollback needed. Correct the destination and resend.                                                                                                                                                                                                                                                                                                |
| Backend running with the wrong `STELLAR_NETWORK` (for example production pointing at testnet) | Relayed transactions go to the wrong network; `/api/relayer/status` shows the wrong `network`. | Fix `STELLAR_NETWORK` (and `ESCROW_CONTRACT_ID` / `RELAYER_SECRET_KEY` if they were swapped too), `pm2 reload stellar-escrow-api`, then re-check `/api/relayer/status`. Transactions already submitted to the wrong network cannot be moved; users must resubmit.                                                                                      |

After any wrong-network event:

1. Verify both relayers with `/api/relayer/status` and Horizon.
2. Confirm testnet and mainnet use different relayer keypairs; rotate if they do not (`docs/runbook.md` section 3.5).
3. Record the incident using `docs/incidents/templates/post-mortem.md`.

## Related runbooks

- Relayer key rotation: `docs/runbook.md`, section 3.5 (`RELAYER_SECRET_KEY`).
- Environment variables: `docs/env-variables.md` (`RELAYER_SECRET_KEY`, `STELLAR_NETWORK`, `ESCROW_CONTRACT_ID`).
- Monitoring and alert routing: `docs/monitoring/alerting.md`.
