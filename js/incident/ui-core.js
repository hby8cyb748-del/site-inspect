// Shared pieces for every incident screen: the current incident, saving, the status strip, the
// question / form / list renderers and the pop-up sheet. Screens register themselves in SCREENS.
import * as M from './model.js';
import * as W from './workflow.js';
import * as store from './store.js';
import * as adapter from './adapter.js';

export const TOP = {}; // screens that are not inside an incident: 'new', 'previous', 'emergency', 'settings'
export const SCREENS = {}; // 'timeline' or 's1/danger' -> (inc, parts) => void
export const RECORD_EXTRAS = {}; // collection -> { top, bottom, handlers, summary }
export const GLOBAL = {}; // handlers available on every incident screen (the toolbar adds to this)

export const S = {
  shell: null, // helpers handed over by app.js (camera, recorder, Word export, routing)
  inc: null,
  user: { name: '', role: 'advisor' },
  settings: {},
  handlers: {},
  focus: {}, // which question is being re-asked, per group
  live: {}, // parts of the screen that are redrawn after each save without redrawing the whole screen
  healthAt: null, // the screen on which health information is currently shown
  lastSection: null,
  saving: Promise.resolve(),
  savedAt: null,
  toolbar: null,
};

export const esc = (s) => S.shell.esc(s);
export const app = () => S.shell.app;
export const go = (hash) => S.shell.go(hash);
export const ctx = () => ({ by: S.user.name || 'Advisor', role: S.user.role });
export const href = (inc, path = '') => `#/inc/${inc.id}${path ? `/${path}` : ''}`;
export const filled = (v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== '');
export const time = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
export const dateTime = (t) => (t ? new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const toLocalInput = (ms) => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
export const fromLocalInput = (text) => (text ? new Date(text).getTime() : null);
export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const pair = (o) => (Array.isArray(o) ? o : [o, o]);
export const labelOf = (options, value) => pair(options.find((o) => pair(o)[0] === value) ?? [value, value ?? ''])[1];

export async function loadUser() {
  const [name, role, settings] = await Promise.all(['inspector', 'incidentRole', 'incidentSettings'].map(S.shell.db.getSetting));
  S.user = { name: name ?? '', role: W.ROLES[role] ? role : 'advisor' };
  S.settings = { mockSync: true, failSync: false, failExport: false, emergencyNumber: '000', siteEmergency: '', ...settings };
}

export async function saveSettings(patch) {
  Object.assign(S.settings, patch);
  await S.shell.db.setSetting('incidentSettings', S.settings);
}

export async function load(id) {
  if (S.inc?.id !== id) {
    await S.saving.catch(() => {});
    S.inc = await store.getIncident(id);
    S.focus = {};
    S.savedAt = null;
  }
  return S.inc;
}

export function forget() {
  S.inc = null;
  S.healthAt = null;
}

// Saving. One save at a time so an older save can never land on top of a newer one.
export function save() {
  const inc = S.inc;
  S.saving = S.saving.catch(() => {}).then(() => store.saveIncident(inc)).then(() => {
    S.savedAt = Date.now();
    syncSoon();
  });
  return S.saving;
}

let syncTimer = null;
// PLACEHOLDER synchronisation: counts changes as "queued" and clears the queue through the mock adapter.
export function syncSoon(delay = 1500) {
  clearTimeout(syncTimer);
  if (!S.settings.mockSync) return;
  syncTimer = setTimeout(async () => {
    const inc = S.inc;
    if (!inc || !inc.sync.pending) return;
    const result = await adapter.syncIncident(inc, { fail: S.settings.failSync });
    if (S.inc !== inc) return;
    if (result.ok) Object.assign(inc.sync, { pending: 0, lastSyncedAt: result.at, lastError: null });
    else if (result.reason !== 'offline') inc.sync.lastError = result.reason;
    else return;
    S.saving = S.saving.catch(() => {}).then(() => store.saveIncident(inc, { countChange: false }));
    await S.saving;
    refreshStrip();
  }, delay);
}

// Runs a change, shows any rule it broke as a message, then saves.
export async function act(change, rerender = true) {
  try {
    change(S.inc, ctx());
  } catch (err) {
    if (!err.rule) throw err;
    toast(err.message, 'error');
    return false;
  }
  await save();
  if (rerender) await S.shell.rerender();
  else refreshStrip();
  return true;
}

// Rendering

export function screen(html, handlers = {}) {
  S.handlers = { ...GLOBAL, ...handlers };
  const el = app();
  el.innerHTML = html;
  el.onclick = onClick;
  el.onchange = onChange;
}

async function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if ('self' in el.dataset && e.target !== el) return;
  const handler = S.handlers[el.dataset.act];
  if (!handler) return;
  e.preventDefault();
  try {
    await handler(el, e);
  } catch (err) {
    if (err.rule) toast(err.message, 'error');
    else { console.error(err); toast(`Something went wrong. ${err.message}`, 'error'); }
  }
}

