# Release Compatibility Policy

Operators must deploy only the component combinations listed below. Contract, backend
and frontend versions follow SemVer; a contract **ABI** change (new/removed function,
changed argument or event shape) always bumps the contract major version.

## Compatibility table

| Contract | Backend | Frontend | ABI migration required                                   | Supported rollback path                                                                |
| -------- | ------- | -------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1.x      | 1.x     | 1.x      | None                                                     | Redeploy previous backend/frontend image                                               |
| 2.x      | ≥ 2.0   | ≥ 2.0    | Regenerate bindings; re-index events from upgrade ledger | Point `ESCROW_CONTRACT_ID` back to 1.x contract, roll back backend + frontend together |

Mixed majors (e.g. contract 2.x with backend 1.x) are **unsupported**.

## Deployment order

1. Deploy/upgrade the contract and record the new contract ID and upgrade ledger.
2. Deploy the backend with regenerated bindings; restart the indexer from the upgrade ledger.
3. Deploy the frontend last.

## Rollback

Roll back in reverse order (frontend → backend → contract ID). Contract state cannot be
reverted on-chain, so rollback means switching configuration back to the previous
contract ID; escrows created on the new contract stay there and must be drained or
migrated before it is abandoned.
