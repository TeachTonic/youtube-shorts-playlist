import { loadYoutube, type Player, type YoutubeApi } from './youtube';

export interface PlaybackStatus { phase: 'idle' | 'loading' | 'ready' | 'error'; message: string }
const reasons: Record<number, string> = {
  2: 'Invalid player parameter', 5: 'HTML5 playback failed',
  100: 'Video unavailable or private', 101: 'Embedding is not allowed', 150: 'Embedding is not allowed',
  153: 'Player identification or referrer is missing',
};
export function createPlayback(
  mount: HTMLElement, videoId: string, update: (status: PlaybackStatus) => void,
  api: () => Promise<YoutubeApi> = loadYoutube,
) {
  let disposed = false, loading = false, ready = false, failed = false;
  let player: Player | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function release() {
    clearTimeout(timer); ready = false;
    const old = player; player = null;
    try { old?.destroy(); } finally { mount.replaceChildren(); }
  }
  function error(message: string) {
    if (disposed || failed) return;
    failed = true; loading = false; release();
    update({ phase: 'error', message });
  }
  return {
    async play() {
      if (disposed || failed || loading) return;
      try {
        if (ready && player) { player.playVideo(); return; }
        loading = true;
        update({ phase: 'loading', message: 'Loading the official YouTube player…' });
        const youtube = await api();
        if (disposed) return;
        const target = document.createElement('div'); mount.replaceChildren(target);
        timer = setTimeout(() => error('Player did not become ready. Retry or open in YouTube; this does not establish that the video was deleted.'), 15000);
        player = new youtube.Player(target, {
          videoId, host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%',
          playerVars: { autoplay: 0, playsinline: 1, controls: 1, origin: location.origin },
          events: {
            onReady() {
              if (disposed || failed) return;
              clearTimeout(timer); loading = false; ready = true;
              mount.querySelector('iframe')?.setAttribute('title', 'Official YouTube player');
              update({ phase: 'ready', message: 'Ready. Press Play again or use the official player controls.' });
            },
            onError(event) { error((reasons[event.data] ?? 'YouTube playback error') + ' (' + event.data + '). Try Open in YouTube or another occurrence.'); },
            onStateChange(event) {
              if (!disposed && !failed && ready && event.data === 0)
                update({ phase: 'ready', message: 'This item ended. Replay it or choose Next; the sequence does not advance automatically.' });
            },
            onAutoplayBlocked() {
              if (!disposed && !failed)
                update({ phase: 'ready', message: 'Playback was blocked. Use the official player Play control.' });
            },
          },
        });
      } catch {
        error('The official player is unavailable. Retry or open in YouTube.');
      }
    },
    destroy() { if (disposed) return; disposed = true; release(); },
  };
}
