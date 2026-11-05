import { beforeEach, describe, expect, it } from 'vitest';
import { emptyState, type State, type Source } from '../src/model';
import { beginFinish, completeFinish, includeCurrent, interrupt, observe, pause, reset, resume, start } from '../src/state';
const A = 'AAAAAAAAAAA', B = 'BBBBBBBBBBB';
const at = '2026-10-08T09:00:00.000Z';
let state: State;
let nextId = 0;
function encounter(videoId: string, source: Source = 'webNavigation.onHistoryStateUpdated', foreground = true, tabId = 7): boolean {
  return observe(state, { tabId, url: 'https://www.youtube.com/shorts/' + videoId, at, source, foreground }, 'e-' + nextId++);
}
beforeEach(() => { state = emptyState(); nextId = 0; start(state, 7, at, 'session-1'); });
describe('encounter state machine', () => {
  it('persists the required encounter fields', () => {
    encounter(A);
    expect(state.encounters[0]).toEqual({ id: 'e-0', ordinal: 1, provider: 'YouTube', videoId: A,
      detectedUrl: 'https://www.youtube.com/shorts/' + A, detectedAt: at,
      mechanism: 'webNavigation.onHistoryStateUpdated', selected: false, sessionId: 'session-1' });
  });
  it('suppresses duplicate notification from another mechanism', () => {
    encounter(A, 'webNavigation.onCommitted'); encounter(A); encounter(A, 'url-comparison');
    expect(state.encounters).toHaveLength(1);
    expect(state.diagnostics.at(-1)?.reason).toBe('same-current-occurrence');
  });
  it('preserves A → B → A with separate occurrence IDs', () => {
    encounter(A); encounter(B); encounter(A);
    expect(state.encounters.map(item => item.videoId)).toEqual([A, B, A]);
    expect(state.encounters.map(item => item.ordinal)).toEqual([1, 2, 3]);
    expect(new Set(state.encounters.map(item => item.id)).size).toBe(3);
  });
  it('leaving Shorts resets the current occurrence and redacts the destination', () => {
    encounter(A);
    observe(state, { tabId: 7, url: 'https://example.com/private?q=secret', at, source: 'webNavigation.onCommitted', foreground: true }, 'unused');
    expect(state.session?.currentVideoId).toBeNull();
    expect(JSON.stringify(state)).not.toContain('secret');
    encounter(A); expect(state.encounters).toHaveLength(2);
  });
  it('does not persist or log unrelated-tab events', () => {
    const before = structuredClone(state);
    encounter(B, 'webNavigation.onCommitted', true, 999);
    expect(state).toEqual(before);
  });
  it('rejects background events without retaining their ID; return reconciles once', () => {
    encounter(A); encounter(B, 'webNavigation.onHistoryStateUpdated', false);
    expect(state.encounters).toHaveLength(1);
    expect(state.diagnostics.at(-1)?.videoId).toBeNull();
    encounter(B, 'tabs.onActivated'); encounter(B, 'windows.onFocusChanged');
    expect(state.encounters.map(item => item.videoId)).toEqual([A, B]);
  });
  it('switching away and returning to the same URL does not duplicate it', () => {
    encounter(A); encounter(A, 'tabs.onActivated');
    expect(state.encounters).toHaveLength(1);
  });
  it('does not record while paused and reconciles a different ID on resume', () => {
    encounter(A); pause(state, at); encounter(B);
    expect(state.encounters).toHaveLength(1);
    expect(state.diagnostics.at(-1)?.videoId).toBeNull();
    resume(state, 7, at); encounter(B, 'resume');
    expect(state.encounters.map(item => item.videoId)).toEqual([A, B]);
  });
  it('resume on the unchanged ID retains the current occurrence', () => {
    encounter(A); pause(state, at); resume(state, 7, at); encounter(A, 'resume');
    expect(state.encounters).toHaveLength(1);
  });
  it('resume rejects a different tab unless the session was interrupted', () => {
    pause(state, at); expect(() => resume(state, 8, at)).toThrow('original capture tab');
    interrupt(state, at, 'restart'); resume(state, 8, at);
    expect(state.session?.tabId).toBe(8);
  });
  it('finish gates incoming events and retains selections', () => {
    encounter(A); includeCurrent(state, A, at); beginFinish(state, at); encounter(B);
    expect(state.session?.phase).toBe('finishing');
    completeFinish(state, at); encounter(B);
    expect(state.encounters).toHaveLength(1);
    expect(state.encounters[0]?.selected).toBe(true);
    expect(state.session?.phase).toBe('finished');
  });
  it('selection applies only to current occurrence and is idempotent', () => {
    encounter(A); encounter(B); encounter(A); includeCurrent(state, A, at); includeCurrent(state, A, at);
    expect(state.encounters.map(item => item.selected)).toEqual([false, false, true]);
    pause(state, at); expect(() => includeCurrent(state, A, at)).toThrow();
  });
  it('reload notification of unchanged video does not duplicate it', () => {
    encounter(A); encounter(A, 'webNavigation.onCommitted'); expect(state.encounters).toHaveLength(1);
  });
  it('clock changes do not affect ordinals', () => {
    encounter(A);
    observe(state, { tabId: 7, url: 'https://www.youtube.com/shorts/' + B,
      at: '2000-01-01T00:00:00.000Z', source: 'url-comparison', foreground: true }, 'clock');
    expect(state.encounters.map(item => item.ordinal)).toEqual([1, 2]);
  });
  it('stops at the encounter limit', () => {
    for (let i = 0; i < 1001; i++) encounter(i % 2 ? A : B);
    expect(state.encounters).toHaveLength(1000); expect(state.session?.phase).toBe('paused');
  });
  it('bounds diagnostic storage and counts discarded entries', () => {
    for (let i = 0; i < 5010; i++) encounter(A);
    expect(state.diagnostics).toHaveLength(5000);
    expect(state.droppedDiagnostics).toBe(11);
  });
  it('requires explicit reset before a new session', () => {
    expect(() => start(state, 7, at, 'other')).toThrow();
    expect(() => reset(state)).toThrow();
    beginFinish(state, at); completeFinish(state, at); reset(state);
    expect(state).toEqual(emptyState());
  });
  it('restart pauses without adding an encounter', () => {
    encounter(A); interrupt(state, at, 'browser-restarted');
    expect(state.session?.phase).toBe('paused'); expect(state.session?.tabId).toBeNull();
    expect(state.encounters).toHaveLength(1);
  });
  it('recovers a persisted finishing state', () => {
    encounter(A); beginFinish(state, at); interrupt(state, at, 'restart');
    expect(state.session?.phase).toBe('finished');
  });
});
