export type ParsedUrl = { ok: true; videoId: string; canonicalUrl: string } | { ok: false; reason: string };
export function parseShortUrl(value: string): ParsedUrl {
  let url: URL;
  try { url = new URL(value); } catch { return { ok: false, reason: 'invalid-url' }; }
  if (url.protocol !== 'https:' || url.hostname !== 'www.youtube.com' || url.port || url.username || url.password)
    return { ok: false, reason: 'unsupported-origin' };
  const match = /^\/shorts\/([A-Za-z0-9_-]{11})$/.exec(url.pathname);
  const videoId = match?.[1];
  if (!videoId) return { ok: false, reason: url.pathname.startsWith('/shorts/') ? 'invalid-video-id' : 'not-shorts' };
  return { ok: true, videoId, canonicalUrl: 'https://www.youtube.com/shorts/' + videoId };
}
