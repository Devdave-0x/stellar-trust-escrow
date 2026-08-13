# Dispute Resolution

When a client and freelancer cannot agree on milestone completion, either party can raise a dispute. TrustChain Escrow uses a decentralised arbiter system to resolve disputes fairly and on-chain.

## Raising a Dispute

Either party can raise a dispute on any active milestone:

```typescript
await fetch(`/v1/escrows/${escrowId}/milestones/${milestoneIndex}/dispute`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    reason: 'Deliverable did not meet the agreed specification',
    evidence_ipfs_hash: 'bafybeig...',
  }),
});
```

Once raised, the escrow is locked — neither party can cancel or withdraw funds until the dispute is resolved.

## Arbiter Selection

Arbiters are selected from the TrustChain arbiter registry — a curated list of verified professionals with domain expertise. Selection is weighted by:

1. **Domain match** — arbiters with expertise relevant to the escrow category are preferred
2. **Reputation score** — arbiters with higher scores are selected more frequently
3. **Availability** — arbiters must accept the case within 48 hours or be skipped
4. **Conflict of interest check** — arbiters who have previously transacted with either party are excluded

A panel of **3 arbiters** is selected for each dispute. The majority ruling is binding.

## Dispute Timeline

| Stage | Duration | Description |
|-------|----------|-------------|
| Raised | Day 0 | Dispute submitted, funds locked |
| Evidence period | Days 1–5 | Both parties submit evidence via IPFS |
| Arbiter review | Days 6–12 | Arbiters review and deliberate |
| Ruling | Day 13 | Majority ruling submitted on-chain |
| Appeal window | Days 14–16 | Losing party may appeal once |
| Final settlement | Day 17 | Funds released per ruling |

## Ruling Outcomes

| Outcome | Fund Distribution |
|---------|------------------|
| Full freelancer win | 100% of disputed milestone released to freelancer |
| Full client win | 100% of disputed milestone refunded to client |
| Split ruling | Funds split per arbiter's specified percentage |

Arbiter fees (3% of disputed amount) are deducted before distribution and shared equally among the three arbiters.

## On-chain Resolution

The ruling is submitted to the escrow contract by the arbiter DAO multi-sig:

```rust
pub fn resolve_dispute(
    env: Env,
    escrow_id: u64,
    milestone_index: u32,
    freelancer_share: u32,  // percentage 0-100
    ruling_hash: Bytes,     // IPFS hash of ruling document
) -> Result<(), EscrowError>
```

This is an irreversible on-chain action. The ruling hash links to the full written ruling stored on IPFS for permanent auditability.
