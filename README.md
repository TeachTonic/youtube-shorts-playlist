# Watch What I Watched — Phase 0

Local-only capture and official-player feasibility experiments. **Encounter detection is not proof of viewing.** No production application or backend.

See [Web Editor and Viewer](apps/web/README.md) for setup and usage.

## Files and containment

Everything project-related stays under the repository root on D:, including npm cache, temporary files, dependencies, build output and manual exports. Do not use global npm installations or the browser's default Downloads directory.

From the repository root, set the project-local paths in PowerShell:

```powershell
# Run from the root of your checkout on D:.
New-Item -ItemType Directory -Force -Path .tmp,.cache\npm,.artifacts | Out-Null
$env:TEMP = Join-Path $PWD '.tmp'
$env:TMP = $env:TEMP
$env:npm_config_cache = Join-Path $PWD '.cache\npm'
Get-Location
```

Install the shared root tooling and check the extension and player experiments:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm test -- experiments/extension/tests experiments/player/tests
npm run typecheck
npm run build
```

Node 22.12+ or 24+ recommended. Dependencies are lockfile-pinned. npm installation scripts are disabled; Vite/esbuild uses its installed platform package.

For the web editor and viewer, keep the same shell and root tooling. Install the separate web dependencies with `npm ci --prefix apps/web`, then run `npm --prefix apps/web test`, `npm --prefix apps/web run typecheck` and `npm --prefix apps/web run build`.

Root experiment build output:
- Extension: `experiments\extension\dist`
- Player: `experiments\player\dist`

## Extension manual test — Chrome and Edge separately

Use isolated browser profiles **inside this project** so extension databases, browser cache and logs do not go onto C:. Close the test browser before reusing its profile. Use your installed browser executable with these arguments (substitute its real executable path):

```powershell
& '<Chrome executable path>' "--user-data-dir=$(Join-Path $PWD '.artifacts\browser-profiles\chrome')" "--disk-cache-dir=$(Join-Path $PWD '.cache\chrome')" '--no-first-run'
& '<Edge executable path>' "--user-data-dir=$(Join-Path $PWD '.artifacts\browser-profiles\edge')" "--disk-cache-dir=$(Join-Path $PWD '.cache\edge')" '--no-first-run'
```

Apply the TEMP/TMP setup above before launching. Do not sign in to browser sync. These profiles contain local browsing data; do not commit or share them.

1. Open `chrome://extensions` or `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select the extension `dist` directory.
2. Pin the extension. Open `https://www.youtube.com/shorts/` and navigate to an actual Short whose URL has a video ID.
3. Open the popup and **Start Capture**. The first encounter is persisted before the UI acknowledges it.
4. Open the diagnostic window. Place it beside YouTube, then return focus to YouTube. Keep experimental polling **off** for the baseline.
5. Independently record at least 20 **visibly displayed** Shorts, in order. In a local text file under `.artifacts`, record a short visual description and its matching ID after the visible content settles. Do not build the reference list from extension logs. If URL and visible content disagree, record both and mark the discrepancy.
6. Scroll at normal speed. Pause using the popup, scroll through two additional Shorts, then Resume. Record the exact pause interval; those intermediate Shorts must not appear.
7. Scroll further and use **Include Current Short** on several items. This selects the current occurrence only; it does not Like anything on YouTube.
8. Revisit an earlier Short after another Short. Verify separate occurrence IDs and ordinals: A → B → A.
9. Switch to another tab and browse there. Return. Confirm unrelated URLs are absent and returning to unchanged A does not duplicate A.
10. Navigate the capture tab to YouTube home, then return to Shorts. Confirm a redacted rejection and a fresh occurrence on return.
11. Exercise back/forward and reload. Verify event sources. An unchanged-ID reload is deliberately one occurrence.
12. Close the extension service-worker inspector; let the worker suspend, then continue. Separately test closing/reopening the browser: expect paused/unbound state and explicit Resume, not automatic capture.
13. Finish using the popup or diagnostic window. No later navigation may add encounters.
14. Click **Show export JSON**. Copy the text into a file such as `.artifacts\chrome-baseline.json`. There is no automatic download.
15. Compare actual visible sequence and captured sequence item by item. Record missing, extra, reordered and correctly repeated occurrences; attach the included-item check.
16. After export, Reset. Repeat rapid scrolling with polling off, then on. When polling is on, leave the diagnostic window open but keep the YouTube window foreground. Background-window timer throttling may slow polling. Closing all extension views stops polling.
17. Repeat the complete experiment in Edge, with a separate profile and export.

