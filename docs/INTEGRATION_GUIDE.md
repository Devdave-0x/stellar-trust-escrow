# Integration Guide

This guide explains how to integrate TrustChain Escrow into your application using the TypeScript SDK and REST API.

## Overview

TrustChain Escrow exposes two integration surfaces:

1. **REST API** — for backend services that need to create escrows, track milestones, and query reputation scores without direct blockchain interaction
2. **Soroban SDK** — for frontend applications that sign transactions directly with Freighter wallet

## REST API Integration

### Base URL

```
https://api.trustchain.finance/v1   (mainnet)
https://api-testnet.trustchain.finance/v1   (testnet)
```

### Authentication

All API requests require a JWT bearer token obtained by signing a challenge with your Stellar keypair:

```typescript
// 1. Request a challenge
const { challenge } = await fetch('/v1/auth/challenge', {
  method: 'POST',
  body: JSON.stringify({ public_key: myPublicKey }),
}).then(r => r.json());

// 2. Sign the challenge with Freighter
const { signedXDR } = await signTransaction(challenge, { network: 'TESTNET' });

// 3. Exchange for JWT
const { token } = await fetch('/v1/auth/verify', {
  method: 'POST',
  body: JSON.stringify({ signed_xdr: signedXDR }),
}).then(r => r.json());
```

### Creating an Escrow

```typescript
const escrow = await fetch('/v1/escrows', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    freelancer: 'GFREELANCER...',
    token: 'USDC',
    total_amount: 5000_0000000,
    milestones: [
      { title: 'Design mockups', amount: 1500_0000000, deadline: '2026-09-01' },
      { title: 'Frontend implementation', amount: 2000_0000000, deadline: '2026-10-01' },
      { title: 'Final delivery', amount: 1500_0000000, deadline: '2026-11-01' },
    ],
  }),
}).then(r => r.json());

console.log('Escrow ID:', escrow.id);
console.log('Contract ID:', escrow.contract_id);
```

### Approving a Milestone

```typescript
await fetch(`/v1/escrows/${escrow.id}/milestones/0/approve`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
});
```

### Querying Reputation

```typescript
const reputation = await fetch(`/v1/reputation/${freelancerAddress}`).then(r => r.json());

console.log('Score:', reputation.score);
console.log('Completed escrows:', reputation.completed_count);
console.log('Disputed escrows:', reputation.disputed_count);
```

## Soroban Direct Integration

For applications that prefer direct on-chain interaction:

```typescript
import { SorobanRpc, Contract, Networks } from '@stellar/stellar-sdk';

const server = new SorobanRpc.Server('https://soroban-testnet.stellar.org');
const contract = new Contract(ESCROW_CONTRACT_ID);

// Build create_escrow transaction
const tx = await contract.call(
  'create_escrow',
  nativeToScVal(clientAddress, { type: 'address' }),
  nativeToScVal(freelancerAddress, { type: 'address' }),
  nativeToScVal(totalAmount, { type: 'i128' }),
  nativeToScVal(milestones, { type: 'vec' }),
);
```

## Webhook Events

Register a webhook to receive real-time notifications:

```typescript
await fetch('/v1/webhooks', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    url: 'https://yourapp.com/webhooks/trustchain',
    events: ['milestone.submitted', 'milestone.approved', 'dispute.raised', 'escrow.completed'],
  }),
});
```

Webhook payloads are signed with HMAC-SHA256 using your webhook secret.

## Further Reading

- [Smart Contract Reference](CONTRACTS.md)
- [Reputation System](REPUTATION.md)
- [Dispute Resolution](DISPUTES.md)
- [API Reference](API_REFERENCE.md)
