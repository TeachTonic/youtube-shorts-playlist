# Phase 0 results — Watch What I Watched

Date: 2026-10-08\
Scope: isolated extension and player spike only.

## Summary and evidence level

The requested experiments are implemented and built. **Live YouTube capture reliability has not been established.** No manual Chrome or Edge browsing sequence was observed during this implementation run. No real video was played through the experiment.

Do not read passing automated checks as evidence that YouTube updates its URL correctly for every visibly displayed Short.

| Area | Implemented | Automated verification | Manually verified |
|---|---|---|---|
| Strict Shorts URL parser | Yes | 18 passing tests | No |
| Encounter state machine | Yes | 19 passing tests | No |
| IndexedDB transaction behavior | Yes | 3 passing fake-indexeddb tests | No real worker-termination test |
| Worker event/message wiring | Yes | 7 passing tests with mocked Chrome APIs | No |
| Player controls and failure states | Yes | 7 passing tests with a fake player API and DOM | No live embed |
| Extension/player build | Yes | Both Vite builds passed | Generated files inspected; browser loading unverified |
| Platform-policy clearance | No declaration made | Documentation reviewed during architecture analysis | Human review outstanding |

Total: **54 tests passed in 5 files; 0 failed** on the final run. Strict TypeScript passed. Both builds passed. Initial player fixture setup issues were corrected; the final test run was clean.

Verification commands, from the project root with README environment settings:
- `npm.cmd run test:report`
- `npm.cmd run typecheck`
- `npm.cmd run build`
- `npm.cmd run inspect:build`

Artifacts:
- `.artifacts/tests.json`: actual machine-readable test results.
- `.artifacts/build-inspection.json`: generated-file checks and SHA-256 hashes.
- `experiments/extension/dist/`: unpacked extension.
- `experiments/player/dist/`: built player page.

All commanded project writes, dependencies, npm cache and temporary-file paths were confined to the project checkout on D:. No global package installation or external browser profile was used.

## Capture

### Mechanisms

| Mechanism | Implemented behavior | Evidence actually obtained |
|---|---|---|
| webNavigation.onCommitted | Top-level capture-tab navigation, including full loads | Mocked worker integration passes; actual browser event delivery unverified |
| webNavigation.onHistoryStateUpdated | Browser-reported History API transitions; no page-script injection | Mocked integration passes; actual YouTube SPA transitions unverified |
| tabs.onActivated | Re-read capture-tab URL when activated | State reconciliation unit tested; actual browser behavior unverified |
| windows.onFocusChanged | Reconcile selected capture tab when foreground focus changes | Foreground gate mocked; actual focus behavior unverified |
| URL comparison | Opt-in 500 ms polling driven by an open popup/diagnostic view | Foreground/opt-in behavior tested with mocked APIs; no measured live benefit |
| Start/Resume/Include | Explicit current-tab URL reconciliation | Worker integration/state tests pass; real popup behavior unverified |

No mechanism has been shown to fail against real YouTube because no live experiment has yet been run. Conversely, no mechanism is marked as having worked against real YouTube.

### Required questions

- **How reliable was URL detection?** Parser and state behavior passed deterministic inputs. Real visible-content correspondence and miss rate are unknown.
- **How did SPA transitions behave?** Mocked History API event sequences were ingested correctly. YouTube's actual update timing remains unverified.
- **How did back/forward behave?** The model preserves A → B → A. Actual back/forward event delivery must be measured.
- **What happened on reload?** An unchanged-ID committed event is suppressed in tests; this deliberate policy treats reload as the same occurrence. Actual browser reload is unverified.
- **What happened when switching tabs?** Tests exclude unrelated tabs, suppress background encounters and reconcile a changed URL on return. Actual focus/activation behavior is unverified.
- **What happened when leaving Shorts?** Tests reset current occurrence, redact the destination and create a new occurrence on return. Actual browser navigation is unverified.
- **Were rapid transitions missed?** Unknown. No rapid real scrolling was measured.
- **Did polling help?** Unknown. Polling is disabled by default and must be compared in separate runs.
- **Were duplicate events observed?** Synthetic duplicate reports were supplied and suppressed correctly. No empirical duplicate rate has been measured.

### Capture limitations that must be accepted or resolved

1. URL changes may lead or lag visible content. No URL-only design can prove actual viewing.
2. Only the selected foreground tab is eligible. Intermediate background or paused navigation is intentionally omitted.
3. Focus is checked while processing an event; delayed delivery near a focus change can affect eligibility. The manual test must inspect these boundaries.
4. Polling runs only while an extension view is open. Background-window throttling can reduce its frequency; closing all views stops polling. A worker timer is not used as a false guarantee.
5. Same-current-ID notifications collapse into one occurrence, including reload and resume without an observed ID change. An unobserved away-and-back cannot be reconstructed.
6. Occurrences are ordered by serialized processing, not timestamp sorting. Real event timing across mechanisms remains to be measured.
7. Committed IndexedDB state survives connection recreation in simulation. Browser/OS crashes and actual MV3 termination have not been tested.
8. Storage failures latch ingestion off for the running worker and display an error. A worker restart after a storage failure cannot reconstruct uncommitted events; inspect for gaps before trusting that session.
9. Only one saved session is supported; export and reset before another run. Capture stops at 1,000 encounters. Diagnostics retain the newest 5,000 entries and count discarded records.
10. The 11-character ID check validates syntax, not existence or classification as a Short. ABC123 is an invalid placeholder; real-length variants were also tested.
11. Diagnostics retain canonical Shorts URLs, not arbitrary query/fragment data; unrelated browsing is discarded and non-Shorts destinations are redacted.