A popup/diagnostic window briefly takes foreground focus. Pause/Resume/Include require the popup opened from the capture tab. The diagnostic window is best for inspecting, Finish, export and Reset.

### Evidence worksheet

Record browser version, OS, extension build, date, login state (only signed in/out; no identity), consent/interstitial state and polling setting.

| Run | Visible eligible encounters | Detected | Missing | Extra | Misordered | Duplicate signals | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| Chrome normal | | | | | | | |
| Chrome rapid | | | | | | | |
| Chrome rapid + polling | | | | | | | |
| Edge normal | | | | | | | |
| Edge rapid | | | | | | | |
| Edge rapid + polling | | | | | | | |

For the initial decision gate require zero unexplained missing, extra or misordered encounters in two normal-speed 20+ encounter runs per browser, correct repeated-occurrence handling, and correct pause/tab boundaries. Rapid-scroll differences must be measured and explicitly accepted or treated as blocking. These are experiment acceptance criteria, not statistical proof of universal reliability.

## Player manual test

```powershell
npm run dev:player
```

Open `http://127.0.0.1:5173` in the isolated browser. To test production output:

```powershell
npm run build:player
npm run preview:player
```

Open `http://127.0.0.1:4173`. Do not open the HTML using file://.

1. Paste 3–20 real video IDs from your manual capture; no titles or video data are fetched by our application.
2. Load sequence. Verify there is no YouTube request until Play.
3. Press Play to create the official player. Once ready, press Play again or use its own control. No implicit playback occurs while waiting for the API.
4. Inspect portrait rendering, controls, branding, audio and resize behavior. Test normal-width and narrow windows; actual mobile devices remain a separate unverified environment unless tested.
5. Verify Next/Previous and “3 of N”; changing items destroys the prior player and requires Play again.
6. Try an unavailable ID, a known embedding-disabled video and age-restricted content if available. Do not invent those results from error-code mappings.
7. Block player requests or disconnect temporarily. Verify timeout/error text and Open in YouTube.
8. Check the fallback opens the intended Short. No overlay may intercept the official player's controls.
9. Record Chrome and Edge results in the Phase 0 report.

## Storage, privacy and limits

One local session; 1,000 encounters; newest 5,000 diagnostic events, with discarded count. No network synchronization exists. Popup “last event” refers to local detection/persistence.

URLs are canonicalized to remove query/fragment data. Non-Shorts, paused and background destinations are redacted. Other tabs are ignored before parsing/logging. The export contains the captured sequence, so treat it as private browsing data.

Local capture is a diagnostic convenience, not proof of legal/platform approval. Review [the results report](docs/architecture/phase-0-results.md) and [ADR](docs/adr/0001-phase-0-boundaries.md) before considering later phases.

## Automated evidence and scope

`npm.cmd run test:report` writes the test report to `.artifacts/tests.json`.\
`npm.cmd run inspect:build` validates the manifest and generated file references and saves asset checksums to `.artifacts/build-inspection.json`.

The suite uses fake-indexeddb, mocked Chrome APIs and a fake YouTube player in Happy DOM. It does not contact YouTube. These tests validate our code paths, not real browser navigation delivery, portrait rendering or playback. The current detailed status and limited decision are in [phase-0-results.md](docs/architecture/phase-0-results.md).
