// Loads the demonstration scenarios from Settings › Incident settings. Everything loaded is synthetic.
import * as M from './model.js';
import * as store from './store.js';
import { SCENARIOS, buildScenario } from './demo.js';
import { S, esc, go, forget } from './ui-core.js';
import { SETTINGS_EXTRAS } from './ui-overview.js';

// A stand-in picture for demo evidence, so photos, mark-up copies and Word export can be tried.
async function placeholder(label, number) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 900;
  const pen = canvas.getContext('2d');
  pen.fillStyle = '#d9dde3';
  pen.fillRect(0, 0, 1200, 900);
  pen.strokeStyle = '#9aa3ad';
  pen.lineWidth = 6;
  pen.strokeRect(30, 30, 1140, 840);
  pen.fillStyle = '#14181d';
  pen.textAlign = 'center';
  pen.font = 'bold 54px sans-serif';
  pen.fillText('SYNTHETIC DEMO IMAGE', 600, 200);
  pen.font = '36px sans-serif';
  pen.fillText(`${number} — not a real photograph`, 600, 270);
  pen.font = '40px sans-serif';
  const words = label.split(' ');
  let line = '';
  let y = 430;
  for (const word of words) {
    if (pen.measureText(`${line} ${word}`).width > 1000) {
      pen.fillText(line, 600, y);
      line = word;
      y += 56;
    } else line = `${line} ${word}`.trim();
  }
  pen.fillText(line, 600, y);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function loadScenario(key) {
  const inc = buildScenario(key);
  const loader = { by: 'Demo loader', role: 'advisor', at: inc.updatedAt };
  for (const e of M.records(inc, 'evidence').filter((x) => x.demoImage)) {
    const blob = await placeholder(e.demoImage, e.number);
    const mediaId = crypto.randomUUID();
    const mediaKey = store.mediaKey(inc.id, mediaId);
    const thumbKey = store.mediaKey(inc.id, mediaId, 'thumb');
    await store.putMedia(mediaKey, blob);
    const { bytes } = await S.shell.toJpeg(blob, 480, 0.7);
    await store.putMedia(thumbKey, new Blob([bytes], { type: 'image/jpeg' }));
    M.updateRecord(inc, loader, 'evidence', e.id, { mediaKey, thumbKey, mediaType: 'image/jpeg', fileName: `${e.number}-demo.jpg`, size: blob.size, sha256: await sha256(await blob.arrayBuffer()) });
  }
  await store.saveIncident(inc);
  return inc;
}

SETTINGS_EXTRAS.push(async () => {
  const loaded = new Map((await store.allIncidents()).filter((i) => i.demo).map((i) => [i.demoKey, i]));
  return {
    html: `<h2>Demo scenarios</h2>
      <p class="muted">Four ready-made incidents for trying the app. Every name, company, place and event in them is invented. They are marked "Demo" wherever they appear.</p>
      ${Object.entries(SCENARIOS).map(([key, s]) => `<div class="answered">
        <p><strong>${esc(s.title)}</strong></p>
        <p class="muted">${esc(s.about)}</p>
        <div class="row">
          ${loaded.has(key) ? `<a class="button small" href="#/inc/${loaded.get(key).id}">Open</a>` : ''}
          <button class="small" data-act="demo-load" data-k="${key}">${loaded.has(key) ? 'Load a fresh copy' : 'Load this scenario'}</button>
        </div>
      </div>`).join('')}
      ${loaded.size ? '<div class="stack" style="margin-top:10px"><button class="danger" data-act="demo-remove">Remove all demo incidents from this phone</button></div>' : ''}`,
    handlers: {
      'demo-load': async (el) => {
        el.disabled = true;
        el.textContent = 'Loading…';
        const old = loaded.get(el.dataset.k);
        if (old) await store.deleteIncident(old.id);
        forget();
        const inc = await loadScenario(el.dataset.k);
        go(`#/inc/${inc.id}`);
      },
      'demo-remove': async () => {
        if (!confirm('Remove all demo incidents from this phone? Your own incidents are not touched.')) return;
        for (const inc of loaded.values()) await store.deleteIncident(inc.id);
        forget();
        await S.shell.rerender();
      },
    },
  };
});
