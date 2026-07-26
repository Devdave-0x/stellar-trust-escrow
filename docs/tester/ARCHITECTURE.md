# Architecture

This document describes the system design of FlowPay — how the contract is structured, how data is stored, and how the frontend and contract interact.

---

## Overview

FlowPay is composed of two parts:

1. **Smart Contract** — a Soroban contract written in Rust that lives on the Stellar blockchain. It is the single source of truth for all subscription state.
2. **Frontend** — a React + TypeScript single-page application that lets users interact with the contract through the Freighter browser wallet.

There is no centralised backend. The only off-chain component required is a **keeper service** — a simple scheduler that calls `charge()` on behalf of merchants when a billing interval elapses.

```
┌─────────────────────────────────────────────────────────┐
│                        User Browser                      │
│                                                          │
│   ┌──────────────┐        ┌──────────────────────────┐  │
│   │   React UI   │──────▶ │  Freighter Wallet        │  │
│   │  (Vite/TS)   │◀────── │  (signs transactions)    │  │
│   └──────┬───────┘        └──────────────────────────┘  │
│          │                                               │
└──────────┼──────────────────────────────────────────────┘
           │ signed XDR
           ▼
┌─────────────────────────────────────────────────────────┐
│                  Stellar Testnet / Mainnet               │
│                                                          │
│   ┌──────────────────────────────────────────────────┐  │
│   │              FlowPay Contract                    │  │
│   │                                                  │  │
│   │  initialize()   subscribe()   charge()           │  │
│   │  cancel()       pay_per_use() get_subscription() │  │
│   └──────────────────────────────────────────────────┘  │
│                                                          │
│   ┌──────────────────────────────────────────────────┐  │
│   │         Token Contract (SAC / XLM)               │  │
│   │         transfer_from() — moves funds            │  │
│   └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
           ▲
           │ calls charge() on schedule
┌──────────┴──────────┐
│   Keeper Service    │
│  (cron / Lambda)    │
└─────────────────────┘
```

---

## Smart Contract Design

### Entry Points

| Function | Mutates State | Auth | Description |
| --- | --- | --- | --- |
| `initialize(token)` | Yes | None | One-time setup. Stores the token contract address. Panics if called again. |
| `subscribe(user, merchant, amount, interval)` | Yes | `user` | Creates or overwrites a subscription for the caller. |
| `charge(user)` | Yes | None | Permissionless. Transfers funds if the interval has elapsed. |
| `pay_per_use(user, amount)` | No (token state only) | `user` | Instant transfer of any amount against an active subscription. |
| `cancel(user)` | Yes | `user` | Sets `active = false`. Prevents future charges. |
| `get_subscription(user)` | No | None | Read-only view. Returns `Option<Subscription>`. |

### Why `charge()` has no auth

`charge()` is intentionally permissionless. Any account — including a keeper bot — can call it. The contract enforces correctness:

- The subscription must exist
- `active` must be `true`
- `now >= last_charged + interval` must hold

If any condition fails, the transaction panics and no funds move. This design means merchants don't need to hold keys on a server — they can delegate charging to any keeper.

---

## Data Model

### `Subscription` struct

```rust
pub struct Subscription {
    pub merchant: Address,   // who receives the payment
    pub amount: i128,        // stroops per period (1 XLM = 10_000_000)
    pub interval: u64,       // seconds between charges
    pub last_charged: u64,   // ledger timestamp of last successful charge
    pub active: bool,        // false = cancelled
}
```

### `DataKey` enum

```rust
pub enum DataKey {
    Subscription(Address),  // keyed by subscriber address
    Token,                  // the token contract address (set at init)
}
```

---

## Storage Strategy

Soroban has three storage tiers. FlowPay uses two of them deliberately:

| Tier | Used For | Why |
| --- | --- | --- |
| `instance` | `DataKey::Token` | The token address is contract-wide config. It's always needed and should never expire. Instance storage is tied to the contract's own TTL. |
| `persistent` | `DataKey::Subscription(user)` | Subscription records must survive indefinitely until explicitly cancelled. Persistent storage has its own TTL that can be extended. |
| `temporary` | Not used (yet) | Suitable for ephemeral data like daily spending limits — a future feature. |

**TTL note:** Persistent storage entries have a TTL on Stellar. In production, a keeper or the frontend should call `extend_ttl` on active subscriptions to prevent them from being evicted by the network. This is a planned improvement.

---

## Token Flow

FlowPay never holds tokens. It uses the Soroban token interface's `transfer_from` to move funds directly from the user's account to the merchant's account, using the allowance the user pre-approved.

```
User account ──[allowance]──▶ FlowPay contract
                                    │
                              transfer_from()
                                    │
                                    ▼
                            Merchant account
```

The user must call `approve()` on the token contract before subscribing. The frontend handles this automatically as part of the subscribe flow (planned — currently the user must approve manually or via CLI).

---

## Frontend Architecture

The frontend is a minimal React SPA with no routing library. State is local to components.

```
App.tsx
├── useWallet()          — Freighter connection, signing, submission
├── SubscribeForm.tsx    — form to create a subscription
└── Dashboard.tsx        — view subscription, cancel, pay-per-use
```

All Soroban SDK calls are isolated in `stellar.ts`. Components never import `@stellar/stellar-sdk` directly. This makes it easy to swap the SDK version or mock it in tests.

### Transaction lifecycle

```
1. Component calls buildXxxTx() from stellar.ts
2. stellar.ts builds the transaction and simulates it via RPC
3. assembleTransaction() attaches auth entries from simulation
4. XDR string returned to component
5. Component passes XDR to useWallet().signAndSubmit()
6. Freighter prompts user to sign
7. Signed transaction submitted to Stellar RPC
8. Transaction hash returned and displayed
```

---

## Keeper Service

Because Soroban has no native scheduler, recurring charges require an external trigger. The recommended pattern is a simple script that:

1. Maintains a list of subscriber addresses (from contract events or a database)
2. Runs on a schedule (cron, Lambda, etc.)
3. Calls `charge(user)` for each subscriber whose interval has elapsed

The contract itself enforces the interval — if the keeper calls too early, the transaction simply fails. There is no risk of double-charging.

See [DEPLOYMENT.md](DEPLOYMENT.md) for a reference keeper implementation.
