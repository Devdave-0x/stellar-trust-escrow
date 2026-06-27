# Environment Variable Reference

This document is the canonical reference for environment variables used by Stellar Trust Escrow.
It covers backend, frontend, and mobile configuration names, descriptions, default behavior, example values, and production guidance.

> For backend deployment, `backend/.env.example` is the primary template. For frontend and mobile, use `frontend/.env.example` and `mobile/.env.example`.

## 1. Backend environment variables

### 1.1 Required startup and core runtime variables

- `DATABASE_URL` (string)
  - Description: PostgreSQL connection string used by Prisma and the API.
  - Example: `postgresql://escrow_user:strongpassword@postgres:5432/stellar_escrow`
  - Required: yes
  - Production: must point to a managed production database service.

- `REDIS_URL` (string)
  - Description: Redis connection string for BullMQ queues, distributed locks, rate limiting, and caching.
  - Example: `redis://redis:6379`
  - Required: yes if Redis is used; if unset, some queue and lock behavior falls back to in-memory defaults.
  - Production: use a secured Redis instance with password if required by your provider.

- `JWT_SECRET` (string)
  - Description: Signing secret for access tokens.
  - Example: `9f2a...` (use at least 32 random characters)
  - Required: yes
  - Production: must be a strong secret and must differ from `JWT_REFRESH_SECRET`.

- `JWT_REFRESH_SECRET` (string)
  - Description: Signing secret for refresh tokens.
  - Example: `d3e5...` (use at least 32 random characters)
  - Required: yes
  - Production: must be a strong secret and must differ from `JWT_SECRET`.

- `MFA_SECRET` (string)
  - Description: Signing secret used by MFA token flows and multi-factor authentication.
  - Example: `8c1b...` (use at least 32 random characters)
  - Required: yes
  - Production: must be unique and not reused from other JWT secrets.

- `STELLAR_NETWORK` (string)
  - Description: Stellar network environment.
  - Allowed: `testnet`, `mainnet`
  - Example: `mainnet`
  - Required: yes
  - Production: set to `mainnet`.

- `SOROBAN_RPC_URL` (string)
  - Description: Soroban JSON-RPC endpoint used for contract calls and event fetching.
  - Example: `https://soroban-mainnet.stellar.org`
  - Required: yes
  - Production: use a managed or highly available RPC endpoint.

- `CONTRACT_ID` (string)
  - Description: Deployed escrow contract address.
  - Example: `GA...` Stellar address
  - Required: yes for startup validation and contract-specific flows.
  - Production: set to the deployed escrow contract address.

### 1.2 Secrets backend and secrets cache

- `SECRETS_BACKEND` (string)
  - Description: Determines secret retrieval method.
  - Allowed: `env`, `vault`
  - Default: `env`
  - Example: `vault`
  - Required: no
  - Production: `vault` is recommended when you have Vault infrastructure.

- `VAULT_ADDR` (string)
  - Description: HashiCorp Vault address.
  - Default: `http://127.0.0.1:8200`
  - Example: `https://vault.example.com`
  - Required: yes when `SECRETS_BACKEND=vault`

- `VAULT_ROLE_ID` (string)
  - Description: Vault AppRole role ID used for authentication.
  - Example: `a1b2c3...`
  - Required: yes when `SECRETS_BACKEND=vault`

- `VAULT_SECRET_ID` (string)
  - Description: Vault AppRole secret ID used to authenticate.
  - Example: `x1y2z3...`
  - Required: yes when `SECRETS_BACKEND=vault`

- `VAULT_TOKEN` (string)
  - Description: Static Vault token for local development or CI.
  - Example: `s.XYZ...`
  - Required: only for vault auth via token, not recommended for production.

- `VAULT_KV_PATH` (string)
  - Description: Vault KV v2 path used to mount app secrets.
  - Default: `stellar-trust/app`
  - Example: `stellar-trust/app`
  - Required: only when using `vault`.

- `VAULT_NAMESPACE` (string)
  - Description: Vault Enterprise namespace for multi-tenant Vault deployments.
  - Example: `prod`
  - Required: no unless your Vault deployment uses namespaces.

- `SECRETS_CACHE_TTL_MS` (integer)
  - Description: In-process secret cache TTL in milliseconds.
  - Default: `300000`
  - Example: `300000`
  - Required: no

- `SECRETS_ROTATION_INTERVAL_MS` (integer)
  - Description: How often the application refreshes its secret cache.
  - Default: `3600000`
  - Example: `3600000`
  - Required: no

### 1.3 Database and Prisma

- `DIRECT_URL` (string)
  - Description: Direct PostgreSQL connection string used by Prisma migrate.
  - Example: `postgresql://user:password@db:5432/stellar_escrow`
  - Required: no
  - Production: use a non-pooled URL if Prisma migration tooling requires it.

