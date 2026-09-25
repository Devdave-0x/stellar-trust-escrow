# Escrow Completion Certificate Revocation Policy

This policy defines when an escrow completion certificate stops being valid,
how that is decided, and how API consumers and the UI must check certificate
status.

---

## 1. How certificates work today

Certificates are produced by `backend/services/certificateService.js` and
served by `backend/api/controllers/certificateController.js`
(`GET /api/escrows/:id/certificate`).

- A certificate is only issued while the escrow row has `status = 'Completed'`.
  Any other status returns `404 Certificate is only available for completed escrows`.
- The certificate content is built from the escrow row at request time
  (`buildCertificateContent`): escrow id, title, client, freelancer, arbiter,
  amount, token, completion date and milestone completion dates.
- The content is signed with HMAC-SHA256 using `CERTIFICATE_SIGNING_SECRET`
  (`signContent`). The signature is printed on the PDF.
- The PDF embeds a QR code that points to an `EscrowShareLink`
  (`/api/share/:token`). The link is reused if an active one exists, otherwise
  a new one is created with a 30-day expiry.

Certificates are **not stored**. Every download is regenerated from the current
escrow state, so there is no revocation list. Revocation is therefore defined
as: _the certificate content or signature no longer matches what the platform
would issue for that escrow right now_.

> The controller exists but is not yet mounted in `escrowRoutes.js`. This
> policy applies as soon as the route is exposed.

---

## 2. Certificate states

| State       | Meaning                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------- |
| `valid`     | Escrow is `Completed` and the recomputed signature matches the one on the certificate.   |
| `superseded`| Escrow is still `Completed` but its content changed (correction). Old signature fails.   |
| `revoked`   | Escrow is no longer `Completed` (reopened dispute, cancellation) or was revoked for fraud. |
| `unknown`   | Escrow id not found, or the certificate was signed with a retired secret.                 |

---

## 3. Revocation triggers

### 3.1 Reopened disputes

If a completed escrow moves back to `Disputed` (or any status other than
`Completed`), every certificate issued for it is **revoked**.

- No manual action is needed: the certificate endpoint stops returning a PDF
  for non-`Completed` escrows.
- If the dispute resolves and the escrow returns to `Completed`, a new
  certificate may be issued. Its completion date and milestone data will
  reflect the new state, so the old signature will not verify against it.
- Operators should revoke any active share links for the escrow while the
  dispute is open so the QR code no longer resolves
  (`DELETE /api/escrows/:id/share/:token`, creator only).

### 3.2 Corrections

A correction is any change to data that is part of the signed content (title,
parties, amount, token, `updatedAt`, milestone titles or `resolvedAt`).

- Old certificates become **superseded**. They are not fraudulent, but they
  are no longer the platform's record.
- Corrections must be made through normal admin tooling so they are written to
  the audit log (`GET /api/admin/audit-logs`). The audit entry must reference
  the escrow id and the fields changed.
- Parties should be told to download a new certificate.

### 3.3 Fraud

If an escrow completion is found to be fraudulent (e.g. collusion between
client and freelancer, stolen keys, spoofed evidence):

1. An admin with MFA marks the escrow as no longer `Completed` (typically
   `Disputed` while under review, `Cancelled` if confirmed). This revokes the
   certificate immediately (section 3.1).
2. The admin revokes all active share links for the escrow.
3. The action, reason and ticket reference are recorded in the audit log.
4. If a signing secret is suspected to be leaked, rotate
   `CERTIFICATE_SIGNING_SECRET` (see `docs/runbook.md` → Rotating Secrets).
   Rotation revokes **all** previously issued certificates; affected users
   must re-download.

### 3.4 Not revocation triggers

- Share link expiry (30 days). The certificate remains valid; only the QR
  target stops resolving. A fresh download creates a new link.
- Escrow archival by the daily archive job. Archived escrows keep
  `status = 'Completed'`.

---

## 4. API verification

Consumers (employers, marketplaces, other integrators) must not trust a PDF on
its own. To verify a certificate:

1. Read the escrow id and signature from the certificate.
2. Fetch the escrow (`GET /api/escrows/:id`) and check `status === 'Completed'`.
   Any other status → `revoked`.
3. Rebuild the content and recompute the HMAC on the backend
   (`buildCertificateContent` + `signContent`). Compare with the presented
   signature using a constant-time comparison.
   - match → `valid`
   - mismatch → `superseded` (or `unknown` if the secret was rotated)

Because the signature is an HMAC, only the platform can recompute it. Any
public verification endpoint must perform step 3 server-side and return only
the state, never the secret or a signature for arbitrary input. The response
shape for such an endpoint should be:

```json
{
  "escrowId": "42",
  "state": "valid",
  "escrowStatus": "Completed",
  "checkedAt": "2026-01-01T00:00:00.000Z"
}
```

Verification results must not be cached for longer than 60 seconds so that a
reopened dispute or fraud action is visible quickly.

---

## 5. UI expectations

- The certificate download button is only shown for `Completed` escrows.
- When an escrow leaves `Completed`, the UI hides the download button and shows
  "Certificate revoked — this escrow is no longer marked as completed."
- After a correction, the UI shows "A newer certificate is available" next to
  the download button when the escrow `updatedAt` is later than the last
  download the user made (if tracked client-side).
- Public share pages reached from a QR code show the current escrow status,
  not a cached copy, and show a clear revoked banner for non-`Completed`
  escrows.
- Never display a "verified" badge based only on the presence of a PDF or
  signature string; always use the verification flow in section 4.

---

## 6. Responsibilities

| Action                           | Who                         |
| -------------------------------- | --------------------------- |
| Reopen dispute                   | Escrow party / arbiter flow |
| Correction                       | Admin (audit logged)        |
| Fraud revocation                 | Admin with MFA              |
| Signing secret rotation          | Platform operator           |
| Notify parties of revocation     | Support / notification flow |
