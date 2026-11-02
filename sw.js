// Keeps the app itself available with no signal. Bump VERSION when files change.
const VERSION = 'v3';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png',
  'js/app.js', 'js/ai.js', 'js/db.js', 'js/docx.js', 'js/whisper.js', 'js/whisper-worker.js',
  'vendor/transformers.min.js', 'vendor/ort-wasm-simd-threaded.mjs', 'vendor/ort-wasm-simd-threaded.wasm',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit ?? fetch(e.request)));
});
