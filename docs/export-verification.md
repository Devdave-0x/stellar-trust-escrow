# Verifying Escrow Exports and Reports

How users and auditors can check that an exported escrow report is complete, unmodified, and interpreted with the right schema. It covers every export the platform produces today, how to record and compare checksums, schema version notes, and what to do when something does not match.

> **Manifests are not produced yet.** No export currently ships with a signed manifest or a server-provided checksum. Until they do, verification relies on the process in [Recording and checking a checksum](#recording-and-checking-a-checksum): hash the file yourself when you download it and keep that hash with the file. See [Not yet supported](#not-yet-supported).

## Contents

- [Available exports](#available-exports)
- [Why two downloads never match](#why-two-downloads-never-match)
- [Recording and checking a checksum](#recording-and-checking-a-checksum)
- [Checking completeness](#checking-completeness)
- [Schema versions](#schema-versions)
- [Troubleshooting mismatches](#troubleshooting-mismatches)
- [Not yet supported](#not-yet-supported)

## Available exports

| Export             | Endpoint                                                                                                                                         | Who can call it                                                                                                                | Format                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Full user data     | `GET /api/users/:address/export` (JSON body) and `GET /api/users/:address/export/file` (download, `stellar-trust-export-<address>.json`)         | The owner of `:address`, or an admin (admin exports are written to the audit log). Limited to 3 requests per hour per address. | JSON, `version: "1.0"`                        |
| My escrows         | `GET /api/escrows/export.csv?from=&to=`                                                                                                          | The authenticated user; covers escrows where they are client or freelancer                                                     | CSV, `escrows-YYYY-MM-DD.csv`                 |
| Audit log          | `GET /api/audit/export?category=&action=&actor=&resourceId=&from=&to=`                                                                           | Audit route permissions                                                                                                        | CSV, `audit-export-<ms>.csv`, max 10 000 rows |
| Compliance reports | `GET /api/compliance/reports/:type/export?format=` with `type` = `transactions` \| `users` \| `activity` and `format` = `json` \| `csv` \| `pdf` | Compliance route permissions                                                                                                   | JSON, CSV, or PDF                             |

User-data exports larger than 10 MB return `202 {"status": "queued"}` and are delivered by email instead of in the response.

## Why two downloads never match

Every export is **generated fresh on each request** from live data. It is not a stored file:

- The user-data JSON includes `exportedAt`, the time of generation, so its bytes (and hash) change on every download even if nothing else did.
- CSV and compliance exports reflect the data at the moment of the request; any escrow update in between changes the file.
- Audit and compliance filenames include a millisecond timestamp.

So a checksum **cannot** be used to re-download a report and prove it is "the same". It **can** prove that a copy you already hold has not been altered since you downloaded it. That is what the procedure below is for.

## Recording and checking a checksum

**1. Download and hash immediately.** Do this on the machine that received the file, before sharing or editing it.

```bash
# Linux / macOS
sha256sum stellar-trust-export-GABC…XYZ.json
# 5f2c…e1a9  stellar-trust-export-GABC…XYZ.json

# macOS without coreutils
shasum -a 256 escrows-2026-09-24.csv

# Windows (PowerShell)
Get-FileHash .\escrows-2026-09-24.csv -Algorithm SHA256
```

**2. Record it** alongside the file: who downloaded it, when (UTC), from which endpoint and with which query parameters, and the SHA-256. For audits, record it somewhere the recipient cannot edit (a ticket, a signed email, an evidence log):

```text
file:        escrows-2026-09-24.csv
endpoint:    GET /api/escrows/export.csv?from=2026-01-01&to=2026-06-30
downloaded:  2026-09-24T10:14:03Z by auditor@example.com
sha256:      9b1d…44c0
```

**3. Verify later** by hashing again and comparing:

```bash
echo "9b1d…44c0  escrows-2026-09-24.csv" | sha256sum --check
# escrows-2026-09-24.csv: OK
```

`OK` means the file is byte-for-byte identical to what was downloaded. `FAILED` means it was changed, re-saved, or corrupted in transit (see [Troubleshooting](#troubleshooting-mismatches)).

Keep the original file read-only. Opening a CSV in a spreadsheet and saving it rewrites line endings, quoting and number formats and changes the hash, even if no value changed. Analyse a copy.

## Checking completeness

A matching hash proves the file was not altered, not that it contains everything. Also check:

**User-data JSON**

- `version` is `"1.0"` (see [Schema versions](#schema-versions)) and `userAddress` is the address you asked for.
- `data` contains all six sections: `escrows`, `payments`, `kyc`, `reputation`, `adminAuditLog`, `disputeMessages`.
- The number of entries in `data.escrows` matches the escrow count shown in the app for that address (as client plus as freelancer).

```bash
jq '{version, userAddress, exportedAt, escrows: (.data.escrows | length), payments: (.data.payments | length)}' stellar-trust-export-*.json
```

**Escrows CSV**

- The header row is exactly `id,title,amount,currency,status,counterparty,created_at,completed_at`.
- Row count (minus the header) matches the number of escrows in the requested date range.
- `from` / `to` filter on the escrow's creation date; `to` includes the whole day (up to 23:59:59.999). An escrow created outside the range will not appear, even if it completed inside it.
- Column notes: `title` holds the escrow's brief hash (there is no separate title field), `currency` holds the Soroban token contract address the amount is denominated in, and `completed_at` is the last update time, filled only for Completed escrows.

**Audit CSV**

- Header: `id,category,action,actor,resourceId,statusCode,ipAddress,createdAt`.
- The export stops at **10 000 rows**. If you get exactly 10 000 data rows, assume the result was truncated and narrow the filters (for example by `from` / `to`) until each file has fewer rows.

## Schema versions

| Export             | Version marker                     | Notes                                                                                                                                                                                                                                                                          |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| User-data JSON     | `version` field, currently `"1.0"` | The same `version` is checked when a file is re-imported (`POST /api/users/:address/import`); a missing or non-string `version` is rejected. A future format change should bump this value; treat an unknown version as "do not interpret without the matching documentation". |
| Escrows CSV        | none                               | The column list above is the schema. A different header means a different format; do not compare such files column by column.                                                                                                                                                  |
| Audit CSV          | none                               | Same: the header row is the schema.                                                                                                                                                                                                                                            |
| Compliance reports | none in the file                   | The report `type` and `format` in the request define the content.                                                                                                                                                                                                              |

When comparing exports taken at different times, first confirm they share the same version (JSON) or header (CSV).

## Troubleshooting mismatches

| Symptom                                                              | Likely cause                                                                          | What to do                                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `sha256sum --check` reports `FAILED` on a file you recorded yourself | The file was edited, re-saved by a spreadsheet, or converted (line endings, encoding) | Compare against the untouched original. If you have none, request a new export and treat the old copy as unverified.              |
| Two downloads of the "same" export have different hashes             | Expected: exports are regenerated and include generation time or live data            | Verify each download against the hash recorded at its own download time.                                                          |
| Hash recorded by someone else does not match your copy               | You have a different download, or the copy was altered in transit                     | Ask for their original file, or have both parties download at the same agreed moment and exchange hashes over a separate channel. |
| Hash differs only after emailing or uploading the file               | The channel rewrote it (compression, line-ending conversion, antivirus rewrapping)    | Send inside a ZIP and hash the ZIP, or hash after receipt and compare out-of-band.                                                |
| JSON export has fewer escrows than the app shows                     | Tenant scoping, or escrows under a different address                                  | Confirm the tenant and the exact address used; exports cover one address in one tenant.                                           |
| Audit CSV has exactly 10 000 rows                                    | Truncated at the row cap                                                              | Split the request with narrower `from` / `to` windows.                                                                            |
| Download returns `202 queued` instead of a file                      | Export is over 10 MB                                                                  | Wait for the email. See the note below about large exports.                                                                       |
| Download returns `403 Forbidden`                                     | Requesting another user's export without admin rights                                 | Only the address owner or an admin can export.                                                                                    |
| Download returns `429`                                               | More than 3 user-data exports for the address in an hour                              | Wait and retry.                                                                                                                   |

## Not yet supported

- **Export manifests.** No export includes a manifest listing its contents, row counts, generation parameters, and a checksum.
- **Server-side checksums.** Responses do not include a SHA-256 header or a detached signature, so the platform cannot currently vouch for a file's integrity; only the downloader's own recorded hash can.
- **Reproducible exports.** Exports are regenerated per request rather than stored, so an earlier export cannot be fetched again byte-for-byte.
- **Schema version on CSV and compliance exports.** Only the user-data JSON carries a `version`.
- **Large-export delivery.** The emailed link for exports over 10 MB points back to `/api/users/:address/export/file`, which regenerates the export and, if it is still over 10 MB, queues it again instead of serving it. Large exports cannot currently be downloaded; contact support.
