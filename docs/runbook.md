# Operational Runbook — Stellar Crowd Fund Escrow

Last updated: 2026-06-24

---

## 1. Restarting Services Safely

### 1.1 Pre-restart health check

Always verify the current state before touching a service.

```bash
# Full dependency status
curl -sf http://localhost:4000/health | jq .

# Readiness probe (returns 503 when DB is unavailable)
curl -o /dev/null -w "%{http_code}" http://localhost:4000/health/ready
```

Expected output before restart: `200` with all dependencies reporting `ok`.

---

### 1.2 Restart API — PM2

```bash
# Graceful reload (zero-downtime, waits for in-flight requests)
pm2 reload stellar-escrow-api

# Hard restart if reload is insufficient
pm2 restart stellar-escrow-api

# Confirm process is back up
pm2 status stellar-escrow-api
```

**Expected output:** `status: online`, `restart count` incremented by 1.  
**Failure indicator:** `status: errored` or restart count climbing rapidly (crash loop).

---

### 1.3 Restart API — Docker

```bash
# Rolling restart with health-check gate
docker compose up -d --no-deps --build api

# Watch container health
docker inspect --format='{{.State.Health.Status}}' stellar-escrow-api
```

Wait until `healthy` before routing traffic back.

**Failure indicator:** container stays `unhealthy` or exits immediately — check logs:

```bash
docker logs stellar-escrow-api --tail 50
```

---

### 1.4 Restart BullMQ workers

Workers (webhook, email, event) are stateless consumers. Jobs remain in Redis queues during a restart.

```bash
# PM2
pm2 reload stellar-escrow-workers

# Docker
docker compose up -d --no-deps webhook-worker email-worker event-worker
```

After restart, confirm queues are draining:

```bash
# Check active / waiting job counts via Bull Board or Redis CLI
redis-cli llen bull:webhookQueue:active
redis-cli llen bull:emailQueue:active
redis-cli llen bull:eventQueue:active
```

**Failure indicator:** dead-letter queue (`failed`) growing instead of active queue shrinking.

---

### 1.5 Zero-downtime rolling restart (multi-instance)

With multiple API instances behind a load balancer:

```bash
# Restart instances one at a time, waiting for readiness between each
for instance in api-1 api-2 api-3; do
  docker restart "$instance"
  until [ "$(curl -so /dev/null -w '%{http_code}' http://$instance:4000/health/ready)" = "200" ]; do
    sleep 2
  done
  echo "$instance ready"
done
```

Never restart all instances simultaneously — maintain at least one healthy instance at all times.

---

## 2. Running Database Migrations

> **Production rule:** always use `prisma migrate deploy`, never `prisma migrate dev`. `migrate dev` creates and applies new migrations interactively and is for development only.

### 2.1 Check current migration state

```bash
cd backend
npx prisma migrate status
```

**Expected outputs:**

| Output | Meaning |
|---|---|
| `All migrations have been applied.` | Database is up to date |
| `X migrations pending` | Unapplied migrations exist |
| `Database schema is not in sync` | Schema drift detected — investigate before proceeding |

---

### 2.2 Apply pending migrations (production)

```bash
cd backend
npx prisma migrate deploy
```

This applies all pending migrations in order and is safe to run in CI/CD pipelines. It never prompts interactively.

**Verify:**

```bash
npx prisma migrate status
# Expected: "All migrations have been applied."
```

---

### 2.3 Rollback a migration

Prisma does not support automatic rollback. Two options:

**Option A — Restore from backup (preferred for destructive migrations)**

```bash
# Stop API to prevent writes during restore
pm2 stop stellar-escrow-api   # or docker compose stop api

# Restore from the pre-deploy backup
./scripts/backup.sh restore --snapshot pre-deploy-<timestamp>

# Restart API
pm2 start stellar-escrow-api
```

**Option B — Write a compensating migration**

```bash
cd backend

# Create a new migration that reverses the changes
npx prisma migrate dev --name rollback_<original_migration_name>
# Edit the generated SQL to undo the previous migration
npx prisma migrate deploy
```

Always take a database backup immediately before applying migrations in production.

---

## 3. Rotating Secrets

> **Warning:** rotating JWT secrets invalidates all active user sessions. Schedule during low-traffic windows and notify users if possible.

### 3.1 JWT secrets (JWT_SECRET, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET)

```bash
# 1. Generate new secrets
NEW_JWT_SECRET=$(openssl rand -hex 64)
NEW_JWT_ACCESS_SECRET=$(openssl rand -hex 64)
NEW_JWT_REFRESH_SECRET=$(openssl rand -hex 64)

echo "JWT_SECRET=$NEW_JWT_SECRET"
echo "JWT_ACCESS_SECRET=$NEW_JWT_ACCESS_SECRET"
echo "JWT_REFRESH_SECRET=$NEW_JWT_REFRESH_SECRET"

# 2. Update environment (Vault, .env, or secrets manager)
#    Replace the three variables in backend/.env or your Vault path

# 3. Rolling restart API (all active sessions will be invalidated)
pm2 reload stellar-escrow-api
```

