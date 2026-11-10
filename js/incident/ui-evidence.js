// Capturing and viewing evidence. The original file is stored once, encrypted, and never written again.
// A mark-up is saved as a new evidence item that points back at the original.
import * as M from './model.js';
import * as W from './workflow.js';
import * as store from './store.js';
import { S, SCREENS, RECORD_EXTRAS, esc, go, href, act, screen, frame, toast, dateTime, labelOf } from './ui-core.js';

const THUMB_EDGE = 480;
const MARKUP_EDGE = 1600;
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function kindOf(type) {
  if (type.startsWith('image/')) return 'Photograph';
  if (type.startsWith('video/')) return 'Video';
  if (type.startsWith('audio/')) return 'Audio';
  return 'Document';
}

// Stores the file first, then adds the evidence record that points to it.
export async function addEvidenceFile(file, preset = {}) {
  const inc = S.inc;
  const buffer = await file.arrayBuffer();
  const blob = new Blob([buffer], { type: file.type });
  const mediaId = crypto.randomUUID();
  const mediaKey = store.mediaKey(inc.id, mediaId);
  await store.putMedia(mediaKey, blob);
  let thumbKey = null;
  if (file.type.startsWith('image/')) {
    try {
      const { bytes } = await S.shell.toJpeg(blob, THUMB_EDGE, 0.7);
      thumbKey = store.mediaKey(inc.id, mediaId, 'thumb');
      await store.putMedia(thumbKey, new Blob([bytes], { type: 'image/jpeg' }));
    } catch {
      thumbKey = null; // some photo formats cannot be previewed; the original is still stored
    }
  }
  // The fingerprint proves later that the stored original has not changed.
  const fingerprint = await sha256(buffer);
  let rec;
  await act((i, c) => {
    rec = M.addRecord(i, c, 'evidence', {
      kind: kindOf(file.type),
      source: 'Captured or attached in this app',
      preserved: 'app',
      ...preset,
      mediaKey,
      thumbKey,
      mediaType: file.type,
      fileName: file.name || 'capture',
      size: file.size,
      sha256: fingerprint,
    });
  }, false);
  return rec;
}

export async function thumbUrl(rec) {
  const blob = rec.thumbKey ? await store.getMedia(rec.thumbKey) : null;
  return blob ? S.shell.urlFor(blob) : null;
}

// Fills every [data-thumb] placeholder on the screen once its photo has been decrypted.
export async function fillThumbs(inc) {
  for (const el of S.shell.app.querySelectorAll('[data-thumb]')) {
    const rec = M.record(inc, 'evidence', el.dataset.thumb);
    const url = rec && await thumbUrl(rec);
    if (url && el.isConnected) el.innerHTML = `<img src="${url}" alt="${esc(rec.number)}">`;
  }
}

RECORD_EXTRAS.evidence = {
  summary: (inc, r) => `${esc(r.kind ?? 'Item')} · ${esc(labelOf(W.EVIDENCE_STATUS, r.status))} · ${dateTime(r.capturedAt)}${r.restriction && r.restriction !== 'none' ? ' · restricted' : ''}`,
  top: (inc, r) => {
    const source = r.derivedFrom && M.record(inc, 'evidence', r.derivedFrom);
    const copies = M.records(inc, 'evidence').filter((e) => e.derivedFrom === r.id);
    return `<div data-role="media"></div>
      ${r.mediaKey ? `<p class="muted">Original file: ${esc(r.fileName)} · ${kb(r.size ?? 0)}${r.sha256 ? ` · fingerprint ${esc(r.sha256.slice(0, 12))}…` : ''}. Stored unchanged. It cannot be replaced or edited here.</p>`
        : '<p class="muted">No file is attached. This is a reference to evidence held elsewhere, or evidence still to be obtained.</p>'}
      ${source ? `<p>Marked-up copy of <a href="${href(inc, `r/evidence/${source.id}`)}">${esc(source.number)}</a>. The original is unchanged.</p>` : ''}
      ${copies.length ? `<p>Marked-up copies: ${copies.map((c) => `<a href="${href(inc, `r/evidence/${c.id}`)}">${esc(c.number)}</a>`).join(', ')}</p>` : ''}
      <div data-role="caption"></div>
      <div class="stack">
        ${r.mediaKey && r.mediaType?.startsWith('audio/') ? '' : '<button data-act="caption">Record a voice caption</button>'}
        ${(r.mediaType?.startsWith('audio/') || r.captionKey) ? `<button data-act="transcribe">${r.transcript ? 'Transcribe again' : 'Transcribe the recording'}</button>` : ''}
        ${r.mediaType?.startsWith('image/') ? `<a class="button" href="${href(inc, `markup/${r.id}`)}">Mark up a copy</a>` : ''}
        ${r.mediaKey ? '<button data-act="share-original">Share or save the original</button>' : '<button data-act="attach">Attach the file</button>'}
        <p class="error" data-role="media-error" hidden></p>
        <div class="progress" data-role="media-progress" hidden></div>
      </div>`;
  },
  async after(inc, r) {
    const slot = S.shell.app.querySelector('[data-role=media]');
    if (!slot) return;
    const blob = r.mediaKey && await store.getMedia(r.mediaKey);
    if (blob && slot.isConnected) {
      const url = S.shell.urlFor(blob);
      if (r.mediaType.startsWith('image/')) slot.innerHTML = `<img class="photo" src="${url}" alt="${esc(r.number)}">`;
      else if (r.mediaType.startsWith('audio/')) slot.innerHTML = `<audio controls src="${url}"></audio>`;
      else if (r.mediaType.startsWith('video/')) slot.innerHTML = `<video class="photo" controls playsinline src="${url}"></video>`;
    }
    const caption = r.captionKey && await store.getMedia(r.captionKey);
    const captionSlot = S.shell.app.querySelector('[data-role=caption]');
    if (caption && captionSlot?.isConnected) captionSlot.innerHTML = `<p class="label">Voice caption</p><audio controls src="${S.shell.urlFor(caption)}"></audio>`;
  },
  handlers: (inc, r) => {
    const fail = (message) => {
      const el = S.shell.app.querySelector('[data-role=media-error]');
      el.textContent = message;
      el.hidden = false;
    };
    return {
      caption: (el) => S.shell.recordAudio(el, async (blob) => {
        const captionKey = store.mediaKey(inc.id, crypto.randomUUID(), 'caption');
        await store.putMedia(captionKey, blob);
        await act((i, c) => M.updateRecord(i, c, 'evidence', r.id, { captionKey, transcript: '' }));
      }, fail),
      transcribe: async () => {
        const progress = S.shell.app.querySelector('[data-role=media-progress]');
        const say = (text) => { progress.hidden = false; progress.textContent = text; };
        try {
          const audio = await store.getMedia(r.mediaType?.startsWith('audio/') ? r.mediaKey : r.captionKey);
          const text = await S.shell.whileBusy(() => S.shell.transcribeBlob(audio, say));
          await act((i, c) => M.updateRecord(i, c, 'evidence', r.id, { transcript: text || '(no speech detected)' }));
        } catch (err) {
          progress.hidden = true;
          fail(`The recording could not be transcribed. ${err.message} You can type the words into the transcript box instead.`);
        }
      },
      'share-original': async () => {
        const blob = await store.getMedia(r.mediaKey);
        await S.shell.deliver(new File([blob], r.fileName || `${r.number}`, { type: r.mediaType }));
      },
      attach: () => S.shell.chooseFile(async (file) => {
        const buffer = await file.arrayBuffer();
        const mediaKey = store.mediaKey(inc.id, crypto.randomUUID());
        await store.putMedia(mediaKey, new Blob([buffer], { type: file.type }));
        const fingerprint = await sha256(buffer);
        await act((i, c) => M.updateRecord(i, c, 'evidence', r.id, { mediaKey, mediaType: file.type, fileName: file.name, size: file.size, sha256: fingerprint, preserved: 'app', status: 'obtained' }));
      }),
    };
  },
};

