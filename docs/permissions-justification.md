# Permissions Justification

This document provides a rationale for each permission and host permission requested by the RageBaiter extension, ensuring compliance with the Chrome Web Store's Single Purpose and Least Privilege policies.

## Requested Permissions

### 1. `storage`

- **Why needed:** To store user preferences, the results of the political compass quiz, and the user's political vector. It is also used to securely store user-provided LLM API keys for local processing.
- **User impact:** Enables persistent settings across browser sessions.
- **Least-privilege rationale:** Necessary for local persistence without requiring a server-side session for every preference.

### 2. `activeTab`

- **Why needed:** To interact with the currently active Twitter/X tab when the user triggers the extension's features. This allows the extension to analyze tweets on the page and inject interventions.
- **User impact:** Allows the extension to function on the page the user is currently interacting with.
- **Least-privilege rationale:** Preferable to broad `<all_urls>` permission as it only grants access to the tab the user has actively invoked.

### 3. `sidePanel`

- **Why needed:** To provide a dedicated UI for political compass quizzes, detailed tweet analysis, Socratic interventions, and settings.
- **User impact:** Provides a non-intrusive way to interact with the extension without blocking the main Twitter feed.
- **Least-privilege rationale:** A core Manifest V3 feature for sidebar UI, providing a better user experience than popups for longer interactions.

## Host Permissions

### `*://x.com/*` and `*://twitter.com/*`

- **Why needed:** RageBaiter is specifically designed to work on the Twitter/X platform to detect political echo chambers.
- **User impact:** Enables the content script to run on these specific domains to monitor and analyze tweets.
- **Least-privilege rationale:** Restricted specifically to the domains where the extension provides its core service.

## Manifest V3 Compliance Checklist

- [x] Manifest version is 3.
- [x] Permissions are minimal and justified.
- [x] Background script is a Service Worker.
- [x] Uses modern side panel API instead of broad `tabs` permissions where possible.
- [x] Content scripts are scoped to specific domains.
- [x] Remote code execution is avoided (all logic is bundled).
- [x] Privacy policy and permissions rationale are documented.
