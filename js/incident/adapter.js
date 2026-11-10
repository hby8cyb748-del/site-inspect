// PLACEHOLDERS. Nothing in this file talks to a real system.
// It stands in for sign-in, background synchronisation and the INX incident system, so the rest of the
// app can be built and tried. A real version replaces the bodies of these functions and keeps their shape.

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const isOnline = () => navigator.onLine !== false;

// Sign-in placeholder: accepts any name and role. There is no password and no server check.
export function signIn(name, role) {
  return { name: name.trim(), role, placeholder: true };
}

// Sync placeholder: pretends to send queued changes when the phone is online. Nothing leaves the phone.
export async function syncIncident(inc, { fail = false } = {}) {
  if (!isOnline()) return { ok: false, reason: 'offline' };
  await pause(300);
  if (fail) return { ok: false, reason: 'The mock server refused the changes (simulated failure).' };
  return { ok: true, at: Date.now(), sent: inc.sync.pending };
}

// INX placeholder: receives the export package and answers with an acknowledgement, or fails on request.
export async function submitToInx(payload, { fail = false } = {}) {
  if (!isOnline()) throw new Error('No connection. The export is still waiting on this phone.');
  await pause(700);
  if (fail) throw new Error('The mock INX service rejected the export (simulated failure).');
  return { ack: `MOCK-ACK-${payload.reference}-${Date.now().toString(36).toUpperCase()}`, receivedAt: Date.now() };
}
