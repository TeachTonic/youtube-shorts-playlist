# ADR 0001 — Encounter capture and Phase 0 boundaries

Date: 2026-10-08
Status: Accepted for the isolated experiment; public release remains gated.

## Decisions

1. **Encounter ≠ verified watch.** URL observations do not prove visible content, playback, attention, duration or completion.
2. **No undocumented YouTube APIs.** No private endpoints, intercepted requests, authentication cookies or reverse engineering.
3. **No DOM scraping in MVP.** This spike reads browser navigation metadata only; no content script, DOM attributes, React internals or page globals.
4. **No automatic Like detection in MVP.** Inclusion is our explicit local action and never affects YouTube.
5. **Automatic capture is conditional on feasibility/policy review.** Browser API permission is not YouTube platform permission. Synthetic evidence is not a real Shorts verdict.
6. **Manual Include current Short is the fallback.** If automatic sequence capture fails, scope a subsequent fallback around explicit user-triggered URL inclusion. Do not silently claim it fulfills automatic capture.

## Implementation choices

- One locally persisted session at a time, UUID occurrence IDs, immutable ordinals, bounded diagnostic log.
- Separate repeated occurrences; A → B → A remains three entries. Reload/repeated signals for unchanged A are one occurrence.
- Pause retains the current occurrence; Resume records a changed eligible URL. Returning from an observed non-Shorts URL creates a new occurrence.
- Background navigation is ignored. Returning reconciles the current eligible URL; intermediate background transitions are intentionally not recovered.
- IndexedDB is the source of truth; a worker promise queue serializes processing, not durable storage.
- Browser restart/tab closure pauses and unbinds capture. Resume is an explicit user action.
- Experimental polling is off by default and driven by an open extension view, not a worker timer. It cannot promise continuous capture while all views are closed.
- Exact HTTPS www.youtube.com Shorts links with 11-character IDs only. Query/fragment data is dropped.
- Minimal manifest: webNavigation plus the YouTube host. IndexedDB needs no storage permission; no activeTab, scripting, cookies, history, downloads, alarms or broad tabs permission.
- Navigation APIs deliver events more broadly than our session; the worker rejects other tab IDs before parsing/logging.
- Portrait official embed with external controls, no seamless autoplay. Playback can fail or require opening YouTube.

## Previous architecture decisions retained, not implemented

Later production work was provisionally designed around React/TypeScript, ASP.NET Core, PostgreSQL, a modular monolith, private sessions, independent ordered playlists, revocable unlisted sharing and references-only storage. None of those production services belongs to this phase.

## Alternatives rejected

DOM observation, page-script monkey-patching, internal APIs and account history/Likes import violate this phase's constraints. Memory-only persistence loses state on worker suspension. Global ID deduplication destroys encounter history. A native Shorts UI clone and media hosting are unnecessary.

## Open questions

Does automatic URL collection have acceptable platform-policy standing? Do visible Shorts and URLs align across supported browser/YouTube variants? Do live embeds preserve a usable portrait presentation under actual restrictions? Phase 0 evidence must answer or explicitly leave these unverified.
