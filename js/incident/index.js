// Entry point for incident mode. app.js hands over its shared helpers and sends "#/inc/..." routes here.
import { S, TOP, SCREENS, loadUser, load, forget, go, href, refreshStrip, syncSoon } from './ui-core.js';
import * as store from './store.js';
import { renderHome } from './ui-stage1.js';

export { renderHome };

export function init(shell) {
  S.shell = shell;
  const connectionChanged = () => {
    if (!S.inc || !location.hash.startsWith('#/inc/')) {
      if (location.hash === '#/inc' && shell.unlocked()) shell.rerender();
      return;
    }
    refreshStrip();
    syncSoon(200);
  };
  window.addEventListener('online', connectionChanged);
  window.addEventListener('offline', connectionChanged);
}

export async function unlock(key) {
  store.setDataKey(key);
  await loadUser();
}

export function lock() {
  store.setDataKey(null);
  forget();
}

// parts: everything after "#/inc/", for example ['new'] or [incidentId, 's1', 'danger'].
export async function route(parts) {
  const [first, ...rest] = parts;
  if (TOP[first]) return TOP[first](rest);
  const inc = await load(first);
  if (!inc) return go('#/inc');
  const handler = SCREENS[rest.slice(0, 2).join('/')] ?? SCREENS[rest[0] ?? ''];
  if (!handler) return go(href(inc, inc.stage === 1 ? 's1' : ''));
  return handler(inc, rest);
}
