import * as db from './db.js';
import { transcribe, draftReport } from './ai.js';
import { buildDocx } from './docx.js';
import { MODELS, DEFAULT_MODEL, loadWhisper, transcribeOnPhone, releaseWhisper } from './whisper.js';

const app = document.getElementById('app');
const camera = document.getElementById('camera');
const MAX_AI_PHOTOS = 100; // API limit on images in one request
const RISKS = ['Low', 'Medium', 'High', 'Critical'];
const COPILOT_PROMPT = `You are helping a workplace safety professional. The attached document contains numbered site inspection photos, each followed by the inspector's notes. Look at every photo and write a site inspection report with a summary, findings, risk ratings, recommended actions and timeframes. Refer to photos by number. Use only the document as evidence and keep the inspector's judgement. Do not invent facts or cite regulations unless the notes do. If you cannot view a photo, say so. Mark anything you add from a photo as "AI-suggested". Risk ratings and timeframes are suggestions for the inspector to review.`;

let objectUrls = [];
let recorder = null;
let busy = false;
let startupNotice = '';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const today = () => new Date().toLocaleDateString('en-CA'); // yyyy-mm-dd in local time
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const urlFor = (blob) => {
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  return url;
};
const go = (hash) => { location.hash = hash; };

function header(title, back) {
  return `<header class="top">
    ${back ? `<a class="button icon" href="${back}" aria-label="Back" style="width:auto;border:0;background:none">‹ Back</a>` : ''}
    <h1>${esc(title)}</h1>
  </header>`;
}

// Screens

async function homeScreen() {
  const inspections = await db.allInspections();
  const counts = await Promise.all(inspections.map(async (i) => (await db.itemsFor(i.id)).length));
  app.innerHTML = `
    <header class="top"><h1>Site Inspect</h1><a class="button icon" href="#/settings" style="width:auto;border:0;background:none">Settings</a></header>
    <button class="primary big" data-action="new">New inspection</button>
    <h2>Inspections</h2>
    ${inspections.length ? inspections.map((i, n) => `
      <a class="card" href="#/i/${i.id}">
        <strong>${esc(i.site)}${i.area ? ` — ${esc(i.area)}` : ''}</strong>
        <span class="muted">${esc(i.date)} · ${counts[n]} photo${counts[n] === 1 ? '' : 's'} · ${i.report ? 'Report ready' : i.finished ? 'Finished' : 'In progress'}</span>
      </a>`).join('') : '<p class="muted">Nothing yet. Start your first inspection above.</p>'}`;
  app.querySelector('[data-action=new]').onclick = () => go('#/new');
}

async function newScreen() {
  const inspector = (await db.getSetting('inspector')) ?? '';
  app.innerHTML = `${header('New inspection', '#/')}
    <form class="stack" id="form">
      <label>Site <input name="site" required autocomplete="off" placeholder="e.g. Northside Plant"></label>
      <label>Area <input name="area" autocomplete="off" placeholder="e.g. Loading bay (optional)"></label>
      <label>Inspector <input name="inspector" value="${esc(inspector)}" autocomplete="name"></label>
      <label>Date <input name="date" type="date" value="${today()}" required></label>
      <button class="primary big" style="margin-top:20px">Start inspection</button>
    </form>`;
  app.querySelector('#form').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const inspection = {
      id: crypto.randomUUID(),
      site: data.site.trim(),
      area: data.area.trim(),
      inspector: data.inspector.trim(),
      date: data.date,
      createdAt: Date.now(),
      finished: false,
      report: null,
    };
    await db.putInspection(inspection);
    await db.setSetting('inspector', inspection.inspector);
    go(`#/i/${inspection.id}`);
  };
}