- `READ_REPLICA_URLS` (string)
  - Description: Comma-separated read replica URLs for Prisma read scaling.
  - Example: `postgresql://replica1:5432/db,postgresql://replica2:5432/db`
  - Required: no

- `DB_RETRY_BASE_MS` (integer)
  - Description: Base delay for DB retry backoff.
  - Default: `50`
  - Example: `50`

- `DB_RETRY_MAX` (integer)
  - Description: Maximum number of DB retry attempts.
  - Default: `3`
  - Example: `3`

- `DB_RETRY_MAX_MS` (integer)
  - Description: Maximum retry delay in milliseconds.
  - Default: `200`
  - Example: `200`

### 1.4 Stellar network and contract configuration

- `STELLAR_HORIZON_URL` (string)
  - Description: Horizon endpoint used for asset data, order book lookups, and network checks.
  - Example: `https://horizon.stellar.org`
  - Required: no if defaults are acceptable, but recommended in production.

- `STELLAR_NETWORK_PASSPHRASE` (string)
  - Description: Stellar network passphrase.
  - Example: `Public Global Stellar Network ; September 2015`
  - Required: no for most backend code; present for local examples and shell tooling.

- `CONTRACT_ADDRESS` (string)
  - Description: Contract address alias used by local scripts and documentation.
  - Example: `GA...`
  - Required: no for backend runtime, but keep in sync with `CONTRACT_ID` for local tooling.

- `ESCROW_CONTRACT_ID` (string)
  - Description: Deployed escrow contract address used by event indexing and relayer flows.
  - Example: `GA...`
  - Required: yes for indexer and relayer functionality.
  - Production: set it to the same value as `CONTRACT_ID`.

> Note: The repository currently validates `CONTRACT_ID` at startup but reads `ESCROW_CONTRACT_ID` for event indexing and relayer routes. For production you should set both to the same deployed contract address.

### 1.5 App server and tenant defaults

- `PORT` (integer)
  - Description: HTTP port for the backend API server.
  - Default: `4000`
  - Example: `4000`

- `NODE_ENV` (string)
  - Description: Node environment mode.
  - Default: `development`
  - Example: `production`

- `DEFAULT_TENANT_ID` (string)
  - Description: Default tenant identifier used when multi-tenancy is not explicitly selected.
  - Default: `tenant_default`
  - Example: `tenant_default`

- `DEFAULT_TENANT_SLUG` (string)
  - Description: Default tenant slug.
  - Default: `default`

- `DEFAULT_TENANT_NAME` (string)
  - Description: Display name for the default tenant.
  - Default: `Default Tenant`

### 1.6 Email and notification delivery

- `EMAIL_PROVIDER` (string)
  - Description: Email backend provider.
  - Default: `bullmq`
  - Example: `console`, `sendgrid`, `bullmq`

- `EMAIL_FROM` (string)
  - Description: Default sender email address.
  - Default: `no-reply@stellartrustescrow.local`
  - Example: `no-reply@example.com`

- `EMAIL_FROM_NAME` (string)
  - Description: Display name for automated emails.
  - Default: `Stellar Trust Escrow`

- `EMAIL_BASE_URL` (string)
  - Description: Public base URL used by email links.
  - Default: `http://localhost:<PORT>`
  - Example: `https://app.example.com`

- `EMAIL_UNSUBSCRIBE_SECRET` (string)
  - Description: HMAC secret for unsubscribe tokens.
  - Example: `change_this_secret`
  - Required: recommended for production when email is enabled.

- `SENDGRID_API_KEY` (string)
  - Description: SendGrid API key for transactional email delivery.
  - Example: `SG.xxxxx`
  - Required: only if `EMAIL_PROVIDER=sendgrid`

- `ALERT_EMAIL_ENABLED` (boolean)
  - Description: Enable alert email notifications.
  - Example: `true`
  - Required: no

- `ALERT_EMAIL_RECIPIENTS` (string)
  - Description: Comma-separated email recipients for alerts.
  - Example: `ops@example.com,alerts@example.com`
  - Required: no

- `ALERT_WEBHOOK_URL` (string)
  - Description: Webhook URL used for alert delivery.
  - Example: `https://hooks.example.com/services/...`
  - Required: no

### 1.7 Authentication, JWT, and relayer

- `JWT_ACCESS_SECRET` (string)
  - Description: Secret used by WebSocket upgrade JWT validation and some refresh token flows.
  - Example: `c4f...`
  - Required: yes for WebSocket auth and token verification.

- `JWT_ACCESS_EXPIRATION` (string)
  - Description: Access token lifetime for relay and refresh flows.
  - Default: `15m`
  - Example: `15m`

- `JWT_EXPIRES_IN` (string)
  - Description: Access token lifetime returned by the authentication controller.
  - Default: `24h`
  - Example: `24h`

