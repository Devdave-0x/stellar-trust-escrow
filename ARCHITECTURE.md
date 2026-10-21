# 🏛️ Architecture

This document describes the full data flow, component responsibilities, and design decisions for StellarTrustEscrow.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        USER BROWSER                          │
│                                                               │
│  ┌──────────────┐     ┌──────────────┐    ┌──────────────┐  │
│  │  Next.js App │────►│   Freighter  │    │  REST API    │  │
│  │  (Frontend)  │     │   Wallet     │    │  (Backend)   │  │
│  └──────────────┘     └──────┬───────┘    └──────┬───────┘  │
└────────────────────────────│─────────────────────│──────────┘
                              │ sign tx             │ read data
                              ▼                     ▼
                    ┌─────────────────┐   ┌─────────────────┐
                    │  Stellar Network│   │   PostgreSQL    │
                    │  (Soroban)      │   │   Database      │
                    └────────┬────────┘   └────────┬────────┘
                             │                     ▲
                             │ events              │ index
                             └──────────────────►──┘
                                        Escrow Indexer
                                        (backend service)
```

---

## Smart Contract Layer

### Contract: `escrow_contract`

The single Soroban contract manages the entire escrow lifecycle.

**Key Data Structures:**

```
EscrowState
├── escrow_id        : u64
├── client           : Address
├── freelancer       : Address
├── token            : Address         (Stellar Asset Contract)
├── total_amount     : i128
├── status           : EscrowStatus    (Active | Completed | Disputed | Cancelled)
├── milestones       : Vec<Milestone>
├── created_at       : u64             (ledger timestamp)
└── metadata_hash    : BytesN<32>      (IPFS hash of description)

Milestone
├── id               : u32
├── description_hash : BytesN<32>
├── amount           : i128
├── status           : MilestoneStatus (Pending | Submitted | Approved | Rejected)
└── submitted_at     : Option<u64>

ReputationEntry
├── address          : Address
├── total_score      : u64
├── completed_count  : u32
├── disputed_count   : u32
└── last_updated     : u64
```

**State Transitions:**

```
Escrow:   Created → Active → Completed
                         └→ Disputed → Resolved
                         └→ Cancelled

Milestone: Pending → Submitted → Approved (funds released)
                             └→ Rejected  (resubmit)
```

---

## Backend Layer

### API Server (`backend/api/`)

Express.js REST API serving the frontend. All write operations are signed on the client side — the backend is read-heavy.

| Route                         | Method | Description                   |
| ----------------------------- | ------ | ----------------------------- |
| `/api/escrows`                | GET    | List all escrows (paginated)  |
| `/api/escrows/:id`            | GET    | Get escrow details            |
| `/api/escrows`                | POST   | Submit a pre-signed create tx |
| `/api/users/:address`         | GET    | Get user profile + reputation |
| `/api/users/:address/escrows` | GET    | Get user's escrows            |
| `/api/reputation/:address`    | GET    | Get reputation score          |
| `/api/disputes`               | GET    | List active disputes          |

### Escrow Indexer (`backend/services/escrowIndexer.js`)

A background service that polls Stellar for contract events and writes them to PostgreSQL. This allows fast reads without hitting the blockchain on every request.

**Events it listens for:**

- `EscrowCreated`
- `MilestoneAdded`
- `MilestoneApproved`
- `FundsReleased`
- `DisputeRaised`
- `DisputeResolved`
- `EscrowCancelled`
- `ReputationUpdated`

### Reputation Service (`backend/services/reputationService.js`)

Computes and caches reputation scores. Raw data lives in the contract; this service aggregates it for display.

**Score formula (TODO — contributor task):**

```
reputation_score = (completed * 10) - (disputed * 5) + (avg_rating * 20)
```

---

## Frontend Layer

### Pages (Next.js App Router)

| Route                | Page            | Description                           |
| -------------------- | --------------- | ------------------------------------- |
| `/`                  | Dashboard       | Overview, active escrows, quick stats |
| `/escrow/create`     | Create Escrow   | Form to create a new escrow           |
| `/escrow/[id]`       | Escrow Details  | Milestone view, approval actions      |
| `/profile/[address]` | User Profile    | Reputation, history                   |
| `/explorer`          | Public Explorer | Browse all escrows                    |

### Key Components

```
components/
├── layout/
│   ├── Header.jsx        — Navigation, wallet connect button
│   ├── Sidebar.jsx       — Left nav for dashboard
│   └── Footer.jsx        — Links, network status
├── escrow/
│   ├── EscrowCard.jsx    — Summary card for escrow list
│   ├── MilestoneList.jsx — Timeline of milestones
│   ├── MilestoneItem.jsx — Individual milestone with actions
│   └── DisputeModal.jsx  — Raise/view dispute
└── ui/
    ├── Button.jsx        — Base button component
    ├── Badge.jsx         — Status badges
    ├── Modal.jsx         — Reusable modal
    ├── Spinner.jsx       — Loading indicator
    └── ReputationBadge.jsx — Star/score display
