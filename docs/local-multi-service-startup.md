# Local Multi-Service Startup Order

Use this order when running the full stack locally so workers and clients do not
start before their dependencies are ready.

1. Database: start Postgres and run migrations.
2. Redis: start Redis before queue workers.
3. Backend API: run environment checks, then start the API server.
4. Backend workers: start queue, webhook, expiry, email, and monitor workers.
5. Contracts: run local contract build or sandbox tooling when contract changes
   are being tested.
6. Frontend: start the Next.js app after the backend API is reachable.
7. Mobile: start Expo after API URL and wallet settings are configured.

## Checks

- `scripts/check-env.js` should pass before the backend starts.
- Queue workers should connect to Redis before processing jobs.
- Frontend and mobile should point at the same backend base URL.
- Contract addresses in `.env` should match the selected network.

## Common Failures

- Starting workers before migrations can produce missing table errors.
- Starting frontend before backend makes auth and dashboard pages show generic
  network failures.
- Running mobile against a stale API URL can cache incorrect KYC or escrow state.