- `JWT_REFRESH_EXPIRATION` (string)
  - Description: Refresh token lifetime.
  - Default: `7d`
  - Example: `7d`

- `ADMIN_API_KEY` (string)
  - Description: Static API key for `/api/admin/*` endpoints.
  - Example: `change_this_to_a_strong_random_secret`
  - Required: yes for admin route protection.

- `RELAYER_SECRET_KEY` (string)
  - Description: Relayer service private key for gasless transaction signing.
  - Example: `s3cr3t`
  - Required: only for relayer/meta-transaction support.

### 1.8 Platform and rate limiting

- `PLATFORM_FEE_PERCENT` (number)
  - Description: Marketplace platform fee percentage.
  - Default: `1.5`
  - Example: `1.5`

- `ALLOWED_ORIGINS` (string)
  - Description: Comma-separated list of allowed CORS origins.
  - Default: `http://localhost:3000`
  - Example: `https://app.example.com`

- `PUBLIC_RATE_LIMIT_WINDOW_MS` (integer)
  - Description: Public API rate limit window in milliseconds.
  - Default: `60000`

- `PUBLIC_RATE_LIMIT_IP_MAX` (integer)
  - Description: Max requests per IP per window.
  - Default: `100`

- `PUBLIC_RATE_LIMIT_WALLET_MAX` (integer)
  - Description: Max requests per Stellar wallet address per window.
  - Default: `50`

- `RATE_LIMIT_WHITELIST_IPS` (string)
  - Description: Comma-separated IP addresses exempt from public rate limiting.
  - Example: `10.0.0.1,10.0.0.2`

- `LEADERBOARD_RATE_LIMIT_MAX_REQUESTS_PER_MINUTE` (integer)
  - Description: Rate limit for leaderboard queries.
  - Default: `30`

- `REPUTATION_SEARCH_RATE_LIMIT_MAX` (integer)
  - Description: Max reputation search requests per minute.
  - Default: `120`

- `BATCH_ALLOWED_ROUTES` (string)
  - Description: Comma-separated allowed endpoints for batch controller routing.
  - Example: `/api/escrows,/api/users`

### 1.9 Elasticsearch and search indexing

- `ELASTICSEARCH_URL` (string)
  - Description: Elasticsearch cluster endpoint.
  - Example: `http://elasticsearch:9200`
  - Required: no for basic API, yes for reputation search and full-text indexing.

- `ELASTICSEARCH_API_KEY` (string)
  - Description: API key for secured Elastic Cloud or secured clusters.
  - Example: `xxxx`
  - Required: only for secured Elasticsearch deployments.

### 1.10 Indexer and event processing

- `INDEXER_POLL_INTERVAL_MS` (integer)
  - Description: How often the event indexer polls Soroban in milliseconds.
  - Default: `5000`

- `INDEXER_START_LEDGER` (integer)
  - Description: Ledger number to start indexing from if no checkpoint exists.
  - Default: `0`

- `INDEXER_BASE_BACKOFF_MS` (integer)
  - Description: Initial retry backoff for indexer RPC failures.
  - Default: `1000`

- `INDEXER_MAX_BACKOFF_MS` (integer)
  - Description: Maximum retry backoff for indexer RPC failures.
  - Default: `60000`

- `INDEXER_LOCK_TTL_MS` (integer)
  - Description: Redis lock TTL for distributed indexer coordination.
  - Default: `30000`

- `INDEXER_LOCK_RETRY_COUNT` (integer)
  - Description: How many times to retry obtaining the indexer lock.
  - Default: `3`

- `INDEXER_LOCK_RETRY_DELAY_MS` (integer)
  - Description: Delay between lock retries.
  - Default: `200`

- `ESCORROW_CONTRACT_ADDRESS` (string)
  - Description: Legacy / commented contract address variable referenced in `escrowIndexer` documentation comments.
  - Required: no; present for compatibility with older script references.

### 1.11 Logging and observability

- `LOG_LEVEL` (string)
  - Description: Logging verbosity.
  - Default: `info`
  - Example: `debug`

- `LOG_DIR` (string)
  - Description: Directory for log files.
  - Default: `logs`

- `LOG_FILE_NAME` (string)
  - Description: Log file name.
  - Default: `api.log`

- `LOG_ROTATION_PERIOD` (string)
  - Description: Log rotation period.
  - Default: `1d`

- `LOG_ROTATION_MAX_SIZE` (string)
  - Description: Maximum size per rotated log file.
  - Default: `1G`

- `LOG_RETENTION_DAYS` (integer)
  - Description: How many days rotated logs are kept.
  - Default: `30`

- `LOG_AGGREGATOR_URL` (string)
  - Description: Remote log aggregation endpoint.
  - Required: no

- `LOG_AGGREGATOR_TOKEN` (string)
  - Description: Authentication token for external log aggregation.
  - Required: no

