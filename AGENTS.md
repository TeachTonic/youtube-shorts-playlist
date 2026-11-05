# Phase 0 engineering rules

- Work only in the project checkout on D:. Keep dependencies, caches, temporary files, browser profiles, exports and generated output under this root. Never use global package installation.
- This repository currently contains a feasibility spike, not a production product. Stop at the Phase 0 decision gate.
- Encounter detection is not proof of viewing. Use "encounter", never "verified watch".
- Never use undocumented YouTube APIs, DOM scraping, page globals, request interception, cookies, video downloading, or automatic Like detection.
- Capture requires an explicit start and applies only to the selected tab. Drop unrelated-tab events before parsing or logging.
- Persist state and occurrence insertion atomically in IndexedDB. Preserve A → B → A. Suppress only repeated reports of the current occurrence.
- No backend, authentication, database server, deployment, analytics, Data API integration, or production editor.
- Keep strict TypeScript and small modules. Test real behavioral invariants.
- No secrets or unrelated browsing history in logs, fixtures, or exports.
- Use the official player without overlays, hidden playback or automatic advancement.
- Distinguish implemented, unit tested, manually verified, and not yet verified.
- Do not infer real YouTube reliability from synthetic tests. Never declare legal compliance.
- Use the README commands to confine npm cache and temporary files to the project.
- Do not commit generated output or local diagnostic data.
