# Local development setup

This is the canonical path from a new clone to a running development environment and a first test escrow. Run commands from the repository root unless a step says otherwise.

## Prerequisites

| Tool | Supported version | Verify |
| --- | --- | --- |
| Git | Current stable | `git --version` |
| Node.js | 20 LTS recommended; 18+ required | `node --version` |
| npm | Bundled with Node.js | `npm --version` |
| Rust | Stable, 1.74+ | `rustc --version` |
| WebAssembly target | `wasm32-unknown-unknown` | `rustup target list --installed` |
| Stellar/Soroban CLI | 21.x; repository commands use the `soroban` executable | `soroban --version` |
| Docker Engine/Desktop | Current stable with Compose v2 | `docker compose version` |

Install the contract toolchain:

```bash
rustup toolchain install stable
rustup default stable
rustup target add wasm32-unknown-unknown
cargo install --locked soroban-cli --version 21.0.0
```

On Windows, WSL2 is recommended because the repository's helper scripts use Bash. Native Rust builds also require Visual Studio Build Tools with the C++ workload.

## 1. Fork and clone

Fork the repository on GitHub, then replace `YOUR_USERNAME` below:

```bash
git clone https://github.com/YOUR_USERNAME/stellar-trust-escrow.git
cd stellar-trust-escrow
git remote add upstream https://github.com/barry01-hash/stellar-trust-escrow.git
git remote -v
```

If your fork has a different repository URL, use the URL shown by GitHub's **Code** button.

## 2. Install dependencies

The root package is an npm workspace containing `backend` and `frontend`, so one command installs all JavaScript dependencies:

```bash
npm ci
```

Do not run separate `npm install` commands in each workspace unless you are deliberately updating lockfiles.

## 3. Configure environment files

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Generate separate local secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Set at least these values in `backend/.env`:

```dotenv
DATABASE_URL=postgresql://user:password@localhost:5432/stellar_escrow
DIRECT_URL=postgresql://user:password@localhost:5432/stellar_escrow
REDIS_URL=redis://localhost:6379
ELASTICSEARCH_URL=http://localhost:9200

JWT_SECRET=<first generated value>
JWT_ACCESS_SECRET=<second generated value>
JWT_REFRESH_SECRET=<third generated value>
MFA_SECRET=<fourth generated value>

STELLAR_NETWORK=testnet
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
CONTRACT_ID=CLOCALPLACEHOLDER000000000000000000000000000000000000000000
CONTRACT_ADDRESS=CLOCALPLACEHOLDER000000000000000000000000000000000000000000
ESCROW_CONTRACT_ID=CLOCALPLACEHOLDER000000000000000000000000000000000000000000

PORT=4000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:3000
FRONTEND_URL=http://localhost:3000
```

The placeholder contract ID is sufficient for frontend/backend-only work, but blockchain reads and writes require a deployed contract ID. The local sandbox step below replaces it for frontend use.