### 1.12 Sentry and tracing

- `SENTRY_DSN` (string)
  - Description: Backend Sentry DSN.
  - Example: `https://...@sentry.io/...`
  - Required: no, but recommended for error monitoring.

- `SENTRY_ENVIRONMENT` (string)
  - Description: Sentry environment label.
  - Default: `development`
  - Example: `production`

- `SENTRY_RELEASE` (string)
  - Description: Release tag or git SHA for Sentry error grouping.
  - Example: `v1.2.3`

- `SENTRY_TRACES_SAMPLE_RATE` (number)
  - Description: Fraction of transactions sampled for performance tracing.
  - Example: `0.1`

- `OTEL_SERVICE_NAME` (string)
  - Description: OpenTelemetry service name.
  - Default: `stellar-trust-escrow`

- `OTEL_ENVIRONMENT` (string)
  - Description: OpenTelemetry environment label.
  - Default: `development`

- `OTEL_EXPORTER_OTLP_ENDPOINT` (string)
  - Description: OTLP collector endpoint.
  - Default: `http://localhost:4318`

- `TRACING_ENABLED` (boolean)
  - Description: Enable tracing if not explicitly disabled.
  - Default: `true` unless set to `false`

### 1.13 KYC and Sumsub

- `SUMSUB_APP_TOKEN` (string)
  - Description: Sumsub application token.
  - Example: `x1y2z3...`
  - Required: yes when KYC is enabled.

- `SUMSUB_SECRET_KEY` (string)
  - Description: Sumsub HMAC secret for webhook validation.
  - Required: yes when KYC is enabled.

- `SUMSUB_BASE_URL` (string)
  - Description: Sumsub API base URL.
  - Default: `https://api.sumsub.com`

- `SUMSUB_LEVEL_NAME` (string)
  - Description: Sumsub KYC level name.
  - Default: `basic-kyc-level`

### 1.14 Payments and Stripe

- `STRIPE_SECRET_KEY` (string)
  - Description: Stripe secret key for checkout sessions and webhook handling.
  - Example: `sk_live_...`
  - Required: yes when Stripe payments are enabled.

- `STRIPE_WEBHOOK_SECRET` (string)
  - Description: Stripe webhook signing secret.
  - Example: `whsec_...`

- `FRONTEND_URL` (string)
  - Description: Public frontend URL used for Stripe success/cancel redirect links.
  - Example: `https://app.example.com`
  - Required: yes when Stripe checkout is enabled.

- `USDC_ISSUER` (string)
  - Description: Stellar USDC issuer public key used by currency swap price lookups.
  - Example: `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`
  - Required: yes if `paymentService` executes USDC order book lookups.

### 1.15 Monitoring and incident response

- `MONITOR_ACCOUNTS` (string)
  - Description: Comma-separated Stellar account addresses monitored for divergence.
  - Example: `GABC...,GDEF...`

- `SLACK_WEBHOOK_URL` (string)
  - Description: Slack incoming webhook for divergence alerts.

- `MONITOR_ALERT_EMAIL` (string)
  - Description: Email address that receives divergence alert notifications.

- `MONITOR_ALERT_WINDOW_MS` (integer)
  - Description: Time window before unresolved divergence triggers an alert.
  - Default: `300000`

- `MONITOR_ALERT_CHECK_MS` (integer)
  - Description: Interval for scanning pending divergence alerts.
  - Default: `60000`

- `MONITORING_SYSTEM_ENABLED` (boolean)
  - Description: Enables the alert monitoring system.
  - Example: `true`

- `SLACK_INCIDENT_WEBHOOK` (string)
  - Description: Slack webhook URL for non-divergence incident notifications.

- `ONCALL_SCHEDULE` (string)
  - Description: JSON array of on-call shifts used in alert notifications.
  - Example: `[{
      "name":"Alice",
      "email":"alice@example.com",
      "startUtc":"2026-01-05T00:00:00Z",
      "endUtc":"2026-01-12T00:00:00Z"
    }]`

- `RUNBOOK_BASE_URL` (string)
  - Description: Base URL for runbook links included in alerts.
  - Example: `https://github.com/your-org/stellar-trust-escrow/blob/main/docs/incidents/runbooks`

- `PAGERDUTY_ROUTING_KEY` (string)
  - Description: PagerDuty Events API v2 integration key.

### 1.16 Backup and PITR

- `BACKUP_DIR` (string)
  - Description: Local backup directory for database dumps.
  - Default: `/var/backups/stellar-trust`

- `BACKUP_RETENTION_DAYS` (integer)
  - Description: Retention period for local backups.
  - Default: `7`

- `BACKUP_MAX_AGE_HOURS` (integer)
  - Description: Alert threshold if no successful backup is found.
  - Default: `26`

