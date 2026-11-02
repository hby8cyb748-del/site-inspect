// On-device storage. Everything lives in IndexedDB so capture works with no signal.
// Records are encrypted here, so the rest of the app reads and writes plain values.
import { encryptBytes, decryptBytes, encryptJson, decryptJson } from './crypto.js';

const DB_NAME = 'site-inspect';
const SECRET_SETTINGS = ['openaiKey', 'anthropicKey', 'inspector'];
let dbPromise;
let dataKey = null;

export const setDataKey = (key) => { dataKey = key; };

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = ({ oldVersion }) => {
      const db = req.result;
      if (oldVersion < 1) {
        db.createObjectStore('inspections', { keyPath: 'id' });
        db.createObjectStore('items', { keyPath: 'id' }).createIndex('inspectionId', 'inspectionId');
        db.createObjectStore('settings');
      }
      if (oldVersion < 2) db.createObjectStore('media');
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

// Only the ids needed to find a record stay readable. Records saved before encryption have no
// `sealed` field and are read as they are until sealExisting has run.
async function seal({ thumb, ...value }) {
  const record = { id: value.id, sealed: await encryptJson(dataKey, value) };
  if (value.inspectionId) record.inspectionId = value.inspectionId;
  if (thumb) record.thumb = await encryptBytes(dataKey, thumb);
  return record;
}

async function unseal(record) {
  if (!record?.sealed) return record;
  const value = await decryptJson(dataKey, record.sealed);
  if (record.thumb) value.thumb = await decryptBytes(dataKey, record.thumb);
  return value;
}

export const getInspection = async (id) => unseal(await run('inspections', 'readonly', (s) => s.get(id)));
export async function putInspection(v) {
  const record = await seal(v);
  return run('inspections', 'readwrite', (s) => s.put(record));
}
export const allInspections = async () =>
  (await Promise.all((await run('inspections', 'readonly', (s) => s.getAll())).map(unseal)))
    .sort((a, b) => b.createdAt - a.createdAt);

export const getItem = async (id) => unseal(await run('items', 'readonly', (s) => s.get(id)));
export async function putItem(v) {
  const record = await seal(v);
  return run('items', 'readwrite', (s) => s.put(record));
}
export async function deleteItem(id) {
  await run('media', 'readwrite', (s) => {
    s.delete(photoKey(id));
    s.delete(audioKey(id));
  });
  await run('items', 'readwrite', (s) => s.delete(id));
}
export const itemsFor = async (inspectionId) =>
  (await Promise.all((await run('items', 'readonly', (s) => s.index('inspectionId').getAll(inspectionId))).map(unseal)))
    .sort((a, b) => a.createdAt - b.createdAt);

export async function deleteInspection(id) {
  for (const item of await itemsFor(id)) await deleteItem(item.id);
  await run('inspections', 'readwrite', (s) => s.delete(id));
}

// Photos and audio live apart from notes as plain bytes. On iPhones, saving a stored Blob again can
// leave it unreadable until the app restarts, so note edits must never touch them.
export const photoKey = (id) => `${id}:photo`;
export const audioKey = (id) => `${id}:audio`;

export async function putMedia(key, blob) {
  const sealed = await encryptBytes(dataKey, await blob.arrayBuffer());
  await run('media', 'readwrite', (s) => s.put({ ...sealed, type: blob.type }, key));
}

export async function getMedia(key) {
  const media = await run('media', 'readonly', (s) => s.get(key));
  if (!media) return media;
  const buffer = media.buffer ?? await decryptBytes(dataKey, media);
  return new Blob([buffer], { type: media.type });
}

export async function getSetting(k) {
  const value = await run('settings', 'readonly', (s) => s.get(k));
  return value?.sealed ? decryptJson(dataKey, value.sealed) : value;
}

export async function setSetting(k, v) {
  const value = SECRET_SETTINGS.includes(k) ? { sealed: await encryptJson(dataKey, v ?? '') } : v;
  await run('settings', 'readwrite', (s) => s.put(value, k));
}

// Encrypts anything saved before the PIN lock existed. Safe to repeat if it's interrupted.
export async function sealExisting() {
  for (const store of ['inspections', 'items']) {
    for (const record of await run(store, 'readonly', (s) => s.getAll())) {
      if (record.sealed || record.photo) continue; // a record still holding a Blob hasn't been migrated
      const sealed = await seal(record);
      await run(store, 'readwrite', (s) => s.put(sealed));
    }
  }
  for (const key of await run('media', 'readonly', (s) => s.getAllKeys())) {
    const media = await run('media', 'readonly', (s) => s.get(key));
    if (!media.buffer) continue;
    const sealed = await encryptBytes(dataKey, media.buffer);
    await run('media', 'readwrite', (s) => s.put({ ...sealed, type: media.type }, key));
  }
  for (const key of SECRET_SETTINGS) {
    const value = await getSetting(key);
    if (value !== undefined) await setSetting(key, value);
  }
}
