import { decodeDraft, type Draft } from './draft';

export const STORAGE_KEY = 'watch-what-i-watched.local-draft.v1';
const MAX_STORED_CHARACTERS = 1024 * 1024;
type DraftStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type LoadedDraft = { draft: Draft | null; error: string | null; existing: boolean };
export type SaveResult = { ok: true } | { ok: false; error: string };
const browserStorage = (): DraftStorage => window.localStorage;

export function loadDraft(getStorage: () => DraftStorage = browserStorage): LoadedDraft {
  try {
    const text = getStorage().getItem(STORAGE_KEY);
    if (text === null) return { draft: null, error: null, existing: false };
    if (text.length > MAX_STORED_CHARACTERS) throw new Error('Saved draft too large.');
    return { draft: decodeDraft(JSON.parse(text) as unknown), error: null, existing: true };
  } catch {
    return { draft: null, existing: true, error: 'The saved draft could not be opened. It has not been deleted. Check browser storage access, or import a session to explicitly replace it.' };
  }
}
export function saveDraft(draft: Draft, getStorage: () => DraftStorage = browserStorage): SaveResult {
  try {
    getStorage().setItem(STORAGE_KEY, JSON.stringify(decodeDraft(draft)));
    return { ok: true };
  } catch {
    return { ok: false, error: 'Changes are only in this tab. Browser storage is unavailable or full. Keep this tab open and retry saving.' };
  }
}