function readValue(el) {
  const type = el.dataset.type;
  if (type === 'datetime') return fromLocalInput(el.value);
  if (type === 'check') return el.checked;
  if (type === 'multi') return [...app().querySelectorAll(`[data-bind="${CSS.escape(el.dataset.bind)}"]`)].filter((b) => b.checked).map((b) => b.value);
  return el.value.trim();
}

// data-bind="f|form|key", "r|collection|id|key", "s|key" (start facts) or "n|key" (a note on a question)
export function applyBind(inc, c, bind, value) {
  const [kind, a, b, d] = bind.split('|');
  if (kind === 'f') M.setField(inc, c, a, b, value);
  else if (kind === 'r') M.updateRecord(inc, c, a, b, { [d]: value });
  else if (kind === 's') M.setStart(inc, c, a, value);
  else if (kind === 'n') M.setNote(inc, c, a, value);
}

async function onChange(e) {
  const el = e.target.closest('[data-bind]');
  if (!el) return;
  try {
    const ok = await act((inc, c) => applyBind(inc, c, el.dataset.bind, readValue(el)), 'rerender' in el.dataset);
    el.classList.toggle('invalid', !ok);
    // A refused choice goes back to what is actually saved, so the screen never shows something that is not on file.
    if (!ok && el.tagName === 'SELECT') el.value = el.querySelector('option[selected]')?.value ?? '';
  } catch (err) {
    console.error(err);
    toast(`That change could not be saved. ${err.message}`, 'error');
  }
}

export function toast(message, kind = 'info') {
  app().querySelector('.toast')?.remove();
  app().insertAdjacentHTML('beforeend', `<div class="toast ${kind}" role="alert" data-act="toast-close">${esc(message)}<span class="muted"> Tap to dismiss.</span></div>`);
  S.handlers['toast-close'] = (el) => el.closest('.toast').remove();
  const shown = app().querySelector('.toast');
  setTimeout(() => shown.remove(), kind === 'error' ? 12000 : 5000);
}

export function sheet(title, body, handlers = {}) {
  closeSheet();
  Object.assign(S.handlers, { 'sheet-close': closeSheet }, handlers);
  app().insertAdjacentHTML('beforeend', `<div class="sheet-back" data-act="sheet-close" data-self>
    <section class="sheet" role="dialog" aria-label="${esc(title)}">
      <header class="top"><h2>${esc(title)}</h2><button class="icon" data-act="sheet-close">Close</button></header>
      ${body}
    </section></div>`);
}
export const closeSheet = () => app().querySelector('.sheet-back')?.remove();
export const sheetValues = () => Object.fromEntries([...app().querySelectorAll('.sheet [name]')].map((el) =>
  [el.name, el.type === 'checkbox' ? el.checked : el.type === 'datetime-local' ? fromLocalInput(el.value) : el.value.trim()]));

// Status strip: stage, status, urgent items, saved time, connection, sync and the next step.

function syncText(inc) {
  if (!S.settings.mockSync) return 'Sync off (placeholder)';
  if (inc.sync.lastError) return 'Sync failed — will retry (mock)';
  if (inc.sync.pending) return `${plural(inc.sync.pending, 'change')} queued${adapter.isOnline() ? '' : ' until online'} (mock)`;
  return inc.sync.lastSyncedAt ? `Synced ${time(inc.sync.lastSyncedAt)} (mock)` : 'Nothing to sync (mock)';
}

