import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Viewer } from '../src/viewer/Viewer';
import { STORAGE_KEY } from '../src/storage';
import { draft, A, B } from './fixtures';
import { moveIncluded, setIncluded } from '../src/draft';
import { loadYoutube, type Options } from '../src/viewer/youtube';
vi.mock('../src/viewer/youtube', () => ({ loadYoutube: vi.fn() }));
let host: HTMLDivElement, root: Root;
const players: FakePlayer[] = [];
class FakePlayer {
  destroy = vi.fn(); playVideo = vi.fn();
  constructor(_node: HTMLElement, readonly options: Options) { players.push(this); }
}
async function mount() { await act(async () => { root.render(<Viewer />); }); }
async function button(text: string) {
  const target = Array.from(host.querySelectorAll('button')).find(value => value.textContent === text);
  if (!target) throw Error('Missing button ' + text);
  await act(async () => { target.click(); });
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); players.length = 0;
  localStorage.clear(); vi.mocked(loadYoutube).mockResolvedValue({ Player: FakePlayer });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
describe('local recipient view', () => {
  it('preserves selected order including consecutive repeats, cleans up and never writes storage', async () => {
    const value = draft(); value.items[1]!.included = false;
    const raw = JSON.stringify(value); localStorage.setItem(STORAGE_KEY, raw);
    await mount();
    expect(loadYoutube).not.toHaveBeenCalled();
    expect(host.querySelectorAll('aside li')).toHaveLength(2);
    expect(host.textContent).toContain('1 of 2');
    await button('Play');
    await act(async () => { players[0]!.options.events.onReady(); });
    await button('Play'); expect(players[0]!.playVideo).toHaveBeenCalledOnce();
    await button('Next');
    expect(players[0]!.destroy).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('2 of 2');
    expect(host.querySelector('[aria-current=step]')?.getAttribute('aria-label')).toContain('occurrence 2');
    expect(players).toHaveLength(1);
    await button('Play'); expect(players[1]!.options.videoId).toBe(A);
    await button('Previous'); expect(players[1]!.destroy).toHaveBeenCalledOnce();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });
  it('uses the reordered draft and excludes unselected items', async () => {
    const value = moveIncluded(setIncluded(draft(), 'draft-2', true), 'draft-2', -1);
    const raw = JSON.stringify(value);
    localStorage.setItem(STORAGE_KEY, raw); await mount();
    expect(value.items.map(item => item.videoId)).toEqual([A, B, A]);
    expect(Array.from(host.querySelectorAll('aside li strong')).map(node => node.textContent)).toEqual([B, A, A]);
    const target = host.querySelector<HTMLButtonElement>('[aria-label="Go to occurrence 1: ' + B + '"]')!;
    await act(async () => target.click());
    expect(host.textContent).toContain('1 of 3');
    expect(host.querySelector('a[target=_blank]')?.getAttribute('href')).toBe('https://www.youtube.com/shorts/' + B);
    expect(loadYoutube).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    root = createRoot(host); await mount();
    expect(Array.from(host.querySelectorAll('aside li strong')).map(node => node.textContent)).toEqual([B, A, A]);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });
  it('keeps fallback and navigation after unavailable video and retries without autoplay', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft())); await mount(); await button('Play');
    await act(async () => players[0]!.options.events.onError({ data: 100 }));
    expect(host.querySelector('[role=alert]')?.textContent).toContain('unavailable or private');
    expect(host.querySelector('a[target=_blank]')).not.toBeNull();
    await button('Try again'); expect(players).toHaveLength(1);
    await button('Play'); expect(players).toHaveLength(2);
    expect(players[1]!.playVideo).not.toHaveBeenCalled();
  });
  it('does not advance at end and destroys the active player on pagehide', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft())); await mount(); await button('Play');
    await act(async () => { players[0]!.options.events.onReady(); players[0]!.options.events.onStateChange({ data: 0 }); });
    expect(host.textContent).toContain('1 of 2');
    await act(async () => window.dispatchEvent(new Event('pagehide')));
    expect(players[0]!.destroy).toHaveBeenCalledOnce();
  });
  it.each([null, '{corrupt', JSON.stringify({ ...draft(), items: [], playlistOrder: [] })])('handles missing, invalid and empty local drafts without a player: %s', async raw => {
    if (raw !== null) localStorage.setItem(STORAGE_KEY, raw);
    await mount(); expect(loadYoutube).not.toHaveBeenCalled();
    expect(host.querySelector('.portrait-player')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
    expect(host.querySelector('a')?.textContent).toContain('Back to editor');
  });
});
