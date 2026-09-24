# IPFS Evidence Durability Policy

This policy defines how dispute evidence stored on IPFS is pinned, replicated, served, retained, and deleted, and how its integrity is verified. Evidence decides who gets paid in a dispute, so losing it (or losing the ability to read it) is a correctness failure, not an inconvenience.

Each section states the **policy** (what operators must guarantee) and the **current implementation** (what the code in `backend/services/ipfs*.js`, `backend/api/middleware/fileUpload.js`, and `backend/workers/ipfsSyncWorker.js` does today). Gaps between the two are listed in [Known gaps](#known-gaps) and must be closed before the policy's SLAs can be claimed in production.

## Contents

- [Scope](#scope)
- [Durability SLAs](#durability-slas)
- [Pinning](#pinning)
- [Replication](#replication)
- [Gateway fallback](#gateway-fallback)
- [Encryption and privacy](#encryption-and-privacy)
- [Retention](#retention)
- [Deletion and garbage collection](#deletion-and-garbage-collection)
- [Verification](#verification)
- [Known gaps](#known-gaps)
- [Configuration reference](#configuration-reference)

## Scope

Covered: every file attached to a dispute through `POST /api/disputes/:id/evidence` (stored in `dispute_evidence` with `ipfs_cid`, and `thumbnail_cid` for images), plus evidence metadata JSON fetched by the IPFS sync worker when a `dis_rai` event is indexed.

Not covered: text-only evidence (`evidenceType: text`), which lives only in PostgreSQL and follows the database backup policy in `docs/disaster-recovery.md`.

## Durability SLAs

| Objective                                                    | Target                                                                                         | Measured by                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Evidence retrievable while its dispute is open or appealable | 99.9% of fetch attempts succeed within 10 s                                                    | gateway fetch success rate and latency (`ipfsGateway` logs) |
| Pin durability                                               | Zero evidence CIDs lost while inside the retention window                                      | weekly pin audit (see [Verification](#verification))        |
| Replication                                                  | Every evidence CID pinned by at least **2 independent providers** within 1 hour of upload      | pin audit                                                   |
| Decryptability                                               | Decryption keys for every retained CID recoverable after a full backend restart or region loss | key-store backup restore test, quarterly                    |
| Integrity                                                    | 100% of retained files match their stored SHA-256 on audit                                     | weekly hash audit                                           |
| Time to detect a lost pin                                    | under 24 hours                                                                                 | weekly audit plus provider alerts                           |

## Pinning

**Policy**

- Every evidence file and thumbnail is pinned at upload time, before the evidence row is written. An upload whose pin fails must fail the request; no evidence row may reference an unpinned CID.
- Pins use CIDv1 so CIDs are stable across providers and case-insensitive in URLs.
- The primary pinning provider is Pinata, authenticated with a JWT scoped to pinning only.
- Pins are never removed while the evidence is inside its [retention window](#retention).

**Current implementation**

- `ipfsService.pinFile` encrypts the buffer (see below) and uploads it to `https://api.pinata.cloud/pinning/pinFileToIPFS` with `cidVersion: 1` and a 60 s timeout. A non-2xx response throws, and the upload middleware returns `500 IPFS upload failed`, so no row is written.
- Uploads are limited by `MAX_FILE_SIZE` (default 10 MB) and a MIME allow-list (`ALLOWED_MIME_TYPES`, default JPEG, PNG, WebP, GIF, PDF, plain text, MP4).
- Image thumbnails (300×300 JPEG) are pinned as separate CIDs.
- See [Known gaps](#known-gaps) 1–3: the middleware currently calls `pinFile` without the MIME type, so uploads are rejected.

## Replication

**Policy**

- Each evidence CID must be pinned by at least two independent pinning services (for example Pinata plus a self-hosted IPFS node or a second commercial provider).
- A replication job re-pins any CID found on fewer than two providers. It runs hourly and on every audit.
- Providers must be in different failure domains (different companies, or different cloud regions for self-hosted nodes).

**Current implementation**

- Only Pinata is written to. The garbage collector can also talk to a self-hosted node through `IPFS_API_URL`, but nothing pins to it. Replication is a [known gap](#known-gaps) (6).

## Gateway fallback

**Policy**

- Reads must not depend on a single gateway. At least three gateways are configured, including the pinning provider's dedicated gateway.
- A failing gateway is taken out of rotation automatically and re-tested before it serves traffic again.
- Retrieved content is cached so repeat views do not depend on gateway availability.

**Current implementation** (`backend/services/ipfsGateway.js`)

- Pool: `IPFS_GATEWAYS` (comma-separated) or the defaults `ipfs.io`, `cloudflare-ipfs.com`, `gateway.pinata.cloud`, `dweb.link`, `w3s.link`.
- Each fetch races all healthy gateways in parallel and uses the first success (`Promise.any`), with a per-gateway timeout of `IPFS_REQUEST_TIMEOUT` (default 8 s).
- A gateway is quarantined after 3 failures for `IPFS_RECOVERY_WINDOW` (default 120 s), then re-admitted. A background health check runs every `IPFS_HEALTH_INTERVAL` (default 60 s). Healthy gateways are tried fastest-first.
- Responses are cached in Redis under `ipfs:asset:<cid>` for `IPFS_CACHE_TTL_SEC` (default 1 h). Without `REDIS_URL` caching is disabled.
- Links returned to clients (`fileUrl`, `thumbnailUrl`) point at a single gateway: `PINATA_GATEWAY_URL`, else `IPFS_GATEWAY_URL`, else `https://ipfs.io`. Clients that fetch those URLs directly do not get the fallback; they should go through the backend.
- The sync worker (`ipfsSyncWorker.js`) uses only `IPFS_GATEWAY_URL` with `IPFS_SYNC_MAX_RETRIES` (default 3) retries and a `IPFS_FETCH_TIMEOUT_MS` (default 15 s) timeout, not the gateway pool.

## Encryption and privacy

**Policy**

- IPFS is public: anyone who learns a CID can fetch the bytes from any gateway, forever, from any node that cached them. Evidence must therefore be encrypted before it leaves the backend, and nothing identifying may appear in plaintext on IPFS.
- Decryption keys are stored in a durable secrets store, backed up, and released only to the dispute's client, freelancer, and assigned arbiter (and to admins under audit).
- Filenames are sanitised before upload and personal data is never placed in pin metadata.
- Unpinning does **not** delete content from the network. Deletion of personal data is achieved by destroying the decryption key (crypto-shredding), not by unpinning.

**Current implementation**

- `pinFile` encrypts each file with AES-256-GCM using a fresh random 256-bit key and 96-bit IV. The uploaded payload is `authTag (16 B) || ciphertext`.
- Keys are held in an in-process `Map` keyed by CID, with the set of authorised addresses. `getDecryptionKey(cid, address)` returns the key only to listed addresses. See [Known gaps](#known-gaps) 1 and 3.
- Filenames are sanitised to `[a-zA-Z0-9._-]`, max 255 characters.
- Thumbnails are generated from the plaintext image and pinned through the same encrypting `pinFile`, so they are encrypted too.
- Files are virus-scanned before pinning (`virusScanner.js`). Infected uploads are rejected with `400` and logged against the account. Scan status (`pending | clean | infected | error`) is stored on the evidence row.

## Retention

**Policy**

| Evidence state                                               | Retention                                                                              |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Dispute open, or resolved but still inside the appeal window | Retain, pinned on 2+ providers                                                         |
| Dispute resolved and final                                   | Retain for **24 months** after the final resolution (financial record and audit trail) |
| Dispute under legal hold (flag set by an admin)              | Retain until the hold is released, regardless of age                                   |
| Upload whose evidence row was never written (failed request) | Eligible for garbage collection after 24 hours                                         |

Retention is measured from `disputes.resolved_at` (or the latest `dispute_appeals.resolved_at`, whichever is later).

**Current implementation**

- There is no retention clock or legal-hold flag. The only automated removal is the daily garbage collector, which keeps anything still referenced by a `dispute_evidence` row, so referenced evidence is currently kept indefinitely.

## Deletion and garbage collection

**Policy**

- A CID may be unpinned only when all of these hold: it is no longer referenced by any evidence row, it is outside its retention window, it is not under legal hold, and it was pinned more than 24 hours ago.
- Deletion for privacy requests (for example a GDPR erasure that is not overridden by the retention obligation) destroys the decryption key and then unpins. The ciphertext may survive on third-party nodes but is unreadable.
- Every unpin and key destruction is written to the admin audit log with the CID, reason, and operator.
- The garbage collector runs in dry-run mode first after any change to its logic, and its output is reviewed before a live run.
- The garbage collector only touches pins it created. A shared provider account must not be used for other applications.

**Current implementation** (`backend/services/ipfsGarbageCollector.js`, scheduled daily at 04:00 UTC in `workers/scheduler.js`)

1. Collects every `ipfsCid` and `thumbnailCid` referenced in `dispute_evidence`.
2. Lists all pins on the Pinata account (`PINATA_JWT` or `PINATA_API_KEY` + `PINATA_SECRET_API_KEY`), or on the node at `IPFS_API_URL` if no Pinata credentials are set.
3. Treats every pinned CID that is not referenced as an orphan and unpins it. `runGarbageCollector({ dryRun: true })` logs instead of unpinning; the scheduled run uses `dryRun: false`.
4. See [Known gaps](#known-gaps) 5: the intended 24 h safety buffer (`GC_SAFETY_BUFFER_HOURS`) does not take effect.

## Verification

Run these checks to prove the SLAs hold.

**Integrity of a single file (manual)**

```bash
# 1. Fetch the stored payload through the backend (uses the gateway pool)
# 2. Decrypt with the key returned to an authorised party
# 3. Compare the plaintext hash with the stored fileHash
sha256sum evidence.pdf
psql "$DATABASE_URL" -c "SELECT file_hash, merkle_root FROM dispute_evidence WHERE id = 123;"
```

The backend has `verifyEvidence` (in `disputeController.js`) that re-hashes uploaded files, compares them with `file_hash`, and recomputes the dispute's Merkle root with `ipfsHashService.merkleRoot`. See [Known gaps](#known-gaps) 4 and 7 before relying on it.

**Weekly pin audit (operator)**

```bash
# Every CID referenced by evidence
psql "$DATABASE_URL" -At -c "
  SELECT ipfs_cid FROM dispute_evidence WHERE ipfs_cid IS NOT NULL
  UNION
  SELECT thumbnail_cid FROM dispute_evidence WHERE thumbnail_cid IS NOT NULL;" > referenced.txt

# Every CID pinned on Pinata
curl -s -H "Authorization: Bearer $PINATA_JWT" \
  "https://api.pinata.cloud/data/pinList?status=pinned&pageLimit=1000" \
  | jq -r '.rows[].ipfs_pin_hash' | sort > pinned.txt

# Referenced but not pinned = data at risk (must be empty)
sort referenced.txt | comm -23 - pinned.txt
```

Repeat the pinned list for each replication provider. Any referenced CID pinned on fewer than two providers is re-pinned and reported.

**Gateway health**

Search the backend logs for `Gateway quarantined` and `No healthy IPFS gateways available`. A quarantine rate above a few per hour for one gateway means it should be removed from `IPFS_GATEWAYS`.

**Garbage collector dry run**

Before enabling a live run after any change, call `runGarbageCollector({ dryRun: true })` and confirm that none of the CIDs it reports as orphans appear in `referenced.txt` or were pinned in the last 24 hours.

## Known gaps

These are defects in the current code that prevent the policy above from holding. Each should become its own issue.

| #   | Gap                                                                                                                                                             | Impact                                                                                                                                                                                                        | Required change                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Decryption keys live only in an in-process `Map` (`ipfsService.js`).                                                                                            | A backend restart, deploy, or second API instance makes all previously uploaded evidence undecryptable. Violates the decryptability SLA.                                                                      | Persist keys in a secrets manager or an encrypted database table, back it up, and load it on demand.                                              |
| 2   | `fileUpload.js` calls `ipfsService.pinFile(file.buffer)` without `mimeType`, `filename`, or authorised addresses.                                               | `validateFile` rejects the `undefined` MIME type, so every evidence file upload currently fails with `500 IPFS upload failed`.                                                                                | Pass `file.mimetype`, `file.originalname`, and the dispute parties' addresses.                                                                    |
| 3   | No authorised addresses are recorded for a pinned CID (same call as gap 2).                                                                                     | Once uploads work, `getDecryptionKey` would refuse every caller.                                                                                                                                              | Record the client, freelancer, and arbiter addresses at upload.                                                                                   |
| 4   | `postEvidence` never stores `file_hash` or `merkle_root`.                                                                                                       | Integrity verification always reports `No stored hash`.                                                                                                                                                       | Compute `hashFile(buffer)` on the plaintext at upload and store it; recompute the dispute's Merkle root after each upload.                        |
| 5   | The garbage collector's safety buffer never applies: it looks up the upload time only for CIDs that have no evidence row, so the lookup always returns nothing. | Anything pinned but not yet (or never) referenced is unpinned at the next 04:00 UTC run, including an upload whose row is being written at that moment, and any unrelated content on the same Pinata account. | Use the provider's pin date (`date_pinned` on Pinata) for the 24 h buffer, and tag pins with app metadata so only this app's pins are considered. |
| 6   | Only one pinning provider is used.                                                                                                                              | A Pinata outage or account problem makes evidence unavailable once gateway caches expire.                                                                                                                     | Add a second provider and a replication job.                                                                                                      |
| 7   | `verifyEvidence` is exported from `disputeController.js` but not mounted on any route.                                                                          | Parties and arbiters cannot run the integrity check through the API.                                                                                                                                          | Mount it (for example `POST /api/disputes/:id/evidence/verify`) behind party/arbiter authorisation.                                               |
| 8   | No retention clock, legal-hold flag, or key-destruction path.                                                                                                   | Retention and privacy deletion cannot be enforced.                                                                                                                                                            | Add `legal_hold` and retention fields, and an audited key-destruction operation.                                                                  |

## Configuration reference

| Variable                                             | Default                        | Used by                    | Purpose                                               |
| ---------------------------------------------------- | ------------------------------ | -------------------------- | ----------------------------------------------------- |
| `PINATA_JWT`                                         | none                           | `ipfsService`, GC          | Pinata auth for pinning, listing, and unpinning       |
| `PINATA_API_KEY`, `PINATA_SECRET_API_KEY`            | none                           | GC                         | Alternative Pinata auth for list/unpin                |
| `PINATA_GATEWAY_URL`                                 | none                           | `ipfsService.getFileUrl`   | Gateway used for client-facing links                  |
| `IPFS_GATEWAY_URL`                                   | `https://ipfs.io`              | `ipfsService`, sync worker | Fallback link gateway; sync worker gateway            |
| `IPFS_GATEWAYS`                                      | 5 public gateways              | `ipfsGateway`              | Gateway pool for backend fetches                      |
| `IPFS_REQUEST_TIMEOUT`                               | `8000` ms                      | `ipfsGateway`              | Per-gateway fetch timeout                             |
| `IPFS_RECOVERY_WINDOW`                               | `120000` ms                    | `ipfsGateway`              | Quarantine duration after 3 failures                  |
| `IPFS_HEALTH_INTERVAL`                               | `60000` ms                     | `ipfsGateway`              | Background health-check interval                      |
| `IPFS_CACHE_TTL_SEC`                                 | `3600`                         | `ipfsGateway`              | Redis cache TTL for fetched assets                    |
| `IPFS_FETCH_TIMEOUT_MS`                              | `15000` ms                     | sync worker                | Metadata fetch timeout                                |
| `IPFS_SYNC_MAX_RETRIES` / `IPFS_SYNC_RETRY_DELAY_MS` | `3` / `2000` ms                | sync worker                | Metadata fetch retries                                |
| `IPFS_API_URL`                                       | `http://127.0.0.1:5001/api/v0` | GC                         | Self-hosted node API when Pinata is not configured    |
| `GC_SAFETY_BUFFER_HOURS`                             | `24`                           | GC                         | Intended minimum pin age before unpinning (see gap 5) |
| `MAX_FILE_SIZE`                                      | `10485760`                     | `ipfsService`              | Maximum evidence file size                            |
| `ALLOWED_MIME_TYPES`                                 | image, PDF, text, MP4 list     | `ipfsService`              | Evidence MIME allow-list                              |
