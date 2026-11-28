# Dependency update policy

Updates to Soroban SDK, Stellar SDK, and other protocol-critical dependencies require:

- review of upstream release notes and breaking changes;
- confirmation that contract interfaces and serialization formats remain compatible;
- the existing contract and integration checks to be run by CI or the reviewer; and
- a rollback plan in the pull request if the update changes runtime behavior.

Dependency updates should remain focused. Unrelated dependency upgrades belong in a separate pull request.