## Semantics

**Encounter detection is not proof of viewing.**

An encounter means the extension observed an eligible video reference during explicit capture. It does not establish whether the video was visible, played, completed, heard, liked or attended to. The independent manual reference sequence must be based on visible content, with any visible-content/URL mismatch recorded.

A → B → A remains three encounter records with distinct IDs and ordinals. Include selects the current occurrence only and never changes YouTube's rating.

## Chrome

**Not yet manually verified.**

No browser version, visible-sequence log or real encounter export is available. Execute the README protocol in a project-local Chrome profile. Record two normal-speed runs of at least 20 encounters, rapid scrolling with polling off/on, pause/resume, Include, revisits, tab changes, leaving Shorts, reload, back/forward and interruption.

Do not replace the missing measurements with inferred results from mocked chrome.* APIs.

## Edge

**Not yet manually verified.**

The extension builds as MV3 using Chromium APIs, but compatibility is not a measured outcome. Run the same protocol independently in a project-local Edge profile and record its version and results.

## Player

| Topic | Implementation/test result | Real result |
|---|---|---|
| Portrait presentation | 9:16 outer viewport; official player controls unobscured | Actual rendering, letterboxing and usability unverified |
| Availability | Video IDs are supplied manually; no metadata/API availability preflight | Actual sample-video availability unverified |
| Errors | Fake 101 error and readiness timeout produce useful UI and fallback | Real 2/5/100/101/150/153 responses unverified |
| Age/restriction | Open-in-YouTube fallback exists; no bypass | No age-restricted or region-restricted content tested |
| Autoplay | autoplay=0; creation/ready does not call playVideo; no end-event advancement | Browser gesture behavior unverified |
| Explicit Play | First action loads API/player; second action or native player control starts playback | Real user-activation behavior unverified |
| Navigation | Next destroys the previous fake player; stale callbacks ignored; position updates | Real audio teardown and focus behavior unverified |
| Fallback | Canonical URL and visible error fallback asserted in DOM tests | Actual external navigation unverified |

YouTube is contacted only after Play in the application flow. Privacy-enhanced embedding is used; it must not be described as zero third-party data collection. Controls remain outside the iframe. There is no player overlay, hidden simultaneous playback, media proxying or video download.

## Policy

### Confirmed technical facts

- The extension manifest requests only webNavigation and host access to https://www.youtube.com/*.
- No content script or DOM/page-global inspection is present.
- The worker reads browser navigation metadata and keeps captured data locally in IndexedDB.
- Generated-worker inspection found no fetch, XMLHttpRequest or dynamic code execution.
- Player integration uses the documented YouTube IFrame API and privacy-enhanced embed host.
- User inclusion is separate from YouTube Likes.
- No production API, authentication, account management, analytics, Data API client or deployment was created.

### Open platform-policy questions

- Is ongoing URL observation after explicit Start acceptable under the relevant YouTube terms and API agreement?
- What disclosures and consent are required for this browsing-data use in each extension store?
- What public-product privacy, retention, jurisdiction, age/audience and branding requirements apply?
- Are the proposed player presentation and linking flows acceptable for the released product?

Browser permission and technical feasibility do not answer these questions. **No legal-compliance conclusion is made.** Obtain appropriate human/legal/platform review before public release.

Relevant official sources reviewed in the preceding analysis:
- [Chrome navigation API](https://developer.chrome.com/docs/extensions/reference/api/webNavigation)
- [MV3 worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Chrome Web Store user-data requirements](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [YouTube Terms](https://www.youtube.com/static?template=terms)
- [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)
- [Required player functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)
- [Embedding guidance](https://support.google.com/youtube/answer/171780?hl=en)

### Explicitly excluded mechanisms

Undocumented APIs, account cookies, page globals, React internals, DOM scraping, request interception, History API monkey-patching, automatic Likes, account history, video downloading, media re-hosting, and bypassing playback restrictions.

## Decision gate

# CONDITIONAL GO

**This recommendation is limited to controlled manual Phase 0 evaluation of the built spike. It is not a conclusion that automatic Shorts capture is reliable, and it does not authorize Phase 1 or public release.**

The implementation works against deterministic and simulated inputs. The core live-browser question is still **not yet verified**. Consequently the production architecture gate remains blocked until:

1. Independent visible-sequence comparisons pass in both Chrome and Edge.
2. The stated normal-speed acceptance criteria pass, and rapid-transition limitations are measured.
3. Pause, foreground boundaries, revisits and interruption recovery are verified in real browsers.
4. The official player is tested with real portrait content and observed failure/fallback cases.
5. Required human/platform-policy review resolves the capture approach.

Known experimental limitations are listed above; none is concealed by claiming successful URL changes equal viewing evidence.

If measured automatic capture is fundamentally unreliable or unacceptable after review, use a manual fallback: an explicit Include current Short action reads only the user-selected current tab URL and appends an included occurrence in click order. It must not imply that skipped or unclicked content was captured. That fallback is documented, not separately implemented in this spike.

**Recommended next work: complete the README manual experiments and update this report with measured evidence. Stop here; do not start production implementation.**
