# Stellar Smart Fund Escrow

> A decentralised, milestone-based escrow platform with an on-chain reputation system built on the Stellar blockchain using Soroban smart contracts.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Contributors Welcome](https://img.shields.io/badge/contributors-welcome-brightgreen)](CONTRIBUTING.md)
[![Built on Stellar](https://img.shields.io/badge/built%20on-Stellar-blueviolet)](https://stellar.org)
[![Soroban](https://img.shields.io/badge/Soroban-Smart%20Contracts-orange)](https://soroban.stellar.org)
[![Coverage](https://img.shields.io/github/actions/workflow/status/Stellar-Trust-Escrow/stellar-trust-escrow/coverage.yml?label=coverage&style=flat-square)](https://github.com/Stellar-Trust-Escrow/stellar-trust-escrow/actions/workflows/coverage.yml)

---

## Overview

Stellar Smart Fund Escrow allows clients and freelancers to create trustless payment agreements secured by Soroban smart contracts. Funds are locked on-chain and released milestone by milestone — no intermediaries, no central authority required.

Every completed milestone builds an immutable, on-chain **reputation score** for both parties, creating a verifiable track record that persists across all future engagements on the platform.

---

## Features

| Feature                          | Status      |
| -------------------------------- | ----------- |
| Milestone-based escrow contract  | In Progress |
| On-chain reputation system       | In Progress |
| Dispute resolution mechanism     | In Progress |
| REST API + event indexer         | In Progress |
| Next.js dashboard                | In Progress |
| Wallet connection (Freighter)    | In Progress |
| Mobile app (Expo / React Native) | In Progress |
| Multi-tenant architecture        | In Progress |
| Real-time chat (WebSocket)       | In Progress |

---

## Architecture

```
+-------------------------------------------------------------+
|                      Client Devices                         |
|          Browser (Next.js)    Mobile (Expo/RN)              |
+------------------+----------------------+-------------------+
                   |  HTTPS / WS          | HTTPS / WS
+------------------v----------------------v-------------------+
|                   Express.js API (Node 18)                  |
|  +------------+  +----------+  +----------+  +----------+  |
|  | Auth / JWT |  | Escrow   |  | Chat /WS |  | Admin    |  |
|  | Middleware |  | Routes   |  | Socket   |  | Routes   |  |
|  +------------+  +----------+  +----------+  +----------+  |
|  +------------+  +----------+  +----------+                 |
|  | Cache      |  | Prisma   |  | Redis    |                 |
|  | Middleware |  | ORM      |  | Cache    |                 |
|  +------------+  +----------+  +----------+                 |
+------------------+----------------------+-------------------+
                   |                      |
          +--------v------+    +----------v------+
          |  PostgreSQL   |    |  Stellar Network |
          |  (Prisma)     |    |  Soroban RPC     |
          +---------------+    +-----------------+
                                        |
                               +--------v--------+
                               |  Soroban Smart  |
                               |  Contracts      |
                               |  (Rust / Wasm)  |
                               +-----------------+
```

### Component Overview

| Layer           | Technology                  | Purpose                                           |
| --------------- | --------------------------- | ------------------------------------------------- |
| Smart Contracts | Rust + Soroban SDK          | Escrow logic, reputation, dispute resolution      |
| Backend API     | Node.js 18 + Express        | REST endpoints, WebSocket server, event indexer   |
| Database        | PostgreSQL + Prisma         | Persistent storage, migrations, type-safe queries |
| Cache           | Redis                       | HTTP response caching, session state              |
| Frontend        | Next.js 14 + Tailwind CSS   | Web dashboard, Freighter wallet integration       |
| Mobile          | Expo + React Native         | iOS/Android app, offline support, biometrics      |
| Blockchain      | Stellar (Testnet / Mainnet) | On-chain escrow and reputation records            |
| Wallet          | Freighter Browser Extension | Transaction signing for web users                 |

---

## How It Works

```
Client                   Contract               Freelancer
  |                         |                       |
  |--- create_escrow() ---->|                       |
  |    (funds locked)       |                       |
  |                         |<-- submit_milestone()-|
  |                         |                       |
  |<-- milestone ready -----+                       |
  |                         |                       |
  |--- approve_milestone() ->|                      |
  |                         |--- release_funds() -->|
  |                         |    (partial payout)   |
  |                         |                       |
  |         [dispute raised by either party]        |
  |                         |                       |
  |--- raise_dispute() ---->|<--- raise_dispute() --|
  |                         |                       |
  |           [arbiter / DAO resolves]              |
  |                         |--- resolve_dispute() ->
  |                         |                       |
  +-- reputation updated ---+--- reputation updated-+
```

### Reputation System

Each escrow completion or dispute resolution writes a `ReputationEvent` to the chain. Events aggregate into a score that is publicly queryable and tamper-proof. Both clients and freelancers build reputation independently.

---

## Project Structure

```
stellar-trust-escrow/
├── contracts/
│   └── escrow_contract/           # Soroban smart contract (Rust)
│       ├── src/
│       │   ├── lib.rs             # Contract entry points
│       │   ├── escrow.rs          # Escrow state machine
│       │   ├── reputation.rs      # On-chain reputation logic
│       │   └── dispute.rs         # Dispute resolution
│       └── Cargo.toml
├── backend/
│   ├── api/
│   │   ├── controllers/           # Route handler logic
│   │   ├── middleware/            # Auth, cache, tenant, rate-limit
│   │   └── routes/                # Express route definitions
│   ├── services/                  # Business logic, event indexer
│   ├── database/
│   │   ├── schema.prisma          # Prisma data models
│   │   └── migrations/            # Database migration history
│   └── tests/                     # Jest test suites (425 tests)
├── frontend/
│   ├── app/                       # Next.js 14 App Router pages
│   ├── components/                # Reusable React components
│   └── lib/                       # Soroban client, Freighter helpers
├── mobile/
│   ├── app/                       # Expo Router pages
│   ├── components/                # React Native components
│   ├── services/                  # Biometrics, offline cache
│   ├── hooks/                     # Custom React hooks
│   └── lib/                       # API client, auth
├── docs/                          # Architecture, SSH setup, guides
├── scripts/                       # Deployment & utility scripts
├── .husky/                        # Git hooks (pre-push validation)
├── docker-compose.yml             # Local development services
└── package.json                   # Root workspace config
```

---

## Quick Start

### Prerequisites

| Tool        | Minimum Version            |
| ----------- | -------------------------- |
| Node.js     | 18.x                       |
| Rust        | 1.74                       |
| Soroban CLI | 21.0.0                     |
| PostgreSQL  | 14                         |
| Redis       | 7                          |
| Docker      | 24 (optional, for sandbox) |

You will also need the [Freighter wallet](https://www.freighter.app/) browser extension for transaction signing on the web.

### 1. Clone the repository

```bash
git clone https://github.com/Stellar-Trust-Escrow/stellar-trust-escrow
cd stellar-trust-escrow
```

### 2. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### 3. Configure environment variables

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and fill in all required secrets. See [Environment Variable Reference](#environment-variable-reference) below.

```bash
cp frontend/.env.example frontend/.env.local
```

Open `frontend/.env.local` and set the API URL, network, and contract address.

> **Security note**: Every secret must be unique and generated with a CSPRNG (`openssl rand -hex 64`). Never reuse secrets across environments.

### 4. Set up the database

```bash
cd backend
npx prisma migrate dev --name init
npx prisma generate
cd ..
```

### 5. Build the smart contract

```bash
cd contracts/escrow_contract
cargo build --release --target wasm32-unknown-unknown
cd ../..
```

### 6. Start the development servers

```bash
# Terminal 1 — Backend API (port 4000)
cd backend && npm run dev

# Terminal 2 — Frontend (port 3000)
cd frontend && npm run dev

# Terminal 3 — Mobile (Expo)
cd mobile && npx expo start
```

Open `http://localhost:3000` to access the web dashboard.

---

## Local Soroban Sandbox (Docker)

For local development without a public testnet connection:

```bash
# Start the full local stack (Stellar node + services)
docker compose up -d

# Or use the helper script which also deploys contracts and funds a dev wallet
./scripts/start-sandbox.sh
```

The helper script:

- Starts a local Stellar Quickstart node in Soroban standalone mode
- Deploys all smart contracts to the local network
- Funds a development wallet
- Writes contract IDs and RPC settings into `frontend/.env.local`

**Verify the sandbox is running:**

```bash
docker ps --filter name=stellar-sandbox
curl -sf http://localhost:8000/soroban/rpc | jq .
```

**Rebuild and redeploy a contract after editing:**

```bash
./scripts/start-sandbox.sh
```

The script is idempotent — it rebuilds the Wasm, redeploys to the existing sandbox, and refreshes contract IDs without a full network teardown.

**Teardown:**

```bash
docker compose down
```

---

## Running Tests

```bash
# All backend tests (39 suites, 425 tests)
cd backend && npm test

# Watch mode during development
cd backend && npm run test:watch

# With coverage report
cd backend && npm run test:coverage
```

The Husky pre-push hook runs all backend tests automatically before every push to any branch. Pushes are blocked if any test fails or the branch name is invalid.

---

## Environment Variable Reference

| Variable             | Required | Description                                        |
| -------------------- | -------- | -------------------------------------------------- |
| `DATABASE_URL`       | Yes      | PostgreSQL connection string                       |
| `REDIS_URL`          | Yes      | Redis connection string                            |
| `JWT_SECRET`         | Yes      | Access token signing secret (64+ random bytes)     |
| `JWT_REFRESH_SECRET` | Yes      | Refresh token signing secret (64+ random bytes)    |
| `MFA_SECRET`         | Yes      | MFA token signing secret (64+ random bytes)        |
| `STELLAR_NETWORK`    | Yes      | `testnet` or `mainnet`                             |
| `SOROBAN_RPC_URL`    | Yes      | Soroban JSON-RPC endpoint URL                      |
| `CONTRACT_ID`        | Yes      | Deployed escrow contract address                   |
| `PORT`               | No       | API server port (default: 4000)                    |
| `LOG_LEVEL`          | No       | `debug`, `info`, `warn`, `error` (default: `info`) |

---

## Smart Contract API

The core escrow contract exposes these entry points (defined in `contracts/escrow_contract/src/lib.rs`):

| Function            | Arguments                              | Description                                   |
| ------------------- | -------------------------------------- | --------------------------------------------- |
| `create_escrow`     | client, freelancer, amount, milestones | Lock funds and initialise escrow              |
| `submit_milestone`  | escrow_id, milestone_id                | Freelancer marks milestone ready for review   |
| `approve_milestone` | escrow_id, milestone_id                | Client approves and triggers partial release  |
| `raise_dispute`     | escrow_id, reason                      | Either party initiates dispute                |
| `resolve_dispute`   | escrow_id, winner                      | Arbiter resolves in favour of one party       |
| `cancel_escrow`     | escrow_id                              | Cancel and refund (requires mutual agreement) |
| `get_reputation`    | address                                | Query on-chain reputation score               |

All contract interactions require a simulation step (`simulateTransaction`) before submission. See `frontend/lib/soroban.ts` for client-side integration patterns.

---

## Contributing

Contributions of all kinds are welcome. The project is designed to be beginner-friendly with clearly scoped, labelled issues.

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature-name`
3. Make your changes and update or add tests where appropriate
4. Ensure all tests pass: `cd backend && npm test`
5. Push your branch and open a pull request against `develop`

See [CONTRIBUTING.md](CONTRIBUTING.md) for the complete guide including code style, commit message format, and the review process.

Browse [open issues](../../issues) for ideas sorted by difficulty.

---

## Security

Report security vulnerabilities privately — do not open a public issue for security bugs.

- Security model: [`docs/SECURITY.md`](docs/SECURITY.md)
- Bug bounty policy: [`docs/BUG_BOUNTY.md`](docs/BUG_BOUNTY.md)
- Privacy policy: [`docs/PRIVACY.md`](docs/PRIVACY.md)

---

## License

MIT — see [LICENSE](LICENSE).
