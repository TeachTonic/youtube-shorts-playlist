import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiLoader, type YoutubeApi } from '../src/viewer/youtube';
const official = window as unknown as { YT?: YoutubeApi; onYouTubeIframeAPIReady?: () => void };
beforeEach(() => {
  vi.useFakeTimers(); delete official.YT; delete official.onYouTubeIframeAPIReady;
  const append = document.head.append.bind(document.head);
  // Keep script elements inert: tests drive load/error callbacks without network access.
  vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
    for (const node of nodes) if (node instanceof HTMLScriptElement) node.type = 'text/plain';
    append(...nodes);
  });
});
afterEach(() => { document.head.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]').forEach(script => script.remove()); delete official.YT; delete official.onYouTubeIframeAPIReady; vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe('official API loader', () => {
  it('shares concurrent loads and resolves only the documented ready callback', async () => {
    const load = createApiLoader(); const first = load(), second = load();
    expect(first).toBe(second);
    expect(document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]')).toHaveLength(1);
    official.YT = { Player: class { destroy() {} playVideo() {} } };
    official.onYouTubeIframeAPIReady?.();
    expect(await first).toBe(official.YT);
    expect(await load()).toBe(official.YT);
  });
  it('removes failed script and allows a fresh retry after a network error', async () => {
    const load = createApiLoader(); const first = load();
    const rejected = expect(first).rejects.toThrow('could not be loaded');
    document.querySelector('script[src="https://www.youtube.com/iframe_api"]')?.dispatchEvent(new Event('error'));
    await rejected;
    expect(document.querySelector('script[src="https://www.youtube.com/iframe_api"]')).toBeNull();
    const retry = load(); const retried = expect(retry).rejects.toThrow();
    vi.advanceTimersByTime(15000); await retried;
  });
  it('restores a prior callback and fails when the API does not arrive', async () => {
    const previous = vi.fn(); official.onYouTubeIframeAPIReady = previous;
    const result = createApiLoader()(); const rejected = expect(result).rejects.toThrow();
    vi.advanceTimersByTime(15000); await rejected;
    expect(official.onYouTubeIframeAPIReady).toBe(previous);
  });
});
