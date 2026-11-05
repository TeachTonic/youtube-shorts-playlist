import { describe, expect, it } from 'vitest';
import { parseShortUrl } from '../src/url';
const valid = 'AbC123_-xyz';
describe('strict URL parsing', () => {
  it.each(['', '?feature=share', '#something'])('accepts a real-length ID with suffix %s', suffix => {
    expect(parseShortUrl('https://www.youtube.com/shorts/' + valid + suffix)).toEqual({
      ok: true, videoId: valid, canonicalUrl: 'https://www.youtube.com/shorts/' + valid,
    });
  });
  it.each([
    'https://www.youtube.com/shorts/ABC123',
    'https://www.youtube.com/shorts/ABC123?feature=share',
    'https://www.youtube.com/shorts/ABC123#something',
    'https://www.youtube.com/watch?v=ABC123', 'https://www.youtube.com/',
    'https://example.com/shorts/' + valid, 'https://www.youtube.com.evil.test/shorts/' + valid,
    'http://www.youtube.com/shorts/' + valid, 'https://youtube.com/shorts/' + valid,
    'https://www.youtube.com:8443/shorts/' + valid, 'https://name@www.youtube.com/shorts/' + valid,
    'https://www.youtube.com/shorts/invalid!id_', 'https://www.youtube.com/shorts/' + valid + '/extra',
    'https://www.youtube.com/shorts/%41bC123_-xyz', 'not a URL',
  ])('rejects %s', url => expect(parseShortUrl(url).ok).toBe(false));
});