async function inspectionScreen(id) {
  const inspection = await db.getInspection(id);
  if (!inspection) return go('#/');
  const items = await db.itemsFor(id);
  app.innerHTML = `${header(inspection.site, '#/')}
    <p class="muted">${esc(inspection.area)}${inspection.area ? ' · ' : ''}${esc(inspection.date)} · ${items.length} photo${items.length === 1 ? '' : 's'}</p>
    <div class="stack">
      <button class="primary big" data-action="photo">Take photo</button>
      <button data-action="finish" ${items.length ? '' : 'disabled'}>${inspection.report ? 'View report' : 'Finish inspection'}</button>
    </div>
    <div class="grid">
      ${items.map((item, n) => `<a class="thumb" href="#/i/${id}/${item.id}">
        <img src="${urlFor(item.photo)}" alt="Photo ${n + 1}">
        <span>${n + 1}${item.audio ? ' 🎙' : ''}${item.note ? ' ✎' : ''}</span>
      </a>`).join('')}
    </div>
    <div style="margin-top:32px"><button class="danger" data-action="delete">Delete inspection</button></div>`;
  app.querySelector('[data-action=photo]').onclick = () => openCamera(id);
  app.querySelector('[data-action=finish]').onclick = async () => {
    inspection.finished = true;
    await db.putInspection(inspection);
    go(`#/i/${id}/report`);
  };
  app.querySelector('[data-action=delete]').onclick = async () => {
    if (!confirm(`Delete this inspection and its ${items.length} photos? This can't be undone.`)) return;
    await db.deleteInspection(id);
    go('#/');
  };
}

async function itemScreen(id, itemId) {
  const item = await db.getItem(itemId);
  if (!item) return go(`#/i/${id}`);
  const items = await db.itemsFor(id);
  const number = items.findIndex((i) => i.id === itemId) + 1;
  app.innerHTML = `${header(`Photo ${number}`, `#/i/${id}`)}
    <img class="photo" src="${urlFor(item.photo)}" alt="Photo ${number}">
    <div class="stack" style="margin-top:12px">
      <button class="primary big" data-action="record">${item.audio ? 'Re-record note' : 'Record note'}</button>
      <p class="error" data-role="record-error" hidden></p>
    </div>
    ${item.audio ? `<audio controls src="${urlFor(item.audio)}"></audio>` : ''}
    ${item.transcript ? `<label>Transcript <textarea data-field="transcript">${esc(item.transcript)}</textarea></label>` : ''}
    <label>Typed note (optional) <textarea data-field="note" placeholder="Or tap the mic on your keyboard to dictate">${esc(item.note)}</textarea></label>
    <div class="stack" style="margin-top:16px">
      <button class="big" data-action="next">Next photo</button>
      <a class="button" href="#/i/${id}">Done with this photo</a>
      <button class="danger" data-action="delete">Delete photo</button>
    </div>`;

  app.querySelectorAll('[data-field]').forEach((field) => {
    field.oninput = async () => {
      const fresh = await db.getItem(itemId);
      fresh[field.dataset.field] = field.value;
      await db.putItem(fresh);
    };
  });
  app.querySelector('[data-action=record]').onclick = (e) => toggleRecording(e.target, id, itemId);
  app.querySelector('[data-action=next]').onclick = () => openCamera(id);
  app.querySelector('[data-action=delete]').onclick = async () => {
    if (!confirm('Delete this photo and its note?')) return;
    await db.deleteItem(itemId);
    go(`#/i/${id}`);
  };
}

