# Passkey Recovery Guide

What to do when a passkey is lost, fails to enroll, or a device is replaced,
and how fallback MFA works. Sections 1–4 are for **users**; section 5 is for
the **support team**.

> **Implementation status.** Passkeys are WebAuthn MFA methods
> (`MfaMethod.type = WEBAUTHN`) handled by `backend/services/mfaService.js`
> and the `/api/mfa/*` routes in `backend/api/routes/mfa.js`. That router is
> not yet mounted in `server.js`, `backend/services/passkeyService.js` is
> still a stub, and there is no admin endpoint for resetting MFA. The flows
> below describe the intended behaviour on top of the existing MFA service.
> Steps that need missing pieces are marked **(pending)**.

---

## 1. Your sign-in factors

| Factor | What it is | Recovery value |
| --- | --- | --- |
| Stellar wallet | Your account identity. Escrow funds are controlled by the wallet, not by the passkey. | Losing a passkey never loses funds |
| Passkey (WebAuthn) | Device-bound or synced credential (Face ID, Touch ID, Windows Hello, security key) | Second factor |
| Authenticator app (TOTP) | 6-digit codes | Fallback second factor |
| Backup codes | 10 one-time codes (`XXXX-XXXX`) shown **once** when you enable TOTP | Last-resort self-service factor |

**Before you need it:** register at least **two** factors, e.g. a passkey on
your phone plus an authenticator app, and store your backup codes offline.

---

## 2. Self-service paths

Use these first. They need no support ticket.

### 2.1 Passkey lost or device unavailable

1. Sign in with your wallet.
2. At the MFA prompt, choose **Use another method**:
   - your authenticator app (`POST /api/mfa/totp/verify`), or
   - a backup code (same endpoint, in `XXXX-XXXX` format). Each code works
     once; you are warned when fewer than 3 remain.
3. Go to **Security → Sign-in methods** (`GET /api/mfa/methods`) and remove
   the lost passkey (`DELETE /api/mfa/methods/:id`; this requires a fresh MFA
   check).
4. Register a new passkey on a device you control.
5. If you used backup codes, regenerate them.

> ⚠️ Remove a lost passkey promptly, especially a security key that someone
> could find. Anyone who has the device and can unlock it could use it as
> your second factor.

### 2.2 Replacing a device (you still have the old one)

1. On the **new** device: sign in and register a new passkey.
2. Confirm you can sign in with the new passkey.
3. Only then remove the old device's passkey.
4. Wipe or factory-reset the old device before selling or recycling it.

Synced passkeys (iCloud Keychain, Google Password Manager) usually move with
your account. Still confirm a sign-in works on the new device before removing
anything.

### 2.3 Enrollment failed

| Symptom | Try |
| --- | --- |
| Browser shows no passkey prompt | Use a supported browser (current Chrome, Safari, Edge, Firefox) over HTTPS. Private windows and some in-app browsers block WebAuthn. |
| "Operation timed out" / cancelled | Start again. The registration challenge expires, so don't reuse an old prompt. |
| "Credential already registered" | This device already has a passkey for your account. Use it, or remove the old entry first. |
| Security key not detected | Try another USB port / NFC position, and check the key supports FIDO2. |
| Repeated failures | Enroll an authenticator app instead and contact support (section 5) with the browser, OS and error text. |

A failed enrollment never changes your existing factors, so you can retry
safely.

### 2.4 Locked out after failed attempts

After **5** failed MFA attempts, MFA is locked for **15 minutes**
(`GET /api/mfa/lockout-status` shows the remaining time). Wait, then retry
with a working factor. Repeated guessing only extends the problem, and
support cannot shorten a lockout.

---

## 3. When self-service is not possible

You need support-assisted recovery (section 5) only if **all** of these are
true:

- no registered passkey is available,
- no authenticator app is available,
- no unused backup codes are left,

and you still control your Stellar wallet.

If you have also lost your wallet keys, the platform cannot restore access
to the wallet or its funds. Only the wallet's own recovery (seed phrase) can.

---

## 4. Security warnings for users

- ⚠️ **Support will never ask** for your seed phrase, secret key, backup
  codes, or an authenticator code, by any channel. Anyone who does is an
  attacker.
- ⚠️ Recovery requests are a common attack path. Expect support-assisted
  recovery to take time and to require proof; the delay protects you.
- ⚠️ Removing your **last** MFA method turns MFA off for your account. Add
  the replacement first.
- ⚠️ Store backup codes offline (printed, or in a password manager), never in
  email or chat.
- ⚠️ Check **Security → Sign-in methods** after any recovery. If you see a
  method or change you did not make, secure your wallet and contact support
  immediately.

---

## 5. Support-assisted recovery (support team)

### 5.1 Eligibility and verification

Proceed only when section 3 applies. Verify identity with **all** of:

1. **Wallet control:** the user signs a fresh, support-issued challenge
   message with the account's Stellar wallet. This is the primary proof.
2. **Account email:** confirmation link sent to the verified address on file
   (not to an address provided in the ticket).
3. **Account context:** at least two facts only the owner would know
   (recent escrow ids, counterparties, approximate amounts), checked
   against the database.

Refuse and escalate to security if the wallet signature fails, the email
changed recently, or the request is urgent with pressure to skip steps.

### 5.2 Reset procedure (pending: no admin endpoint yet)

1. Record the ticket, the verification evidence, and the approving support
   lead. Two people are required: one performs, one approves.
2. Deactivate all of the user's MFA methods (`mfa_methods.is_active = false`
   for that `user_id` and `tenant_id`) and set `users.mfa_enabled = false`.
   Until an admin endpoint exists, this is done by an engineer with DB
   access, with the ticket id in the change record.
3. Revoke the user's refresh tokens so every session must sign in again.
4. Apply a **24-hour hold** on sensitive actions (withdrawal-address
   changes, new API keys, admin role changes) and notify the account email.
5. Ask the user to enroll a new passkey **and** an authenticator app right
   away, and to save new backup codes.
6. Log the reset as an admin action in the audit log, with the ticket id.

### 5.3 Other support cases

| Case | Handling |
| --- | --- |
| User asks to lift an MFA lockout | Decline. Lockouts expire after 15 minutes. |
| Enrollment keeps failing | Collect browser, OS, authenticator type and error text; enroll TOTP as the interim factor; file a bug. |
| Lost device may be compromised | Remove its passkey immediately (user self-service, or the reset in 5.2), revoke sessions, and review recent account activity. |
| Wallet lost as well | The platform cannot recover wallet access. Explain wallet seed recovery; do not reset MFA for an account whose wallet the requester cannot prove. |
