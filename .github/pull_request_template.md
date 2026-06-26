## Summary

<!-- One or two sentences: what changed and why. -->

Closes #

## Type of change

<!-- Check all that apply. -->

- [ ] `feat` — new feature
- [ ] `fix` — bug fix
- [ ] `perf` — performance improvement
- [ ] `security` — security fix or hardening
- [ ] `refactor` — code restructuring, no behaviour change
- [ ] `test` — tests only
- [ ] `docs` — documentation only
- [ ] `chore` — tooling, dependencies, config
- [ ] Breaking change — existing callers must update to stay compatible

## What changed

<!--
List the concrete changes made. Be specific enough that a reviewer knows
where to focus without reading every line.
-->

-
-

## Tests

<!--
List the exact commands you ran. If no tests were added, explain why.
"No behaviour change" or "covered by existing suite" are valid reasons —
state them explicitly rather than leaving this section blank.
-->

```bash
# Smart contracts
cargo test -p stellar-trust-escrow-contract

# Backend
npm run test -w backend

# Frontend
npm run test:unit -w frontend

# Lint
npm run lint:all
```

**New or updated tests:** <!-- yes / no — if yes, name the file(s) -->

## Documentation

<!-- List every doc, README section, or .env.example that was updated. -->
<!-- If no documentation needed updating, state why. -->

- [ ] Docs updated (list files below)
- [ ] No documentation change needed — reason: <!-- fill in -->

## CHANGELOG

<!-- Add the entry you placed under ## [Unreleased] in CHANGELOG.md, or explain why no entry is needed. -->

```
### Added / Changed / Fixed / Security
- <description> (#<issue>)
```

## Breaking changes

<!-- If this is a breaking change, describe what callers must change. Delete if not applicable. -->

## Screenshots / recordings

<!-- Required for any UI change. Delete if not applicable. -->

## Review notes

<!--
Anything reviewers should know:
- areas that need extra scrutiny
- follow-up issues filed or planned
- deployment, migration, or rollback considerations
-->

---

## Checklist

<!-- Complete every item before converting from Draft to Ready for Review. -->

- [ ] CI is green
- [ ] Tests added or updated (or absence explained above)
- [ ] Documentation updated (or absence explained above)
- [ ] `## [Unreleased]` section of CHANGELOG updated (if user-visible change)
- [ ] PR targets `develop` (or `main` for a release/hotfix — confirm intentional)
- [ ] Breaking change labelled in the PR title with `!` and described above
- [ ] No `.env` files or secrets committed