- `BACKUP_S3_BUCKET` (string)
  - Description: Optional S3 destination for offsite backup copies.
  - Example: `s3://my-company-backups/stellar-trust`

- `WAL_ARCHIVE_DIR` (string)
  - Description: Local WAL archive directory for PITR.
  - Example: `/var/lib/postgresql/wal_archive`

- `WAL_ARCHIVE_S3_BUCKET` (string)
  - Description: S3 bucket for WAL archive upload.
  - Example: `s3://my-company-backups/stellar-trust/wal`

- `S3_SSE_ALGORITHM` (string)
  - Description: Server-side encryption algorithm used for S3 uploads.
  - Default: `AES256`

- `SLACK_BACKUP_WEBHOOK` (string)
  - Description: Slack webhook for backup success/failure notifications.

### 1.17 PDF generation and storage

- `PDF_STORAGE` (string)
  - Description: Storage backend for generated PDFs.
  - Example: `s3`
  - Required: no

- `PDF_LOCAL_DIR` (string)
  - Description: Local directory for temporary PDF files.
  - Default: `/tmp/escrow-pdfs`

- `PDF_S3_BUCKET` (string)
  - Description: S3 bucket used when `PDF_STORAGE=s3`.

### 1.18 Dispute evidence and IPFS

- `IPFS_GATEWAY_URL` (string)
  - Description: Default gateway used for IPFS fetches.
  - Default: `https://ipfs.io`

- `IPFS_API_URL` (string)
  - Description: IPFS API endpoint used for evidence uploads.
  - Example: `https://api.thegraph.com/ipfs/api/v0`

- `PINATA_JWT` (string)
  - Description: JWT used by Pinata for authenticated IPFS uploads.

- `PINATA_API_KEY` (string)
  - Description: Pinata API key used by IPFS garbage collection.

- `PINATA_SECRET_API_KEY` (string)
  - Description: Pinata secret API key used by IPFS garbage collection.

- `IPFS_CACHE_TTL_SEC` (integer)
  - Description: Amount of time IPFS metadata is cached.
  - Default: `3600`

- `IPFS_FETCH_TIMEOUT_MS` (integer)
  - Description: Timeout for IPFS fetch requests.
  - Default: `15000`

- `IPFS_GATEWAYS` (string)
  - Description: Comma-separated fallback gateway list.

- `IPFS_HEALTH_INTERVAL` (integer)
  - Description: Interval for IPFS health checks.
  - Default: `60000`

- `IPFS_RECOVERY_WINDOW` (integer)
  - Description: Time window used by IPFS recovery logic.
  - Default: `120000`

- `IPFS_REQUEST_TIMEOUT` (integer)
  - Description: Per-request IPFS timeout.
  - Default: `8000`

- `IPFS_SYNC_MAX_RETRIES` (integer)
  - Description: Max retries for IPFS sync jobs.
  - Default: `3`

- `IPFS_SYNC_RETRY_DELAY_MS` (integer)
  - Description: Delay between IPFS sync retries.
  - Default: `2000`

- `GC_SAFETY_BUFFER_HOURS` (integer)
  - Description: Safety buffer before IPFS garbage collection removes old objects.
  - Default: `24`

### 1.19 File and upload limits

- `MAX_FILE_SIZE` (integer)
  - Description: Maximum uploaded file size in bytes.
  - Default: `10485760` (10 MB)

- `MAX_FILES` (integer)
  - Description: Maximum number of uploaded files per evidence submission.
  - Default: `5`

- `MAX_SCAN_FILE_SIZE` (integer)
  - Description: Maximum file size scanned by ClamAV.
  - Default: `10485760`

- `MAX_BATCH_ITEM_BODY_BYTES` (integer)
  - Description: Maximum request payload size for batch endpoints.
  - Default: `65536`

- `MAX_BATCH_SIZE` (integer)
  - Description: Maximum number of operations in a single batch request.
  - Default: `20`

- `MAX_TRANSCODE_SIZE` (integer)
  - Description: Maximum video transcoding input size.
  - Default: `52428800` (50 MB)

- `THUMBNAIL_SIZE` (integer)
  - Description: Image thumbnail width in pixels.
  - Default: `300`

- `WEBP_QUALITY` (integer)
  - Description: WebP compression quality.
  - Default: `85`

- `WEB_STANDARD_SIZE` (integer)
  - Description: Standard image width for resizing.
  - Default: `1920`

### 1.20 Queue behavior and workers

- `QUEUE_CONCURRENCY` (integer)
  - Description: Worker concurrency for background queues.
  - Default: `5`

- `WEBHOOK_MAX_RETRY_ATTEMPTS` (integer)
  - Description: Number of retry attempts for webhook delivery.
  - Default: `5`

- `WEBHOOK_BACKOFF_BASE_MS` (integer)
  - Description: Base backoff delay for webhook retries.
  - Default: `5000`

