# Permissions Justification

This document provides a rationale for each permission and host permission requested by the RageBaiter extension, ensuring compliance with the Chrome Web Store's Single Purpose and Least Privilege policies.

## Requested Permissions

### 1. `storage`

- **Why needed:** To store user preferences, the results of the political compass quiz, and the user's political vector. Also used for the feedback retry queue and pipeline cooldown state.
- **User impact:** Enables persistent settings across browser sessions.
- **Least-privilege rationale:** Necessary for local persistence without requiring a server-side session for every preference.

### 2. `activeTab`

- **Why needed:** `chrome.tabs.query()` is used in the popup to open the side panel for the correct tab (`chrome.sidePanel.open({ tabId })`), and in the service worker to update the extension badge on tab activation.
- **User impact:** Allows the extension to function on the page the user is currently interacting with.
- **Least-privilege rationale:** Preferable to broad `tabs` permission; only grants access to the currently active tab.

### 3. `sidePanel`

- **Why needed:** To provide a dedicated UI for political compass quizzes, detailed tweet analysis, Socratic interventions, and settings.
- **User impact:** Provides a non-intrusive way to interact with the extension without blocking the main Twitter feed.
- **Least-privilege rationale:** A core Manifest V3 feature for sidebar UI, providing a better user experience than popups for longer interactions.

### 4. `alarms`

- **Why needed:** `chrome.alarms` creates a recurring 5-minute alarm to retry failed feedback submissions. MV3 service workers are killed by Chrome at any time; alarms are the only reliable way to schedule recurring background work.
- **User impact:** Ensures feedback events queued while offline or during a backend outage are retried and not lost.
- **Least-privilege rationale:** The only MV3-compliant mechanism for reliable recurring background tasks. No alternative exists.

## Host Permissions

### `*://x.com/*` and `*://twitter.com/*`

- **Why needed:** RageBaiter is specifically designed to work on the Twitter/X platform to detect political echo chambers. The content script runs on these domains to observe tweets via MutationObserver.
- **User impact:** Enables the content script to run on these specific domains to monitor and analyze tweets.
- **Least-privilege rationale:** Restricted specifically to the domains where the extension provides its core service.

### `https://*.run.app/*`

- **Why needed:** The extension's service worker and side panel make API calls to the RageBaiter backend (hosted on Google Cloud Run) for tweet analysis (`/api/analyze`), feedback submission (`/api/feedback`), quiz scoring (`/api/quiz/score`), and data export/delete (`/api/user/*`).
- **User impact:** Enables the AI-powered tweet analysis and data sync features.
- **Least-privilege rationale:** Scoped to `*.run.app` (Google Cloud Run). **Before CWS submission, replace with the specific deployed service URL** (e.g., `https://ragebaiter-backend-abc123-uc.a.run.app/*`) to minimize scope.

## Permissions NOT Requested

| Permission      | Reason not requested                                                            |
| --------------- | ------------------------------------------------------------------------------- |
| `tabs`          | Not needed — `activeTab` covers our tab query needs                             |
| `scripting`     | Not needed — content scripts are declared in manifest, not injected dynamically |
| `webRequest`    | Not needed — we don't intercept network requests                                |
| `cookies`       | Not needed — auth uses Supabase JWT stored in `chrome.storage.local`            |
| `history`       | Not needed — we only observe the current page's DOM                             |
| `notifications` | Not needed — interventions are injected inline into the page                    |
| `identity`      | Not needed — auth is email+password via Supabase, not Google OAuth              |

## Remote Code Execution

RageBaiter does **not** execute remote code. All JavaScript is bundled at build time via Vite/CRXJS. The extension does NOT use `eval()`, `new Function()`, or `chrome.scripting.executeScript()` with remote code. The backend returns JSON data only (tweet analysis results), never executable code.

## Manifest V3 Compliance Checklist

- [x] Manifest version is 3.
- [x] Permissions are minimal and justified.
- [x] Background script is a Service Worker.
- [x] Uses modern side panel API instead of broad `tabs` permissions where possible.
- [x] Content scripts are scoped to specific domains.
- [x] Remote code execution is avoided (all logic is bundled).
- [x] No localhost patterns in production manifest.
- [x] `alarms` used instead of `setInterval` for recurring background work (MV3 compliant).
- [x] Privacy policy and permissions rationale are documented.