Set `frontend/.env.local` to:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_CONTRACT_ADDRESS=CLOCALPLACEHOLDER000000000000000000000000000000000000000000
```

Never commit `.env`, `.env.local`, generated wallet files, or secret keys.

## 4. Start supporting services

Start PostgreSQL, Redis, and Elasticsearch with Docker:

```bash
docker compose up -d postgres redis elasticsearch
```

Check their state:

```bash
docker compose ps
```

Expected ports are PostgreSQL `5432`, Redis `6379`, and Elasticsearch `9200`.

## 5. Prepare the database

```bash
npm run db:generate -w backend
npm run db:migrate -w backend
```

Check migration status if needed:

```bash
npm run db:migrate:status -w backend
```

The older root `scripts/seed.js` is intentionally stubbed. Use `npm run db:seed -w backend` only when working on seed data; the seed fixtures currently lag the tenant-aware schema and may require adjustment.

## 6. Start the application

Use two terminals so failures are easy to identify.

Terminal 1:

```bash
npm run dev -w backend
```

Terminal 2:

```bash
npm run dev -w frontend
```

Open:

- Frontend: <http://localhost:3000>
- Backend health: <http://localhost:4000/health>
- API documentation: <http://localhost:4000/api-docs>

You can also run both workspaces with `npm run dev`, but separate terminals produce clearer logs and stop more reliably.

## 7. Start the optional local Stellar network

Use this for contract deployment or local-chain work:

```bash
bash scripts/start-sandbox.sh
```

The script starts Stellar Quickstart, creates funded `test-client`, `test-freelancer`, and `test-arbiter` identities, builds and deploys the escrow contract, writes `.sandbox-wallets.json`, and rewrites `frontend/.env.local` for the local network.

Verify the services:

```bash
curl -sf http://localhost:8000/health
curl -sf -X POST http://localhost:8001 -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
```

Copy the generated `contract_id` from `.sandbox-wallets.json` into `CONTRACT_ID`, `CONTRACT_ADDRESS`, and `ESCROW_CONTRACT_ID` in `backend/.env`, then restart the backend.

Stop or reset the sandbox with:

```bash
bash scripts/start-sandbox.sh --stop
bash scripts/start-sandbox.sh --reset
```

## 8. Make a test escrow

The reliable end-to-end check today is the Soroban test harness. This creates a funded test token, creates an escrow, and verifies the emitted escrow-created event and payload entirely in memory:

```bash
cargo test -p stellar-trust-escrow-contract event_tests::event_tests::test_event_escrow_created_topics_and_payload -- --nocapture
```

A passing result confirms that Rust, the Soroban SDK, contract compilation, token transfer, and escrow creation work locally.

The browser route <http://localhost:3000/escrow/create> can be used to inspect the multi-step form, but final submission is not implemented yet. `frontend/app/escrow/create/page.jsx`, `frontend/lib/stellar.js`, and `POST /api/escrows/broadcast` currently throw or return `Not implemented`; do not use that UI as a setup verification step.

## Fast verification commands

Run the checks relevant to your change:

```bash
npm run lint
npm run test:backend
npm run test:frontend
npm run test:contracts
npm run build
```

For a full pre-PR check:

```bash
npm run test:all
```

## Common setup errors

### `npm ci` reports an unsupported Node version or dependency failure

Use Node 20 LTS. With `nvm`:

```bash
nvm install 20
nvm use 20
rm -rf node_modules frontend/node_modules backend/node_modules
npm ci
```

Do not delete lockfiles unless the change intentionally updates dependencies.

### `docker: command not found` or `docker compose` is unavailable

Install Docker Desktop or Docker Engine with the Compose v2 plugin. Older `docker-compose` installations do not satisfy scripts that call `docker compose`.

### A port is already allocated

Find and stop the conflicting process, or stop an older project stack:

```bash
docker compose down
```

Common ports are `3000`, `4000`, `5432`, `6379`, `8000`, `8001`, and `9200`.

### Prisma cannot connect to PostgreSQL

```bash
docker compose ps postgres
docker compose logs postgres
```

Confirm both `DATABASE_URL` and `DIRECT_URL` use `localhost:5432` when the backend runs on your host. The hostname `postgres` is only correct from another Compose container.

### Backend exits because environment variables are missing or insecure

The production-style startup validator requires `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `MFA_SECRET`, `STELLAR_NETWORK`, `SOROBAN_RPC_URL`, and `CONTRACT_ID`. Secrets must be at least 32 characters and must not contain defaults such as `change_this_in_production`.

Run the validator from the backend directory after loading its environment:

```bash
cd backend
set -a
source .env
set +a
node ../scripts/check-env.js
cd ..
```

### `cargo build` says the WASM target is missing

```bash
rustup target add wasm32-unknown-unknown
```

Then retry:

```bash
cargo build --release --target wasm32-unknown-unknown -p stellar-trust-escrow-contract
```

### `soroban: command not found`

```bash
cargo install --locked soroban-cli --version 21.0.0
```

Ensure Cargo's bin directory is on `PATH`—normally `$HOME/.cargo/bin`—then open a new shell.

### Stellar Quickstart does not become healthy

```bash
docker compose logs stellar
bash scripts/start-sandbox.sh --reset
```

Also confirm ports `8000` and `8001` are free and Docker has enough memory.

### Frontend cannot reach the backend

Confirm the backend is on port `4000`, `NEXT_PUBLIC_API_URL=http://localhost:4000`, and `ALLOWED_ORIGINS=http://localhost:3000`. Restart Next.js after changing `frontend/.env.local`.

### Elasticsearch prevents the backend from starting or search fails

```bash
docker compose up -d elasticsearch
curl http://localhost:9200/_cluster/health
```

Docker should have at least 2 GB available for Elasticsearch and the remaining services.

### The create-escrow UI ends with `Not implemented`

This is expected in the current codebase. Use the contract test in [Make a test escrow](#8-make-a-test-escrow). The missing UI/transaction/broadcast implementation is contribution work, not a local setup failure.

## Your first contribution

1. Read [CONTRIBUTING.md](../CONTRIBUTING.md) for branch, test, and pull-request rules.
2. Browse the [`good-first-issue`](https://github.com/barry01-hash/stellar-trust-escrow/issues?q=is%3Aopen+is%3Aissue+label%3A%22good-first-issue%22) label.
3. Also check [`documentation`](https://github.com/barry01-hash/stellar-trust-escrow/issues?q=is%3Aopen+is%3Aissue+label%3Adocumentation) and [`help wanted`](https://github.com/barry01-hash/stellar-trust-escrow/issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22).
4. Comment on the issue before starting so maintainers know it is in progress.
5. Create a scoped branch:

   ```bash
   git switch -c docs/improve-setup
   # or: feature/<name>, fix/<name>, test/<name>, chore/<name>
   ```

6. Make the smallest coherent change, add or update tests, and run the relevant verification commands.
7. Push your branch and open a PR against `main` with `Closes #<issue-number>`.

For a first PR, prefer an issue with explicit acceptance criteria and avoid combining unrelated cleanup with the requested fix.
