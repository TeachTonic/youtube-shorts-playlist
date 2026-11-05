// Adapted from the Phase 0 player. Only the documented IFrame API is used.
export interface Player { destroy(): void; playVideo(): void }
export interface Options {
  videoId: string; host: string; width: string; height: string;
  playerVars: { autoplay: number; playsinline: number; controls: number; origin: string };
  events: { onReady(): void; onError(event: { data: number }): void; onStateChange(event: { data: number }): void; onAutoplayBlocked(): void };
}
export interface YoutubeApi { Player: new (element: HTMLElement, options: Options) => Player }
type ApiWindow = { YT?: YoutubeApi; onYouTubeIframeAPIReady?: () => void };
const official = () => window as unknown as ApiWindow;

export function createApiLoader(): () => Promise<YoutubeApi> {
  let pending: Promise<YoutubeApi> | null = null;
  return () => {
    if (official().YT?.Player) return Promise.resolve(official().YT!);
    if (pending) return pending;
    pending = new Promise<YoutubeApi>((resolve, reject) => {
      const script = document.createElement('script');
      const previous = official().onYouTubeIframeAPIReady;
      const cleanup = () => {
        clearTimeout(timeout); script.onerror = null;
        if (official().onYouTubeIframeAPIReady === ready) {
          if (previous) official().onYouTubeIframeAPIReady = previous;
          else delete official().onYouTubeIframeAPIReady;
        }
      };
      const fail = () => {
        cleanup(); script.remove();
        reject(new Error('YouTube could not be loaded. Check your connection or content blocker, then retry or open in YouTube.'));
      };
      const ready = () => {
        if (!official().YT?.Player) { fail(); return; }
        cleanup(); resolve(official().YT!);
      };
      const timeout = setTimeout(fail, 15000);
      official().onYouTubeIframeAPIReady = ready;
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = fail;
      document.head.append(script);
    }).catch((error: unknown) => { pending = null; throw error; });
    return pending;
  };
}
export const loadYoutube = createApiLoader();
