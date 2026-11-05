import { PersistenceError, readState, updateState } from './db';
import { type Command, type Reply, type Source } from './model';
import { beginFinish, completeFinish, includeCurrent, interrupt, note, observe, pause, reset, resume, start } from './state';
import { parseShortUrl } from './url';

let chain: Promise<unknown> = Promise.resolve();
let storageFault: string | null = null;
const now = (): string => new Date().toISOString();
function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const result = chain.then(work);
  chain = result.catch(() => undefined);
  return result;
}
async function save(change: Parameters<typeof updateState>[0]): ReturnType<typeof updateState> {
  if (storageFault) throw new Error(storageFault);
  try { return await updateState(change); }
  catch (error) {
    // Business-rule exceptions abort transactions too; only storage failures latch capture off.
    if (error instanceof PersistenceError || error instanceof DOMException) {
      storageFault = 'Local storage failed; capture stopped. Export what remains and reload the extension.';
      await chrome.action.setBadgeText({ text: 'ERR' });
    }
    throw error;
  }
}
interface StartTarget { tabId: number; windowId: number }
async function foreground(tab: chrome.tabs.Tab): Promise<boolean> {
  const result = tab.active && (await chrome.windows.get(tab.windowId)).focused;
  return result;
}
async function detect(tabId: number, url: string, source: Source, at = now()): Promise<void> {
  const state = await readState();
  if (state.session?.tabId !== tabId || !['capturing', 'paused'].includes(state.session.phase)) return;
  const tab = await chrome.tabs.get(tabId);
  const isForeground = await foreground(tab);
  await save(value => { observe(value, { tabId, url, source, at, foreground: isForeground }, crypto.randomUUID()); });
}
async function reconcile(tabId: number, source: Source): Promise<void> {
  const state = await readState();
  if (state.session?.tabId !== tabId) return;
  const tab = await chrome.tabs.get(tabId);
  await detect(tabId, tab.url ?? '', source);
}
function background(work: () => Promise<void>): void {
  void enqueue(work).catch(error => {
    // Do not print URLs or arbitrary browser errors.
    if (error instanceof PersistenceError || error instanceof DOMException) storageFault = 'Local persistence failed. Capture is stopped.';
    void chrome.action.setBadgeText({ text: 'ERR' });
  });
}
async function startCapture(target: StartTarget): Promise<void> {
  let tab: chrome.tabs.Tab;
  try { tab = await chrome.tabs.get(target.tabId); }
  catch { throw new Error('The selected tab is closed or unavailable. Reopen the popup.'); }
  if (tab.id !== target.tabId) throw new Error('The selected tab is unavailable. Reopen the popup.');
  if (tab.active !== true) throw new Error('The selected tab is no longer active. Reopen the popup.');
  if (tab.windowId !== target.windowId) throw new Error('The selected tab moved to another window. Reopen the popup.');
  const parsed = parseShortUrl(tab.url ?? '');
  if (!parsed.ok) throw new Error('Open a valid Short in the selected tab.');
  await save(value => start(value, target.tabId, now(), crypto.randomUUID()));
  // Start authorizes this target. Detection still requires active + focused.
  await detect(target.tabId, tab.url ?? '', 'start', now());
}
async function command(kind: Command, target?: StartTarget): Promise<Reply> {
  if (kind === 'get') return storageFault ? { ok: false, state: await readState(), error: storageFault } : { ok: true, state: await readState() };
  if (kind === 'pause') await save(value => pause(value, now()));
  if (kind === 'finish') {
    await save(value => beginFinish(value, now()));
    await save(value => completeFinish(value, now()));
  }
  if (kind === 'reset') { await save(reset); await chrome.action.setBadgeText({ text: '' }); }
  if (kind === 'enablePolling' || kind === 'disablePolling')
    await save(value => { value.pollingEnabled = kind === 'enablePolling'; note(value, 'control', kind, now()); });
  if (kind === 'start') {
    if (!target) throw new Error('Start requires a valid tab ID and window ID.');
    await startCapture(target);
  }
  if (kind === 'resume') {
    if (!target) throw new Error('Resume requires a valid tab ID and window ID.');
    let tab: chrome.tabs.Tab;
    try { tab = await chrome.tabs.get(target.tabId); }
    catch { throw new Error('The selected tab is closed or unavailable. Reopen the popup.'); }
    if (tab.id !== target.tabId) throw new Error('The selected tab is unavailable. Reopen the popup.');
    if (tab.active !== true) throw new Error('The selected tab is no longer active. Reopen the popup.');
    if (tab.windowId !== target.windowId) throw new Error('The selected tab moved to another window. Reopen the popup.');
    if (!parseShortUrl(tab.url ?? '').ok) throw new Error('Open a valid Short in the selected tab.');
    await save(value => resume(value, target.tabId, now()));
    // Resume authorizes this target. Detection still requires active + focused.
    await detect(target.tabId, tab.url ?? '', 'resume');
  }
  if (kind === 'include') {
    if (!target) throw new Error('Include requires a valid tab ID and window ID.');
    let tab: chrome.tabs.Tab;
    try { tab = await chrome.tabs.get(target.tabId); }
    catch { throw new Error('The selected tab is closed or unavailable. Reopen the popup.'); }
    if (tab.id !== target.tabId) throw new Error('The selected tab is unavailable. Reopen the popup.');
    if (tab.active !== true) throw new Error('The selected tab is no longer active. Reopen the popup.');
    if (tab.windowId !== target.windowId) throw new Error('The selected tab moved to another window. Reopen the popup.');
    const parsed = parseShortUrl(tab.url ?? '');
    if (!parsed.ok) throw new Error('Open a valid Short in the selected tab.');
    // Explicit selection never detects an encounter or depends on popup window focus.
    // Check binding and occurrence consistency within the same transaction as selection.
    await save(value => {
      if (value.session?.tabId !== target.tabId) throw new Error('Return to the capture tab.');
      includeCurrent(value, parsed.videoId, now());
    });
  }
  if (kind === 'poll') {
    const state = await readState();
    if (state.pollingEnabled && state.session?.phase === 'capturing' && state.session.tabId !== null) {
      const tab = await chrome.tabs.get(state.session.tabId);
      if (await foreground(tab)) await reconcile(state.session.tabId, 'url-comparison');
    }
  }
  return { ok: true, state: await readState() };
}
const commands: readonly string[] = ['get','start','pause','resume','include','finish','reset','poll','enablePolling','disablePolling'];
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (reply: Reply) => void) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  if (typeof message !== 'object' || message === null || !('command' in message) ||
      typeof message.command !== 'string' || !commands.includes(message.command)) return false;
  const kind = message.command as Command;
  let target: StartTarget | undefined;
  if (kind === 'start' || kind === 'resume' || kind === 'include') {
    if (sender.url !== chrome.runtime.getURL('popup.html')) {
      sendResponse({ ok: false, error: kind === 'start'
        ? 'Start Capture must originate from the toolbar popup.'
        : kind === 'resume' ? 'Resume must originate from the toolbar popup.'
        : 'Include must originate from the toolbar popup.' });
      return false;
    }
    if (!('tabId' in message) || !('windowId' in message) ||
        typeof message.tabId !== 'number' || !Number.isSafeInteger(message.tabId) || message.tabId < 0 ||
        typeof message.windowId !== 'number' || !Number.isSafeInteger(message.windowId) || message.windowId < 0 ||
        Object.keys(message).some(key => !['command', 'tabId', 'windowId'].includes(key))) {
      sendResponse({ ok: false, error: kind === 'start'
        ? 'Start requires only a valid tab ID and window ID.'
        : kind === 'resume' ? 'Resume requires only a valid tab ID and window ID.'
        : 'Include requires only a valid tab ID and window ID.' });
      return false;
    }
    target = { tabId: message.tabId, windowId: message.windowId };
  } else if ('tabId' in message || 'windowId' in message) {
    sendResponse({ ok: false, error: 'Tab and window IDs are accepted only for Start, Resume and Include.' });
    return false;
  }
  void enqueue(() => command(kind, target)).then(sendResponse).catch(error =>
    sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Operation failed.' }));
  return true;
});
chrome.webNavigation.onCommitted.addListener(event => {
  if (event.frameId === 0) background(() => detect(event.tabId, event.url, 'webNavigation.onCommitted', new Date(event.timeStamp).toISOString()));
});
chrome.webNavigation.onHistoryStateUpdated.addListener(event => {
  if (event.frameId === 0) background(() => detect(event.tabId, event.url, 'webNavigation.onHistoryStateUpdated', new Date(event.timeStamp).toISOString()));
});
chrome.tabs.onActivated.addListener(event => background(() => reconcile(event.tabId, 'tabs.onActivated')));
chrome.windows.onFocusChanged.addListener(windowId => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  background(async () => {
    const state = await readState();
    if (state.session?.tabId !== null && state.session?.tabId !== undefined)
      await reconcile(state.session.tabId, 'windows.onFocusChanged');
  });
});
chrome.tabs.onRemoved.addListener(tabId => background(async () => {
  if ((await readState()).session?.tabId === tabId) await save(value => interrupt(value, now(), 'capture-tab-closed-resume-explicitly'));
}));
chrome.runtime.onStartup.addListener(() => background(async () => {
  await save(value => interrupt(value, now(), 'browser-restarted-resume-explicitly'));
}));
// Complete a durable Finish interrupted by worker termination. Never recreate an encounter here.
background(async () => {
  if ((await readState()).session?.phase === 'finishing') await save(value => completeFinish(value, now()));
});
