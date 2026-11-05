import { MAX_ITEMS, record, validId, validVideoId, type Draft, type DraftItem } from './draft';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export function importSession(text: string, createId: () => string = () => crypto.randomUUID()): Draft {
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES)
    throw new Error('This file is too large. Use a Phase 0 export smaller than 5 MB.');
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error('This is not valid JSON. Choose a finished Phase 0 session export.'); }
  if (!record(value) || value.schemaVersion !== 1 || !record(value.state))
    throw new Error('Unsupported export. Use a schema-version-1 Phase 0 session.');
  const state = value.state;
  if (!record(state.session) || state.session.phase !== 'finished')
    throw new Error('This session is not finished. Finish it in the extension, then import its export.');
  const session = state.session;
  if (!validId(session.id) || typeof session.finishedAt !== 'string' ||
      session.finishedAt.length > 64 || !Number.isFinite(Date.parse(session.finishedAt)))
    throw new Error('The finished session is missing valid session details.');
  if (!Array.isArray(state.encounters) || state.encounters.length === 0 || state.encounters.length > MAX_ITEMS)
    throw new Error('Choose a session containing between 1 and 1,000 encounters.');
  const sourceIds = new Set<string>();
  const draftIds = new Set<string>();
  const items = state.encounters.map((item: unknown, index: number): DraftItem => {
    if (!record(item) || !validId(item.id) || sourceIds.has(item.id) ||
        item.ordinal !== index + 1 || item.provider !== 'YouTube' || !validVideoId(item.videoId) ||
        typeof item.selected !== 'boolean' || item.sessionId !== session.id)
      throw new Error('An encounter is invalid or out of order. The current draft has not been replaced.');
    sourceIds.add(item.id);
    const id = createId();
    if (!validId(id) || draftIds.has(id)) throw new Error('Could not create distinct draft occurrences. Please retry.');
    draftIds.add(id);
    // Project only playlist fields. Never copy session data, URLs, or diagnostics.
    return { id, provider: 'youtube', videoId: item.videoId, included: item.selected };
  });
  return { kind: 'local-playlist-draft', schemaVersion: 1, title: '', description: '',
    items, playlistOrder: items.map(item => item.id) };
}
