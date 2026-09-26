# Escrow Message Retention and Export

Escrow conversations are retained for the configured compliance window and can
be exported for participant access or compliance review.

## Retention

- `ESCROW_MESSAGE_RETENTION_DAYS` controls the retention window.
- Default retention is 365 days when the variable is not set.
- `pruneExpiredEscrowMessages()` deletes messages older than the computed cutoff.
- Pruning should run as a scheduled worker with audit logging around each run.

## Export

`exportEscrowConversation(escrowId)` returns messages in chronological order with
message id, escrow id, sender address, body, creation time, and read receipt
addresses.

## Compliance Rules

- Exports should verify the requester is a participant or authorized admin.
- Prune jobs should not run during active legal hold.
- Retention changes require release notes because they affect user data policy.
