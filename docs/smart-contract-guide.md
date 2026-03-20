# Smart Contract Developer Guide

This guide explains how to work on the `escrow_contract` Soroban smart contract.

---

## Prerequisites

- Rust >= 1.74
- `wasm32-unknown-unknown` target: `rustup target add wasm32-unknown-unknown`
- Soroban CLI >= 21.0.0: `cargo install --locked soroban-cli --features opt`

---

## File Structure

```
contracts/escrow_contract/
├── Cargo.toml         — package manifest
└── src/
    ├── lib.rs         — main contract (EscrowContract impl)
    ├── types.rs       — all structs, enums, storage keys
    ├── errors.rs      — EscrowError enum
    └── events.rs      — event emission helpers
```

---

## Building

```bash
# Native build (for tests)
cd contracts/escrow_contract && cargo build

# WASM build (for deployment)
cargo build --release --target wasm32-unknown-unknown
```

---

## Running Tests

```bash
# All tests
cargo test

# With output
cargo test -- --nocapture

# One test
cargo test test_create_escrow_happy_path
```

---

## Key Patterns

### 1. Authorization

Every function that modifies state must call `require_auth()` on the
appropriate address before touching storage:

```rust
caller.require_auth(); // ← ALWAYS first
let state = load_escrow(&env, escrow_id)?;
```

### 2. Load → Modify → Save

Never read storage twice. Load once, modify in memory, save back:

```rust
let mut escrow = load_escrow(&env, id)?;
escrow.status = EscrowStatus::Disputed;  // modify in memory
env.storage().instance().set(&DataKey::Escrow(id), &escrow); // save
```

### 3. State Before Transfer

Always update contract state **before** making token transfers (re-entrancy safety):

```rust
// ✅ Correct: update state first
milestone.status = MilestoneStatus::Approved;
env.storage()...set(...);  // save state change

token_client.transfer(...); // then do the transfer
```

### 4. Error Returns

Every public function returns `Result<T, EscrowError>`. Never panic:

```rust
// ✅ Good
let escrow = env.storage().instance()
    .get(&DataKey::Escrow(id))
    .ok_or(EscrowError::EscrowNotFound)?;

// ❌ Bad — panics in production
let escrow = env.storage().instance()
    .get(&DataKey::Escrow(id))
    .unwrap();
```

---

## Token Transfers

Use `soroban_sdk::token::Client` to transfer tokens:

```rust
use soroban_sdk::token;

let token_client = token::Client::new(&env, &escrow.token);

// Transfer from caller into contract
token_client.transfer(&caller, &env.current_contract_address(), &amount);

// Transfer from contract out to recipient
token_client.transfer(&env.current_contract_address(), &recipient, &amount);
```

In tests, use `StellarAssetClient` to mint test tokens:

```rust
let sac = soroban_sdk::token::StellarAssetClient::new(&env, &token_addr);
sac.mint(&client_addr, &10_000_000_000i128); // 1000 USDC (7 decimals)
```

---

## Testing Checklist

For every function you implement, add:

- [ ] Happy path test
- [ ] Unauthorized caller test
- [ ] Wrong state test (e.g. escrow not Active)
- [ ] Edge case (zero amount, self-transfer, etc.)

---

## Deployment

See `scripts/deploy.sh` and the README for full deployment steps.
