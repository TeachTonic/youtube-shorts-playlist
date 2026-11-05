import './style.css';
interface Player {
  destroy(): void; playVideo(): void;
}
interface PlayerEvent { data: number }
interface PlayerOptions {
  videoId: string; width: string; height: string;
  host: string;
  playerVars: { autoplay: number; playsinline: number; controls: number; origin: string };
  events: { onReady(): void; onError(event: PlayerEvent): void; onStateChange(event: PlayerEvent): void; onAutoplayBlocked(): void };
}
interface YoutubeApi { Player: new (target: string, options: PlayerOptions) => Player }
declare global {
  interface Window { YT?: YoutubeApi; onYouTubeIframeAPIReady?: () => void }
}
const node = <T extends HTMLElement>(id: string): T => {
  const value = document.getElementById(id); if (!value) throw new Error('Missing ' + id); return value as T;
};
let ids: string[] = [];
let position = 0;
let player: Player | null = null;
let apiPromise: Promise<YoutubeApi> | null = null;
let generation = 0;
let ready = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const events: string[] = [];
function log(message: string): void {
  events.push(new Date().toISOString() + ' ' + message);
  node('events').textContent = events.slice(-100).join('\n');
}
function status(message: string): void { node('status').textContent = message; log(message); }
function api(): Promise<YoutubeApi> {
  if (window.YT) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('YouTube API did not load. Check network/content blocking; reload to retry.')), 15000);
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timeout);
      if (window.YT) resolve(window.YT); else reject(new Error('YouTube player API unavailable.'));
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { clearTimeout(timeout); reject(new Error('YouTube API script blocked or unavailable. Reload to retry.')); };
    document.head.append(script);
  });
  return apiPromise;
}
function select(): void {
  generation++; clearTimeout(timer); player?.destroy(); player = null; ready = false;
  const mount = document.createElement('div'); mount.id = 'mount'; node('viewport').replaceChildren(mount);
  const id = ids[position];
  node('title').textContent = id ? 'Sequence item ' + (position + 1) : 'No sequence loaded';
  node('position').textContent = ids.length ? (position + 1) + ' of ' + ids.length : '0 of 0';
  node<HTMLButtonElement>('previous').disabled = position === 0;
  node<HTMLButtonElement>('next').disabled = position >= ids.length - 1;
  node<HTMLButtonElement>('play').disabled = !id;
  node<HTMLButtonElement>('play').textContent = 'Play';
  const fallback = node<HTMLAnchorElement>('fallback'); fallback.hidden = !id;
  if (id) fallback.href = 'https://www.youtube.com/shorts/' + id;
  status(id ? 'Ready. Press Play to load this item from YouTube.' : 'Enter a sequence.');
}
node<HTMLFormElement>('sequence').addEventListener('submit', event => {
  event.preventDefault();
  const input = node<HTMLTextAreaElement>('ids').value.trim().split(/\s+/).filter(Boolean);
  if (!input.length || input.length > 20 || input.some(id => !/^[A-Za-z0-9_-]{11}$/.test(id))) {
    status('Use 1–20 video IDs, each exactly 11 letters, digits, underscores or hyphens.'); return;
  }
  ids = input; position = 0; select();
});
node('previous').addEventListener('click', () => { if (position > 0) { position--; select(); } });
node('next').addEventListener('click', () => { if (position < ids.length - 1) { position++; select(); } });
node('play').addEventListener('click', () => { void play(); });
async function play(): Promise<void> {
  if (ready && player) { player.playVideo(); return; }
  const id = ids[position]; if (!id) return;
  const current = generation;
  node<HTMLButtonElement>('play').disabled = true;
  status('Loading official YouTube player…');
  try {
    const youtube = await api();
    if (generation !== current) return;
    timer = setTimeout(() => {
      if (generation !== current) return;
      status('Player did not become ready. Use Open in YouTube, or Previous/Next to retry.');
      node<HTMLButtonElement>('play').disabled = true;
    }, 15000);
    player = new youtube.Player('mount', {
      videoId: id, host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%',
      playerVars: { autoplay: 0, controls: 1, playsinline: 1, origin: location.origin },
      events: {
        onReady() {
          if (generation !== current) return;
          clearTimeout(timer); ready = true; node<HTMLButtonElement>('play').disabled = false;
          // A second explicit gesture avoids depending on activation surviving API loading.
          status('Player ready. Press Play again or use the official player controls.');
        },
        onError(event) {
          if (generation !== current) return;
          clearTimeout(timer); ready = false; node<HTMLButtonElement>('play').disabled = true;
          const reasons: Record<number, string> = {
            2: 'Invalid player parameter', 5: 'HTML5 playback failed',
            100: 'Video unavailable or private', 101: 'Embedding not allowed', 150: 'Embedding not allowed',
            153: 'Player client identification/referrer missing',
          };
          status((reasons[event.data] ?? 'YouTube playback error') + ' (' + event.data + '). Open in YouTube or choose another item.');
        },
        onStateChange(event) { if (generation === current) log('Player state: ' + event.data + '; no automatic advance.'); },
        onAutoplayBlocked() { if (generation === current) status('Scripted playback blocked. Use the official player Play control.'); },
      },
    });
  } catch (error) {
    if (generation !== current) return;
    status(error instanceof Error ? error.message : 'Player unavailable.');
    node<HTMLButtonElement>('play').disabled = false;
  }
}
