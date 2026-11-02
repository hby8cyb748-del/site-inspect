// A random data key encrypts everything saved on the phone. The PIN only protects that key,
// so changing the PIN doesn't need every record to be re-encrypted.
const ITERATIONS = 600000;
const ALGORITHM = { name: 'AES-GCM' };
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

async function pinKey(pin, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { ...ALGORITHM, length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

export async function lockKey(pin, dataKey) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrapped = await crypto.subtle.wrapKey('raw', dataKey, await pinKey(pin, salt, ITERATIONS), { ...ALGORITHM, iv });
  return { salt, iv, wrapped, iterations: ITERATIONS };
}

export const createDataKey = () =>
  crypto.subtle.generateKey({ ...ALGORITHM, length: 256 }, true, ['encrypt', 'decrypt']);

// Rejects if the PIN is wrong, because AES-GCM checks the wrapped key hasn't been opened with the wrong key.
export async function unlockKey(pin, { salt, iv, wrapped, iterations }) {
  const key = await pinKey(pin, salt, iterations);
  return crypto.subtle.unwrapKey('raw', wrapped, key, { ...ALGORITHM, iv }, ALGORITHM, true, ['encrypt', 'decrypt']);
}

export async function encryptBytes(key, data) {
  const iv = randomBytes(12);
  return { iv, data: await crypto.subtle.encrypt({ ...ALGORITHM, iv }, key, data) };
}

export const decryptBytes = (key, { iv, data }) => crypto.subtle.decrypt({ ...ALGORITHM, iv }, key, data);

export const encryptJson = (key, value) => encryptBytes(key, encoder.encode(JSON.stringify(value)));

export const decryptJson = async (key, sealed) => JSON.parse(decoder.decode(await decryptBytes(key, sealed)));
