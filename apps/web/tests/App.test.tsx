import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { STORAGE_KEY } from '../src/storage';
import { MAX_IMPORT_BYTES } from '../src/import-session';
import type { Draft } from '../src/draft';
import { A, B, draft, session } from './fixtures';

let host: HTMLDivElement;
let root: Root;
let mounted = false;
const pendingReads = new Set<() => void>();
function deferredRead() {
  let resolve!: (text: string) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  const settle = () => resolve('');
  pendingReads.add(settle);
  return {
    promise,
    resolve: (text: string) => { pendingReads.delete(settle); resolve(text); },
    reject: (reason: unknown) => { pendingReads.delete(settle); reject(reason); },
  };
}
function element<T extends Element>(selector: string): T {
  const found = host.querySelector<T>(selector);
  if (!found) throw new Error('Missing element: ' + selector);
  return found;
}
function saved(): Draft { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Draft; }
async function mount(strict = false) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  mounted = true;
  await act(async () => { root.render(strict ? <StrictMode><App /></StrictMode> : <App />); });
}
async function unmount() {
  if (mounted) {
    await act(async () => { root.unmount(); });
    mounted = false;
    host.remove();
  }
}
async function click(selector: string) {
  await act(async () => { element<HTMLElement>(selector).click(); });
}
async function choose(text: string, size?: number) {
  const file = new File([text], 'session.json', { type: 'application/json' });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  await chooseFile(file);
}
async function chooseFile(file: File) {
  const input = element<HTMLInputElement>('input[type=file]');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}