**Note:** after restart, all users must re-authenticate. Refresh tokens signed with the old secret will be rejected.

---

### 3.2 ADMIN_API_KEY

```bash
# 1. Generate new key
NEW_ADMIN_KEY=$(openssl rand -hex 32)
echo "ADMIN_API_KEY=$NEW_ADMIN_KEY"

# 2. Update env/Vault

# 3. Restart API
pm2 reload stellar-escrow-api
```

Distribute the new key to any automated systems or operators using it before restarting.

---

### 3.3 Webhook signing secrets

Each webhook subscription has its own HMAC signing secret. Subscribers use it to verify `X-Webhook-Signature` headers.

```bash
# Option A — re-subscribe (subscriber rotates their own secret)
# 1. Subscriber deletes the existing subscription
DELETE /api/webhooks/:id   # Authorization: Bearer <token>

# 2. Subscriber re-subscribes; a new secret is generated and returned once
POST /api/webhooks/subscribe

# Option B — admin rotation via admin endpoint
PATCH /api/admin/webhooks/:id/rotate-secret   # Authorization: X-Admin-Key <ADMIN_API_KEY>
```

The new secret is returned in the response body exactly once. The subscriber must update their verification logic before the next delivery.

---

### 3.4 Database password

```bash
# 1. Generate new password
NEW_DB_PASSWORD=$(openssl rand -hex 32)

# 2. Rotate at the database level
psql "$DATABASE_URL" -c "ALTER USER escrow_user PASSWORD '$NEW_DB_PASSWORD';"

# 3. Update DATABASE_URL in env/Vault
#    New value: postgresql://escrow_user:<NEW_DB_PASSWORD>@host:5432/stellar_escrow

# 4. Restart API (Prisma connection pool will reconnect with new credentials)
pm2 reload stellar-escrow-api
```

