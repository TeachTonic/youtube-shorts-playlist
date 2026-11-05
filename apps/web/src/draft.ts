export const MAX_ITEMS = 1000;
export const MAX_TITLE = 120;
export const MAX_DESCRIPTION = 2000;
export interface DraftItem { id: string; provider: 'youtube'; videoId: string; included: boolean }
export interface Draft {
  kind: 'local-playlist-draft';
  schemaVersion: 1;
  title: string;
  description: string;
  items: DraftItem[];
  // All occurrence IDs, including excluded items. Filtering controls membership, not order.
  playlistOrder: string[];
}
export const validVideoId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{11}$/.test(value);
export const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;

export function decodeDraft(value: unknown): Draft {
  if (!record(value) || value.kind !== 'local-playlist-draft' || value.schemaVersion !== 1 ||
      typeof value.title !== 'string' || value.title.length > MAX_TITLE ||
      typeof value.description !== 'string' || value.description.length > MAX_DESCRIPTION ||
      !Array.isArray(value.items) || value.items.length > MAX_ITEMS) throw new Error('Invalid saved draft.');
  const ids = new Set<string>();
  const items = value.items.map((item: unknown): DraftItem => {
    if (!record(item) || !validId(item.id) || ids.has(item.id) || item.provider !== 'youtube' ||
        !validVideoId(item.videoId) || typeof item.included !== 'boolean') throw new Error('Invalid saved occurrence.');
    ids.add(item.id);
    return { id: item.id, provider: 'youtube', videoId: item.videoId, included: item.included };
  });
  // Legacy v1 drafts only have their saved working order; never invent capture order.
  const order: unknown = 'playlistOrder' in value ? value.playlistOrder : items.map(item => item.id);
  if (!Array.isArray(order) || order.length !== items.length ||
      order.some(id => !validId(id) || !ids.has(id)) || new Set(order).size !== order.length)
    throw new Error('Invalid saved playlist order.');
  const playlistOrder = order as string[];
  return { kind: 'local-playlist-draft', schemaVersion: 1, title: value.title, description: value.description,
    items, playlistOrder: [...playlistOrder] };
}
export function includedItems(draft: Draft): DraftItem[] {
  const byId = new Map(draft.items.map(item => [item.id, item]));
  return draft.playlistOrder.flatMap(id => {
    const item = byId.get(id);
    return item?.included ? [item] : [];
  });
}
export function setIncluded(draft: Draft, id: string, included: boolean): Draft {
  return { ...draft, items: draft.items.map(item => item.id === id ? { ...item, included } : item) };
}
export function includeAll(draft: Draft, included: boolean): Draft {
  return { ...draft, items: draft.items.map(item => ({ ...item, included })) };
}
export function removeOccurrence(draft: Draft, id: string): Draft {
  return { ...draft, items: draft.items.filter(item => item.id !== id),
    playlistOrder: draft.playlistOrder.filter(itemId => itemId !== id) };
}
export function moveIncluded(draft: Draft, id: string, direction: -1 | 1): Draft {
  const included = includedItems(draft);
  const position = included.findIndex(item => item.id === id);
  const neighbor = included[position + direction];
  if (position < 0 || !neighbor) return draft;
  const from = draft.playlistOrder.indexOf(id);
  const to = draft.playlistOrder.indexOf(neighbor.id);
  const playlistOrder = [...draft.playlistOrder];
  const moving = playlistOrder[from], other = playlistOrder[to];
  if (!moving || !other) return draft;
  // Swap selected neighbors only in playlist order; encounter order never moves.
  playlistOrder[from] = other; playlistOrder[to] = moving;
  return { ...draft, playlistOrder };
}
