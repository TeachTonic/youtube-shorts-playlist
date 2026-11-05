import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayback, type PlaybackStatus } from '../src/viewer/player';
import type { Options, YoutubeApi } from '../src/viewer/youtube';

let instances: FakePlayer[];
class FakePlayer {
  destroy = vi.fn(); playVideo = vi.fn();
  constructor(_mount: HTMLElement, readonly options: Options) { instances.push(this); }
}
let mount: HTMLDivElement;
beforeEach(() => { vi.useFakeTimers(); instances = []; mount = document.createElement('div'); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
function fixture(api: () => Promise<YoutubeApi> = async () => ({ Player: FakePlayer })) {
  const changes: PlaybackStatus[] = [];
  const controller = createPlayback(mount, 'AAAAAAAAAAA', state => changes.push(state), api);
  return { controller, changes };
}
describe('recipient playback controller, mocked official API', () => {
  it('loads only after Play, retains official controls, and requires a second gesture', async () => {
    const api = vi.fn(async () => ({ Player: FakePlayer }));
    const { controller } = fixture(api);
    expect(api).not.toHaveBeenCalled();
    await controller.play();
    const player = instances[0]!;
    expect(player.options.host).toBe('https://www.youtube-nocookie.com');
    expect(player.options.playerVars).toEqual({ autoplay: 0, playsinline: 1, controls: 1, origin: location.origin });
    player.options.events.onReady();
    expect(player.playVideo).not.toHaveBeenCalled();
    await controller.play();
    expect(player.playVideo).toHaveBeenCalledOnce();
    controller.destroy(); controller.destroy();
    expect(player.destroy).toHaveBeenCalledOnce();
  });
  it('does not construct a player if navigation happens while the API is loading', async () => {
    let resolve!: (value: YoutubeApi) => void;
    const { controller } = fixture(() => new Promise(done => { resolve = done; }));
    const load = controller.play(); controller.destroy();
    resolve({ Player: FakePlayer }); await load;
    expect(instances).toHaveLength(0);
  });
  it('suppresses duplicate clicks during loading', async () => {
    const { controller } = fixture();
    await Promise.all([controller.play(), controller.play()]);
    expect(instances).toHaveLength(1);
    controller.destroy();
  });
  it.each([2, 5, 100, 101, 150, 153, 999])('reports error %i, destroys the player and ignores late ready callbacks', async code => {
    const { controller, changes } = fixture(); await controller.play();
    const player = instances[0]!;
    player.options.events.onError({ data: code });
    expect(changes.at(-1)?.phase).toBe('error');
    expect(changes.at(-1)?.message).toContain('(' + code + ')');
    expect(player.destroy).toHaveBeenCalledOnce();
    const count = changes.length;
    player.options.events.onReady(); player.options.events.onStateChange({ data: 0 });
    expect(changes).toHaveLength(count);
    controller.destroy();
  });
  it('times out a non-ready player and distinguishes timeout from deletion', async () => {
    const { controller, changes } = fixture(); await controller.play();
    vi.advanceTimersByTime(15000);
    expect(changes.at(-1)?.message).toContain('does not establish');
    expect(instances[0]!.destroy).toHaveBeenCalledOnce();
    controller.destroy();
  });
  it('contains API failure without creating a player', async () => {
    const { controller, changes } = fixture(async () => { throw Error('offline'); });
    await controller.play();
    expect(changes.at(-1)?.phase).toBe('error'); expect(instances).toHaveLength(0);
  });
  it('keeps the same player after ended or blocked playback and ignores callbacks after cleanup', async () => {
    const { controller, changes } = fixture(); await controller.play();
    const player = instances[0]!;
    player.options.events.onReady(); player.options.events.onStateChange({ data: 0 });
    expect(changes.at(-1)?.message).toContain('does not advance');
    player.options.events.onAutoplayBlocked();
    expect(changes.at(-1)?.message).toContain('official player Play');
    expect(instances).toHaveLength(1);
    controller.destroy(); const count = changes.length;
    player.options.events.onReady(); player.options.events.onError({ data: 100 }); player.options.events.onAutoplayBlocked();
    vi.advanceTimersByTime(30000);
    expect(changes).toHaveLength(count);
  });
});