- `WEBHOOK_KEEP_FAILED_JOBS` (integer)
  - Description: How many failed webhook jobs to retain.
  - Default: `100`

- `QUERY_TIMEOUT_MS` (integer)
  - Description: Horizon query timeout.
  - Default: `30000`

### 1.21 Surveillance, SLA, and RPC monitoring

- `RPC_MONITOR_ENDPOINTS` (string)
  - Description: Comma-separated Soroban/Horizon RPC endpoints to monitor.

- `RPC_MONITOR_POLL_INTERVAL_MS` (integer)
  - Description: Poll cadence for RPC SLA checks.
  - Default: `10000`

- `RPC_LATENCY_THRESHOLD_MS` (integer)
  - Description: Latency threshold in milliseconds for RPC alerting.
  - Default: `1500`

- `RPC_FAILURE_RATE_THRESHOLD` (number)
  - Description: Failure rate threshold fraction.
  - Default: `0.02`

- `RPC_ALERT_WINDOW` (integer)
  - Description: Number of probes used to compute failure rate.
  - Default: `50`

- `SLACK_RPC_WEBHOOK` (string)
  - Description: Slack webhook for RPC alert notifications.

### 1.22 Fraud detection and reputation

- `FRAUD_SCORE_THRESHOLD` (integer)
  - Description: Score threshold used by fraud detection.
  - Default: `50`

- `FRAUD_RAPID_MS` (integer)
  - Description: Rapid completion window in milliseconds.
  - Default: `3600000` (1 hour)

- `FRAUD_REPEATED_PAIR` (integer)
  - Description: Repeated wallet pair threshold.
  - Default: `3`

- `FRAUD_W_PAIR` (integer)
  - Description: Weight applied for repeated wallet pair activity.
  - Default: `25`

- `FRAUD_W_RAPID` (integer)
  - Description: Weight applied for rapid completion.
  - Default: `20`

- `FRAUD_W_ROUND` (integer)
  - Description: Weight applied for round-number transactions.
  - Default: `10`

- `FRAUD_W_SAME_IP` (integer)
  - Description: Weight applied for same-IP transactions.
  - Default: `40`

- `FRAUD_W_ZERO_MS` (integer)
  - Description: Weight applied for zero-milestone intervals.
  - Default: `5`

### 1.23 WebSocket configuration

- `WS_HEARTBEAT_INTERVAL_MS` (integer)
  - Description: WebSocket heartbeat interval.
  - Default: `30000`

- `WS_MAX_CONNECTIONS` (integer)
  - Description: Maximum concurrent WebSocket connections.
  - Default: `100`

- `WS_ESCROW_SUBSCRIBE_REQUIRE_PARTY` (boolean)
  - Description: Require escrow client/freelancer membership for `escrow:<id>` subscriptions.
  - Example: `true`

### 1.24 MFA and WebAuthn

- `MFA_ENCRYPTION_KEY` (string)
  - Description: Encryption key used by the MFA service.
  - Example: `0...0` hex string
  - Required: no, the app will generate a fallback secret in dev/test.

- `MFA_HIGH_VALUE_THRESHOLD` (number)
  - Description: Threshold amount that triggers higher MFA requirements.
  - Default: `10000`

- `WEBAUTHN_ORIGIN` (string)
  - Description: Origin used for WebAuthn credential registration.
  - Default: `http://localhost:3000`

- `WEBAUTHN_RP_ID` (string)
  - Description: WebAuthn relying party identifier.
  - Default: `localhost`

- `WEBAUTHN_RP_NAME` (string)
  - Description: Display name for WebAuthn relying party.
  - Default: `StellarTrustEscrow`

### 1.25 Operational and performance defaults

- `NODE_RECOVERY_WINDOW_MS` (integer)
  - Description: Failure recovery window for Stellar node queries.
  - Default: `300000`

- `HEALTH_CHECK_INTERVAL_MS` (integer)
  - Description: Interval for health checks against Stellar network endpoints.
  - Default: `60000`

- `HEALTH_STELLAR_TIMEOUT_MS` (integer)
  - Description: Timeout for Stellar health route checks.
  - Default: `5000`

- `BROTLI_QUALITY` (integer)
  - Description: Brotli compression quality.
  - Default: `4`

- `COMPRESSION_LEVEL` (integer)
  - Description: Gzip compression level.
  - Default: `6`

- `COMPRESSION_THRESHOLD` (integer)
  - Description: Minimum response size in bytes before compression.
  - Default: `1024`

- `SCAN_TIMEOUT_MS` (integer)
  - Description: Virus scan timeout.
  - Default: `30000`

- `SHUTDOWN_GRACE_MS` (integer)
  - Description: Graceful shutdown timeout.
  - Default: `30000`

- `ANALYTICS_DB_URL` (string)
  - Description: URL used by the optional analytics middleware.

