# Phase 1 Milestone 1 handoff — 2026-10-13

The user approved only a local React/TypeScript session-to-playlist editor. This is a narrow exception to the Phase 0-only implementation rule. Capture, privacy, and filesystem boundaries remain in force. No backend, accounts, public sharing, playback integration, deployment, or extension changes are authorized.

## Preservation

Before implementation, `.artifacts/milestone-1-2026-10-13/preservation-before.json` recorded SHA-256 hashes, sizes, and modification timestamps for 49 existing files: Phase 0 source/tests, documentation, root configuration, experiment builds, and nine top-level evidence/report files. Browser profiles were not opened. All new files, dependencies, caches, and outputs stay under the repository root on D:. No staging or commit is authorized.

The separate application in `apps/web` has its own package/lockfile and uses the installed root development tools. Historical reports, README, AGENTS.md, root package files, extension, and existing evidence remain unchanged.

## Evidence at handoff

- Current source includes explicit-target Start/Resume and foreground-gated encounters. Encounter detection is not proof of viewing.
- Previous verification in this conversation passed 115 project tests, type checking, and the extension build. Preserved `tests.json` remains the earlier 54-test report.
- Finished Edge/Chrome Resume exports exist. The user reports live Resume, continued capture, revisits, and same-current-occurrence suppression. These are not independent visible-sequence measurements.
- The earlier paused Chrome error export remains preserved. Its reported error text is not in that JSON. Stale/mixed builds remain a hypothesis, not a resolved cause.
- Inspected exports contain zero included items. Live Include and official-player acceptance remain outstanding.
- Historical Phase 0 reports are not rewritten. No universal reliability or platform/legal compliance is claimed.

## Milestone 1 contract

Explicitly import a finished schema-version-1 Phase 0 JSON file as untrusted input. Derive a separate draft containing only its own occurrence IDs, YouTube video IDs, inclusion flags, title, and description. Do not retain diagnostics, capture/session/tab IDs, URLs, filenames, or capture timestamps.

Repeated video IDs remain separate occurrences. Initial order matches encounter order. Selection preserves order; move controls explicitly change the working order. Removal affects only this draft. Blank title and zero included items are valid while drafting. Save one local draft in the web application's origin, separate from extension IndexedDB. No upload, YouTube request, or playback.

Validate replacements before confirmation. Invalid input leaves the current and saved draft intact. Corrupt/unavailable storage must not be silently erased; saving failure leaves an editable in-memory draft with an unsaved warning.

## Verification and remaining gates

Run focused import/ordering/persistence/UI tests, the scoped existing regression suite, root/editor type checks, and only the editor build. Compare preserved hashes; put new reports under the milestone directory. Never overwrite old reports, rebuild/reload the extension, or access existing browser profiles.

Milestone 2, live playback, hosting/authentication, public-release capture measurements, policy review, and the old Chrome build mismatch remain separate work. Stop after Milestone 1.
