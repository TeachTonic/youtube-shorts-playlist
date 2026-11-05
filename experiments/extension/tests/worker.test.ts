import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Reply } from '../src/model';
class Signal<T extends unknown[]> {
  private listeners: ((...args: T) => unknown)[] = [];
  addListener = (listener: (...args: T) => unknown): void => { this.listeners.push(listener); };
  emit(...args: T): void { for (const listener of this.listeners) listener(...args); }
}
interface Navigation { frameId: number; tabId: number; url: string; timeStamp: number }
const origin = 'chrome-extension://test/';
const A = 'https://www.youtube.com/shorts/AAAAAAAAAAA';
const B = 'https://www.youtube.com/shorts/BBBBBBBBBBB';
let tab = { id: 7, windowId: 1, active: true, url: A };
let focused = true;
let closed = false;
let queryResult: typeof tab[];
let focusChanged: Signal<[number]>;
let committed: Signal<[Navigation]>;
let history: Signal<[Navigation]>;
let startup: Signal<[]>;
let messages: Signal<[unknown, { id: string; url: string }, (reply: Reply) => void]>;
function request(payload: unknown, page = 'popup.html'): Promise<Reply> {
  return new Promise(resolve => messages.emit(payload, { id: 'test', url: origin + page }, resolve));
}
function send(command: string): Promise<Reply> {
  return request(command === 'start' || command === 'resume' || command === 'include'
    ? { command, tabId: 7, windowId: 1 } : { command });
}
beforeEach(async () => {
  vi.resetModules(); tab = { id: 7, windowId: 1, active: true, url: A }; focused = true;
  committed = new Signal(); history = new Signal(); startup = new Signal(); messages = new Signal();
  closed = false; queryResult = [tab]; focusChanged = new Signal();
  vi.stubGlobal('chrome', {
    runtime: { id: 'test', getURL: (path: string) => origin + path, onMessage: messages, onStartup: startup },
    webNavigation: { onCommitted: committed, onHistoryStateUpdated: history },
    tabs: { get: vi.fn(async (id: number) => {
      if (closed) throw new Error('Tab closed');
      if (id !== 7) throw new Error('Unexpected access to unrelated tab'); return { ...tab };
    }), query: vi.fn(async () => queryResult), onActivated: new Signal(), onRemoved: new Signal() },
    windows: { get: async () => ({ focused }), WINDOW_ID_NONE: -1, onFocusChanged: focusChanged },
    action: { setBadgeText: async () => undefined },
  });
  await import('../src/worker');
  expect((await send('start')).ok).toBe(true);
});
afterEach(async () => {
  await send('get');
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('encounter-spike-v1');
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
});
describe('worker wiring with mocked Chrome APIs (not live YouTube)', () => {
  it('serializes commit/history notifications and selection through durable state', async () => {
    tab.url = B;
    committed.emit({ frameId: 0, tabId: 7, url: B, timeStamp: Date.now() });
    history.emit({ frameId: 0, tabId: 7, url: B, timeStamp: Date.now() });
    const reply = await send('include');
    expect(reply.state?.encounters.map(item => item.videoId)).toEqual(['AAAAAAAAAAA', 'BBBBBBBBBBB']);
    expect(reply.state?.encounters[1]?.selected).toBe(true);
    expect(reply.state?.diagnostics.some(item => item.reason === 'same-current-occurrence')).toBe(true);
  });
  it('never resolves unrelated tabs or ingests subframes', async () => {
    committed.emit({ frameId: 0, tabId: 999, url: 'https://example.com/private', timeStamp: Date.now() });
    committed.emit({ frameId: 1, tabId: 7, url: B, timeStamp: Date.now() });
    const reply = await send('get');
    expect(reply.state?.encounters).toHaveLength(1);
    expect(JSON.stringify(reply)).not.toContain('example.com');
    expect(chrome.tabs.get).not.toHaveBeenCalledWith(999);
  });
  it('does not create paused encounters through event listeners', async () => {
    await send('pause'); tab.url = B;
    history.emit({ frameId: 0, tabId: 7, url: B, timeStamp: Date.now() });
    expect((await send('get')).state?.encounters).toHaveLength(1);
    expect((await send('resume')).state?.encounters).toHaveLength(2);
  });
  it('polling is opt-in and gated by foreground focus', async () => {
    tab.url = B;
    expect((await send('poll')).state?.encounters).toHaveLength(1);
    await send('enablePolling'); focused = false;
    expect((await send('poll')).state?.encounters).toHaveLength(1);
    focused = true;
    const reply = await send('poll');
    expect(reply.state?.encounters[1]?.mechanism).toBe('url-comparison');
  });
  it('finish drains queued events and then rejects subsequent capture', async () => {
    tab.url = B;
    history.emit({ frameId: 0, tabId: 7, url: B, timeStamp: Date.now() });
    expect((await send('finish')).state?.encounters).toHaveLength(2);
    tab.url = A;
    committed.emit({ frameId: 0, tabId: 7, url: A, timeStamp: Date.now() });
    const reply = await send('get');
    expect(reply.state?.session?.phase).toBe('finished');
    expect(reply.state?.encounters).toHaveLength(2);
  });
  it('browser startup pauses and unbinds capture', async () => {
    startup.emit();
    const reply = await send('get');
    expect(reply.state?.session?.phase).toBe('paused');
    expect(reply.state?.session?.tabId).toBeNull();
  });
  it('does not accept commands from a page outside the extension', async () => {
    let replied = false;
    messages.emit({ command: 'pause' }, { id: 'test', url: 'https://www.youtube.com/' }, () => { replied = true; });
    expect((await send('get')).state?.session?.phase).toBe('capturing');
    expect(replied).toBe(false);
  });


  it('looks up the explicit target and never queries another current tab for Start', async () => {
    expect(chrome.tabs.get).toHaveBeenCalledWith(7);
    expect(chrome.tabs.query).not.toHaveBeenCalled();
    expect((await send('get')).state?.session?.tabId).toBe(7);
  });
  it('binds a valid unfocused target and captures it exactly once after focus restoration', async () => {
    await send('finish'); await send('reset');
    tab.url = 'https://www.youtube.com/shorts/TESTshort01'; focused = false;
    const reply = await send('start');
    expect(reply.ok).toBe(true);
    expect(reply.state?.session?.tabId).toBe(7);
    expect(reply.state?.encounters).toHaveLength(0);
    focused = true; focusChanged.emit(1); focusChanged.emit(1);
    const restored = await send('get');
    expect(restored.state?.encounters.map(item => item.videoId)).toEqual(['TESTshort01']);
  });
  it('does not retarget when another window becomes last focused', async () => {
    await send('finish'); await send('reset');
    queryResult = [{ id: 99, windowId: 2, active: true, url: B }]; focused = false;
    const reply = await send('start');
    expect(reply.state?.session?.tabId).toBe(7);
    expect(reply.state?.encounters).toHaveLength(0);
    focusChanged.emit(2);
    committed.emit({ frameId: 0, tabId: 99, url: B, timeStamp: Date.now() });
    expect((await send('get')).state?.encounters).toHaveLength(0);
    expect(chrome.tabs.query).not.toHaveBeenCalled();
    expect(chrome.tabs.get).not.toHaveBeenCalledWith(99);
    focused = true; focusChanged.emit(1);
    expect((await send('get')).state?.encounters.map(item => item.videoId)).toEqual(['AAAAAAAAAAA']);
  });
  it.each(['inactive', 'moved', 'closed', 'missing returned ID', 'invalid URL'] as const)('rejects %s target before session creation', async reason => {
    await send('finish'); await send('reset');
    if (reason === 'inactive') tab.active = false;
    if (reason === 'moved') tab.windowId = 2;
    if (reason === 'closed') closed = true;
    if (reason === 'missing returned ID') Object.assign(tab, { id: undefined });
    if (reason === 'invalid URL') tab.url = 'https://www.youtube.com/watch?v=TESTshort01';
    const reply = await send('start');
    expect(reply.ok).toBe(false);
    expect((await send('get')).state?.session).toBeNull();
    expect(chrome.tabs.query).not.toHaveBeenCalled();
  });
  it.each([
    { command: 'start' },
    { command: 'start', tabId: 7 },
    { command: 'start', tabId: -1, windowId: 1 },
    { command: 'start', tabId: 7.5, windowId: 1 },
    { command: 'start', tabId: '7', windowId: 1 },
    { command: 'start', tabId: 7, windowId: -1 },
    { command: 'start', tabId: 7, windowId: 1.5 },
    { command: 'start', tabId: 7, windowId: '1' },
    { command: 'start', tabId: 7, windowId: 1, url: A },
  ])('rejects malformed or extra Start fields: %j', async payload => {
    await send('finish'); await send('reset');
    vi.mocked(chrome.tabs.get).mockClear();
    expect((await request(payload)).ok).toBe(false);
    expect(chrome.tabs.get).not.toHaveBeenCalled();
    expect((await send('get')).state?.session).toBeNull();
  });
  it('diagnostic.html cannot initiate Start even with valid IDs', async () => {
    await send('finish'); await send('reset');
    vi.mocked(chrome.tabs.get).mockClear();
    expect((await request({ command: 'start', tabId: 7, windowId: 1 }, 'diagnostic.html')).ok).toBe(false);
    expect(chrome.tabs.get).not.toHaveBeenCalled();
    expect((await send('get')).state?.session).toBeNull();
  });
  it('rejects target IDs on non-targeted commands', async () => {
    expect((await request({ command: 'pause', tabId: 7, windowId: 1 })).ok).toBe(false);
    expect((await send('get')).state?.session?.phase).toBe('capturing');
  });
  it('includes only the current A occurrence without focus, ambient lookup or detection', async () => {
    for (const url of [B, A]) {
      tab.url = url;
      history.emit({ frameId: 0, tabId: 7, url, timeStamp: Date.now() });
      await send('get');
    }
    const before = (await send('get')).state!;
    focused = false;
    queryResult = [{ id: 99, windowId: 2, active: true, url: B }];
    const focusLookup = vi.spyOn(chrome.windows, 'get');
    vi.mocked(chrome.tabs.get).mockClear();
    const reply = await send('include');
    expect(reply.ok).toBe(true);
    expect(reply.state?.session).toEqual(before.session);
    expect(reply.state?.encounters).toEqual(before.encounters.map((item, index) =>
      ({ ...item, selected: index === 2 })));
    expect(reply.state?.diagnostics.slice(before.diagnostics.length).map(item => item.reason))
      .toEqual(['included-current']);
    expect(chrome.tabs.get).toHaveBeenCalledExactlyOnceWith(7);
    expect(chrome.tabs.query).not.toHaveBeenCalled();
    expect(focusLookup).not.toHaveBeenCalled();
    expect((await send('include')).state?.encounters).toEqual(reply.state?.encounters);
    tab.url = B;
    history.emit({ frameId: 0, tabId: 7, url: B, timeStamp: Date.now() });
    expect((await send('get')).state?.encounters).toEqual(reply.state?.encounters);
  });
  it.each(['inactive', 'moved', 'closed', 'missing ID', 'wrong ID', 'invalid URL', 'undetected Short'])(
    'rejects Include target %s without mutation', async reason => {
      const before = (await send('get')).state;
      if (reason === 'inactive') tab.active = false;
      if (reason === 'moved') tab.windowId = 2;
      if (reason === 'closed') closed = true;
      if (reason === 'missing ID') Object.assign(tab, { id: undefined });
      if (reason === 'wrong ID') tab.id = 99;
      if (reason === 'invalid URL') tab.url = 'https://www.youtube.com/watch?v=AAAAAAAAAAA';
      if (reason === 'undetected Short') tab.url = B;
      expect((await send('include')).ok).toBe(false);
      expect((await send('get')).state).toEqual(before);
      expect(chrome.tabs.query).not.toHaveBeenCalled();
    });
  it.each([
    { command: 'include' }, { command: 'include', tabId: 7 },
    { command: 'include', windowId: 1 },
    ...[-1, 0.5, '7', null, NaN, Infinity].map(tabId => ({ command: 'include', tabId, windowId: 1 })),
    ...[-1, 0.5, '1', null, NaN, Infinity].map(windowId => ({ command: 'include', tabId: 7, windowId })),
    { command: 'include', tabId: 7, windowId: 1, url: A },
    { command: 'include', tabId: 7, windowId: 1, encounterId: 'untrusted' },
  ])('rejects malformed Include payload %j before lookup', async payload => {
    const before = (await send('get')).state;
    vi.mocked(chrome.tabs.get).mockClear();
    expect((await request(payload)).ok).toBe(false);
    expect(chrome.tabs.get).not.toHaveBeenCalled();
    expect((await send('get')).state).toEqual(before);
  });
  it('rejects Include from diagnostics before lookup', async () => {
    const before = (await send('get')).state;
    vi.mocked(chrome.tabs.get).mockClear();
    expect((await request({ command: 'include', tabId: 7, windowId: 1 }, 'diagnostic.html')).error)
      .toBe('Include must originate from the toolbar popup.');
    expect(chrome.tabs.get).not.toHaveBeenCalled();
    expect((await send('get')).state).toEqual(before);
  });
  it.each(['missing session', 'paused', 'finished', 'unbound', 'different tab', 'missing occurrence',
    'wrong session', 'wrong video', 'duplicate ID', 'stale same-video occurrence'])(
    'atomically rejects Include with %s', async reason => {
      // This module uses fake-indexeddb/auto only; no Chrome profile or real database.
      const { updateState } = await import('../src/db');
      await updateState(value => {
        const session = value.session!;
        const item = value.encounters[0]!;
        if (reason === 'missing session') value.session = null;
        if (reason === 'paused') session.phase = 'paused';
        if (reason === 'finished') session.phase = 'finished';
        if (reason === 'unbound') session.tabId = null;
        if (reason === 'different tab') session.tabId = 99;
        if (reason === 'missing occurrence') session.currentEncounterId = 'missing';
        if (reason === 'wrong session') item.sessionId = 'other-session';
        if (reason === 'wrong video') item.videoId = 'BBBBBBBBBBB';
        if (reason === 'duplicate ID') value.encounters.push({ ...item, ordinal: 2 });
        if (reason === 'stale same-video occurrence') value.encounters.push({ ...item, id: 'later', ordinal: 2 });
      });
      const before = (await send('get')).state;
      expect((await send('include')).ok).toBe(false);
      expect((await send('get')).state).toEqual(before);
  });
  it('resumes the explicit unfocused target and detects once after focus restoration', async () => {
    await send('pause');
    const paused = (await send('get')).state;
    tab.url = B; focused = false;
    queryResult = [{ id: 99, windowId: 2, active: true, url: A }];
    vi.mocked(chrome.tabs.get).mockClear();
    vi.mocked(chrome.tabs.query).mockClear();

    const reply = await send('resume');
    expect(reply.ok).toBe(true);
    expect(reply.state?.session?.id).toBe(paused?.session?.id);
    expect(reply.state?.session?.tabId).toBe(7);
    expect(reply.state?.session?.phase).toBe('capturing');
    expect(reply.state?.encounters).toEqual(paused?.encounters);
    expect(reply.state?.diagnostics.at(-1)?.reason).toBe('capture-tab-not-foreground');
    expect(chrome.tabs.get).toHaveBeenCalledWith(7);
    expect(chrome.tabs.query).not.toHaveBeenCalled();

    focusChanged.emit(2);
    committed.emit({ frameId: 0, tabId: 99, url: A, timeStamp: Date.now() });
    expect((await send('get')).state?.encounters).toEqual(paused?.encounters);
    expect(chrome.tabs.get).not.toHaveBeenCalledWith(99);

    focused = true; focusChanged.emit(1); focusChanged.emit(1);
    const restored = await send('get');
    expect(restored.state?.encounters.map(item => item.videoId))
      .toEqual(['AAAAAAAAAAA', 'BBBBBBBBBBB']);
    expect(restored.state?.diagnostics.at(-1)?.reason).toBe('same-current-occurrence');
  });
  it('does not create a new occurrence when Resume returns to the same current Short', async () => {
    await send('pause');
    const paused = (await send('get')).state;
    focused = false;
    expect((await send('resume')).ok).toBe(true);
    expect((await send('get')).state?.encounters).toEqual(paused?.encounters);
    focused = true; focusChanged.emit(1); focusChanged.emit(1);
    const restored = await send('get');
    expect(restored.state?.encounters).toEqual(paused?.encounters);
    expect(restored.state?.session?.currentEncounterId).toBe(paused?.session?.currentEncounterId);
    expect(restored.state?.diagnostics.at(-1)?.reason).toBe('same-current-occurrence');
  });
  it.each([
    'inactive', 'moved', 'closed', 'missing returned ID',
    'mismatched returned ID', 'invalid URL',
  ] as const)('rejects a %s Resume target without changing the paused session', async reason => {
    await send('pause');
    const paused = (await send('get')).state;
    if (reason === 'inactive') tab.active = false;
    if (reason === 'moved') tab.windowId = 2;
    if (reason === 'closed') closed = true;
    if (reason === 'missing returned ID') Object.assign(tab, { id: undefined });
    if (reason === 'mismatched returned ID') {
      const mismatchedTab = { ...await chrome.tabs.get(7), id: 99 };
      vi.mocked(chrome.tabs.get).mockClear();
      vi.mocked(chrome.tabs.get as (tabId: number) => Promise<chrome.tabs.Tab>).mockResolvedValueOnce(mismatchedTab);
    }
    if (reason === 'invalid URL') tab.url = 'https://www.youtube.com/watch?v=AAAAAAAAAAA';
    const reply = await send('resume');
    expect(reply.ok).toBe(false);
    if (reason === 'mismatched returned ID') {
      expect(chrome.tabs.get).toHaveBeenCalledExactlyOnceWith(7);
      expect(reply.error).toBe('The selected tab is unavailable. Reopen the popup.');
    }
    expect((await send('get')).state).toEqual(paused);
    expect(chrome.tabs.query).not.toHaveBeenCalled();
  });
  it.each([
    { command: 'resume' },
    { command: 'resume', tabId: 7 },
    { command: 'resume', windowId: 1 },
    { command: 'resume', tabId: -1, windowId: 1 },
    { command: 'resume', tabId: 7.5, windowId: 1 },
    { command: 'resume', tabId: '7', windowId: 1 },
    { command: 'resume', tabId: 7, windowId: -1 },
    { command: 'resume', tabId: 7, windowId: 1.5 },
    { command: 'resume', tabId: 7, windowId: '1' },
    { command: 'resume', tabId: 7, windowId: 1, url: A },
  ])('rejects malformed or extra Resume fields: %j', async payload => {
    await send('pause');
    const paused = (await send('get')).state;
    vi.mocked(chrome.tabs.get).mockClear();
    expect((await request(payload)).ok).toBe(false);
    expect(chrome.tabs.get).not.toHaveBeenCalled();
    expect((await send('get')).state).toEqual(paused);
  });
  it('rejects Resume from diagnostic.html without resolving a tab', async () => {
    await send('pause');
    const paused = (await send('get')).state;
    vi.mocked(chrome.tabs.get).mockClear();
    const reply = await request({ command: 'resume', tabId: 7, windowId: 1 }, 'diagnostic.html');
    expect(reply.error).toBe('Resume must originate from the toolbar popup.');
    expect(chrome.tabs.get).not.toHaveBeenCalled();
    expect((await send('get')).state).toEqual(paused);
  });
  it('preserves the reducer rejection of a different capture tab', async () => {
    await send('pause');
    const paused = (await send('get')).state;
    const otherTab = { ...await chrome.tabs.get(7), id: 99 };
    vi.mocked(chrome.tabs.get as (tabId: number) => Promise<chrome.tabs.Tab>).mockResolvedValueOnce(otherTab);
    const reply = await request({ command: 'resume', tabId: 99, windowId: 1 });
    expect(reply.error).toBe('Return to the original capture tab.');
    expect((await send('get')).state).toEqual(paused);
    expect(chrome.tabs.query).not.toHaveBeenCalled();
  });
  it('preserves the reducer requirement for a paused session', async () => {
    const before = (await send('get')).state;
    expect((await send('resume')).error).toBe('Session is not paused.');
    expect((await send('get')).state).toEqual(before);
  });
  it('preserves explicit Resume of an interrupted unbound session', async () => {
    const before = (await send('get')).state;
    startup.emit();
    expect((await send('get')).state?.session?.tabId).toBeNull();
    focused = false;
    const reply = await send('resume');
    expect(reply.ok).toBe(true);
    expect(reply.state?.session?.id).toBe(before?.session?.id);
    expect(reply.state?.session?.tabId).toBe(7);
    expect(reply.state?.session?.phase).toBe('capturing');
    expect(reply.state?.encounters).toEqual(before?.encounters);
  });
});
