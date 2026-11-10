import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The app only works with no signal if every file it loads is in the service worker's list.
test('every app file is in the offline cache list', () => {
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const listed = new Set([...sw.matchAll(/'([^']+\.(?:js|mjs|wasm|css|html|png|webmanifest))'/g)].map((m) => m[1]));
  const files = [
    'index.html', 'style.css', 'manifest.webmanifest',
    ...fs.readdirSync(new URL('../js/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`),
    ...fs.readdirSync(new URL('../js/incident/', import.meta.url)).map((f) => `js/incident/${f}`),
    ...fs.readdirSync(new URL('../vendor/', import.meta.url)).map((f) => `vendor/${f}`),
  ];
  for (const file of files) assert.ok(listed.has(file), `${file} is missing from FILES in sw.js`);
});

test('the security policy still only allows the two AI services', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const policy = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /script-src 'self'(;|$)/);
  assert.match(policy, /connect-src 'self' https:\/\/api\.anthropic\.com https:\/\/api\.openai\.com(;|$)/);
});
