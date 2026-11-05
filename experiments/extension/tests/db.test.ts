import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { DATABASE, readState, updateState } from '../src/db';
import { observe, start } from '../src/state';
afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
});
describe('IndexedDB transaction durability', () => {
  it('reads persisted data through a freshly opened connection', async () => {
    await updateState(state => start(state, 7, '2026-10-08T09:00:00Z', 'session'));
    await updateState(state => { observe(state, { tabId: 7, url: 'https://www.youtube.com/shorts/AAAAAAAAAAA',
      at: '2026-10-08T09:00:01Z', source: 'start', foreground: true }, 'encounter'); });
    const restored = await readState();
    expect(restored.encounters[0]?.id).toBe('encounter');
    expect(restored.session?.currentEncounterId).toBe('encounter');
  });
  it('rolls back the whole transaction on a reducer error', async () => {
    await updateState(state => start(state, 7, 'now', 'session'));
    await expect(updateState(state => { state.encounters.length = 0; state.session = null; throw new Error('deliberate failure'); })).rejects.toThrow('deliberate failure');
    expect((await readState()).session?.id).toBe('session');
  });
  it('serializes concurrent writers without losing data', async () => {
    await updateState(state => start(state, 7, 'now', 'session'));
    await Promise.all(['AAAAAAAAAAA','BBBBBBBBBBB','AAAAAAAAAAA'].map((id, index) => updateState(state => {
      observe(state, { tabId: 7, url: 'https://www.youtube.com/shorts/' + id, at: 'now',
        source: 'webNavigation.onHistoryStateUpdated', foreground: true }, String(index));
    })));
    expect((await readState()).encounters.map(item => item.ordinal)).toEqual([1,2,3]);
  });
});