function controlledFile(read: ReturnType<typeof deferredRead>) {
  const file = new File(['placeholder'], 'session.json', { type: 'application/json' });
  const text = vi.spyOn(file, 'text').mockReturnValue(read.promise);
  return { file, text };
}
function expectLoading(pending: boolean) {
  expect(element<HTMLInputElement>('input[type=file]').disabled).toBe(pending);
  expect(element<HTMLFieldSetElement>('fieldset.editor').disabled).toBe(pending);
  expect(host.textContent?.includes('Reading session…')).toBe(pending);
}
async function edit(selector: string, value: string) {
  const input = element<HTMLInputElement | HTMLTextAreaElement>(selector);
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
  await act(async () => { input.dispatchEvent(new Event('input', { bubbles: true })); });
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await mount();
});
afterEach(async () => {
  await unmount();
  // Settle even ignored reads or reads left pending by a failed assertion.
  await act(async () => { pendingReads.forEach(settle => settle()); pendingReads.clear(); });
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('import read lifecycle', () => {
  const fallback = 'Could not read or import this file. Your draft has not changed. Try selecting the file again or choose another finished-session JSON export.';
  it.each([
    ['Error', new Error('File access was denied. Please choose another file.'), 'File access was denied. Please choose another file.'],
    ['non-Error', { reason: 'unreadable' }, fallback],
    ['empty Error', new Error(''), fallback],
    ['whitespace Error', new Error(' \t\n'), fallback],
  ])('preserves the edited draft after %s rejection and allows retry', async (_label, reason, message) => {
    await choose(JSON.stringify(session()));
    await edit('#title', 'Keep this title');
    await click('input[aria-label="Include occurrence 2: ' + B + '"]');
    await click('button[aria-label="Move selected occurrence 2 up"]');
    const before = localStorage.getItem(STORAGE_KEY);
    const rows = element('[aria-label="Encounter occurrences"]').innerHTML;
    const order = saved().playlistOrder;
    const sequence = element('[aria-label="Selected sequence"]').innerHTML;
    const write = vi.spyOn(window.localStorage, 'setItem');
    const read = deferredRead(), file = controlledFile(read);
    await chooseFile(file.file);
    expectLoading(true);
    await act(async () => { read.reject(reason); });
    expectLoading(false);
    expect(element('[role=alert]').textContent).toBe(message);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(saved().playlistOrder).toEqual(order);
    expect(element('[aria-label="Encounter occurrences"]').innerHTML).toBe(rows);
    expect(element('[aria-label="Selected sequence"]').innerHTML).toBe(sequence);
    expect(element<HTMLInputElement>('#title').value).toBe('Keep this title');
    expect(window.confirm).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    const retry = deferredRead(), retryFile = controlledFile(retry);
    await chooseFile(retryFile.file);
    expectLoading(true);
    await act(async () => { retry.resolve(JSON.stringify(session())); });
    expectLoading(false);
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(saved().title).toBe('');
    expect(host.querySelector('[role=alert]')).toBeNull();
  });

  it.each(['resolve', 'reject'])('does not prompt or persist when an unmounted read later %ss', async outcome => {
    await choose(JSON.stringify(session()));
    const before = localStorage.getItem(STORAGE_KEY);
    const write = vi.spyOn(window.localStorage, 'setItem');
    const read = deferredRead();
    await chooseFile(controlledFile(read).file);
    await unmount();
    await act(async () => {
      if (outcome === 'resolve') read.resolve(JSON.stringify(session()));
      else read.reject(new Error('Late read failure'));
    });
    expect(window.confirm).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it('cannot overwrite a new instance draft when the old initially empty editor read completes', async () => {
    const oldRead = deferredRead();
    await chooseFile(controlledFile(oldRead).file);
    await unmount();
    await mount();
    const different = session();
    different.state.encounters = [{ ...different.state.encounters[0]!, videoId: B }];
    await choose(JSON.stringify(different));
    await edit('#title', 'New instance draft');
    const before = localStorage.getItem(STORAGE_KEY);
    const write = vi.spyOn(window.localStorage, 'setItem');
    vi.mocked(window.confirm).mockClear();
    await act(async () => { oldRead.resolve(JSON.stringify(session())); });
    expect(write).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(element<HTMLInputElement>('#title').value).toBe('New instance draft');
    expect(host.querySelectorAll('[aria-label="Encounter occurrences"] li')).toHaveLength(1);
  });

  it('ignores a second selection while pending rather than reading or queuing it', async () => {
    await choose(JSON.stringify(session()));
    const write = vi.spyOn(window.localStorage, 'setItem');
    const first = deferredRead(), second = deferredRead();
    const firstFile = controlledFile(first), secondFile = controlledFile(second);
    await chooseFile(firstFile.file);
    expectLoading(true);
    // Dispatch deliberately despite the disabled input to exercise the ref guard itself.
    await chooseFile(secondFile.file);
    expect(firstFile.text).toHaveBeenCalledTimes(1);
    expect(secondFile.text).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    await act(async () => { first.resolve(JSON.stringify(session())); });
    expectLoading(false);
    const savedFirst = localStorage.getItem(STORAGE_KEY);
    await act(async () => { second.resolve('{invalid and ignored'); });
    expect(secondFile.text).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(savedFirst);
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role=alert]')).toBeNull();
    await choose(JSON.stringify(session()));
    expect(window.confirm).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('disables retry saving while pending and restores controls after cancelled confirmation', async () => {
    await choose(JSON.stringify(session()));
    const before = localStorage.getItem(STORAGE_KEY);
    const write = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('Full'); });
    await edit('#title', 'Unsaved edit');
    const retry = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Retry saving')!;
    expect(retry).toBeDefined();
    expect(retry.disabled).toBe(false);
    write.mockClear();
    const read = deferredRead();
    await chooseFile(controlledFile(read).file);
    expectLoading(true);
    expect(retry.disabled).toBe(true);
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await act(async () => { read.resolve(JSON.stringify(session())); });
    expectLoading(false);
    expect(retry.disabled).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(element<HTMLInputElement>('#title').value).toBe('Unsaved edit');
  });

  it('rejects an empty file with a useful JSON error and restores controls', async () => {
    await choose(JSON.stringify(session()));
    const before = localStorage.getItem(STORAGE_KEY);
    const write = vi.spyOn(window.localStorage, 'setItem');
    await choose('');
    expectLoading(false);
    expect(element('[role=alert]').textContent).toBe('This is not valid JSON. Choose a finished Phase 0 session export.');
    expect(window.confirm).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it('supports normal imports in StrictMode but invalidates reads on unmount', async () => {
    await unmount();
    await mount(true);
    const first = deferredRead();
    await chooseFile(controlledFile(first).file);
    await act(async () => { first.resolve(JSON.stringify(session())); });
    expectLoading(false);
    expect(saved().items).toHaveLength(3);
    const before = localStorage.getItem(STORAGE_KEY);
    const write = vi.spyOn(window.localStorage, 'setItem');
    const late = deferredRead();
    await chooseFile(controlledFile(late).file);
    await unmount();
    await act(async () => { late.resolve(JSON.stringify(session())); });
    expect(window.confirm).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });
});

describe('local editor interactions', () => {
  it('imports separate repeated occurrences, edits the sequence and restores it after remount', async () => {
    await choose(JSON.stringify(session()));
    expect(saved().items.map(item => item.videoId)).toEqual([A, B, A]);
    expect(new Set(saved().items.map(item => item.id)).size).toBe(3);
    const originalIds = saved().items.map(item => item.id);
    const originalRows = Array.from(host.querySelectorAll('[aria-label="Encounter occurrences"] .video-info')).map(node => node.textContent);
    await click('input[aria-label="Include occurrence 2: ' + B + '"]');
    await click('button[aria-label="Move selected occurrence 2 up"]');
    expect(saved().items.map(item => item.id)).toEqual(originalIds);
    expect(saved().playlistOrder).toEqual([originalIds[1], originalIds[0], originalIds[2]]);
    expect(Array.from(host.querySelectorAll('[aria-label="Encounter occurrences"] .video-info')).map(node => node.textContent)).toEqual(originalRows);
    expect(Array.from(host.querySelectorAll('[aria-label="Selected sequence"] strong')).map(node => node.textContent)).toEqual([B, A, A]);
    await click('button[aria-label="Remove occurrence 1: ' + A + '"]');
    expect(saved().items.map(item => item.id)).toEqual([originalIds[1], originalIds[2]]);
    await edit('#title', 'Worth revisiting');
    await edit('#description', 'Two separate moments.');
    expect(saved().title).toBe('Worth revisiting');
    expect(saved().description).toBe('Two separate moments.');
    const before = localStorage.getItem(STORAGE_KEY);
    await act(async () => { root.unmount(); }); host.remove(); await mount();
    expect(element<HTMLInputElement>('#title').value).toBe('Worth revisiting');
    expect(element<HTMLTextAreaElement>('#description').value).toBe('Two separate moments.');
    expect(host.querySelectorAll('[aria-label="Selected sequence"] li')).toHaveLength(2);
    expect(Array.from(host.querySelectorAll('[aria-label="Selected sequence"] strong')).map(node => node.textContent)).toEqual([B, A]);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it('restores both different orders on remount and exclusion keeps all encounter rows', async () => {
    await choose(JSON.stringify(session()));
    const original = saved();
    await click('input[aria-label="Include occurrence 2: ' + B + '"]');
    await click('button[aria-label="Move selected occurrence 2 up"]');
    const raw = localStorage.getItem(STORAGE_KEY);
    await act(async () => root.unmount()); host.remove(); await mount();
    expect(saved().items.map(item => item.id)).toEqual(original.items.map(item => item.id));
    expect(Array.from(host.querySelectorAll('[aria-label="Selected sequence"] strong')).map(node => node.textContent)).toEqual([B, A, A]);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
    await click('input[aria-label="Include occurrence 2: ' + B + '"]');
    expect(host.querySelectorAll('[aria-label="Encounter occurrences"] li')).toHaveLength(3);
    expect(saved().items.map(item => item.id)).toEqual(original.items.map(item => item.id));
    expect(host.querySelectorAll('[aria-label="Selected sequence"] li')).toHaveLength(2);
    await click('input[aria-label="Include occurrence 2: ' + B + '"]');
    expect(Array.from(host.querySelectorAll('[aria-label="Selected sequence"] strong')).map(node => node.textContent)).toEqual([B, A, A]);
  });

  it('preserves the draft on invalid input without prompting to replace', async () => {
    await choose(JSON.stringify(session()));
    const before = localStorage.getItem(STORAGE_KEY);
    await choose('{broken');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(element('[role=alert]').textContent).toContain('JSON');
    expect(host.querySelectorAll('[aria-label="Encounter occurrences"] li')).toHaveLength(3);
  });

  it.each([
    ['duplicate encounter IDs', (input: ReturnType<typeof session>) => { input.state.encounters[1]!.id = input.state.encounters[0]!.id; }],
    ['foreign ownership', (input: ReturnType<typeof session>) => { input.state.encounters[1]!.sessionId = 'foreign-session'; }],
    ['invalid selection', (input: ReturnType<typeof session>) => { Object.assign(input.state.encounters[1]!, { selected: 'true' }); }],
    ['invalid ordinal', (input: ReturnType<typeof session>) => { input.state.encounters[1]!.ordinal = 8; }],
  ] as const)('preserves the entire edited draft on %s without confirmation or writes', async (_label, change) => {
    await choose(JSON.stringify(session()));
    await edit('#title', 'Keep this draft');
    await click('input[aria-label="Include occurrence 2: ' + B + '"]');
    await click('button[aria-label="Move selected occurrence 2 up"]');
    const before = localStorage.getItem(STORAGE_KEY);
    const order = saved().playlistOrder;
    expect(order).not.toEqual(saved().items.map(item => item.id));
    const rows = element('[aria-label="Encounter occurrences"]').innerHTML;
    const sequence = element('[aria-label="Selected sequence"]').innerHTML;
    const write = vi.spyOn(window.localStorage, 'setItem');
    const input = session(); change(input);
    await choose(JSON.stringify(input));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(saved().playlistOrder).toEqual(order);
    expect(element('[aria-label="Encounter occurrences"]').innerHTML).toBe(rows);
    expect(element('[aria-label="Selected sequence"]').innerHTML).toBe(sequence);
    expect(element<HTMLInputElement>('#title').value).toBe('Keep this draft');
    expect(window.confirm).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(element('[role=alert]').textContent).toContain('An encounter is invalid or out of order');
  });

  it('keeps a confirmed imported replacement in memory after failed persistence and saves it on retry', async () => {
    await choose(JSON.stringify(session()));
    await edit('#title', 'Previous draft');
    const old = localStorage.getItem(STORAGE_KEY);
    const oldIds = saved().items.map(item => item.id);
    const replacement = session();
    replacement.state.session.id = 'replacement-session';
    replacement.state.encounters = replacement.state.encounters.slice(0, 1).map(item => ({
      ...item, sessionId: 'replacement-session', videoId: B, selected: true,
    }));
    const write = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    await choose(JSON.stringify(replacement));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    const attempted = JSON.parse(write.mock.calls[0]![1]) as Draft;
    expect(attempted.items).toHaveLength(1);
    expect(attempted.items[0]).toMatchObject({ videoId: B, included: true });
    expect(oldIds).not.toContain(attempted.items[0]!.id);
    expect(attempted.playlistOrder).toEqual([attempted.items[0]!.id]);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(old);
    expect(element<HTMLInputElement>('#title').value).toBe('');
    expect(host.querySelectorAll('[aria-label="Encounter occurrences"] li')).toHaveLength(1);
    expect(element('[aria-label="Encounter occurrences"] .video-info strong').textContent).toBe(B);
    expect(element('[aria-label="Selected sequence"] strong').textContent).toBe(B);
    expect(element('[role=alert]').textContent).toContain('only in this tab');
    write.mockRestore();
    const retry = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Retry saving');
    expect(retry).toBeDefined();
    await act(async () => { retry!.click(); });
    expect(saved()).toEqual(attempted);
    expect(host.querySelector('[role=alert]')).toBeNull();
    expect(window.confirm).toHaveBeenCalledTimes(1);
  });

  it('requires confirmation for valid replacement and keeps edits when cancelled', async () => {
    await choose(JSON.stringify(session()));
    await edit('#title', 'Keep me');
    const before = localStorage.getItem(STORAGE_KEY);
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await choose(JSON.stringify(session()));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    await choose(JSON.stringify(session()));
    expect(window.confirm).toHaveBeenCalledTimes(2);
    expect(saved().title).toBe('');
    expect(localStorage.getItem(STORAGE_KEY)).not.toBe(before);
  });

  it('leaves corrupt saved data untouched until explicit replacement', async () => {
    await act(async () => { root.unmount(); }); host.remove();
    localStorage.setItem(STORAGE_KEY, '{corrupt');
    await mount();
    expect(element('[role=alert]').textContent).toContain('not been deleted');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{corrupt');
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await choose(JSON.stringify(session()));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{corrupt');
  });

  it('warns on failed saving, keeps the in-memory edits and can retry', async () => {
    await choose(JSON.stringify(session()));
    const old = localStorage.getItem(STORAGE_KEY);
    const write = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    await edit('#title', 'Unsaved title');
    expect(element('[role=alert]').textContent).toContain('only in this tab');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(old);
    expect(element<HTMLInputElement>('#title').value).toBe('Unsaved title');
    write.mockRestore();
    const retry = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Retry saving');
    expect(retry).toBeDefined();
    await act(async () => { retry?.click(); });
    expect(saved().title).toBe('Unsaved title');
    expect(host.querySelector('[role=alert]')).toBeNull();
  });

  it('rejects oversized imports before replacing the draft', async () => {
    await choose(JSON.stringify(session()));
    const old = localStorage.getItem(STORAGE_KEY);
    await choose('{}', MAX_IMPORT_BYTES + 1);
    expect(element('[role=alert]').textContent).toContain('too large');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(old);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('renders saved title and description as text rather than markup', async () => {
    await act(async () => { root.unmount(); }); host.remove();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...draft(), title: '<img src=x onerror=alert(1)>', description: '<script>bad()</script>' }));
    await mount();
    expect(element('#sequence-heading').textContent).toContain('<img');
    expect(host.querySelector('img, script')).toBeNull();
  });

  it('selects none/all without collapsing repeats and can remove all occurrences', async () => {
    await choose(JSON.stringify(session()));
    async function button(text: string) {
      const target = Array.from(host.querySelectorAll('button')).find(value => value.textContent === text);
      await act(async () => { target?.click(); });
    }
    await button('Deselect all');
    expect(saved().items.every(item => !item.included)).toBe(true);
    await button('Select all');
    expect(saved().items.filter(item => item.included)).toHaveLength(3);
    for (let i = 0; i < 3; i++) await click('.remove-button');
    expect(saved().items).toEqual([]);
    expect(host.textContent).toContain('A clean slate.');
  });
});
