# Insurance Claim Operations Runbook

Operational guide for insurance fund governors and platform operators handling
claims against `contracts/insurance_contract`. It covers claim review, evidence
requirements, payout checks, pool solvency verification and escalation.

---

## 1. Claim decision states

Claim states come from `ClaimStatus` in
`contracts/insurance_contract/src/types.rs`.

| State       | Set by                                              | Terminal | Event       |
| ----------- | --------------------------------------------------- | -------- | ----------- |
| `Pending`   | `submit_claim` (claimant)                           | No       | `ins_clm`   |
| `Approved`  | `vote` once quorum is reached and FOR wins          | No       | `ins_apr`   |
| `Rejected`  | `vote` once quorum is reached and AGAINST wins/ties | Yes      | `ins_rej`   |
| `Paid`      | `execute_payout` (anyone) on an `Approved` claim    | Yes      | `ins_pay`   |
| `Withdrawn` | `withdraw_claim` (claimant) while `Pending`         | Yes      | `ins_wdr`   |

Rules enforced on-chain:

- `amount` must be `> 0` and `<= claim_cap` (`InvalidClaimAmount`, `ClaimExceedsCap`).
- Only registered governors can vote (`NotGovernor`); one vote each (`AlreadyVoted`).
- The claim is finalised on the vote that brings `votes_for + votes_against`
  to `quorum`. It is `Approved` only if `votes_for >= quorum` **and**
  `votes_for > votes_against`; otherwise `Rejected`.
- `execute_payout` requires `Approved` and a contract token balance
  `>= amount` (`InsufficientFunds`).

### 1.1 Expiry

`expires_at = submitted_at + DEFAULT_CLAIM_EXPIRY_LEDGERS` (120 960). This is
added to the ledger **timestamp**, so the window is 120 960 seconds (~1.4
days), not ledgers. A vote after expiry returns `ClaimExpired`. Because the
call returns an error, the transaction reverts and the `Rejected` status is
**not** persisted; the claim stays `Pending` on-chain but can no longer be
voted on. Treat such claims as expired-rejected in off-chain tooling and tell
the claimant to resubmit if appropriate.

---

## 2. Claim review

For every new `ins_clm` event:

1. Fetch the claim: `get_claim(claim_id)`. Record `claimant`, `amount`,
   `description`, `submitted_at`, `expires_at`.
2. Confirm the indexer row in `insurance_claims` matches (`claimId`, `amount`,
   `status = 'Pending'`).
3. Open a review ticket referencing the claim id and the submitting tx hash.
4. Assign at least `quorum` governors. Governors must vote before `expires_at`.
5. Check the claimant has no other open claim for the same incident. The
   contract does not enforce this (`ClaimAlreadyOpen` is defined but unused),
   so duplicates must be caught in review and voted down.

### 2.1 Evidence requirements

`description` holds a human-readable summary or an IPFS hash of the evidence
bundle. A claim is reviewable only if the evidence includes:

- The escrow id(s) and transaction hash(es) of the loss.
- For escrows with insurance opt-in: the `insurance_opt_ins` row
  (`escrowId`, `coverageAmount`, `active = true`, not past `expiresAt`).
- A statement of the loss amount and how it was calculated. The claimed
  `amount` must not exceed the loss or the opt-in `coverageAmount`.
- Supporting material: dispute outcome, arbiter decision, chat/messages,
  screenshots or third-party reports as relevant.
- For IPFS evidence: the CID must be retrievable through the platform gateway
  and pinned for the review period.

Missing or unverifiable evidence → governors vote `approve = false`.

---

## 3. Payout checks

Before calling `execute_payout(claim_id)`:

1. `get_claim(claim_id).status == Approved`.
2. Claimant address matches the address reviewed in section 2 (the payout
   always goes to `claim.claimant`).
3. Solvency check passes (section 4) with the claim amount included.
4. No open incident against the claim or the governors who voted on it.

After the call:

1. Confirm the `ins_pay` event `(claimant, amount)` for the claim id.
2. Confirm `get_fund_info()` shows `total_paid_out` and `paid_claims`
   increased by `amount` and `1`.
3. Confirm the indexer updated `insurance_claims.status = 'Paid'`, `paidAt`,
   `txHash` and `ledger`.

If `execute_payout` fails with `InsufficientFunds`, do not retry in a loop.
Escalate as a solvency incident (section 6).

---

## 4. Pool solvency verification

Run before each payout and daily while any claim is `Approved`.

1. `get_fund_info()` → `current_balance`, `total_contributed`,
   `total_paid_out`, `total_claims`, `paid_claims`, `governor_count`.
2. Sum `amount` over all claims in `Approved` state (outstanding liability).
3. Solvent when `current_balance >= outstanding liability`.
4. Sanity check: `current_balance` is the token balance of the contract and
   also includes staked tokens and yield (`stake`, `add_platform_fees`), so
   also compare against `total_contributed - total_paid_out`. A large gap in
   either direction is investigated before paying.
5. Confirm `governor_count >= quorum`; otherwise no claim can be finalised.

---

## 5. Required logs

Keep these for every claim (ticket + indexer data):

| Item                            | Source                                  |
| ------------------------------- | --------------------------------------- |
| Submission tx hash and ledger   | `ins_clm` event / `insurance_claims`    |
| Evidence CID / description      | `Claim.description`                     |
| Reviewer notes and decision     | Review ticket                           |
| Each governor vote and tx hash  | `ins_vot` events `(governor, approve)`  |
| Finalisation                    | `ins_apr` or `ins_rej` event            |
| Solvency check result           | Section 4 output, attached to ticket    |
| Payout tx hash                  | `ins_pay` event / `insurance_claims`    |
| Withdrawal                      | `ins_wdr` event                         |
| Governor changes during review  | `ins_gov` / `ins_grm` events            |

Admin changes that affect decisions (`set_claim_cap`, `set_quorum`,
`add_governor`, `remove_governor`) must be linked to a ticket.

---

## 6. Incident escalation

| Severity | Trigger                                                                         | Action                                                                                           |
| -------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| SEV-1    | `current_balance` below outstanding `Approved` liability, or unexpected payout  | Stop further `execute_payout` calls, page on-call, notify all governors, open incident in `docs/incidents/` |
| SEV-1    | Suspected compromised governor or admin key                                     | Admin calls `remove_governor`, rotate keys, review all votes by that governor since compromise   |
| SEV-2    | Claim expiring without quorum; `governor_count < quorum`                        | Notify governors, admin adjusts `add_governor` / `set_quorum`                                     |
| SEV-2    | Indexer `insurance_claims` out of sync with on-chain state                      | Re-index from events, compare with `get_claim` for each open claim                                |
| SEV-3    | Evidence CID unavailable, duplicate claims, unclear evidence                    | Request more evidence from claimant, governors vote against if unresolved before expiry          |

Every SEV-1/SEV-2 incident needs a post-incident write-up in `docs/incidents/`.
