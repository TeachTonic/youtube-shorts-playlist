import { describe, expect, it } from 'vitest';
import { loadDraft, saveDraft, STORAGE_KEY } from '../src/storage';
import { draft } from './fixtures';
import { includedItems, moveIncluded } from '../src/draft';

function memory() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
describe('local draft persistence', () => {
  it('restores exactly the saved sequence, metadata, and inclusion flags', () => {
    const storage = memory(), value = { ...draft(), title: 'A little sequence', description: 'Optional context' };
    expect(loadDraft(() => storage)).toEqual({ draft: null, error: null, existing: false });
    expect(saveDraft(value, () => storage)).toEqual({ ok: true });
    expect(loadDraft(() => storage)).toEqual({ draft: value, error: null, existing: true });
  });
  it('persists independent playlist order without changing encounter order', () => {
    const storage = memory(), original = draft();
    const moved = moveIncluded(original, 'draft-3', -1);
    expect(saveDraft(moved, () => storage).ok).toBe(true);
    const restored = loadDraft(() => storage).draft!;
    expect(restored).toEqual(moved);
    expect(restored.items).toEqual(original.items);
    expect(includedItems(restored).map(item => item.id)).toEqual(['draft-3', 'draft-1']);
  });
  it('reads legacy v1 order without rewriting stored data or inventing capture order', () => {
    const storage = memory();
    const { playlistOrder: _order, ...legacy } = draft();
    legacy.items.reverse();
    const raw = JSON.stringify(legacy);
    storage.values.set(STORAGE_KEY, raw);
    const restored = loadDraft(() => storage).draft!;
    expect(restored.items).toEqual(legacy.items);
    expect(restored.playlistOrder).toEqual(['draft-3', 'draft-2', 'draft-1']);
    expect(storage.values.get(STORAGE_KEY)).toBe(raw);
  });
  it.each([null, 'bad', [], ['draft-1'], ['draft-1', 'draft-1', 'draft-3'],
    ['draft-1', 'draft-2', 'unknown'], ['draft-1', 'draft-2', 3],
    ['draft-1', 'draft-2', 'draft-3', 'extra']].map(playlistOrder => ({ playlistOrder })))('rejects malformed explicit playlist order $playlistOrder without writes', ({ playlistOrder }) => {
    const storage = memory();
    const raw = JSON.stringify({ ...draft(), playlistOrder });
    storage.values.set(STORAGE_KEY, raw);
    expect(loadDraft(() => storage).draft).toBeNull();
    expect(storage.values.get(STORAGE_KEY)).toBe(raw);
    expect(saveDraft({ ...draft(), playlistOrder } as unknown as ReturnType<typeof draft>, () => storage).ok).toBe(false);
    expect(storage.values.get(STORAGE_KEY)).toBe(raw);
  });
  it.each(['{', '{"kind":"local-playlist-draft","schemaVersion":2}', 'null'])('preserves unreadable stored data %s', raw => {
    const storage = memory(); storage.values.set(STORAGE_KEY, raw);
    expect(loadDraft(() => storage).error).toContain('not been deleted');
    expect(storage.values.get(STORAGE_KEY)).toBe(raw);
  });
  it('rejects duplicate IDs and malformed saved fields without deleting the saved value', () => {
    const storage = memory(), value = draft();
    value.items[1]!.id = value.items[0]!.id;
    const raw = JSON.stringify(value); storage.values.set(STORAGE_KEY, raw);
    expect(loadDraft(() => storage).draft).toBeNull();
    expect(storage.values.get(STORAGE_KEY)).toBe(raw);
  });
  it('handles denied storage access and write failures without overwriting the previous draft', () => {
    expect(loadDraft(() => { throw new Error('SecurityError'); }).error).toBeTruthy();
    const storage = memory(); saveDraft(draft(), () => storage);
    const before = storage.values.get(STORAGE_KEY);
    const result = saveDraft({ ...draft(), title: 'unsaved' }, () => ({
      getItem: storage.getItem, setItem: () => { throw new Error('QuotaExceededError'); },
    }));
    expect(result.ok).toBe(false);
    expect(storage.values.get(STORAGE_KEY)).toBe(before);
  });
  it('whitelists persisted fields and rejects invalid edits before writing', () => {
    const storage = memory();
    const value = { ...draft(), sessionId: 'excluded', diagnostics: ['excluded'] };
    saveDraft(value, () => storage);
    expect(storage.values.get(STORAGE_KEY)).not.toContain('excluded');
    const before = storage.values.get(STORAGE_KEY);
    expect(saveDraft({ ...draft(), title: 'x'.repeat(121) }, () => storage).ok).toBe(false);
    expect(storage.values.get(STORAGE_KEY)).toBe(before);
  });
});
