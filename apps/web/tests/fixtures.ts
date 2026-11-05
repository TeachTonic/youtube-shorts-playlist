import { importSession } from '../src/import-session';
export const A = 'AAAAAAAAAAA', B = 'BBBBBBBBBBB';
export function session() {
  return {
    schemaVersion: 1, exportedAt: '2026-10-09T13:00:00.000Z',
    state: {
      session: { id: 'source-session', phase: 'finished', tabId: 123, startedAt: '2026-10-09T12:00:00.000Z', finishedAt: '2026-10-09T12:10:00.000Z', currentVideoId: A, currentEncounterId: 'source-3' },
      encounters: [A, B, A].map((videoId, index) => ({
        id: 'source-' + (index + 1), ordinal: index + 1, provider: 'YouTube', videoId,
        selected: index !== 1, sessionId: 'source-session',
        detectedUrl: 'https://www.youtube.com/shorts/' + videoId,
        detectedAt: '2026-10-09T12:00:00.000Z', mechanism: 'webNavigation.onHistoryStateUpdated',
      })),
      diagnostics: [{ privateFixture: 'SYNTHETIC_DIAGNOSTIC_NOT_FOR_DRAFT' }],
      pollingEnabled: false, droppedDiagnostics: 0,
    },
  };
}
export function draft() {
  let id = 0;
  return importSession(JSON.stringify(session()), () => 'draft-' + ++id);
}
