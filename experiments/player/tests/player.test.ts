// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type Options = ConstructorParameters<NonNullable<Window['YT']>['Player']>[1];
const players: MockPlayer[] = [];
class MockPlayer {
  destroy = vi.fn();
  playVideo = vi.fn();
  constructor(_target: string, readonly options: Options) { players.push(this); }
}
const get = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const click = (id: string): void => get<HTMLButtonElement>(id).click();
function load(ids = 'AAAAAAAAAAA\nBBBBBBBBBBB\nCCCCCCCCCCC'): void {
  get<HTMLTextAreaElement>('ids').value = ids;
  get<HTMLFormElement>('sequence').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}
async function create(): Promise<MockPlayer> {
  click('play');
  await Promise.resolve(); await Promise.resolve();
  const player = players.at(-1);
  if (!player) throw new Error('Player not constructed');
  return player;
}
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); players.length = 0;
  document.body.innerHTML = readFileSync(resolve(process.cwd(), 'experiments/player/index.html'), 'utf8').replace('<script type="module" src="/src/main.ts"></script>', '');
  window.YT = { Player: MockPlayer };
  await import('../src/main');
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); delete window.YT; document.body.replaceChildren(); });
describe('player UI using a fake official API (not live playback)', () => {
  it('requires explicit Play, preserves official controls, and never autoplays', async () => {
    load(); expect(players).toHaveLength(0);
    const player = await create();
    expect(player.options.playerVars.autoplay).toBe(0);
    expect(player.options.playerVars.controls).toBe(1);
    expect(player.options.host).toBe('https://www.youtube-nocookie.com');
    player.options.events.onReady();
    expect(player.playVideo).not.toHaveBeenCalled();
    click('play'); expect(player.playVideo).toHaveBeenCalledOnce();
  });
  it('destroys the prior player on Next and requires another Play', async () => {
    load(); const player = await create(); player.options.events.onReady();
    click('next');
    expect(player.destroy).toHaveBeenCalledOnce();
    expect(players).toHaveLength(1);
    expect(get('position').textContent).toBe('2 of 3');
    expect(get<HTMLAnchorElement>('fallback').href).toBe('https://www.youtube.com/shorts/BBBBBBBBBBB');
    const second = await create(); expect(second.options.videoId).toBe('BBBBBBBBBBB');
  });
  it('shows an error and retains a fallback when embedding is denied', async () => {
    load(); const player = await create();
    player.options.events.onError({ data: 101 });
    expect(get('status').textContent).toContain('Embedding not allowed');
    expect(get<HTMLAnchorElement>('fallback').hidden).toBe(false);
    expect(get<HTMLButtonElement>('next').disabled).toBe(false);
  });
  it('ignores callbacks from the previously selected item', async () => {
    load(); const player = await create(); click('next');
    player.options.events.onError({ data: 100 }); player.options.events.onReady();
    expect(get('status').textContent).toContain('Press Play to load this item');
  });
  it('has a player-ready timeout without declaring that the video is deleted', async () => {
    load(); await create(); vi.advanceTimersByTime(15000);
    expect(get('status').textContent).toContain('Player did not become ready');
    expect(get('status').textContent).not.toContain('deleted');
  });
  it('does not advance when video ends and explains blocked scripted playback', async () => {
    load(); const player = await create();
    player.options.events.onStateChange({ data: 0 });
    expect(get('position').textContent).toBe('1 of 3');
    player.options.events.onAutoplayBlocked();
    expect(get('status').textContent).toContain('official player Play control');
  });
  it('rejects invalid IDs without constructing a player', () => {
    load('ABC123');
    expect(get('status').textContent).toContain('exactly 11');
    expect(players).toHaveLength(0);
  });
});
