import { emptyState, type Diagnostic, type Observation, type State } from './model';
import { parseShortUrl } from './url';
export function log(state: State, event: Diagnostic): void {
  state.diagnostics.push(event);
  if (state.diagnostics.length > 5000) {
    state.droppedDiagnostics += state.diagnostics.length - 5000;
    state.diagnostics.splice(0, state.diagnostics.length - 5000);
  }
}
export function note(state: State, source: string, reason: string, at: string): void {
  log(state, { timestamp: at, tabId: state.session?.tabId ?? null, url: '[not collected]',
    videoId: null, source, accepted: false, reason });
}
export function start(state: State, tabId: number, at: string, sessionId: string): void {
  if (state.session) throw new Error('Export then reset the saved session before starting another.');
  state.session = { id: sessionId, tabId, phase: 'capturing', startedAt: at, finishedAt: null,
    currentVideoId: null, currentEncounterId: null };
  note(state, 'control', 'capture-started', at);
}
export function observe(state: State, event: Observation, encounterId: string): boolean {
  const session = state.session;
  // Unrelated tabs are discarded before parsing, logging, or persisting their URL.
  if (!session || session.tabId !== event.tabId || session.phase === 'finished' || session.phase === 'finishing') return false;
  const parsed = parseShortUrl(event.url);
  const record: Diagnostic = {
    timestamp: event.at, tabId: event.tabId, url: parsed.ok ? parsed.canonicalUrl : '[non-Shorts URL omitted]',
    videoId: parsed.ok ? parsed.videoId : null, source: event.source, accepted: false, reason: '',
  };
  if (session.phase !== 'capturing') {
    record.url = '[paused URL omitted]'; record.videoId = null; record.reason = 'paused';
  } else if (!event.foreground) {
    record.url = '[background URL omitted]'; record.videoId = null; record.reason = 'capture-tab-not-foreground';
  } else if (!parsed.ok) {
    record.reason = parsed.reason;
    session.currentVideoId = null; session.currentEncounterId = null;
  } else if (session.currentVideoId === parsed.videoId && session.currentEncounterId) {
    record.reason = 'same-current-occurrence';
  } else if (state.encounters.length >= 1000) {
    session.phase = 'paused'; record.reason = 'encounter-limit-reached';
  } else {
    state.encounters.push({ id: encounterId, ordinal: state.encounters.length + 1, provider: 'YouTube',
      videoId: parsed.videoId, detectedUrl: parsed.canonicalUrl, detectedAt: event.at, mechanism: event.source,
      selected: false, sessionId: session.id });
    session.currentVideoId = parsed.videoId; session.currentEncounterId = encounterId;
    record.accepted = true; record.reason = 'new-encounter';
  }
  log(state, record);
  return record.accepted;
}
export function pause(state: State, at: string): void {
  if (state.session?.phase !== 'capturing') throw new Error('Capture is not running.');
  state.session.phase = 'paused'; note(state, 'control', 'paused', at);
}
export function resume(state: State, tabId: number, at: string): void {
  if (state.session?.phase !== 'paused') throw new Error('Session is not paused.');
  if (state.session.tabId !== null && state.session.tabId !== tabId) throw new Error('Return to the original capture tab.');
  state.session.tabId = tabId; state.session.phase = 'capturing'; note(state, 'control', 'resumed', at);
}
export function includeCurrent(state: State, videoId: string, at: string): void {
  if (state.session?.phase !== 'capturing' || state.session.currentVideoId !== videoId)
    throw new Error('No current capture encounter. Return to the capture tab and resume.');
  const matches = state.encounters.filter(value => value.id === state.session?.currentEncounterId);
  const item = matches[0];
  if (!state.session.currentEncounterId || matches.length !== 1 || !item ||
      item !== state.encounters.at(-1) || item.sessionId !== state.session.id || item.videoId !== videoId)
    throw new Error('Current encounter is missing or inconsistent. Return to the capture tab and wait for detection.');
  item.selected = true; note(state, 'control', 'included-current', at);
}
export function beginFinish(state: State, at: string): void {
  if (!state.session || !['capturing', 'paused'].includes(state.session.phase)) throw new Error('No unfinished session.');
  state.session.phase = 'finishing'; note(state, 'control', 'finishing', at);
}
export function completeFinish(state: State, at: string): void {
  if (state.session?.phase !== 'finishing') throw new Error('Session is not finishing.');
  state.session.phase = 'finished'; state.session.finishedAt = at; note(state, 'control', 'finished-local-persistence', at);
}
export function interrupt(state: State, at: string, reason: string): void {
  if (!state.session || state.session.phase === 'finished') return;
  if (state.session.phase === 'finishing') { completeFinish(state, at); return; }
  state.session.phase = 'paused'; state.session.tabId = null;
  state.session.currentVideoId = null; state.session.currentEncounterId = null;
  note(state, 'control', reason, at);
}
export function reset(state: State): void {
  if (state.session && state.session.phase !== 'finished') throw new Error('Finish the session before resetting.');
  Object.assign(state, emptyState());
}
