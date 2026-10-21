# Contributing

Thanks for your interest in contributing! This guide covers how to get set up, the conventions we follow, and the device compatibility expectations for the mobile wallet reconnect flow.

## Getting Started

1. Fork the repository and create a feature branch from `main`.
2. Install dependencies with your package manager of choice.
3. Make your change, keeping it scoped to a single concern.
4. Run the existing lint, test, and build commands before opening a pull request.
5. Open a pull request describing the problem, the approach, and any trade-offs.

## Code Style

- Match the existing patterns, naming, and module structure of the files you touch.
- Prefer surgical edits over broad rewrites.
- Keep logs, errors, and persisted data deterministic and free of secrets.
- Do not introduce new dependencies without prior discussion in an issue.

## Tests

- Every behavior change should come with automated tests that demonstrate the new behavior and prevent regression.
- Cover the primary success path and at least two relevant failure or boundary paths.
- Existing lint, test, and build commands must remain green.

## Mobile Wallet Reconnect Flow

This section documents device compatibility and expected behavior for the mobile wallet reconnect flow. It is documentation only; it does not change runtime behavior.

### Supported Platforms

| Platform | Minimum version | Notes |
| --- | --- | --- |
| iOS | 15.0+ | Safari and in-app WebViews (WKWebView) on iOS 15 and later. |
| Android | 10 (API 29)+ | Chrome and Android System WebView on Android 10 and later. |
| Desktop browsers | Latest two major versions of Chrome, Firefox, Safari, and Edge | Supported for the web wallet flow; mobile reconnect is not exercised here. |

Constraints:

- The reconnect flow requires a secure context (HTTPS) and access to persistent storage (localStorage / IndexedDB). Private browsing modes that block storage are unsupported.
- Deep-link based reconnects require the wallet app to be installed and able to handle the wallet's URI scheme.
- Devices with JavaScript disabled or with storage cleared between sessions cannot complete a reconnect and must fall back to a fresh connect.

### Primary Success Path

1. The user opens the app on a supported device with the wallet app installed.
2. The app restores the previously persisted session reference from local storage.
3. The app requests a reconnect from the wallet; the wallet approves and returns a fresh session.
4. The app persists the refreshed session and resumes the authenticated view.

### Failure and Boundary Paths

- **Network loss mid-reconnect:** if connectivity drops while the reconnect request is in flight, the app surfaces a retryable error, keeps the persisted session reference intact, and allows the user to retry without re-entering credentials.
- **Expired or stale session:** if the persisted session is no longer valid, the app clears the stale reference and prompts the user to connect the wallet again. No partial session is persisted.
- **App backgrounding:** if the app is backgrounded during reconnect, the in-flight request is abandoned on resume and the user is returned to a retryable state rather than a half-connected state.

When reporting issues with the reconnect flow, include the platform, OS version, browser or WebView version, and the steps that led to the failure. Do not include session tokens or other secrets in issue reports.

## Reporting Issues

- Search existing issues before opening a new one.
- Include reproduction steps, expected versus actual behavior, and environment details.
- Never paste secrets, tokens, or private keys into an issue.

## Pull Requests

- Keep pull requests focused; unrelated changes should be split out.
- Reference the issue being addressed in the description.
- Ensure CI passes before requesting review.
