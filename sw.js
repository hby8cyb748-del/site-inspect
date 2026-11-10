// Keeps the app itself available with no signal. Bump VERSION when files change.
const VERSION = 'v12';
// Named after where this copy of the app lives, so two copies on one web address never share a cache.
const CACHE = `${VERSION}:${self.registration.scope}`;
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png',
  'js/app.js', 'js/ai.js', 'js/crypto.js', 'js/db.js', 'js/docx.js', 'js/whisper.js', 'js/whisper-worker.js',
  'js/incident/index.js', 'js/incident/model.js', 'js/incident/workflow.js', 'js/incident/store.js', 'js/incident/adapter.js',
  'js/incident/ui-core.js', 'js/incident/ui-stage1.js', 'js/incident/ui-evidence.js', 'js/incident/ui-overview.js',
  'js/incident/ui-stage2.js',
  'vendor/transformers.min.js', 'vendor/ort-wasm-simd-threaded.mjs', 'vendor/ort-wasm-simd-threaded.wasm',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's copy, or an update could keep old code for good.
  const fresh = FILES.map((f) => new Request(f, { cache: 'reload' }));
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(fresh)).then(() => self.skipWaiting()));
});

// True if a cache was filled by this copy of the app. Another copy of the app on the same web address
// (for example a trial version in a different folder) keeps its own cache, and it must not be removed.
async function isOurs(name) {
  const [first] = await (await caches.open(name)).keys();
  return !first || first.url.startsWith(self.registration.scope);
}

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map(async (k) => (await isOurs(k)) && caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit ?? fetch(e.request)));
});