- `ANALYTICS_FLUSH_INTERVAL_MS` (integer)
  - Description: Flush interval for analytics data.
  - Default: `10000`

- `API_DOCS_URL` (string)
  - Description: URL returned in deprecation notices and API docs links.
  - Default: `/docs`

- `AUDIT_BATCH_SIZE` (integer)
  - Description: Batch size used by audit verification jobs.
  - Default: `500`

- `AUDIT_LOCK_TTL_SEC` (integer)
  - Description: Audit verification lock TTL.
  - Default: `7200`

- `AUDIT_VERIFY_INTERVAL_MS` (integer)
  - Description: Audit verification interval.
  - Default: `3600000`

- `BATCH_ALLOWED_ROUTES` (string)
  - Description: Allowed routes for batch processing.

- `COMPLIANCE_REPORT_SCHEDULER` (string)
  - Description: Enables or disables compliance report scheduling.
  - Example: `disabled`

- `COMPLIANCE_REPORT_SCHEDULER_INTERVAL_MS` (integer)
  - Description: Interval between compliance report runs.
  - Default: `60000`

- `CHAOS_ENABLED` (boolean)
  - Description: Enable chaos experiments.
  - Example: `true`

- `CHAOS_EXPERIMENT` (string)
  - Description: Specific chaos experiment identifier.

- `CHAOS_CONNECTIONS` (integer)
  - Description: Target connections for chaos load tests.
  - Default: `10`

- `CHAOS_LOAD_DURATION` (integer)
  - Description: Duration in seconds for chaos load tests.
  - Default: `10`

- `CHAOS_TARGET_URL` (string)
  - Description: Target service URL used by chaos tests.
  - Default: `http://localhost:4000`

- `CHAOS_REPORT_DIR` (string)
  - Description: Directory to write chaos reports.

- `GAS_ESTIMATOR_API_KEYS` (string)
  - Description: Comma-separated keys for external gas estimator services.

- `PDF_STORAGE` (string)
  - Description: Whether to store generated PDFs locally or in S3.

- `ANALYZE` (boolean)
  - Description: Next.js bundle analyzer flag.
  - Example: `true`

- `NEXT_OUTPUT` (string)
  - Description: Next.js output mode.
  - Example: `standalone`

- `CI` (boolean)
  - Description: CI environment indicator used by scripts.

- `VERCEL_GIT_COMMIT_SHA` (string)
  - Description: Vercel build commit SHA used by build tooling.

- `PLAYWRIGHT_BASE_URL` (string)
  - Description: Base URL for Playwright tests.

- `PLAYWRIGHT_DISABLE_WEBSERVER` (boolean)
  - Description: Disable Playwright's built-in server.

- `NEXT_PUBLIC_API_BASE` (string)
  - Description: Alternate frontend API base URL consumed by some admin and export pages.

- `NEXT_PUBLIC_API_URL` (string)
  - Description: Public frontend API base URL.
  - Example: `https://api.example.com`
  - Required: yes for production frontend.

- `NEXT_PUBLIC_SITE_URL` (string)
  - Description: Public site URL used for metadata and canonical links.
  - Example: `https://app.example.com`

- `NEXT_PUBLIC_WS_URL` (string)
  - Description: Full websocket URL if the client should override derivation from `NEXT_PUBLIC_API_URL`.

- `NEXT_PUBLIC_EXCHANGE_RATE_API_URL` (string)
  - Description: Exchange rate API used by the frontend.
  - Default: `https://open.er-api.com/v6/latest/USD`

- `NEXT_PUBLIC_FX_CACHE_TTL_MS` (integer)
  - Description: Frontend currency cache TTL.
  - Default: `3600000`

- `NEXT_PUBLIC_USDC_ISSUER` (string)
  - Description: Public USDC issuer address used by currency swap components.

- `NEXT_PUBLIC_HORIZON_URL` (string)
  - Description: Optional frontend Horizon URL used by wallet components.
  - Default: `https://horizon-testnet.stellar.org`

- `NEXT_PUBLIC_SENTRY_DSN` (string)
  - Description: Public Sentry DSN used by frontend error tracking.

- `NEXT_PUBLIC_SENTRY_ENV` (string)
  - Description: Frontend Sentry environment label.
  - Default: `development`

- `NEXT_PUBLIC_SENTRY_RELEASE` (string)
  - Description: Frontend Sentry release metadata.

### 1.26 Mobile environment variables

- `EXPO_PUBLIC_API_URL` (string)
  - Description: Backend API URL used by the mobile app.
  - Example: `http://localhost:4000`
  - Required: yes for mobile runtime.

- `EXPO_PUBLIC_STELLAR_NETWORK` (string)
  - Description: Stellar network used by the mobile app.
  - Default: `testnet`
  - Example: `mainnet`

