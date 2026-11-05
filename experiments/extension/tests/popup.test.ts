// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyState, type Reply, type State } from '../src/model';
interface TabFixture { id?: number; windowId: number; active: boolean; url?: string }
let tabs: TabFixture[];
let startResponse: () => Promise<Reply>;
let resumeResponse: () => Promise<Reply>;
let includeResponse: () => Promise<Reply>;
let viewState: State;
const flush = async (): Promise<void> => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
const startButton = (): HTMLButtonElement => {
  const button = document.querySelector<HTMLButtonElement>('[data-command="start"]');
  if (!button) throw new Error('Missing Start button');
  return button;
};
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers();
  document.body.innerHTML = readFileSync(resolve(process.cwd(), 'experiments/extension/popup.html'), 'utf8')
    .replace('<script type="module" src="/src/view.ts"></script>', '');
  tabs = [{ id: 7, windowId: 1, active: true, url: 'https://www.youtube.com/shorts/TESTshort01' }];
  startResponse = async () => ({ ok: true });
  resumeResponse = async () => ({ ok: true });
  includeResponse = async () => ({ ok: true });
  viewState = emptyState();
  vi.spyOn(window, 'close').mockImplementation(() => undefined);
  vi.stubGlobal('chrome', {
    tabs: { query: vi.fn(async () => tabs) },
    runtime: { sendMessage: vi.fn(async (message: { command: string }): Promise<Reply> =>
      message.command === 'start' ? startResponse() :
      message.command === 'resume' ? resumeResponse() :
      message.command === 'include' ? includeResponse() : { ok: true, state: viewState }) },
  });
  await import('../src/view');
  await flush();
});
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  document.body.replaceChildren();
});
describe('popup-bound Start', () => {
  it('queries on Start and sends IDs without a URL', async () => {
    expect(chrome.tabs.query).not.toHaveBeenCalled();
    startButton().click(); await flush();
    expect(chrome.tabs.query).toHaveBeenCalledExactlyOnceWith({ active: true, currentWindow: true });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ command: 'start', tabId: 7, windowId: 1 });
    const startMessage = vi.mocked(chrome.runtime.sendMessage).mock.calls.find(call => {
      const message = call[0] as { command?: string };
      return message.command === 'start';
    })?.[0];
    expect(startMessage).toEqual({ command: 'start', tabId: 7, windowId: 1 });
    expect(window.close).toHaveBeenCalledOnce();
  });
  it('waits for successful acknowledgement before closing', async () => {
    let acknowledge: (reply: Reply) => void = () => { throw new Error('No pending reply'); };
    startResponse = () => new Promise(resolveReply => { acknowledge = resolveReply; });
    startButton().click(); await flush();
    expect(window.close).not.toHaveBeenCalled();
    acknowledge({ ok: true }); await flush();
    expect(window.close).toHaveBeenCalledOnce();
  });
  it('keeps the popup open and displays worker rejection', async () => {
    startResponse = async () => ({ ok: false, error: 'The selected tab moved.' });
    startButton().click(); await flush();
    expect(window.close).not.toHaveBeenCalled();
    expect(document.getElementById('error')?.textContent).toBe('The selected tab moved.');
  });
  it('keeps the popup open on transport failure', async () => {
    startResponse = async () => { throw new Error('Worker unavailable'); };
    startButton().click(); await flush();
    expect(window.close).not.toHaveBeenCalled();
    expect(document.getElementById('error')?.textContent).toBe('Worker unavailable');
  });
  it.each(([
    [],
    [{ id: 7, windowId: 1, active: true }, { id: 8, windowId: 1, active: true }],
    [{ windowId: 1, active: true }],
    [{ id: -1, windowId: 1, active: true }],
    [{ id: 7, windowId: -1, active: true }],
    [{ id: 7, windowId: 1, active: false }],
  ] satisfies TabFixture[][]).map(fixture => ({ fixture })))('does not send Start for invalid active-tab lookup $fixture', async ({ fixture }) => {
    tabs = fixture;
    startButton().click(); await flush();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ command: 'start' }));
    expect(window.close).not.toHaveBeenCalled();
  });
});