export function strip(inc) {
  const st = M.stats(inc);
  const next = M.nextStep(inc);
  return `<div class="strip" data-role="strip">
    <div class="chips">
      <a class="chip link" href="${href(inc)}">Overview</a>
      <span class="chip stage">Stage ${inc.stage} · ${esc(W.STAGES[inc.stage].title)}</span>
      <span class="chip">${esc(M.statusLabel(inc))}</span>
      ${inc.demo ? '<span class="chip demo">Demo · synthetic</span>' : ''}
    </div>
    <div class="chips">
      <a class="chip ${st.urgent ? 'urgent' : 'ok'}" href="${href(inc, 'open')}">${st.urgent ? `${st.urgent} urgent` : 'No urgent items'}</a>
      <a class="chip link" href="${href(inc, 'open')}">${st.open} open</a>
      <span class="chip">${S.savedAt ? `Saved ${time(S.savedAt)}` : `Last change ${dateTime(inc.updatedAt)}`}</span>
      <span class="chip ${adapter.isOnline() ? '' : 'offline'}">${adapter.isOnline() ? 'Online' : 'Offline — still working'}</span>
      <span class="chip">${esc(syncText(inc))}</span>
    </div>
    ${next.route ? `<a class="next" href="${href(inc, next.route)}"><strong>Next:</strong> ${esc(next.text)} ›</a>` : `<p class="next">${esc(next.text)}</p>`}
  </div>`;
}

export function refreshStrip() {
  const el = app().querySelector('[data-role=strip]');
  if (el && S.inc) el.outerHTML = strip(S.inc);
  for (const [key, draw] of Object.entries(S.live)) {
    const part = app().querySelector(`[data-live="${key}"]`);
    if (part) part.innerHTML = draw();
  }
}

// A block that keeps itself up to date while the advisor types elsewhere on the screen (for example
// the list of problems with a finding). Typing is never interrupted by a full redraw.
export function live(key, draw) {
  S.live[key] = draw;
  return `<div data-live="${key}">${draw()}</div>`;
}

export function dangerBanner(inc) {
  const item = inc.openItems.find((i) => i.key === 'danger' && i.status === 'open');
  if (!item) return '';
  return `<a class="danger-banner" href="${href(inc, 's1/danger')}">⚠ ${esc(item.text)}. Tap to review the hazard and its controls.</a>`;
}

export function frame(inc, title, back, body) {
  if (!location.hash.includes('/r/')) S.lastSection = location.hash;
  return `${S.shell.header(title, back ?? href(inc))}${strip(inc)}${dangerBanner(inc)}
    <div class="inc-body">${body}</div>${S.toolbar ? S.toolbar(inc) : ''}`;
}

// Tags

export const vTag = (v) => (v ? `<span class="tag v-${v}">${esc(W.VERIFICATION[v])}</span>` : '');
export const stateChip = (state) => `<span class="state ${state}">${{ todo: 'To do', started: 'Started', done: 'Done', attention: 'Needs attention', notneeded: 'Not needed at this level' }[state]}</span>`;
export const draftTag = '<span class="tag draft">Draft</span>';

// Questions

export function optionButtons(key, options, current, extra = '') {
  return `<div class="opts opts-${options.length}">${options.map(([v, label]) =>
    `<button class="opt ${current === v ? 'on' : ''}" data-act="answer" data-k="${key}" data-v="${v}" aria-pressed="${current === v}" ${extra}>${esc(label)}</button>`).join('')}</div>`;
}

GLOBAL.answer = async (el) => {
  S.focus = {};
  await act((inc, c) => M.setAnswer(inc, c, el.dataset.k, el.dataset.v));
};
GLOBAL.reask = (el) => {
  S.focus[el.dataset.group] = el.dataset.k;
  return S.shell.rerender();
};
GLOBAL.verify = (el) => act((inc, c) => M.verifyAnswer(inc, c, el.dataset.k, el.dataset.v === 'yes'));

const answerTag = (a) => (!a || a.value === 'unsure' ? 'unknown' : a.verified ? 'confirmed' : 'unverified');

