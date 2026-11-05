import { describe, expect, it } from 'vitest';
import { importSession, MAX_IMPORT_BYTES } from '../src/import-session';
import { A, B, session } from './fixtures';

describe('finished Phase 0 import', () => {
  it('projects distinct occurrences in encounter order and strips private export fields', () => {
    const input = session(), original = JSON.stringify(input);
    let id = 0;
    const result = importSession(original, () => 'new-' + ++id);
    expect(result).toEqual({
      kind: 'local-playlist-draft', schemaVersion: 1, title: '', description: '',
      playlistOrder: ['new-1', 'new-2', 'new-3'],
      items: [
        { id: 'new-1', provider: 'youtube', videoId: A, included: true },
        { id: 'new-2', provider: 'youtube', videoId: B, included: false },
        { id: 'new-3', provider: 'youtube', videoId: A, included: true },
      ],
    });
    expect(JSON.stringify(input)).toBe(original);
    for (const unwanted of ['source-session', 'source-1', 'diagnostics', 'tabId', 'detectedAt', 'detectedUrl', 'mechanism', 'exportedAt', 'SYNTHETIC_DIAGNOSTIC_NOT_FOR_DRAFT'])
      expect(JSON.stringify(result)).not.toContain(unwanted);
  });
  it.each(['', '{', 'null', '[]', '"hello"', '{"schemaVersion":2}'])('rejects malformed or unsupported input %j', text => {
    expect(() => importSession(text)).toThrow();
  });
  it.each(['capturing', 'paused', 'finishing'])('rejects an unfinished %s session', phase => {
    const input = session(); input.state.session.phase = phase;
    expect(() => importSession(JSON.stringify(input))).toThrow('not finished');
  });
  it.each([
    ['missing session', (input: ReturnType<typeof session>) => { Object.assign(input.state, { session: null }); }],
    ['missing finish timestamp', (input: ReturnType<typeof session>) => { input.state.session.finishedAt = ''; }],
    ['empty encounters', (input: ReturnType<typeof session>) => { input.state.encounters = []; }],
    ['missing encounters', (input: ReturnType<typeof session>) => { Object.assign(input.state, { encounters: {} }); }],
    ['duplicate occurrence IDs', (input: ReturnType<typeof session>) => { input.state.encounters[1]!.id = 'source-1'; }],
    ['noncontiguous ordinals', (input: ReturnType<typeof session>) => { input.state.encounters[1]!.ordinal = 8; }],
    ['invalid video ID', (input: ReturnType<typeof session>) => { input.state.encounters[0]!.videoId = 'ABC123'; }],
    ['unsupported provider', (input: ReturnType<typeof session>) => { input.state.encounters[0]!.provider = 'Other'; }],
    ['foreign session', (input: ReturnType<typeof session>) => { input.state.encounters[0]!.sessionId = 'another-session'; }],
    ['nonboolean selection', (input: ReturnType<typeof session>) => { Object.assign(input.state.encounters[0]!, { selected: 'true' }); }],
  ] as const)('rejects %s', (_label, change) => {
    const input = session(); change(input);
    expect(() => importSession(JSON.stringify(input))).toThrow();
  });
  it('accepts 1,000 encounters and rejects 1,001', () => {
    const input = session(), template = input.state.encounters[0]!;
    input.state.encounters = Array.from({ length: 1000 }, (_, index) => ({ ...template, id: 'source-' + index, ordinal: index + 1 }));
    expect(importSession(JSON.stringify(input)).items).toHaveLength(1000);
    input.state.encounters.push({ ...template, id: 'extra', ordinal: 1001 });
    expect(() => importSession(JSON.stringify(input))).toThrow('1,000');
  });
  it.each([
    ['missing', undefined], ['empty', ''], ['null', null], ['numeric', 123], ['overlength', 'x'.repeat(129)],
  ])('rejects a %s session ID', (_label, id) => {
    const input = session();
    Object.assign(input.state.session, { id });
    // Match ownership so rejection must come from session-ID validation.
    input.state.encounters.forEach(item => Object.assign(item, { sessionId: id }));
    expect(() => importSession(JSON.stringify(input))).toThrow('missing valid session details');
  });
  it.each([
    ['missing', undefined], ['null', null], ['numeric', 123], ['unparseable', 'not-a-date'],
    ['overlength', 'x'.repeat(65)],
  ])('rejects a %s finish timestamp', (_label, finishedAt) => {
    const input = session();
    Object.assign(input.state.session, { finishedAt });
    expect(() => importSession(JSON.stringify(input))).toThrow('missing valid session details');
  });
  it('rejects a missing session phase', () => {
    const input = session();
    Object.assign(input.state.session, { phase: undefined });
    expect(() => importSession(JSON.stringify(input))).toThrow('not finished');
  });
  it.each([
    ['missing', undefined], ['null', null], ['numeric', 1],
  ])('rejects a %s selected value', (_label, selected) => {
    const input = session();
    Object.assign(input.state.encounters[0]!, { selected });
    expect(() => importSession(JSON.stringify(input))).toThrow('An encounter is invalid or out of order');
  });
  it.each([
    ['invalid-character', 'AAAAAAAAAA!'], ['numeric', 12345678901], ['null', null],
  ])('rejects a %s video ID', (_label, videoId) => {
    const input = session();
    Object.assign(input.state.encounters[0]!, { videoId });
    expect(() => importSession(JSON.stringify(input))).toThrow('An encounter is invalid or out of order');
  });
  it.each(['swapped entries', 'duplicate ordinals'])('rejects %s', kind => {
    const input = session();
    if (kind === 'swapped entries') {
      const [first, second, third] = input.state.encounters;
      input.state.encounters = [second!, first!, third!];
    } else input.state.encounters[1]!.ordinal = 1;
    expect(() => importSession(JSON.stringify(input))).toThrow('An encounter is invalid or out of order');
  });
  it.each(['ASCII', 'multibyte UTF-8'])('accepts exactly 5 MiB and rejects one byte over for %s', encoding => {
    const base = JSON.stringify({ ...session(), padding: '' });
    const available = MAX_IMPORT_BYTES - new TextEncoder().encode(base).byteLength;
    const padding = encoding === 'ASCII' ? ' '.repeat(available)
      : 'é'.repeat(Math.floor(available / 2)) + ' '.repeat(available % 2);
    const text = JSON.stringify({ ...session(), padding });
    expect(new TextEncoder().encode(text).byteLength).toBe(MAX_IMPORT_BYTES);
    if (encoding !== 'ASCII') expect(text.length).toBeLessThan(MAX_IMPORT_BYTES);
    expect(importSession(text).items).toHaveLength(3);
    const oversized = text + ' ';
    expect(new TextEncoder().encode(oversized).byteLength).toBe(MAX_IMPORT_BYTES + 1);
    if (encoding !== 'ASCII') expect(oversized.length).toBeLessThan(MAX_IMPORT_BYTES);
    expect(() => importSession(oversized)).toThrow('too large');
  });
  it('limits bytes before parsing and refuses duplicate generated IDs', () => {
    expect(() => importSession(' '.repeat(MAX_IMPORT_BYTES + 1))).toThrow('too large');
    expect(() => importSession(JSON.stringify(session()), () => 'same')).toThrow('distinct');
  });
  it('never consumes diagnostic contents or arbitrary source URLs', () => {
    const input = session();
    Object.assign(input.state, { diagnostics: { ignored: true } });
    input.state.encounters[0]!.detectedUrl = 'https://unrelated.example.invalid/';
    expect(importSession(JSON.stringify(input)).items[0]?.videoId).toBe(A);
    expect(JSON.stringify(importSession(JSON.stringify(input)))).not.toContain('unrelated');
  });
});
