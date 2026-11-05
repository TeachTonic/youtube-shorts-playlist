import { describe, expect, it } from 'vitest';
import { decodeDraft, includeAll, includedItems, moveIncluded, removeOccurrence, setIncluded } from '../src/draft';
import { A, B, draft } from './fixtures';

describe('occurrence editing', () => {
  it('selects repeated IDs independently without changing encounter order', () => {
    const original = draft();
    const next = setIncluded(original, 'draft-1', false);
    expect(next.items.map(item => [item.videoId, item.included])).toEqual([[A, false], [B, false], [A, true]]);
    expect(original.items[0]?.included).toBe(true);
    const all = setIncluded(setIncluded(next, 'draft-3', false), 'draft-2', true);
    expect(setIncluded(all, 'draft-1', true).items.filter(x => x.included).map(x => x.videoId)).toEqual([A, B]);
  });
  it('moves selected occurrences across unselected entries without global video deduplication', () => {
    const original = draft();
    const moved = moveIncluded(original, 'draft-3', -1);
    expect(moved.items).toBe(original.items);
    expect(moved.playlistOrder).toEqual(['draft-3', 'draft-2', 'draft-1']);
    expect(includedItems(moved).map(x => x.id)).toEqual(['draft-3', 'draft-1']);
    expect(original.items.map(x => x.id)).toEqual(['draft-1', 'draft-2', 'draft-3']);
    expect(moveIncluded(moved, 'draft-3', 1)).toEqual(original);
  });
  it('ignores moves beyond boundaries, for missing IDs, and for unselected entries', () => {
    const original = draft();
    expect(moveIncluded(original, 'draft-1', -1)).toBe(original);
    expect(moveIncluded(original, 'draft-3', 1)).toBe(original);
    expect(moveIncluded(original, 'draft-2', 1)).toBe(original);
    expect(moveIncluded(original, 'missing', -1)).toBe(original);
  });
  it('removes only the requested occurrence and supports an empty editable draft', () => {
    const original = draft(), next = removeOccurrence(original, 'draft-1');
    expect(next.items.map(x => x.id)).toEqual(['draft-2', 'draft-3']);
    expect(original.items).toHaveLength(3);
    expect(next.playlistOrder).toEqual(['draft-2', 'draft-3']);
    expect(decodeDraft({ ...next, items: [], playlistOrder: [] }).items).toEqual([]);
  });
  it('selects/deselects all without changing order or metadata', () => {
    const original = { ...draft(), title: 'My sequence', description: 'Three moments' };
    expect(includeAll(original, true).items.every(x => x.included)).toBe(true);
    expect(includeAll(original, false).items.every(x => !x.included)).toBe(true);
    expect(includeAll(original, false).title).toBe('My sequence');
  });
  it('retains playlist slots on exclusion and re-inclusion, including repeated videos', () => {
    const reordered = moveIncluded(draft(), 'draft-3', -1);
    const excluded = setIncluded(reordered, 'draft-3', false);
    expect(excluded.items.map(item => item.id)).toEqual(['draft-1', 'draft-2', 'draft-3']);
    expect(includedItems(excluded).map(item => item.id)).toEqual(['draft-1']);
    expect(excluded.playlistOrder).toEqual(reordered.playlistOrder);
    expect(setIncluded(excluded, 'draft-3', true)).toEqual(reordered);
    expect(includeAll(reordered, false).playlistOrder).toEqual(reordered.playlistOrder);
    expect(includedItems(includeAll(reordered, true)).map(item => item.id))
      .toEqual(['draft-3', 'draft-2', 'draft-1']);
  });
  it('removes a reordered repeated occurrence without changing the other occurrence', () => {
    const original = moveIncluded(draft(), 'draft-3', -1);
    const removed = removeOccurrence(original, 'draft-3');
    expect(removed.items).toEqual(original.items.slice(0, 2));
    expect(removed.playlistOrder).toEqual(['draft-2', 'draft-1']);
    expect(includedItems(removed).map(item => item.id)).toEqual(['draft-1']);
    expect(removeOccurrence(original, 'missing')).toEqual(original);
  });
});