```

---

## Data Flow: Creating an Escrow

```
1. User fills out Create Escrow form (frontend)
2. Frontend calls Soroban SDK to build transaction
3. Freighter wallet signs the transaction
4. Transaction submitted to Stellar network
5. Contract executes: funds locked, escrow created, event emitted
6. Indexer picks up EscrowCreated event
7. Indexer writes to PostgreSQL
8. Frontend re-fetches from API and shows new escrow
```

---

## Data Flow: Approving a Milestone

```
1. Client reviews submitted milestone (frontend)
2. Client clicks "Approve" button
3. Frontend builds approve_milestone transaction
4. Freighter signs
5. Contract executes: milestone marked approved, funds released to freelancer
6. ReputationUpdated event emitted
7. Indexer updates DB
8. Both parties see updated reputation scores
```

---

## Mobile Wallet Reconnect Flow

When a user returns to the app on a mobile device, the frontend attempts to silently reconnect the previously authorized wallet session before prompting for a fresh signature. This section documents the supported platforms and the known behavior under constrained conditions.

### Supported Platforms

| Platform              | Minimum version | Notes                                                        |
| --------------------- | --------------- | ------------------------------------------------------------ |
| iOS (Safari)          | iOS 15+         | Wallet connect via deep link; WebView-based wallets supported |
| iOS (in-app WebView)  | iOS 15+         | Requires the host app to allow external deep links          |
| Android (Chrome)      | Android 10+     | Chrome 90+ recommended for stable WebCrypto/IndexedDB       |
| Android (in-app WebView)| Android 10+   | Deep-link handoff depends on the host app's intent filters  |
| Desktop browsers      | Evergreen       | Chrome, Firefox, Safari, Edge (latest two majors)            |

**Constraints:**

- The reconnect flow relies on `localStorage`/`IndexedDB` to persist the last authorized public key. Private keys never leave the wallet.
- Browsers in private/incognito mode may clear storage between sessions; reconnect will fall back to a full connect prompt.
- WebViews that block third-party storage or deep links cannot complete the reconnect handoff and must use the manual connect path.

### Primary Success Path

```
1. App loads on a returning mobile device
2. Frontend reads the persisted public key + session marker from storage
3. Frontend asks the wallet (via deep link / injected provider) to re-authorize
4. Wallet returns the same public key without a new signature prompt
5. Session is restored; the user lands on the previously viewed page
```

### Failure and Boundary Paths

**1. Network loss mid-reconnect**

- If the network drops while the wallet handoff is in flight, the reconnect attempt times out (deterministic timeout, no retry storm).
- The UI surfaces a non-secret error (e.g. "Could not reconnect wallet — check your connection") and offers a manual retry.
- No partial session is persisted; the next load starts a clean reconnect attempt.

**2. Expired or stale session**

- If the persisted session marker is older than the wallet's authorization window, the wallet rejects the silent re-authorization.
- The frontend clears the stale marker and falls back to the standard connect prompt.
- Errors are logged without the public key or any signature material.

**3. App backgrounding / resume**

- If the OS suspends the app during the deep-link handoff, the resume handler re-checks the session state before assuming success.
- A suspended-then-resumed handoff that never completed is treated as a failed reconnect and routed to the manual connect path.

---

## Environment Configuration

```
STELLAR_NETWORK=testnet | mainnet
CONTRACT_ADDRESS=C...
INDEXER_POLL_INTERVAL_MS=5000
DATABASE_URL=postgresql://...
JWT_SECRET=...
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_STELLAR_NETWORK=testnet
```

---

## Future Architecture Considerations

- **WebSocket subscriptions** instead of polling for real-time updates
- **IPFS integration** for storing milestone descriptions/attachments off-chain
- **Multi-token support** for escrows in USDC, custom tokens, etc.
- **Arbiter DAO** for decentralized dispute resolution
- **Analytics service** for platform-wide stats