- `EXPO_PUBLIC_OFFLINE_CACHE_TTL_MS` (integer)
  - Description: Offline cache TTL in milliseconds for the mobile app.
  - Default: `300000`

## 2. Production guidance

### 2.1 Variables that must change in production

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `MFA_SECRET`
- `ADMIN_API_KEY`
- `EMAIL_UNSUBSCRIBE_SECRET`
- `SENTRY_DSN`
- `SENTRY_RELEASE`
- `SUMSUB_APP_TOKEN`
- `SUMSUB_SECRET_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PINATA_JWT`
- `ELASTICSEARCH_API_KEY`
- `VAULT_ROLE_ID`, `VAULT_SECRET_ID`, `VAULT_TOKEN`
- `REDIS_URL`, `DATABASE_URL`, `ELASTICSEARCH_URL`
- `CONTRACT_ID`, `ESCROW_CONTRACT_ID`, `NEXT_PUBLIC_CONTRACT_ADDRESS`

### 2.2 Where to obtain external values

- `DATABASE_URL`: from your managed PostgreSQL service.
- `REDIS_URL`: from your Redis provider.
- `SENTRY_DSN`, `SENTRY_RELEASE`, `SENTRY_ENVIRONMENT`: from Sentry project settings.
- `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `SUMSUB_BASE_URL`: from Sumsub dashboard.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`: from Stripe dashboard.
- `PINATA_JWT`: from Pinata user settings.
- `ELASTICSEARCH_API_KEY`: from Elastic Cloud or secured Elasticsearch cluster.
- `VAULT_ADDR`, `VAULT_ROLE_ID`, `VAULT_SECRET_ID`, `VAULT_TOKEN`: from HashiCorp Vault administration.
- `CONTRACT_ID`, `ESCROW_CONTRACT_ID`, `NEXT_PUBLIC_CONTRACT_ADDRESS`: from Soroban contract deployment output.
- `NEXT_PUBLIC_API_URL`, `EXPO_PUBLIC_API_URL`: the public backend URL exposed through your reverse proxy or load balancer.

### 2.3 Notes on `.env.example`

- `backend/.env.example` is a template and may include placeholder values.
- `frontend/.env.example` and `mobile/.env.example` contain public client variables and should never include real secrets.
- Do not commit production secrets into `.env` files.

### 2.4 Alignment notes

- `backend/scripts/check-env.js` validates that `CONTRACT_ID` exists, but backend runtime code consumes `ESCROW_CONTRACT_ID` for indexers and relayers. Set both to the same contract address.
- `frontend/next.config.js` throws in production if `NEXT_PUBLIC_API_URL` is not defined.
- `mobile/lib/stellar.ts` uses `EXPO_PUBLIC_STELLAR_NETWORK` and derives the correct Horizon URL and passphrase automatically.

### 2.5 Example backend production snippet

```env
DATABASE_URL=postgresql://escrow_user:strongpassword@postgres:5432/stellar_escrow
REDIS_URL=redis://redis:6379
ELASTICSEARCH_URL=http://elasticsearch:9200
STELLAR_NETWORK=mainnet
SOROBAN_RPC_URL=https://soroban-mainnet.stellar.org
STELLAR_HORIZON_URL=https://horizon.stellar.org
CONTRACT_ID=GA...YOUR_CONTRACT_ADDRESS...
ESCROW_CONTRACT_ID=GA...YOUR_CONTRACT_ADDRESS...
JWT_SECRET=<secure-random-32+ chars>
JWT_REFRESH_SECRET=<secure-random-32+ chars>
MFA_SECRET=<secure-random-32+ chars>
ADMIN_API_KEY=<strong-random-secret>
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://app.example.com
```

### 2.6 Example frontend runtime snippet

```env
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_SITE_URL=https://app.example.com
NEXT_PUBLIC_STELLAR_NETWORK=mainnet
NEXT_PUBLIC_CONTRACT_ADDRESS=GA...YOUR_CONTRACT_ADDRESS...
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-mainnet.stellar.org
NEXT_PUBLIC_HORIZON_URL=https://horizon.stellar.org
NEXT_PUBLIC_WS_URL=wss://api.example.com/ws
NEXT_PUBLIC_EXCHANGE_RATE_API_URL=https://open.er-api.com/v6/latest/USD
NEXT_PUBLIC_USDC_ISSUER=GA5Z...YOUR_USDC_ISSUER...
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
NEXT_PUBLIC_SENTRY_ENV=production
NEXT_PUBLIC_SENTRY_RELEASE=v1.2.3
```

### 2.7 Example mobile runtime snippet

```env
EXPO_PUBLIC_API_URL=https://api.example.com
EXPO_PUBLIC_STELLAR_NETWORK=mainnet
EXPO_PUBLIC_OFFLINE_CACHE_TTL_MS=300000
```
