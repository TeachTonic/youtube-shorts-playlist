# Milestone 2 — local recipient viewer — 2026-10-13

## Delivered scope

A separate viewer.html entry in the existing local web app reads a validated snapshot of the saved draft at the same browser origin. Only included occurrences appear, in their edited order. Repeated video IDs retain separate occurrence IDs. Viewing never saves to the draft.

The editor's new View saved sequence link is available only for a saved, nonempty selection. It navigates to the local viewer; it is not a public share link. The only existing source/configuration files changed are apps/web/src/App.tsx (entry link and explanatory text) and apps/web/vite.config.ts (second HTML build entry). Their necessity was explained before editing. The editor HTML/CSP, storage, draft model, importer, all existing tests, package files, root files and the entire Phase 0 spike are unchanged.

No dependencies were added. Production web build output under apps/web/dist was regenerated as required; historical reports and evidence were not regenerated.

## Player behavior

The new React-compatible adapter follows experiments/player/src/main.ts: official IFrame API, autoplay=0, visible official controls, playsinline, explicit origin, youtube-nocookie host, deferred loading and ready/error timeouts. The spike is coupled to its diagnostic page, so it was adapted into small new modules without changing or importing that page's side effects.

Play first loads the API/player; playback requires another explicit Play gesture or the official controls after readiness. Next, Previous and selecting an occurrence destroy the old player and require Play again. Ended events do not advance. Occurrence identity, not video ID, keys the player lifecycle. Late callbacks and pending loads cannot create a previous occurrence's player after navigation. Unmount/pagehide destroys the player; restoration from browser back/forward cache reloads the viewer to avoid a destroyed controller.

Unavailable/embedding errors, ready timeouts and loader failures retain Open in YouTube and navigation. Try again resets the failed attempt; it does not start playback. No inferred claim that a timeout means deletion. The portrait container has no overlaid controls. Native buttons, focus indicators, current-step indication and a live position/status provide keyboard access.

Only viewer.html permits the official player script and iframe hosts. It uses strict-origin-when-cross-origin for player identification. The editor keeps its previous no-referrer policy and no-frame CSP. No preconnect, thumbnail or metadata fetch occurs before Play. The official player may make its own requests and use browser storage according to YouTube/browser behavior; this is not a claim of no third-party processing.

Official references reviewed:
- https://developers.google.com/youtube/iframe_api_reference
- https://developers.google.com/youtube/terms/required-minimum-functionality

No platform or legal compliance conclusion is made.

## Executed verification

With TEMP/TMP set to the project .tmp and npm_config_cache set to .cache/npm:

- npm --prefix apps/web test — 66 passed: 43 existing editor tests, 23 new viewer/controller/loader tests.
- npm test -- experiments/extension/tests experiments/player/tests — 115 passed.
- npm --prefix apps/web run typecheck — passed.
- npm run typecheck — passed.
- npm --prefix apps/web run build — passed; final viewer bundle viewer-Dil3zUsw.js.

Initial failures were resolved in new files only: the loader test needed inert script elements to prevent Happy DOM generating an unsolicited error, and strict TypeScript required deleting an absent optional ready callback instead of assigning undefined. Tests and typecheck were rerun after these corrections. The final build includes the correction.

A new project-local headless Edge profile checked the final production output: repeated occurrences, Enter-key navigation, no YouTube request before Play, mobile layout without overflow, unchanged saved draft, live API loading, error rendering and iframe cleanup on navigation. The chosen Short returned official error 150. Actual video playback, successful live readiness, age restriction behavior and end-of-video behavior with a real video remain unverified. Mocked event tests cover ready, ended, blocked, timeout and error behavior; they are not proof of live playback. Edge emitted tracking-prevention warnings. The test did not disable browser protections.

Desktop/mobile screenshots and browser-check-final.json are in .artifacts/milestone-2-2026-10-13. Earlier attempts remain intact; final output was saved under new names. The existing extension/browser profiles were not opened, reloaded or reset.

## Run and manual acceptance

From the repository root in PowerShell:

```powershell
$env:TEMP = Join-Path $PWD '.tmp'
$env:TMP = $env:TEMP
$env:npm_config_cache = Join-Path $PWD '.cache\npm'
npm --prefix apps/web run dev
```

Open http://127.0.0.1:5174, import a finished session if needed, select/reorder occurrences and give it a title. Choose View saved sequence. Existing dev and preview origins retain separate drafts; do not clear either.

1. Verify selected order and repeated IDs as distinct entries; title and description appear outside the player.
2. Before Play, no video plays. Press Play and wait for readiness; press Play again or use official controls. Use a Short known to permit embedding.
3. Use Next/Previous and keyboard Tab/Enter. Playback must stop on navigation; the newly selected occurrence requires Play.
4. Let a playable video finish. Position must remain unchanged.
5. Try an unavailable or embedding-disabled video. Check the message and Open in YouTube link.
6. Leave the viewer while playing/loading and return. No old player should keep playing. Verify your draft remains unchanged.
7. Check a narrow viewport and keyboard focus. The player must have no app controls overlaid on it.

This milestone is implemented and automated checks passed; successful live playback still needs manual acceptance with an embeddable Short. No backend, database, authentication, public sharing, deployment, extension changes or later milestones.
