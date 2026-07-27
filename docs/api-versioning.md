# API Versioning Policy

## Current versions

| Version | Status  | Base path  | Sunset date |
| ------- | ------- | ---------- | ----------- |
| v1      | Active  | `/api/v1`  | TBD         |

## What constitutes a breaking change

A change is **breaking** (requires a new major version) if it:

- Removes or renames an endpoint
- Removes or renames a required request field
- Removes or renames a response field that clients depend on
- Changes the type or format of an existing field (e.g. string → number)
- Changes the meaning of an existing status code on an endpoint
- Tightens validation on an existing field (e.g. previously optional becomes required)

A change is **non-breaking** (safe to ship in the current version) if it:

- Adds a new endpoint
- Adds a new optional request field
- Adds a new response field
- Relaxes validation on an existing field
- Fixes a bug where the previous behaviour was unintentional/undocumented

## How versions are served

Every response from a versioned endpoint includes an `X-API-Version` header indicating the version that handled the request.

```
X-API-Version: v1
```

## Version support lifetime

- Old versions are supported for **at least 6 months** after a new major version is released.
- Deprecated versions respond with a `Deprecation` and `Sunset` header (RFC 8594) so clients can detect and migrate automatically.
- After the sunset date the version returns `410 Gone`.

## Migrating

When a new version is released:
1. Update your `baseURL` from `/api/v1` to `/api/v2` (or the next version).
2. Review the changelog for breaking changes in the new version.
3. Test against the new version in staging before switching production traffic.