// One question at a time: the next unanswered question is large, answered ones are listed below it.
export function questionFlow(inc, group) {
  const g = W.GROUPS[group];
  const current = g.questions.find((q) => q.k === S.focus[group]) ?? g.questions.find((q) => !M.answer(inc, q.k));
  const answered = g.questions.filter((q) => M.answer(inc, q.k));
  const card = current ? `<div class="qcard">
      <p class="muted">Question ${g.questions.indexOf(current) + 1} of ${g.questions.length}</p>
      <p class="q">${esc(current.q)}</p>
      ${optionButtons(current.k, g.options, M.answer(inc, current.k))}
    </div>` : `<div class="notice">All ${g.questions.length} questions answered. Tap "Change" if something is different now.</div>`;
  return `${card}
    ${answered.length ? `<h2>Answers so far</h2>${answered.map((q) => {
      const a = inc.answers[q.k];
      return `<div class="answered">
        <p>${esc(q.q)} <strong>${esc(labelOf(g.options, a.value))}</strong> ${vTag(answerTag(a))}</p>
        <p class="muted">${time(a.at)} · ${esc(a.by)}</p>
        <div class="row">
          <button class="small" data-act="reask" data-group="${group}" data-k="${q.k}">Change</button>
          ${a.value === 'unsure' ? '' : `<button class="small" data-act="verify" data-k="${q.k}" data-v="${a.verified ? 'no' : 'yes'}">${a.verified ? 'Undo: not confirmed' : 'I have confirmed this myself'}</button>`}
        </div>
      </div>`;
    }).join('')}` : ''}`;
}

// Every question at once, each with small answer buttons and an optional note.
export function questionList(inc, group, detail = () => '') {
  const g = W.GROUPS[group];
  return g.questions.map((q) => `<div class="answered">
      <p><strong>${esc(q.q)}</strong></p>
      ${detail(q)}
      ${optionButtons(q.k, g.options, M.answer(inc, q.k))}
      ${g.notes ? `<input aria-label="Note for ${esc(q.q)}" placeholder="Note (optional)" data-bind="n|${q.k}" value="${esc(inc.notes[q.k] ?? '')}">` : ''}
    </div>`).join('');
}

// Fields

const DICTATE = 'Type, or tap the mic on your keyboard to dictate';
export const healthShown = () => S.healthAt === location.hash;

export function evidenceChips(inc, ids) {
  const items = (ids ?? []).map((id) => M.record(inc, 'evidence', id)).filter(Boolean);
  if (!items.length) return '<span class="muted">None linked</span>';
  return items.map((e) => `<a class="chip link" href="${href(inc, `r/evidence/${e.id}`)}">${esc(e.number)}${e.voided ? ' (withdrawn)' : e.status !== 'obtained' ? ` (${esc(labelOf(W.EVIDENCE_STATUS, e.status).replace('Evidence ', ''))})` : ''}</a>`).join(' ');
}

