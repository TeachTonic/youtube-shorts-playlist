import { emptyState, type State } from './model';
export class PersistenceError extends Error { override name = 'PersistenceError'; }
export const DATABASE = 'encounter-spike-v1';
export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new PersistenceError('Cannot open local storage.', { cause: request.error }));
    request.onblocked = () => reject(new PersistenceError('Storage upgrade blocked. Close other extension views.'));
  });
}
export async function updateState(change: (state: State) => void): Promise<State> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite', { durability: 'strict' });
    const store = tx.objectStore('state');
    const request = store.get('current');
    let next = emptyState();
    let failure: unknown;
    request.onsuccess = () => {
      try {
        next = (request.result as State | undefined) ?? emptyState();
        change(next);
        store.put(next, 'current');
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); resolve(next); };
    tx.onabort = () => { db.close(); reject(failure ?? new PersistenceError('Local save failed.', { cause: tx.error })); };
    tx.onerror = () => { failure ??= new PersistenceError('Local save failed.', { cause: tx.error }); };
  });
}
export async function readState(): Promise<State> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readonly');
    const request = tx.objectStore('state').get('current');
    tx.oncomplete = () => { db.close(); resolve((request.result as State | undefined) ?? emptyState()); };
    tx.onabort = () => { db.close(); reject(new PersistenceError('Local read failed.', { cause: tx.error })); };
  });
}
