# Pause Behavior Test Matrix

This matrix defines expected pause behavior across contract modules. Existing
tests cover the escrow contract heavily; new module changes should add rows here
and update tests before merge.

| Module | Mutating Functions Blocked | Safe Reads Allowed | Existing Coverage |
| --- | --- | --- | --- |
| Escrow | create, add milestone, submit, approve, reject, dispute, release, cancel | `get_escrow`, `get_milestone`, `is_paused`, counts | `pause_tests.rs`, `unit_coverage_tests.rs`, `integration_lifecycle_tests.rs` |
| Escrow extensions | batch creation, fee withdrawal, upgrade execution | fee previews, queued upgrade reads | add targeted extension pause tests before changing guards |
| Governance | proposal create, vote, execute, config updates | proposal reads, voting power reads | add governance pause assertions when module-level pause is introduced |
| Insurance | contribute, submit claim, vote, payout | fund info, claim reads | add insurance pause assertions when module-level pause is introduced |

## Rules

- Paused state must block fund-moving or state-mutating calls.
- Read-only calls must remain available for operators and clients.
- Admin pause/unpause calls must stay authorized and auditable.
- Tests should assert the specific pause error, not only a generic failure.