async function reportScreen(id) {
  const inspection = await db.getInspection(id);
  if (!inspection) return go('#/');
  const items = await db.itemsFor(id);
  if (!inspection.report) return reportStartScreen(inspection, items);

  const { report } = inspection;
  app.innerHTML = `${header('Review report', `#/i/${id}`)}
    <div class="notice">Check every finding before sending. Ratings and timeframes are suggestions${report.findings.some((f) => f.source === 'ai_observation') ? ', and anything marked "AI-suggested" did not come from your notes' : ''}.</div>
    <div class="stack" style="margin-top:12px">
      <button class="primary big" data-action="word">Save Word document</button>
      <p class="error" data-role="error" hidden></p>
    </div>
    <h2>Summary</h2>
    <textarea data-path="executive_summary" rows="6" aria-label="Summary">${esc(report.executive_summary)}</textarea>
    <h2>Findings (${report.findings.length})</h2>
    ${report.findings.map((f, n) => `<section class="finding">
      <span class="tag ${f.risk.toLowerCase()}">${esc(f.risk)}</span>
      ${f.source === 'ai_observation' ? '<span class="tag ai">AI-suggested</span>' : ''}
      ${f.photos.map((p) => items[p - 1] ? `<img src="${urlFor(items[p - 1].photo)}" alt="Photo ${p}">` : '').join('')}
      <p class="muted">${f.photos.length ? `Photo ${f.photos.join(', ')}` : 'No photo'}</p>
      <label>Title <input data-path="findings.${n}.title" value="${esc(f.title)}"></label>
      <label>Risk rating <select data-path="findings.${n}.risk">${RISKS.map((r) => `<option ${r === f.risk ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <label>Hazard type <input data-path="findings.${n}.hazard_type" value="${esc(f.hazard_type)}"></label>
      <label>Observation <textarea data-path="findings.${n}.description">${esc(f.description)}</textarea></label>
      <label>Recommended action <textarea data-path="findings.${n}.action">${esc(f.action)}</textarea></label>
      <label>Timeframe <input data-path="findings.${n}.timeframe" value="${esc(f.timeframe)}"></label>
      <div style="margin-top:12px"><button class="danger" data-remove="${n}">Remove finding</button></div>
    </section>`).join('')}
    <h2>Start over</h2>
    <button data-action="redo">Discard this draft</button>`;

  app.querySelectorAll('[data-path]').forEach((el) => {
    el.onchange = async () => {
      const keys = el.dataset.path.split('.');
      const last = keys.pop();
      keys.reduce((o, k) => o[k], report)[last] = el.value;
      await db.putInspection(inspection);
      if (last === 'risk') return reportScreen(id);
      resetWordButton();
    };
  });
  app.querySelectorAll('[data-remove]').forEach((el) => {
    el.onclick = async () => {
      if (!confirm('Remove this finding?')) return;
      report.findings.splice(Number(el.dataset.remove), 1);
      await db.putInspection(inspection);
      reportScreen(id);
    };
  });
  // Any edit makes an already-built document out of date.
  const resetWordButton = () => {
    const button = app.querySelector('[data-action=word]');
    button.textContent = 'Save Word document';
    button.onclick = () => saveWord(inspection, items);
  };
  resetWordButton();
  app.querySelector('[data-action=redo]').onclick = async () => {
    if (!confirm('Discard this draft and any edits? Your photos and notes are kept.')) return;
    inspection.report = null;
    await db.putInspection(inspection);
    reportScreen(id);
  };
}

async function reportStartScreen(inspection, items) {
  const audioCount = items.filter((i) => i.audio).length;
  const engine = (await db.getSetting('transcribeWith')) ?? 'phone';
  app.innerHTML = `${header('Create report', `#/i/${inspection.id}`)}
    <p>${items.length} photo${items.length === 1 ? '' : 's'}, ${audioCount} audio note${audioCount === 1 ? '' : 's'}.</p>
    <div class="notice">
      <strong>Before you use AI:</strong> ${engine === 'openai'
        ? 'your audio goes to OpenAI for transcription, and your photos, notes and the site name go to Anthropic to write the report.'
        : 'your audio is transcribed on this phone, but the text of your notes, your photos and the site name go to Anthropic to write the report.'} Check this is allowed for the site. Nothing is sent until you tap the button below.
    </div>
    <div class="stack" style="margin-top:12px">
      <button class="primary big" data-action="ai">Create report with AI</button>
      <button data-action="plain">Create without AI</button>
      <button data-action="copilot">Prepare for Copilot</button>
    </div>
    <p class="muted">Without AI, nothing goes to Anthropic. You get one finding per photo using your notes${engine === 'openai' ? ', and any audio without text is left out' : ', transcribed on this phone'}.</p>
    <p class="muted">Prepare for Copilot makes a document of your photos and notes on this phone, for you to upload to Microsoft Copilot yourself.</p>
    <div class="progress" data-role="progress" hidden></div>
    <p class="error" data-role="error" hidden></p>
    <section data-role="copilot" hidden>
      <h2>Ready for Copilot</h2>
      <div class="stack">
        <button class="primary" data-action="copilot-share">1. Save or share document</button>
        <button data-action="copilot-copy">2. Copy prompt</button>
        <textarea readonly rows="7" aria-label="Copilot prompt">${esc(COPILOT_PROMPT)}</textarea>
      </div>
      <p class="muted">Save it somewhere your work account can reach, then upload it to Microsoft 365 Copilot and paste the prompt. Check Copilot actually read your photos.</p>
    </section>`;

  const progress = app.querySelector('[data-role=progress]');
  const say = (text) => { progress.hidden = false; progress.textContent = text; };
  // Returns false if the user chooses not to carry on without every transcript.
  const transcribeNotes = async () => {
    if (engine !== 'phone' || !items.some((i) => i.audio && !i.transcript)) return true;
    try {
      await whileBusy(() => transcribePending(items, say));
      progress.hidden = true;
      return true;
    } catch (err) {
      progress.hidden = true;
      return confirm(`Some audio couldn't be transcribed. (${err.message}) Carry on with the notes you have?`);
    }
  };

  app.querySelector('[data-action=ai]').onclick = () => createAiReport(inspection, items);
  app.querySelector('[data-action=plain]').onclick = async () => {
    if (busy || !await transcribeNotes()) return;
    inspection.report = notesReport(items, 'Low');
    await db.putInspection(inspection);
    reportScreen(inspection.id);
  };
  app.querySelector('[data-action=copilot]').onclick = async () => {
    if (busy || !await transcribeNotes()) return;
    const errorEl = app.querySelector('[data-role=error]');
    const section = app.querySelector('[data-role=copilot]');
    errorEl.hidden = true;
    section.hidden = true;
    try {
      say('Building document…');
      const file = await whileBusy(() => buildWordFile(inspection, items, notesReport(items, ''), {
        title: 'Inspection Photos and Notes',
        heading: 'Photos and notes',
        appendix: false,
        suffix: ' notes for Copilot',
      }));
      app.querySelector('[data-action=copilot-share]').onclick = () => deliver(file);
      section.hidden = false;
      progress.hidden = true;
    } catch (err) {
      progress.hidden = true;
      errorEl.textContent = `Couldn't build the document. ${err.message}`;
      errorEl.hidden = false;
    }
  };
  app.querySelector('[data-action=copilot-copy]').onclick = async (e) => {
    try {
      await navigator.clipboard.writeText(COPILOT_PROMPT);
      e.target.textContent = 'Prompt copied';
    } catch {
      e.target.textContent = 'Press and hold the text below to copy it';
    }
  };
}

function notesReport(items, risk) {
  return {
    executive_summary: '',
    findings: items.map((item, n) => ({
      title: `Photo ${n + 1}`,
      photos: [n + 1],
      description: [item.transcript, item.note].filter(Boolean).join(' — '),
      hazard_type: '',
      risk,
      action: '',
      timeframe: '',
      source: 'inspector',
    })),
    good_practice: [],
    next_steps: [],
  };
}

async function settingsScreen() {
  const [openaiKey, anthropicKey, inspector, transcribeWith, whisperModel] = await Promise.all(
    ['openaiKey', 'anthropicKey', 'inspector', 'transcribeWith', 'whisperModel'].map(db.getSetting));
  const engine = transcribeWith ?? 'phone';
  const model = whisperModel ?? DEFAULT_MODEL;
  let storage = '';
  if (navigator.storage?.estimate) {
    const { usage } = await navigator.storage.estimate();
    storage = `${(usage / 1048576).toFixed(0)} MB used on this phone.`;
  }
  app.innerHTML = `${header('Settings', '#/')}
    <label>Your name <input data-key="inspector" value="${esc(inspector)}" autocomplete="name"></label>
    <label>Transcribe audio with
      <select data-key="transcribeWith" data-rerender>
        <option value="phone" ${engine === 'phone' ? 'selected' : ''}>This phone (free, private)</option>
        <option value="openai" ${engine === 'openai' ? 'selected' : ''}>OpenAI (paid, sends audio)</option>
      </select>
    </label>
    ${engine === 'phone' ? `
      <label>Speech model (English only)
        <select data-key="whisperModel">
          ${Object.entries(MODELS).map(([id, label]) => `<option value="${id}" ${id === model ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </label>
      <div class="stack" style="margin-top:10px">
        <button data-action="download">Download speech model</button>
        <p class="muted" data-role="download-status">Do this once on Wi-Fi, before you need it on site. Your audio is not sent anywhere.</p>
      </div>` : `
      <label>OpenAI API key <input data-key="openaiKey" value="${esc(openaiKey)}" autocomplete="off" autocapitalize="off" spellcheck="false" type="password"></label>`}
    <label>Anthropic API key (writes the report) <input data-key="anthropicKey" value="${esc(anthropicKey)}" autocomplete="off" autocapitalize="off" spellcheck="false" type="password"></label>
    <p class="muted">Keys are stored only on this phone and only sent to their own service.</p>
    <p class="muted">${storage} Photos and audio are only on this phone. Saving the Word document is how you keep a copy elsewhere.</p>`;
  app.querySelectorAll('[data-key]').forEach((el) => {
    el.onchange = async () => {
      await db.setSetting(el.dataset.key, el.value.trim());
      if ('rerender' in el.dataset) settingsScreen();
    };
  });
  const download = app.querySelector('[data-action=download]');
  if (download) {
    download.onclick = async () => {
      const status = app.querySelector('[data-role=download-status]');
      const chosen = app.querySelector('[data-key=whisperModel]').value;
      download.disabled = true;
      status.textContent = 'Downloading…';
      try {
        await whileBusy(() => loadWhisper(chosen, (percent) => {
          status.textContent = `Downloading… ${percent}%`;
        }));
        status.textContent = 'Ready. Transcription will now work with no signal.';
      } catch (err) {
        status.textContent = `Download failed. Check your connection and try again. (${err.message})`;
      } finally {
        releaseWhisper();
        download.disabled = false;
      }
    };
  }
}

// Capture

function openCamera(inspectionId) {
  camera.dataset.inspection = inspectionId;
  camera.value = '';
  camera.click();
}

camera.onchange = async () => {
  const file = camera.files[0];
  if (!file) return;
  const item = {
    id: crypto.randomUUID(),
    inspectionId: camera.dataset.inspection,
    photo: new Blob([await file.arrayBuffer()], { type: file.type }),
    audio: null,
    transcript: '',
    note: '',
    createdAt: Date.now(),
  };
  await db.putItem(item);
  go(`#/i/${item.inspectionId}/${item.id}`);
};

function pickAudioType() {
  return ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
    .find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '';
}

async function toggleRecording(button, inspectionId, itemId) {
  if (recorder) { recorder.stop(); return; }
  const errorEl = app.querySelector('[data-role=record-error]');
  errorEl.hidden = true;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    errorEl.textContent = 'Microphone is blocked. Allow it in iPhone Settings, or type your note below.';
    errorEl.hidden = false;
    return;
  }
  const type = pickAudioType();
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks = [];
  const started = Date.now();
  const tick = setInterval(() => {
    const s = Math.floor((Date.now() - started) / 1000);
    button.textContent = `Stop recording  ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }, 500);
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = async () => {
    clearInterval(tick);
    stream.getTracks().forEach((t) => t.stop());
    recorder = null;
    const item = await db.getItem(itemId);
    if (item && chunks.length) {
      item.audio = new Blob(chunks, { type: rec.mimeType || 'audio/mp4' });
      item.transcript = '';
      await db.putItem(item);
    }
    if (location.hash === `#/i/${inspectionId}/${itemId}`) route();
  };
  rec.start();
  recorder = rec;
  button.classList.remove('primary');
  button.classList.add('recording');
  button.textContent = 'Stop recording  0:00';
  app.querySelector('[data-action=next]').disabled = true;
}

// Reports

// Safari can fail to read a stored photo directly, so copy it into memory and decode it as a normal image.
async function loadImage(blob) {
  const copy = new Blob([await blob.arrayBuffer()], { type: blob.type || 'image/jpeg' });
  const url = URL.createObjectURL(copy);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("A saved photo couldn't be opened."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
  return image;
}

async function toJpeg(blob, maxEdge, quality) {
  const image = await loadImage(blob);
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  return { bytes: new Uint8Array(await jpeg.arrayBuffer()), width: canvas.width, height: canvas.height };
}

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}

// Keeps the screen on and blocks a second run while long work happens.
async function whileBusy(work) {
  busy = true;
  let wakeLock = null;
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
  app.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    return await work();
  } finally {
    busy = false;
    wakeLock?.release();
    app.querySelectorAll('button').forEach((b) => { b.disabled = false; });
  }
}

// Note on readings: on iPhones, a stored photo or audio Blob can stop being readable once its
// note has been saved again. Always fetch the note just before reading its media.
async function transcribePending(items, say) {
  const needed = items.filter((i) => i.audio && !i.transcript);
  if (!needed.length) return;
  const [engine, openaiKey, whisperModel] = await Promise.all(
    ['transcribeWith', 'openaiKey', 'whisperModel'].map(db.getSetting));
  const useOpenAi = engine === 'openai';
  const model = whisperModel ?? DEFAULT_MODEL;
  // If the phone kills the app, this is still set at next launch so the app can explain what happened.
  await db.setSetting('transcribing', !useOpenAi);
  try {
    for (const [n, { id }] of needed.entries()) {
      const label = `audio note ${n + 1} of ${needed.length}`;
      const item = await db.getItem(id); // see the note on readings below
      let text;
      if (useOpenAi) {
        say(`Transcribing ${label}…`);
        text = await transcribe(item.audio, openaiKey);
      } else {
        say(`Loading the speech model for ${label}…`);
        await loadWhisper(model);
        say(`Transcribing ${label}…`);
        text = await transcribeOnPhone(item.audio, model);
        releaseWhisper(); // a fresh start for each note keeps memory from building up
      }
      item.transcript = text || '(no speech detected)';
      await db.putItem(item); // saved one at a time so a retry picks up where it stopped
      items.find((i) => i.id === id).transcript = item.transcript;
    }
  } finally {
    releaseWhisper();
    await db.setSetting('transcribing', false);
  }
}

async function createAiReport(inspection, items) {
  if (busy) return;
  const progress = app.querySelector('[data-role=progress]');
  const errorEl = app.querySelector('[data-role=error]');
  const say = (text) => { progress.hidden = false; progress.textContent = text; };
  const fail = (message) => {
    progress.hidden = true;
    errorEl.textContent = message;
    errorEl.hidden = false;
  };
  errorEl.hidden = true;

  const [engine, openaiKey, anthropicKey] = await Promise.all(
    ['transcribeWith', 'openaiKey', 'anthropicKey'].map(db.getSetting));
  const needsTranscripts = items.some((i) => i.audio && !i.transcript);
  if (needsTranscripts && engine === 'openai' && !openaiKey) return fail('Add your OpenAI key in Settings first.');
  if (!anthropicKey) return fail('Add your Anthropic key in Settings first.');
  if (items.length > MAX_AI_PHOTOS) return fail(`AI reports support up to ${MAX_AI_PHOTOS} photos. This inspection has ${items.length}.`);
  if (!navigator.onLine) return fail("You're offline. Your inspection is saved, so try again when you have signal.");

  try {
    await whileBusy(async () => {
      await transcribePending(items, say);

      const maxEdge = items.length > 30 ? 1100 : 1568;
      const photos = [];
      for (const [n, { id }] of items.entries()) {
        say(`Preparing photo ${n + 1} of ${items.length}…`);
        const item = await db.getItem(id);
        const { bytes } = await toJpeg(item.photo, maxEdge, 0.8);
        photos.push({ number: n + 1, transcript: item.transcript, note: item.note, base64: toBase64(bytes) });
      }

      say('Writing your report. This can take a few minutes, so keep the app open…');
      inspection.report = await draftReport({
        inspection,
        photos,
        key: anthropicKey,
        onActivity: () => say('Writing your report. Nearly there…'),
      });
      await db.putInspection(inspection);
    });
    reportScreen(inspection.id);
  } catch (err) {
    fail(err.message === 'Failed to fetch' || err.name === 'TypeError'
      ? 'Connection lost. Your inspection is saved, so try again.'
      : err.message);
  }
}

async function buildWordFile(inspection, items, report, { suffix = '', ...options } = {}) {
  const photos = [];
  for (const [n, { id }] of items.entries()) {
    const item = await db.getItem(id);
    const { bytes, width, height } = await toJpeg(item.photo, 1400, 0.8);
    photos.push({
      number: n + 1,
      time: clock(item.createdAt),
      transcript: item.transcript,
      note: item.note,
      jpeg: bytes,
      width,
      height,
    });
  }
  const blob = buildDocx({ inspection, report, photos, ...options });
  const name = `${inspection.date} ${inspection.site}${suffix}`.replace(/[^\w -]+/g, '').trim();
  return new File([blob], `${name}.docx`, { type: blob.type });
}

async function saveWord(inspection, items) {
  const button = app.querySelector('[data-action=word]');
  const errorEl = app.querySelector('[data-role=error]');
  errorEl.hidden = true;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Building document…';
  try {
    const file = await buildWordFile(inspection, items, inspection.report);
    button.textContent = 'Share or save document';
    button.disabled = false;
    // Building takes long enough that iOS no longer counts it as a tap, so share needs a second one.
    button.onclick = () => deliver(file);
    if (!navigator.canShare?.({ files: [file] })) deliver(file);
  } catch (err) {
    button.textContent = label;
    button.disabled = false;
    errorEl.textContent = `Couldn't build the document. ${err.message}`;
    errorEl.hidden = false;
  }
}

async function deliver(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      if (err.name !== 'AbortError') throw err;
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// Routing

async function route() {
  if (recorder) recorder.stop();
  objectUrls.forEach(URL.revokeObjectURL);
  objectUrls = [];
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'new') await newScreen();
  else if (parts[0] === 'settings') await settingsScreen();
  else if (parts[0] === 'i' && parts[2] === 'report') await reportScreen(parts[1]);
  else if (parts[0] === 'i' && parts[2]) await itemScreen(parts[1], parts[2]);
  else if (parts[0] === 'i') await inspectionScreen(parts[1]);
  else await homeScreen();
  if (startupNotice) {
    app.insertAdjacentHTML('afterbegin', `<div class="notice" style="margin-bottom:12px">${startupNotice}</div>`);
    startupNotice = '';
  }
}

async function start() {
  if (await db.getSetting('transcribing')) {
    await db.setSetting('transcribing', false);
    startupNotice = 'Transcription stopped before it finished, possibly because the phone ran low on memory or the app was closed. Finished notes are saved. Close other apps and tap the report button again to continue. If it keeps happening, choose the Small speech model in Settings.';
  }
  route();
}

window.addEventListener('hashchange', route);
navigator.storage?.persist?.();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
start();
