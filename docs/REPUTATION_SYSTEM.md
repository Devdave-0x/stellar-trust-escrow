# Reputation System

TrustChain Escrow builds an immutable, on-chain reputation score for every participant — clients and freelancers alike.

## How It Works

Every escrow completion or dispute resolution writes a `ReputationEvent` to the Soroban contract. Events aggregate into a score that is publicly queryable and tamper-proof.

```
Escrow created
      ↓
Milestones completed
      ↓
ReputationEvent written on-chain
      ↓
Score updated (both client and freelancer)
      ↓
Score queryable by anyone
```

## Score Components

| Component | Weight | Description |
|-----------|--------|-------------|
| Completion rate | 40% | % of accepted escrows completed without dispute |
| On-time delivery | 25% | % of milestones delivered before deadline |
| Dispute rate | 20% | Inverse of % of escrows that ended in dispute |
| Volume | 15% | Total value of completed escrows (log-scaled) |

## Score Range

Scores range from **0 to 1000**:

| Range | Label | Meaning |
|-------|-------|---------|
| 900–1000 | Elite | Exceptional track record, minimal disputes |
| 700–899 | Trusted | Solid history, low dispute rate |
| 500–699 | Established | Growing track record |
| 300–499 | New | Limited history |
| 0–299 | Unverified | Insufficient data or dispute history |

## Querying a Score

### On-chain (Soroban)

```rust
let score = env.invoke_contract(
    &reputation_contract,
    &symbol_short!("get_score"),
    vec![&env, address.into_val(&env)],
);
```

### Via API

```bash
curl https://api.trustchain.finance/v1/reputation/GADDRESS...
```

Response:
```json
{
  "address": "GADDRESS...",
  "score": 847,
  "label": "Trusted",
  "completed_count": 23,
  "disputed_count": 1,
  "total_volume_usdc": 142500,
  "last_updated_ledger": 54821093
}
```

## Dispute Impact

A dispute reduces both parties' scores proportionally based on the arbiter's ruling:

- **Ruling in favour of freelancer** — client's score decreases, freelancer's score is unaffected
- **Ruling in favour of client** — freelancer's score decreases, client's score is unaffected
- **Split ruling** — both scores decrease proportionally

Score reductions decay over time — a dispute 2 years ago has less impact than one last month.

## Privacy

Reputation scores are public by design — this is the core value proposition of the platform. However, the underlying escrow amounts are only visible to the participants unless they choose to make them public.
