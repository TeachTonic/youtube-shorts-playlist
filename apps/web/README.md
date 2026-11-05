# Local session-to-playlist editor — Milestone 1

A separate React/TypeScript application. It reads a finished Phase 0 session export and stores one local draft. It does not change the extension or its storage, upload files, fetch video metadata, play videos, or create share links.

## Run on Windows PowerShell

Run from the repository root in PowerShell:

```powershell
$env:TEMP = Join-Path $PWD '.tmp'
$env:TMP = $env:TEMP
$env:npm_config_cache = Join-Path $PWD '.cache\npm'
npm --prefix apps/web run dev
```

Open `http://127.0.0.1:5174`. Keep this exact origin to restore the same draft. Dependencies are already installed; on a fresh checkout use `npm ci` for the root tooling followed by `npm ci --prefix apps/web`, with the same environment variables. Never install globally. The app uses the root's Vite, TypeScript and Vitest tools, with its own pinned React dependencies and lockfile.

## Checks

```powershell
npm --prefix apps/web test
npm test -- experiments/extension/tests experiments/player/tests
npm run typecheck
npm --prefix apps/web run typecheck
npm --prefix apps/web run build
```

The editor build goes to `apps/web/dist`. Optional `npm --prefix apps/web run preview` serves it at `http://127.0.0.1:4174`; this is a different storage origin from development. Do not run the historical report-writing scripts: they overwrite Phase 0 evidence.

### Editor import lifecycle verification — recorded 2026-11-05

**Manual browser acceptance.** The project owner tested the existing synthetic fixtures `.tmp/import-lifecycle-valid.json` and `.tmp/import-lifecycle-invalid.json` (paths relative to the repository root).

| Browser | Editor origin | Profile and storage |
|---|---|---|
| Microsoft Edge | `http://127.0.0.1:5184` | Existing user profile. The separate port gave the test its own localStorage origin, distinct from the original editor at `http://127.0.0.1:5174`. |
| Google Chrome | `http://127.0.0.1:5185` | Fresh dedicated user-data directory at `.tmp/chrome-import-lifecycle-review-01`, with extensions and sync disabled. |

The owner verified each outcome in both browsers:

- The valid fixture imported two encounters in A → B order. Both were included on import, matching the fixture's selection flags. Moving B to the top of Your Cut produced B → A while the encounter list stayed A → B.
- Malformed JSON displayed “This is not valid JSON. Choose a finished Phase 0 session export.” No replacement confirmation appeared, and the existing draft was preserved.
- A synthetic `File` whose `text()` deliberately rejected displayed “Could not read or import this file. Your draft has not changed. Try selecting the file again or choose another finished-session JSON export.” The draft was preserved. Actual operating-system file-read failures remain untested.
- The controls recovered. A subsequent valid import reached replacement confirmation, and cancelling preserved the draft. After refresh, the editor restored the title, encounter order A → B and playlist order B → A.

**Automated verification.** The completed web regression run passed 116 tests across 7 files. The 25 editor tests included 11 new lifecycle cases, and the web TypeScript check passed. The [editor lifecycle tests](tests/App.test.tsx) cover pending reads, invalidation on unmount, a late completion after a new editor instance saves, the concurrent-import guard and React StrictMode. Evidence for the unmount and stale-write scenarios comes from these automated tests only.

**Limits.** The manual results apply to the two browser setups above. Compatibility with other browsers and versions remains unverified. Unmount invalidates the import while the underlying file read continues. Cross-tab storage conflict resolution remains unsupported.

## Try it

1. Choose a finished schema-version-1 session JSON using Import session. The file is read only in your browser and remains unchanged.
2. Check individual occurrences, or Select all. Existing export selection flags are respected; an export with no selections starts with an empty selected sequence.
3. Move selected occurrences using the up/down buttons (also keyboard accessible). Your Cut and the saved-sequence viewer use an independent playlist order; the encounter list stays in import order. Repeated video IDs have separate draft occurrence IDs.
4. Excluding an occurrence leaves it in the encounter list and retains its playlist position for re-inclusion. Removing an occurrence deletes it from both orders in this draft only; remaining encounter numbers are displayed consecutively.
5. Enter a title and optional description. Edits save automatically; reload at the same origin to confirm restoration.
6. Try malformed JSON or an unfinished export: the current draft must remain intact. Valid replacement asks for confirmation.

## Boundaries and failure behavior

- Import limit: 5 MiB, 1–1,000 encounters. Supported input requires a finished session, contiguous ordered ordinals, unique source occurrence IDs, matching session ownership, valid 11-character video IDs and boolean selections.
- Only fresh draft IDs, YouTube provider/video IDs, selection flags, title, description and a playlist ordering of draft occurrence IDs enter storage. Diagnostics, URLs, timestamps, filenames, source encounter IDs and browser/session internals are discarded.
- Schema version 1 now includes `playlistOrder`, containing every draft occurrence ID exactly once. Legacy v1 drafts without it derive playlist order from their saved item order on read, without automatically writing storage. A malformed explicit order is rejected. Previously overwritten capture order cannot be recovered from an old draft alone. Older editor builds ignore this additional field and can lose the independent order on save; do not mix old and new builds at the same storage origin.
- Title limit: 120 characters; description: 2,000. Blank titles and zero selected items are valid local drafts. Text renders as text, not HTML.
- One draft per browser origin. Local storage is not encrypted or a backup; clearing site data/private browsing can lose it. Use one editor tab at a time; concurrent tab conflict resolution is outside this milestone.
- Storage failures show an unsaved warning and Retry saving. Keep the tab open while retrying. Corrupt saved data is not silently deleted or overwritten; importing a valid replacement requires confirmation.
- Removed occurrences can be recovered by reimporting the original export, which replaces the draft after confirmation. There is no undo or draft export in this milestone.
- No playback, public sharing, API, accounts, deployment or extension integration changes. Encounter detection is not proof of viewing.

Preservation records and new verification evidence are under `.artifacts/milestone-1-2026-10-13`. The dated handoff is `docs/architecture/2026-10-13-milestone-1-handoff.md`; historical reports are unchanged.
