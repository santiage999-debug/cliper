// IndexedDB mínima: 'files' (blobs de video/audio) y 'kv' (estado JSON)
let dbp = null;
const open = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('cliper', 1);
  r.onupgradeneeded = () => { r.result.createObjectStore('files'); r.result.createObjectStore('kv'); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
const tx = async (store, mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(store, mode); const s = t.objectStore(store); const r = fn(s); t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); }); };
export const putFile = (id, blob) => tx('files', 'readwrite', s => s.put(blob, id));
export const getFile = id => tx('files', 'readonly', s => s.get(id));
export const delFile = id => tx('files', 'readwrite', s => s.delete(id));
export const kvGet = k => tx('kv', 'readonly', s => s.get(k));
export const kvSet = (k, v) => tx('kv', 'readwrite', s => s.put(v, k));
export async function persist() { try { return await navigator.storage?.persist?.(); } catch { return false; } }
export async function quota() { try { return await navigator.storage.estimate(); } catch { return null; } }
