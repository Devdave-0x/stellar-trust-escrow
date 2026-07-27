# Deployment Guide

This guide covers everything from building the contract to running it on Testnet and eventually Mainnet, including setting up a keeper service to trigger recurring charges.

---

## Prerequisites

| Tool | Install |
| --- | --- |
| Rust 1.70+ | `curl https://sh.rustup.rs -sSf \| sh` |
| wasm32 target | `rustup target add wasm32-unknown-unknown` |
| Soroban CLI | `cargo install --locked soroban-cli` |
| Node.js 18+ | [nodejs.org](https://nodejs.org/) |
| Freighter Wallet | [freighter.app](https://www.freighter.app/) |

Verify your setup:

```bash
rustc --version        # rustc 1.70+
soroban --version      # soroban 21.x
node --version         # v18+
```

---

## Part 1 — Build the Contract

```bash
cd contract

# Run tests first — always
cargo test

# Build optimised WASM for deployment
cargo build --release --target wasm32-unknown-unknown
```

The compiled WASM will be at:
```
contract/target/wasm32-unknown-unknown/release/flowpay.wasm
```

---

## Part 2 — Deploy to Testnet

### Step 1 — Create and fund a deployer account

```bash
# Generate a new keypair and store it locally
soroban keys generate --global deployer --network testnet

# Check the address
soroban keys address deployer

# Fund it via Friendbot (testnet only)
curl "https://friendbot.stellar.org?addr=$(soroban keys address deployer)"
```

### Step 2 — Deploy the WASM

```bash
soroban contract deploy \
  --wasm contract/target/wasm32-unknown-unknown/release/flowpay.wasm \
  --source deployer \
  --network testnet
```

This prints your `CONTRACT_ID`. Save it — you'll need it for every subsequent step.

```
# Example output:
CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Step 3 — Initialize the contract

FlowPay must be initialized with a token contract address before it can be used. On Testnet, the native XLM Stellar Asset Contract (SAC) address is:

```
CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- initialize \
  --token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

`initialize` can only be called once. Calling it again will panic with `already initialized`.

### Step 4 — Verify deployment

```bash
# Read back a subscription (should return nothing yet)
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_subscription \
  --user <ANY_ADDRESS>
```

---

## Part 3 — Run the Frontend

```bash
cd frontend
npm install

# Create your local env file
echo "VITE_CONTRACT_ID=<CONTRACT_ID>" > .env.local

npm run dev
```

Open `http://localhost:5173`. Make sure Freighter is set to **Testnet**.

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_CONTRACT_ID` | Yes | The deployed FlowPay contract ID |

---

## Part 4 — Manual Contract Interaction (CLI)

### Subscribe

Before subscribing, the user must approve the FlowPay contract to spend their tokens:

```bash
# Approve FlowPay to spend up to 100 XLM on behalf of the user
soroban contract invoke \
  --id CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
  --source <USER_KEY> \
  --network testnet \
  -- approve \
  --from <USER_ADDRESS> \
  --spender <CONTRACT_ID> \
  --amount 1000000000 \
  --expiration_ledger 999999
```

Then subscribe:

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <USER_KEY> \
  --network testnet \
  -- subscribe \
  --user <USER_ADDRESS> \
  --merchant <MERCHANT_ADDRESS> \
  --amount 50000000 \
  --interval 2592000
```

> `50000000` stroops = 5 XLM. `2592000` seconds = 30 days.

### Charge

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <KEEPER_KEY> \
  --network testnet \
  -- charge \
  --user <USER_ADDRESS>
```

### Cancel

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <USER_KEY> \
  --network testnet \
  -- cancel \
  --user <USER_ADDRESS>
```

---

## Part 5 — Keeper Service

Soroban has no native cron. You need an external service to call `charge()` periodically.

### Reference implementation (Node.js)

```javascript
// keeper.js — run with: node keeper.js
const { execSync } = require("child_process");

const CONTRACT_ID = process.env.CONTRACT_ID;
const KEEPER_KEY  = process.env.KEEPER_KEY;   // soroban key name
const NETWORK     = process.env.NETWORK ?? "testnet";

// In production, load this list from a database or by indexing contract events
const subscribers = [
  "GABC...",
  "GDEF...",
];

for (const user of subscribers) {
  try {
    execSync(
      `soroban contract invoke --id ${CONTRACT_ID} --source ${KEEPER_KEY} --network ${NETWORK} -- charge --user ${user}`,
      { stdio: "inherit" }
    );
    console.log(`Charged ${user}`);
  } catch {
    // charge() panics if interval hasn't elapsed — that's expected, not an error
    console.log(`Skipped ${user} (interval not elapsed or inactive)`);
  }
}
```

Run this on a schedule using cron, AWS Lambda, GitHub Actions scheduled workflow, or any task scheduler.

**Example cron (daily at midnight):**
```
0 0 * * * node /path/to/keeper.js
```

---

## Part 6 — Mainnet Deployment

> ⚠️ FlowPay has not been audited. Deploy to Mainnet at your own risk.

The steps are identical to Testnet with two changes:

1. Use `--network mainnet` instead of `--network testnet`
2. Use the Mainnet native XLM SAC address (verify from the [Stellar documentation]())
3. Fund your deployer account with real XLM instead of Friendbot

```bash
soroban contract deploy \
  --wasm contract/target/wasm32-unknown-unknown/release/flowpay.wasm \
  --source deployer \
  --network mainnet
```

---

## Troubleshooting

| Error | Cause | Fix |
| --- | --- | --- |
| `already initialized` | `initialize()` called twice | Expected — contract is already set up |
| `interval not elapsed yet` | `charge()` called too early | Wait for the interval to pass |
| `no subscription found` | User hasn't subscribed | Call `subscribe()` first |
| `subscription is not active` | User cancelled | Cannot charge a cancelled subscription |
| `HostError: insufficient balance` | User's allowance is too low | User must call `approve()` again with a higher amount |
