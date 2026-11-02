// On-device storage. Everything lives in IndexedDB so capture works with no signal.
const DB_NAME = 'site-inspect';
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('inspections', { keyPath: 'id' });
      db.createObjectStore('items', { keyPath: 'id' }).createIndex('inspectionId', 'inspectionId');
      db.createObjectStore('settings');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const getInspection = (id) => run('inspections', 'readonly', (s) => s.get(id));
export const putInspection = (v) => run('inspections', 'readwrite', (s) => s.put(v));
export const allInspections = async () =>
  (await run('inspections', 'readonly', (s) => s.getAll())).sort((a, b) => b.createdAt - a.createdAt);

export const getItem = (id) => run('items', 'readonly', (s) => s.get(id));
export const putItem = (v) => run('items', 'readwrite', (s) => s.put(v));
export const deleteItem = (id) => run('items', 'readwrite', (s) => s.delete(id));
export const itemsFor = async (inspectionId) =>
  (await run('items', 'readonly', (s) => s.index('inspectionId').getAll(inspectionId)))
    .sort((a, b) => a.createdAt - b.createdAt);

export async function deleteInspection(id) {
  for (const item of await itemsFor(id)) await deleteItem(item.id);
  await run('inspections', 'readwrite', (s) => s.delete(id));
}

export const getSetting = (k) => run('settings', 'readonly', (s) => s.get(k));
export const setSetting = (k, v) => run('settings', 'readwrite', (s) => s.put(v, k));