// Mark-up: draw on a copy of a photo. Saving makes a new evidence item; the original is untouched.
SCREENS.markup = async (inc, [, id]) => {
  const rec = M.record(inc, 'evidence', id);
  if (!rec?.mediaType?.startsWith('image/')) return go(href(inc));
  const back = href(inc, `r/evidence/${id}`);
  screen(frame(inc, `Mark up a copy of ${rec.number}`, back, `
    <p class="muted">Draw with your finger to circle or point. This saves a separate copy. ${esc(rec.number)} itself is never changed.</p>
    <canvas class="markup"></canvas>
    <label>What does the mark-up show? <input name="note" autocomplete="off" placeholder="For example: missing mid-rail circled"></label>
    <div class="stack" style="margin-top:12px">
      <button class="primary big" data-act="markup-save">Save as a separate copy</button>
      <button data-act="markup-clear">Clear my marks</button>
      <a class="button" href="${back}">Cancel</a>
    </div>`), {
    'markup-clear': () => draw(),
    'markup-save': async (el) => {
      el.disabled = true;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      const note = S.shell.app.querySelector('[name=note]').value.trim();
      const copy = await addEvidenceFile(new File([blob], `${rec.number}-markup.jpg`, { type: 'image/jpeg' }), {
        kind: 'Photograph',
        description: `Marked-up copy of ${rec.number}${note ? `: ${note}` : ''}`,
        derivedFrom: rec.id,
        source: `Copy of ${rec.number}, marked up in this app`,
        location: rec.location ?? '',
        capturedAt: Date.now(),
      });
      toast(`Saved as ${copy.number}. ${rec.number} is unchanged.`);
      go(href(inc, `r/evidence/${copy.id}`));
    },
  });
  const canvas = S.shell.app.querySelector('canvas.markup');
  const { bytes, width, height } = await S.shell.toJpeg(await store.getMedia(rec.mediaKey), MARKUP_EDGE, 0.92);
  const image = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
  canvas.width = width;
  canvas.height = height;
  const pen = canvas.getContext('2d');
  const draw = () => pen.drawImage(image, 0, 0, width, height);
  draw();
  let last = null;
  const point = (e) => {
    const box = canvas.getBoundingClientRect();
    return { x: (e.clientX - box.left) * (width / box.width), y: (e.clientY - box.top) * (height / box.height) };
  };
  canvas.onpointerdown = (e) => { last = point(e); canvas.setPointerCapture(e.pointerId); };
  canvas.onpointerup = () => { last = null; };
  canvas.onpointercancel = canvas.onpointerup;
  canvas.onpointermove = (e) => {
    if (!last) return;
    const next = point(e);
    pen.strokeStyle = '#ff2d2d';
    pen.lineWidth = Math.max(4, width / 160);
    pen.lineCap = 'round';
    pen.beginPath();
    pen.moveTo(last.x, last.y);
    pen.lineTo(next.x, next.y);
    pen.stroke();
    last = next;
  };
};
