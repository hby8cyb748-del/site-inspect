// On-device storage for incidents. It is a separate database from the inspections one, so the
// inspections database is never altered by this version and the earlier app version can still open it.
// Everything is encrypted with the same key as the rest of the app (unlocked by the PIN).
import { encryptBytes, decryptBytes, encryptJson, decryptJson } from '../crypto.js';
import { sealAudit } from './model.js';

const DB_NAME = 'site-inspect-incidents';
let dbPromise;
let dataKey = null;

export const setDataKey = (key) => { dataKey = key; };

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('incidents', { keyPath: 'id' });
      db.createObjectStore('audit', { autoIncrement: true }).createIndex('incidentId', 'incidentId');
      db.createObjectStore('media');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const req = fn(tx);
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// The incident and its new audit entries are written together or not at all.
export async function saveIncident(inc, { countChange = true } = {}) {
  const pending = inc._audit ?? [];
  const head = inc.audit;
  inc._audit = [];
  try {
    const sealed = await sealAudit(pending, head);
    inc.audit = sealed.head;
    if (countChange) inc.sync.pending += 1;
    const { _audit, ...plain } = inc;
    const record = { id: inc.id, sealed: await encryptJson(dataKey, plain) };
    const entries = await Promise.all(sealed.entries.map(async (e) => ({ incidentId: inc.id, sealed: await encryptJson(dataKey, e) })));
    await run(['incidents', 'audit'], 'readwrite', (tx) => {
      tx.objectStore('incidents').put(record);
      // The audit store is only ever added to. Nothing in the app updates or deletes single entries.
      for (const e of entries) tx.objectStore('audit').add(e);
    });
  } catch (err) {
    inc.audit = head;
    inc._audit = [...pending, ...inc._audit];
    if (countChange) inc.sync.pending -= 1;
    throw err;
  }
}

async function unseal(record) {
  if (!record) return null;
  return { ...await decryptJson(dataKey, record.sealed), _audit: [] };
}

export const getIncident = async (id) => unseal(await run('incidents', 'readonly', (tx) => tx.objectStore('incidents').get(id)));

export const allIncidents = async () =>
  (await Promise.all((await run('incidents', 'readonly', (tx) => tx.objectStore('incidents').getAll())).map(unseal)))
    .sort((a, b) => b.updatedAt - a.updatedAt);

export async function auditFor(id) {
  const sealed = await run('audit', 'readonly', (tx) => tx.objectStore('audit').index('incidentId').getAll(id));
  return (await Promise.all(sealed.map((r) => decryptJson(dataKey, r.sealed)))).sort((a, b) => a.seq - b.seq);
}

const mediaRange = (incidentId) => IDBKeyRange.bound(`${incidentId}:`, `${incidentId}:￿`);
export const mediaKey = (incidentId, evidenceId, part = 'original') => `${incidentId}:${evidenceId}:${part}`;

// Evidence files are written once. `add` refuses to replace a key that already exists.
export async function putMedia(key, blob) {
  const sealed = await encryptBytes(dataKey, await blob.arrayBuffer());
  await run('media', 'readwrite', (tx) => tx.objectStore('media').add({ ...sealed, type: blob.type }, key));
}

export async function getMedia(key) {
  const media = await run('media', 'readonly', (tx) => tx.objectStore('media').get(key));
  if (!media) return null;
  return new Blob([await decryptBytes(dataKey, media)], { type: media.type });
}

// Removes a whole incident file from this phone. Used for demonstration data and by the owner of the phone.
export async function deleteIncident(id) {
  const keys = await run('audit', 'readonly', (tx) => tx.objectStore('audit').index('incidentId').getAllKeys(id));
  await run(['incidents', 'audit', 'media'], 'readwrite', (tx) => {
    tx.objectStore('incidents').delete(id);
    for (const k of keys) tx.objectStore('audit').delete(k);
    tx.objectStore('media').delete(mediaRange(id));
  });
}