describe('popup-bound Include', () => {
  const includeButton = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[data-command="include"]')!;
  beforeEach(async () => {
    viewState.session = { id: 'session-1', tabId: 7, phase: 'capturing', startedAt: 'now',
      finishedAt: null, currentVideoId: 'AAAAAAAAAAA', currentEncounterId: 'e-1' };
    await vi.advanceTimersByTimeAsync(500); await flush();
    expect(includeButton().disabled).toBe(false);
  });
  it('sends exact IDs, waits for acknowledgement and renders selection without closing', async () => {
    let acknowledge: (reply: Reply) => void = () => { throw new Error('No pending reply'); };
    includeResponse = () => new Promise(resolve => { acknowledge = resolve; });
    includeButton().click(); await flush();
    expect(chrome.tabs.query).toHaveBeenCalledExactlyOnceWith({ active: true, currentWindow: true });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ command: 'include', tabId: 7, windowId: 1 });
    expect(includeButton().disabled).toBe(true);
    const selectedState = structuredClone(viewState);
    selectedState.encounters = [{ id: 'e-1', sessionId: 'session-1', ordinal: 1, provider: 'YouTube',
      videoId: 'AAAAAAAAAAA', detectedUrl: 'https://www.youtube.com/shorts/AAAAAAAAAAA',
      detectedAt: 'now', mechanism: 'start', selected: true }];
    acknowledge({ ok: true, state: selectedState }); await flush();
    expect(document.getElementById('counts')?.textContent).toBe('1 / 1');
    expect(includeButton().disabled).toBe(false);
    expect(window.close).not.toHaveBeenCalled();
  });
  it.each(['rejection', 'transport'])('displays Include %s without closing', async failure => {
    includeResponse = async () => {
      if (failure === 'transport') throw new Error('Worker unavailable');
      return { ok: false, error: 'Return to the capture tab.' };
    };
    includeButton().click(); await flush();
    expect(document.getElementById('error')?.textContent)
      .toBe(failure === 'transport' ? 'Worker unavailable' : 'Return to the capture tab.');
    expect(window.close).not.toHaveBeenCalled();
  });
  it.each(([
    [], [{ id: 7, windowId: 1, active: true }, { id: 8, windowId: 1, active: true }],
    [{ windowId: 1, active: true }], [{ id: -1, windowId: 1, active: true }],
    [{ id: 0.5, windowId: 1, active: true }], [{ id: 7, windowId: -1, active: true }],
    [{ id: 7, windowId: 0.5, active: true }], [{ id: 7, windowId: 1, active: false }],
  ] satisfies TabFixture[][]).map(fixture => ({ fixture })))('rejects invalid Include lookup $fixture', async ({ fixture }) => {
    tabs = fixture;
    includeButton().click(); await flush();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ command: 'include' }));
    expect(window.close).not.toHaveBeenCalled();
  });
  it('does not send Include when tab lookup fails', async () => {
    vi.mocked(chrome.tabs.query).mockRejectedValueOnce(new Error('Tab lookup failed'));
    includeButton().click(); await flush();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ command: 'include' }));
    expect(document.getElementById('error')?.textContent).toBe('Tab lookup failed');
  });
});

describe('popup-bound Resume', () => {
  const resumeButton = (): HTMLButtonElement => {
    const button = document.querySelector<HTMLButtonElement>('[data-command="resume"]');
    if (!button) throw new Error('Missing Resume button');
    return button;
  };
  beforeEach(async () => {
    viewState.session = {
      id: 'session-1', tabId: 7, phase: 'paused',
      startedAt: '2026-01-01T00:00:00.000Z', finishedAt: null,
      currentVideoId: null, currentEncounterId: null,
    };
    await vi.advanceTimersByTimeAsync(500);
    await flush();
    expect(resumeButton().disabled).toBe(false);
  });
  it('sends only the active tab/window IDs and closes after successful acknowledgement', async () => {
    let acknowledge: (reply: Reply) => void = () => { throw new Error('No pending reply'); };
    resumeResponse = () => new Promise(resolveReply => { acknowledge = resolveReply; });
    expect(chrome.tabs.query).not.toHaveBeenCalled();
    resumeButton().click(); await flush();
    expect(chrome.tabs.query).toHaveBeenCalledExactlyOnceWith({ active: true, currentWindow: true });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      command: 'resume', tabId: 7, windowId: 1,
    });
    expect(window.close).not.toHaveBeenCalled();
    acknowledge({ ok: true }); await flush();
    expect(window.close).toHaveBeenCalledOnce();
  });
  it('keeps the popup open and displays Resume rejection', async () => {
    resumeResponse = async () => ({ ok: false, error: 'Return to the original capture tab.' });
    resumeButton().click(); await flush();
    expect(window.close).not.toHaveBeenCalled();
    expect(document.getElementById('error')?.textContent).toBe('Return to the original capture tab.');
  });
  it('keeps the popup open on Resume transport failure', async () => {
    resumeResponse = async () => { throw new Error('Worker unavailable'); };
    resumeButton().click(); await flush();
    expect(window.close).not.toHaveBeenCalled();
    expect(document.getElementById('error')?.textContent).toBe('Worker unavailable');
  });
  it.each(([
    [],
    [{ id: 7, windowId: 1, active: true }, { id: 8, windowId: 1, active: true }],
    [{ windowId: 1, active: true }],
    [{ id: -1, windowId: 1, active: true }],
    [{ id: 7, windowId: -1, active: true }],
    [{ id: 7, windowId: 1, active: false }],
  ] satisfies TabFixture[][]).map(fixture => ({ fixture })))('does not send Resume for invalid active-tab lookup $fixture', async ({ fixture }) => {
    tabs = fixture;
    resumeButton().click(); await flush();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ command: 'resume' }));
    expect(window.close).not.toHaveBeenCalled();
  });
});