**Failure indicator:** API logs show `P1001` (can't reach database) or `P1000` (authentication failed) — recheck the connection string.

---

### 3.5 RELAYER_SECRET_KEY (Stellar keypair)

```bash
# 1. Generate a new Stellar keypair using Stellar CLI or SDK
stellar keys generate relayer-key-new

# 2. Fund the new account on testnet
stellar friendbot relayer-key-new

# 3. Update RELAYER_SECRET_KEY in env/Vault with the new secret key

# 4. Transfer any remaining XLM balance from the old account to the new one
#    before decommissioning the old keypair

# 5. Rolling restart API
pm2 reload stellar-escrow-api
```

Keep the old keypair available (offline, secured) until you confirm the new keypair is operating correctly.

---

## 4. Scaling Horizontally

### 4.1 API instances

The API is fully stateless — no sticky sessions required.

- Rate limit state lives in Redis (sliding-window counters keyed by `tenantId:userId`)
- Cache keys are Redis-backed and scoped by `tenantId`/`tenantSlug`
- The in-memory cache fallback is **single-node only** — ensure `REDIS_URL` is set in all production instances

Scale by adding instances behind any HTTP load balancer:

```bash
# Docker Compose example
docker compose up -d --scale api=3
```

All instances can start immediately with no coordination step.

---

### 4.2 BullMQ workers

Workers are independently scalable from the API. Each worker type (webhook, email, event) can have multiple concurrent consumers:

```bash
# Docker Compose example
docker compose up -d --scale webhook-worker=3 --scale email-worker=2
```

**Exception — event indexer:** keep `eventIndexer` (on-chain event processor) as a **single process**. Multiple instances will race to process the same Stellar ledger events, causing duplicate reputation updates and double-processing of contract events.

```bash
# Always scale=1 for the event indexer
docker compose up -d --scale event-indexer=1
```

---

### 4.3 Redis dependency

All scaled instances share a single Redis. If Redis becomes unavailable:

- Rate limiting falls back to in-memory (per-process, not shared across instances)
- Cache misses fall through to the database
- BullMQ workers pause until Redis reconnects

Monitor Redis memory and connection count as instance count grows.

---

## 5. Feature Flag Management

All flag operations require `ADMIN_API_KEY` in the `X-Admin-Key` header.

### 5.1 List all flags

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" \
     https://api.example.com/api/admin/flags | jq .
```

---

### 5.2 Enable or disable a flag

```bash
# Enable
curl -X PATCH \
     -H "X-Admin-Key: $ADMIN_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"isEnabled": true}' \
     https://api.example.com/api/admin/flags/my-feature

# Disable
curl -X PATCH \
     -H "X-Admin-Key: $ADMIN_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"isEnabled": false}' \
     https://api.example.com/api/admin/flags/my-feature
```

---

### 5.3 Percentage rollout

Rolls out to a deterministic 50% of users (keyed by Stellar address hash — the same user always gets the same result):

```bash
curl -X PATCH \
     -H "X-Admin-Key: $ADMIN_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"percentage": 50}' \
     https://api.example.com/api/admin/flags/my-feature
```

---

### 5.4 Target specific users

```bash
curl -X PATCH \
     -H "X-Admin-Key: $ADMIN_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"targetUsers": ["GABC...1", "GDEF...2"]}' \
     https://api.example.com/api/admin/flags/my-feature
```

All flag changes are audit-logged automatically with the admin address, timestamp, previous value, and new value.

---

## 6. Rollback Procedure for Failed Deployments

### Step 1 — Detect failure

```bash
curl -o /dev/null -w "%{http_code}" https://api.example.com/health/ready
# 503 = database unreachable or service not ready
# 200 = healthy
```

Also check structured logs for `"level":"error"` events and the BullMQ dead-letter queue.

---

### Step 2 — Re-deploy previous version

**Docker:**

```bash
# Re-deploy the last known-good image tag
docker compose up -d --no-deps api --env IMAGE_TAG=<previous-tag>

# Or roll back to a specific git SHA
git -C /workspaces/stellar-trust-escrow checkout <previous-sha>
docker compose build api && docker compose up -d api
```

**PM2 / direct Node:**

```bash
git -C /workspaces/stellar-trust-escrow checkout <previous-sha>
cd backend && npm ci
pm2 reload stellar-escrow-api
```

---

### Step 3 — Assess migration state

```bash
cd backend && npx prisma migrate status
```

- If no new migration was applied: re-deploy is sufficient.
- If a migration was applied and is **reversible** (additive only — new columns with defaults, new tables): write a compensating migration and deploy it.
- If a migration was applied and is **destructive** (dropped columns, dropped tables, data transforms): restore from the pre-deploy backup.

```bash
./scripts/backup.sh restore --snapshot pre-deploy-<timestamp>
```

---

### Step 4 — Verify rollback

```bash
# Readiness probe
curl -o /dev/null -w "%{http_code}" https://api.example.com/health/ready
# Expected: 200

# Run test suite against staging
cd backend && npm test
```

---

### Step 5 — Open incident ticket

Document the following in the ticket:

- Deployment SHA that failed and the previous SHA rolled back to
- Whether a migration was involved and what action was taken
- Timeline: detection time, rollback start, rollback complete
- Link to the post-mortem (see Section 7)

---

## 7. Incident Response Checklist

**Severity levels:**

| Level | Description | Response time |
|---|---|---|
| P1 | Funds at risk, contract exploit, full outage | Immediate |
| P2 | Partial outage, data inconsistency | < 30 minutes |
| P3 | Degraded performance, non-critical feature down | < 2 hours |

---

### Detect

- [ ] Alert fired or user report received
- [ ] Check `GET /health` for dependency status (`DB`, `Redis`, `Stellar RPC`, `email queue`)
- [ ] Check structured logs for `"level":"error"` events (filter by `correlationId` to trace a specific request)
- [ ] Check BullMQ dead-letter queue for failed jobs

```bash
# Health check
curl -sf https://api.example.com/health | jq .

# Dead-letter counts
redis-cli llen bull:webhookQueue:failed
redis-cli llen bull:emailQueue:failed
redis-cli llen bull:eventQueue:failed
```

---

### Contain

- [ ] Identify affected scope: single tenant, all users, or specific feature
- [ ] If a smart contract exploit is suspected: follow `docs/EMERGENCY_PAUSE.md` for the on-chain pause procedure
- [ ] Isolate the affected service if needed (remove from load balancer, scale to 0)
- [ ] If credentials may be compromised: rotate affected secrets immediately (see Section 3)

---

### Communicate

- [ ] Notify the on-call channel within **15 minutes** of detection
- [ ] Update the status page with incident start time and affected services
- [ ] Notify affected tenants if their data may be impacted (required for any potential data breach)

Message template:

```
[INCIDENT] <short description>
Severity: P<1|2|3>
Started: <ISO timestamp>
Affected: <services / tenants>
Status: Investigating
```

---

### Resolve

- [ ] Apply fix or execute rollback procedure (see Section 6)
- [ ] Verify with health probes: `GET /health/ready` returns `200`
- [ ] Run smoke tests: `cd backend && npm test -- --testPathPattern smoke`
- [ ] Drain and re-process dead-letter jobs:

```bash
# Re-queue failed webhook jobs
redis-cli lrange bull:webhookQueue:failed 0 -1  # inspect
# Use Bull Board UI or BullMQ CLI to retry failed jobs
```

- [ ] Update on-call channel and status page with resolution time

---

### Post-mortem

- [ ] Write incident report within **48 hours** using `docs/incidents/templates/`
- [ ] Identify root cause and all contributing factors
- [ ] Document corrective actions with assigned owners and due dates
- [ ] Schedule a review meeting for P1/P2 incidents

---

*This runbook covers the Node.js API, BullMQ workers, PostgreSQL, Redis, and the Soroban smart contract layer. For contract-specific emergency procedures see `docs/EMERGENCY_PAUSE.md`. For backup and restore procedures see `scripts/backup.sh --help`.*