export function fieldHtml(inc, def, value, bind) {
  const hint = def.hint ? `<span class="hint">${esc(def.hint)}</span>` : '';
  if (def.health && !healthShown()) {
    return `<div class="restricted"><strong>${esc(def.label)}</strong><span>Restricted health information${filled(value) ? ' — recorded, hidden' : ' — nothing recorded'}</span></div>`;
  }
  const attrs = `data-bind="${bind}" ${def.rerender ? 'data-rerender' : ''}`;
  const label = `${esc(def.label)}${def.health ? ' <span class="tag health">Health — restricted</span>' : ''}${hint}`;
  switch (def.type) {
    case 'area':
      return `<label>${label}<textarea ${attrs} rows="${def.rows ?? 3}" placeholder="${DICTATE}">${esc(value)}</textarea></label>`;
    case 'datetime':
      return `<label>${label}<input type="datetime-local" data-type="datetime" ${attrs} value="${toLocalInput(value)}"></label>`;
    case 'date':
      return `<label>${label}<input type="date" ${attrs} value="${esc(value)}"></label>`;
    case 'select':
      return `<label>${label}<select ${attrs}><option value="">Choose…</option>${def.options.map(pair).map(([v, l]) => `<option value="${esc(v)}" ${String(value ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    case 'check':
      return `<label class="check"><input type="checkbox" data-type="check" ${attrs} ${value ? 'checked' : ''}> <span>${esc(def.label)}</span></label>`;
    case 'multi':
      return `<fieldset><legend>${label}</legend>${def.options.map((o) => `<label class="check"><input type="checkbox" data-type="multi" ${attrs} value="${esc(o)}" ${(value ?? []).includes(o) ? 'checked' : ''}> <span>${esc(o)}</span></label>`).join('')}</fieldset>`;
    case 'evidence':
      return `<div class="field"><span class="label">${label}</span><div class="chips">${evidenceChips(inc, value)}</div>
        <button class="small" data-act="link-evidence" data-bind-to="${bind}">Link evidence</button></div>`;
    case 'ref': {
      const options = M.records(inc, def.collection);
      return `<label>${label}<select ${attrs}><option value="">None</option>${options.map((r) => `<option value="${r.id}" ${value === r.id ? 'selected' : ''}>${esc(M.recordTitle(def.collection, r).slice(0, 70))}</option>`).join('')}</select></label>`;
    }
    default:
      return `<label>${label}<input ${attrs} value="${esc(value)}" autocomplete="off"></label>`;
  }
}

export const formHtml = (inc, form, only) => W.FORMS[form].filter((f) => !only || only.includes(f.k))
  .map((f) => fieldHtml(inc, f, M.field(inc, form, f.k), `f|${form}|${f.k}`)).join('');

function currentBound(inc, bind) {
  const [kind, a, b, d] = bind.split('|');
  return (kind === 'f' ? M.field(inc, a, b) : M.record(inc, a, b)?.[d]) || [];
}

GLOBAL['link-evidence'] = (el) => {
  const inc = S.inc;
  const bind = el.dataset.bindTo;
  const linked = currentBound(inc, bind);
  const items = M.records(inc, 'evidence');
  sheet('Link evidence', `${items.length ? items.map((e) => `<label class="check"><input type="checkbox" name="${e.id}" ${linked.includes(e.id) ? 'checked' : ''}>
      <span><strong>${esc(e.number)}</strong> ${esc(e.kind ?? '')} — ${esc(e.description || 'no description')} <em class="muted">(${esc(labelOf(W.EVIDENCE_STATUS, e.status))})</em></span></label>`).join('')
    : '<p class="muted">No evidence has been recorded yet. Add it with Photo, Voice or the evidence list, then link it here.</p>'}
    <div class="stack" style="margin-top:16px"><button class="primary" data-act="link-save">Save links</button></div>`, {
    'link-save': async () => {
      const ids = Object.entries(sheetValues()).filter(([, on]) => on).map(([id]) => id);
      closeSheet();
      await act((i, c) => applyBind(i, c, bind, ids));
    },
  });
};

GLOBAL['health-show'] = async () => {
  if (!M.can(S.user.role, 'health')) return toast(`Health information is restricted. Your role (${W.ROLES[S.user.role].label}) cannot view it.`, 'error');
  S.healthAt = location.hash;
  await act((inc, c) => M.recordAccess(inc, c, 'Health information viewed'));
};
GLOBAL['health-hide'] = () => {
  S.healthAt = null;
  return S.shell.rerender();
};

export function healthToggle(collection) {
  if (!W.HEALTH_FIELDS[collection]?.length) return '';
  return healthShown()
    ? '<div class="notice health">Health information is showing. It is restricted: share it only with people who need it for care or injury management. <button class="small" data-act="health-hide">Hide it</button></div>'
    : '<div class="notice health">Health information is hidden on this screen and left out of summaries. Each viewing is recorded in the audit history. <button class="small" data-act="health-show">Show health information</button></div>';
}

// Lists of records

export function recordCards(inc, collection, { filter = () => true, empty } = {}) {
  const def = W.COLLECTIONS[collection];
  const list = (inc.records[collection] ?? []).filter(filter);
  if (!list.length) return `<p class="muted">${esc(empty ?? `No ${def.plural.toLowerCase()} recorded yet.`)}</p>`;
  return list.map((r) => `<a class="card ${r.voided ? 'voided' : ''}" href="${href(inc, `r/${collection}/${r.id}`)}">
      <strong>${esc(r.number)} · ${esc(def.title(r))}</strong>
      <span class="muted">${r.voided ? `Withdrawn: ${esc(r.voided.reason)}` : RECORD_EXTRAS[collection]?.summary?.(inc, r) ?? esc(dateTime(r.createdAt))}</span>
    </a>`).join('');
}

export const addButton = (collection, label, preset = {}, cls = '') =>
  `<button class="${cls}" data-act="add-record" data-c="${collection}" data-preset="${esc(JSON.stringify(preset))}">${esc(label)}</button>`;

GLOBAL['add-record'] = async (el) => {
  let rec;
  const ok = await act((inc, c) => { rec = M.addRecord(inc, c, el.dataset.c, JSON.parse(el.dataset.preset || '{}')); }, false);
  if (ok) go(href(S.inc, `r/${el.dataset.c}/${rec.id}`));
};

// One record: every field from the workflow definition, plus anything extra its collection registers.
SCREENS.r = (inc, [, collection, id]) => {
  const def = W.COLLECTIONS[collection];
  const rec = def && M.record(inc, collection, id);
  if (!rec) return go(href(inc));
  const extras = RECORD_EXTRAS[collection] ?? {};
  const back = S.lastSection ?? href(inc);
  let html = '';
  let open = false;
  for (const f of def.fields) {
    if (f.divider) {
      html += `${open ? '</details>' : ''}<details class="more" ${extras.openDetails?.(inc, rec) ?? inc.stage > 1 ? 'open' : ''}><summary>${esc(f.divider)}</summary>`;
      open = true;
    } else if (!extras.hide?.(inc, rec)?.includes(f.k)) {
      html += fieldHtml(inc, f, rec[f.k], `r|${collection}|${id}|${f.k}`);
    }
  }
  if (open) html += '</details>';
  const body = rec.voided
    ? `<div class="notice">Withdrawn by ${esc(rec.voided.by)} at ${dateTime(rec.voided.at)}: ${esc(rec.voided.reason)}. It stays in the file but can no longer be changed.</div>
       <fieldset disabled>${html}</fieldset>`
    : `${healthToggle(collection)}${extras.top?.(inc, rec) ?? ''}${html}${extras.bottom?.(inc, rec) ?? ''}
       <div class="stack" style="margin-top:24px">
         <a class="button primary" href="${back}">Done</a>
         <button class="danger" data-act="void-record">Withdraw this ${esc(def.label.toLowerCase())}</button>
       </div>
       <p class="muted">Recorded ${dateTime(rec.createdAt)} by ${esc(rec.createdBy)}. Changes save as you go and are kept in the audit history.</p>`;
  setTimeout(() => extras.after?.(inc, rec)); // for anything slow, such as decrypting a photo
  screen(frame(inc, `${rec.number} ${def.label}`, back, body), {
    ...extras.handlers?.(inc, rec),
    'void-record': () => sheet(`Withdraw ${rec.number}`, `<p>Nothing is deleted. The record stays in the file, marked as withdrawn with your reason.</p>
      <label>Why is it being withdrawn? <textarea name="reason" rows="3"></textarea></label>
      <div class="stack" style="margin-top:16px"><button class="danger" data-act="void-confirm">Withdraw</button></div>`, {
      'void-confirm': async () => {
        const { reason } = sheetValues();
        if (await act((i, c) => M.voidRecord(i, c, collection, id, reason), false)) go(back);
      },
    }),
  });
};

// A stage's list of sections with how far each has got.
export function sectionList(inc, stage, sections) {
  return sections.map(([key, title]) => `<a class="card" href="${href(inc, `s${stage}/${key}`)}">
      <strong>${esc(title)}</strong>${stateChip(M.sectionState(inc, stage, key))}</a>`).join('');
}

// "Mark this section complete" for Stage 2 and 3 sections, with links to the sections either side.
export function sectionFooter(inc, stage, key, sections) {
  const i = sections.findIndex(([k]) => k === key);
  const done = Boolean(inc.done[`s${stage}.${key}`]);
  const next = sections[i + 1];
  return `<div class="stack" style="margin-top:24px">
      <button class="${done ? '' : 'primary'}" data-act="section-done" data-k="s${stage}.${key}" data-v="${done ? '' : '1'}">${done ? 'Reopen this section' : 'Mark this section complete'}</button>
      ${next ? `<a class="button" href="${href(inc, `s${stage}/${next[0]}`)}">Next: ${esc(next[1])}</a>` : ''}
      <a class="button" href="${href(inc, `s${stage}`)}">Back to Stage ${stage} list</a>
    </div>`;
}
GLOBAL['section-done'] = (el) => act((inc, c) => M.markSection(inc, c, el.dataset.k, Boolean(el.dataset.v)));
