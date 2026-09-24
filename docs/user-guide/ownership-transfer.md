# Transferring Escrow Ownership (Client Role)

The **client** of an escrow is the party who funded it: they approve milestones, can cancel it, and receive refunds. Sometimes that role needs to move to someone else, for example when a project is handed to another team member or company wallet. This guide explains how the transfer works today, who can do it, what it changes for everyone on the escrow, and the errors you may see.

> **How transfers work today:** a transfer is a **single step**. The current client signs one transaction naming the new client, and the role moves immediately. There is no request the new client has to accept, no way to reject it, and no expiry. See [Not yet supported](#not-yet-supported).

## Contents

- [Who can transfer](#who-can-transfer)
- [Who can receive the client role](#who-can-receive-the-client-role)
- [What changes for each participant](#what-changes-for-each-participant)
- [How to transfer](#how-to-transfer)
- [Before you transfer](#before-you-transfer)
- [Notifications and history](#notifications-and-history)
- [Common errors](#common-errors)
- [Not yet supported](#not-yet-supported)

## Who can transfer

| Condition      | Required                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caller         | Only the **current client** of the escrow, signing with the client wallet. The freelancer, arbiter, and platform admins cannot move the client role. |
| Escrow status  | **Active**. Any other status (for example Completed, Cancelled, Disputed, or CancellationPending) blocks the transfer.                               |
| Platform state | Not paused. During an emergency pause every change, including transfers, is blocked.                                                                 |

## Who can receive the client role

The new client can be any Stellar address **except**:

- the escrow's **freelancer** (a party cannot pay themselves), or
- the escrow's **arbiter**, if one is set (the arbiter must stay independent).

The contract does not check that the new address is controlled by a real person or that it can sign. **Double-check the address**: if you transfer to a wallet nobody controls, nobody can approve milestones or cancel the escrow any more.

## What changes for each participant

| Participant                | After the transfer                                                                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New client**             | Gains every client right immediately: approving or rejecting milestones, releasing funds, requesting cancellation, and receiving any refund of the remaining balance.                                 |
| **Previous client**        | Loses all client rights immediately. They can no longer approve, cancel, or receive refunds for this escrow. Funds they deposited stay in the escrow and follow its rules under the new client.       |
| **Freelancer**             | No change to their rights or pending work. Milestones already submitted wait for the **new** client's approval.                                                                                       |
| **Arbiter**                | No change. Disputes are resolved as before, with the new client as the client party.                                                                                                                  |
| **Escrow terms**           | Unchanged: amount, remaining balance, milestones, deadlines, and arbiter stay the same. Only the client address changes.                                                                              |
| **Multisig buyer signers** | Unchanged. On multisig escrows, addresses in the buyer-signer list can still approve alongside the client. Update or review that list separately if the old client's organisation should lose access. |

A transfer cannot be undone by the previous client. To move the role back, the **new** client has to transfer it again.

## How to transfer

The transfer is a call to the escrow contract's `transfer_client_role(escrow_id, new_client)`, signed by the current client. The web and mobile apps do not have a transfer screen yet, so use a wallet or the Stellar CLI:

```bash
stellar contract invoke \
  --id <ESCROW_CONTRACT_ID> \
  --source <CURRENT_CLIENT_IDENTITY> \
  --network testnet \
  -- transfer_client_role \
  --escrow_id 42 \
  --new_client <NEW_CLIENT_ADDRESS>
```

The transaction succeeds only if every condition above holds; otherwise nothing changes and you get one of the [errors below](#common-errors).

## Before you transfer

- **Tell the freelancer and the new client first.** Nobody is notified automatically (see below).
- **Check pending milestones.** Anything submitted but not yet approved will need the new client's approval.
- **Confirm the new address** by having its owner send you a small payment or sign a message from it.
- **Consider timing.** If the escrow is close to its deadline, the new client needs to be ready to act straight away.

## Notifications and history

- The contract emits a `cl_role` event with `(previous client, new client)` for the escrow, so the change is permanently recorded on-chain and visible in block explorers.
- The platform **does not yet send emails or push notifications** for transfers, and the backend does not index the `cl_role` event yet, so the escrow page in the app may keep showing the previous client until that is added. The on-chain contract state is authoritative.

## Common errors

Contract errors are returned as numbered codes (see `docs/contracts/ABI.md`):

| Error                                                       | Meaning                                                                                                 | What to do                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Authorization failure (transaction rejected before running) | The transaction was not signed by the current client.                                                   | Sign with the client wallet. If you are no longer the client, the role was already transferred. |
| `E3` Unauthorized                                           | The new client is the escrow's freelancer or arbiter.                                                   | Choose a different address.                                                                     |
| `E8` Escrow not found                                       | The escrow id does not exist, or its storage rent has expired.                                          | Check the escrow id. Expired escrows cannot be transferred.                                     |
| `E9` Escrow not active                                      | The escrow is in any status other than Active (Completed, Cancelled, Disputed, CancellationPending, …). | Only Active escrows can be transferred. Resolve the dispute first, or create a new escrow.      |
| `E31` Contract paused                                       | The platform is in an emergency pause.                                                                  | Wait for the pause to be lifted and try again.                                                  |

## Not yet supported

These are part of the planned transfer flow but **do not exist yet**:

- **Request and accept:** the new client cannot be asked to accept before the role moves; transfers take effect as soon as the current client signs.
- **Reject:** the new client cannot refuse a transfer.
- **Expiry:** there are no pending transfers, so nothing expires.
- **In-app transfer screen** in the web or mobile app.
- **Notifications** to the new client, previous client, freelancer, or arbiter.
- **Backend indexing** of the `cl_role` event, so API responses reflect the new client straight away.

Until the two-step flow exists, treat a transfer as final and coordinate with the new client off-platform beforehand.
