# Trustchain Escrow

**Trustless, milestone-based escrow on the Stellar blockchain.**

A platform where clients lock funds into verifiable smart contracts, contractors deliver work in provable milestones, and every outcome — completion or dispute — builds an immutable on-chain reputation that follows both parties forever.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Built on Stellar](https://img.shields.io/badge/Built%20on-Stellar-7B2FBE?logo=stellar)](https://stellar.org)
[![Soroban Contracts](https://img.shields.io/badge/Smart%20Contracts-Soroban%20%2F%20Rust-orange)](https://soroban.stellar.org)
[![Backend Tests](https://img.shields.io/badge/backend%20tests-425%20passing-brightgreen)](#testing)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-blue)](docs/CONTRIBUTING.md)

---

## The Problem This Solves

Traditional escrow platforms hold funds in centralised accounts — meaning you trust a company, not a contract. If the platform shuts down, gets hacked, or makes a unilateral call, your money can be frozen or lost. Dispute resolution is opaque, outcomes are non-transferable, and reputation is a database entry that can be deleted.

**Trustchain Escrow replaces the intermediary with code.**

- Funds are locked in a Soroban smart contract, not on a company server
- Milestone approval is on-chain — no one can override or delay it
- Reputation scores are contract-level state, not a row that can be deleted
- Anyone can audit the contract logic before trusting it with funds

---

## Who This Is For

| Role                          | How they use Trustchain                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Clients / Funders**         | Lock XLM or any Stellar asset into a milestone contract; approve work incrementally; raise disputes with evidence if delivery fails |
| **Contractors / Freelancers** | Accept work under clear on-chain terms; submit milestones for review; build a verifiable reputation across all engagements          |
| **DAOs / Communities**        | Pool contributor funds into a single escrow; gate milestone approval to a multi-sig or governance vote                              |
| **Arbiters**                  | Resolve disputes with on-chain authority and an auditable decision trail                                                            |
| **Developers**                | Self-host a tenant, integrate via REST API, or extend the Soroban contract                                                          |

---

## Core Concepts

### Escrow Lifecycle

```
Active → (all milestones approved) → Completed
Active → (either party raises dispute) → Disputed → (arbiter resolves) → Completed
Active → (mutual consent) → Cancelled
Active → (deadline passed) → Expired → (auto-refund to client)
```

Each state transition is a signed Stellar transaction — auditable by anyone, reversible by no one.

### Milestone-Based Release

Funds are never released all at once. Each escrow is subdivided into milestones, each with its own amount and description hash. When the contractor submits a milestone and the client approves it, only that milestone's funds are released — the remainder stays locked.

This gives both parties checkpoints: clients can stop at any milestone if work is unsatisfactory; contractors are protected from non-payment once a milestone is approved.

### On-Chain Reputation

Every escrow completion, dispute win, and dispute loss emits a `ReputationEvent` to the contract. Events accumulate into a score that is:

- **Public** — readable by any Stellar wallet or dApp
- **Immutable** — no one can delete or alter past events
- **Portable** — your score lives at your Stellar address, not on our servers
- **Composable** — other contracts and dApps can query it directly

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Client Layer                                                   │
│  ┌──────────────────────────┐  ┌──────────────────────────┐    │
│  │  Web Dashboard           │  │  Mobile App              │    │
│  │  Next.js 14 + Tailwind   │  │  Expo / React Native     │    │
│  │  Freighter wallet        │  │  Biometric auth          │    │
│  │  Soroban transaction UI  │  │  Offline SQLite cache    │    │
│  └────────────┬─────────────┘  └────────────┬─────────────┘    │
└───────────────┼──────────────────────────────┼──────────────────┘
                │ HTTPS + JWT                  │ HTTPS + JWT
┌───────────────▼──────────────────────────────▼──────────────────┐
│  API Layer  (Express.js, Node 20+)                              │
│                                                                 │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐   │
│  │ Auth      │  │ Escrow    │  │ Dispute   │  │ Admin     │   │
│  │ MFA + JWT │  │ Milestone │  │ Evidence  │  │ Audit log │   │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘   │
│                                                                 │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐   │
│  │ Tenant    │  │ Search    │  │ Webhooks  │  │ Reputation│   │
│  │ Scoping   │  │ (ES + PG) │  │ BullMQ    │  │ Indexer   │   │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘   │
└───────────┬───────────────────────────┬─────────────────────────┘
            │                           │
┌───────────▼──────────┐  ┌────────────▼──────────────────────────┐
│  Data Layer           │  │  Blockchain Layer                     │
│  PostgreSQL (Prisma)  │  │  Stellar Network (Testnet / Mainnet)  │
│  Redis (cache+queues) │  │  Soroban RPC                         │
│  IPFS (evidence)      │  │  Soroban Smart Contracts (Rust/Wasm) │
└──────────────────────┘  └───────────────────────────────────────┘
```

### Technology Decisions

| Decision               | Choice                          | Why                                                                                |
| ---------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| Smart contract runtime | Soroban (Rust → Wasm)           | Stellar's native contract platform; deterministic, auditable, no EVM gas surprises |
| API framework          | Express.js                      | Minimal surface area; easy to audit middleware chain                               |
| ORM                    | Prisma                          | Type-safe DB access; migration history lives in the repo                           |
| Cache                  | Redis + in-memory fallback      | Sliding-window rate limits need atomic operations; fallback keeps dev setup simple |
| Job queue              | BullMQ                          | Reliable webhook retry with exponential backoff; dead-letter visibility in Redis   |
| Search                 | Elasticsearch + Prisma fallback | Full-text escrow search at scale; falls back gracefully if ES is unavailable       |
| Mobile offline         | SQLite (expo-sqlite)            | Works without network; stale rows evicted by TTL                                   |
| Pagination             | Cursor-based                    | Stable across concurrent inserts; no skipped rows on fast-changing datasets        |

---

## Fund Flow

```
1. CLIENT deposits funds
   └─ create_escrow(contractor, amount, milestones[], timelock?)
      └─ Stellar transaction locks funds in contract

2. CONTRACTOR delivers work
   └─ submit_milestone(escrow_id, milestone_index, ipfs_hash)
      └─ Deliverable hash stored on-chain

3. CLIENT reviews and approves
   └─ approve_milestone(escrow_id, milestone_index)
      └─ Soroban releases that milestone's funds to contractor

4. Repeat for each milestone until completion
   └─ Final approval → escrow Completed
      └─ ReputationEvent written for both parties

── OR ──

3b. Dispute raised
    └─ raise_dispute(escrow_id, evidence_hashes[])
       └─ SHA-256 hashes anchored on-chain

4b. Arbiter resolves
    └─ submit_ruling(escrow_id, client_pct, contractor_pct)
       └─ Funds split per ruling; ReputationEvent reflects outcome
```

---

## Project Structure

```
trustchain-escrow/
│
├── contracts/                         # Soroban smart contracts (Rust)
│   ├── escrow_contract/
│   │   └── src/
│   │       ├── lib.rs                 # Entry points & access control
│   │       ├── storage.rs             # On-chain state definitions
│   │       ├── errors.rs              # Typed error enum
│   │       └── types.rs               # Shared types
│   └── governance/                    # On-chain governance contract
│
├── backend/                           # Node 20+ REST API
│   ├── api/
│   │   ├── controllers/
│   │   ├── middleware/                # Auth, rate-limit, cache, logging
│   │   └── routes/
│   ├── services/                      # Business logic layer
│   ├── database/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── tests/                         # Jest — 425 tests
│
├── frontend/                          # Next.js 14 web dashboard
│   ├── app/                           # App Router pages
│   ├── components/
│   └── lib/
│       ├── stellar.js                 # Stellar SDK + contract bindings
│       └── api/client.js              # Axios client + JWT refresh
│
├── mobile/                            # Expo / React Native app
│   ├── app/
│   ├── hooks/
│   ├── services/
│   │   ├── biometrics.ts
│   │   └── offlineCache.ts
│   └── lib/
│
├── docs/
│   ├── CONTRIBUTING.md
│   └── SECURITY.md
│
├── scripts/
│   ├── deploy/
│   │   ├── testnet.sh
│   │   └── mainnet.sh
│   └── simulate/                      # End-to-end lifecycle scripts
│
└── docker-compose.yml                 # PostgreSQL + Redis + Stellar node
```

---

## Getting Started

### Prerequisites

| Dependency  | Minimum        |
| ----------- | -------------- |
| Node.js     | 20             |
| Rust        | stable (1.75+) |
| Docker      | 24+            |
| Stellar CLI | latest         |

### Local Setup

```bash
# Clone
git clone git@github.com:KCEE0901/trustchain-escrow.git
cd trustchain-escrow

# Install dependencies
npm install

# Start infrastructure
docker compose up -d

# Configure environment
cp backend/.env.example backend/.env

# Run migrations
npm run db:migrate -w backend
npm run db:generate -w backend

# Start backend
npm run dev -w backend

# Start frontend (separate terminal)
npm run dev -w frontend
```

### Run Tests

```bash
# Backend
npm test -w backend

# Frontend
npm run test:unit -w frontend

# Contracts
cargo test --workspace
```

---

## API Overview

All endpoints are versioned under `/api/v1/`. Authentication uses Bearer JWT tokens.

| Method | Endpoint               | Description                         |
| ------ | ---------------------- | ----------------------------------- |
| `POST` | `/auth/login`          | Authenticate and receive JWT        |
| `GET`  | `/escrows`             | List escrows for authenticated user |
| `POST` | `/escrows`             | Create a new escrow                 |
| `GET`  | `/escrows/:id`         | Get escrow detail                   |
| `POST` | `/escrows/:id/release` | Approve milestone release           |
| `POST` | `/escrows/:id/dispute` | Raise a dispute                     |
| `GET`  | `/escrows/:id/events`  | Full event timeline                 |
| `GET`  | `/users/me/stats`      | Account stats and volume            |

Full API reference: `backend/openapi.yaml`

---

## Smart Contract Addresses

| Network | Contract ID          |
| ------- | -------------------- |
| Testnet | _deploy in progress_ |
| Mainnet | _pending audit_      |

---

## Security

See [docs/SECURITY.md](docs/SECURITY.md) for the vulnerability disclosure policy.

---

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for branch naming conventions, commit format, and PR guidelines.

---

## License

[MIT](LICENSE)
