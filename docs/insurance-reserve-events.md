# Insurance reserve solvency events

The insurance contract keeps its existing contribution (`ins_dep`) and payout
(`ins_pay`) events unchanged. It additionally emits a post-operation reserve
snapshot on every successful contribution and successful approved payout.

| Topic | Primary identifier | Data |
| --- | --- | --- |
| `ins_rin` | contributor | `ReserveSnapshot` |
| `ins_rout` | claim ID | `(claimant, ReserveSnapshot)` |

`ReserveSnapshot` contains the operation `amount`, `tracked_reserve`,
`total_contributed`, and `total_paid_out`, all in token base units. The
contract enforces `tracked_reserve = total_contributed - total_paid_out` and
does not emit a snapshot for failed contributions or failed payouts.

These figures are deterministic accounting counters, not a replacement for a
live token-balance query: staking, yield, or other token movements can affect
the contract’s actual balance. Indexers should retain both the snapshot and the
ledger/event position, and flag any snapshot that violates the stated equation.
