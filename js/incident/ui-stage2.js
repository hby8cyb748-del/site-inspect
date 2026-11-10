// Stage 2: Information capture. Twelve short sections instead of one large form.
import * as M from './model.js';
import * as W from './workflow.js';
import {
  S, SCREENS, RECORD_EXTRAS, esc, go, href, act, screen, frame, sheet, closeSheet, sheetValues, toast, vTag, draftTag,
  questionList, formHtml, fieldHtml, recordCards, addButton, sectionList, sectionFooter,
  dateTime, toLocalInput, plural, filled,
} from './ui-core.js';
import { addEvidenceFile, fillThumbs } from './ui-evidence.js';

const SECTIONS = W.STAGE2_SECTIONS;
const title = (key) => SECTIONS.find(([k]) => k === key)[1];
const page = (inc, key, body, handlers) => screen(frame(inc, title(key), href(inc, 's2'), `${body}${sectionFooter(inc, 2, key, SECTIONS)}`), handlers);

SCREENS.s2 = (inc) => {
  const complete = inc.stages[2]?.completedAt;
  screen(frame(inc, 'Stage 2: Information capture', href(inc), `
    <p class="muted">Capture a reliable factual record, one short section at a time, in any order.</p>
    ${sectionList(inc, 2, SECTIONS)}
    <div class="stack" style="margin-top:20px">
      ${complete ? `<div class="notice">Stage 2 was marked complete at ${dateTime(complete)}.</div><a class="button primary big" href="${href(inc, 's3')}">Go to Stage 3: Investigation</a>`
        : `<a class="button primary" href="${href(inc, 's2/completeness')}">Review completeness and move to Stage 3</a>`}
    </div>`));
};

// Incident details. The three start facts are shown first, each with how far it can be relied on.

const startFact = (inc, key, label, input) => `<div class="answered">
    <label style="margin-top:0">${label}${input}</label>
    <div class="opts opts-3">${Object.entries(W.VERIFICATION).map(([v, l]) => `<button class="opt ${inc.start.v[key] === v ? 'on' : ''}" data-act="start-v" data-k="${key}" data-v="${v}">${esc(l)}</button>`).join('')}</div>
  </div>`;

SCREENS['s2/details'] = (inc) => page(inc, 'details', `
  <h2>As first reported</h2>
  ${startFact(inc, 'what', 'What happened?', `<textarea data-bind="s|what" rows="3">${esc(inc.start.what)}</textarea>`)}
  ${startFact(inc, 'where', 'Where did it happen?', `<input data-bind="s|where" value="${esc(inc.start.where)}" autocomplete="off">`)}
  ${startFact(inc, 'when', 'When did it happen?', `<input type="datetime-local" data-type="datetime" data-bind="s|when" value="${toLocalInput(inc.start.when)}">`)}
  <h2>Details</h2>
  <p class="muted">Current incident status: <strong>${esc(M.statusLabel(inc))}</strong> (Stage ${inc.stage}).</p>
  ${formHtml(inc, 'details')}
  <div class="notice" style="margin-top:12px">Keep the description factual: what was happening, what occurred, the immediate outcome, what happened next. <strong>Leave suspected causes out.</strong> They belong in the investigation.</div>`, {
  'start-v': (el) => act((i, c) => M.setStartVerification(i, c, el.dataset.k, el.dataset.v)),
});

SCREENS['s2/people'] = (inc) => page(inc, 'people', `
  <p class="muted">Add role, type of person, exposure status and treatment as they become known. Health details stay restricted.</p>
  ${recordCards(inc, 'people')}
  <div style="margin-top:10px">${addButton('people', 'Add affected person', {}, 'primary')}</div>
  <div class="notice" style="margin-top:12px">Exposure can be <strong>reported</strong> (someone said so), <strong>confirmed</strong> (evidence such as a medical assessment or a monitoring record is linked) or <strong>unknown</strong>. The app will not accept "confirmed" without linked evidence.</div>`);

SCREENS['s2/work'] = (inc) => {
  const docs = M.records(inc, 'evidence').filter((e) => filled(e.docType));
  page(inc, 'work', `
    ${formHtml(inc, 'work')}
    <h2>Documents for this work</h2>
    <p class="muted">${docs.length ? docs.map((d) => `${esc(d.number)} ${esc(d.docType)}`).join(' · ') : 'None attached yet.'}</p>
    <div class="stack"><a class="button" href="${href(inc, 's2/documents')}">Attach SWMS, permit, risk assessment and other documents</a></div>`);
};

SCREENS['s2/conditions'] = (inc) => page(inc, 'conditions', `
  <p class="muted">Mark each as Relevant, Not relevant or Unknown. Add a short note for anything relevant.</p>
  ${questionList(inc, 'conditions')}`);

SCREENS['s2/equipment'] = (inc) => page(inc, 'equipment', `
  <p class="muted">Plant, tools, materials and substances involved. Record identifiers, and where each item is now.</p>
  ${recordCards(inc, 'equipment')}
  <div style="margin-top:10px">${addButton('equipment', 'Add equipment or material', {}, 'primary')}</div>`);
RECORD_EXTRAS.equipment = { summary: (inc, r) => esc([r.identifier, r.location].filter(Boolean).join(' · ') || 'Details to be added') };

// Documents are evidence items with a document type.
SCREENS['s2/documents'] = (inc) => {
  const preset = () => ({ kind: 'Document', docType: S.shell.app.querySelector('[name=docType]').value });
  page(inc, 'documents', `
    <div class="notice">A document shows what was planned or signed. It does <strong>not</strong> prove the control was in place. Record what was physically there under "Critical risks and controls".</div>
    <label>Document type <select name="docType">${W.DOC_TYPES.map((d) => `<option>${esc(d)}</option>`).join('')}</select></label>
    <div class="stack" style="margin-top:10px">
      <button class="primary" data-act="doc-photo">Photograph the document</button>
      <button data-act="doc-file">Attach a file</button>
      <button data-act="doc-ref">Record it without a file (held elsewhere or requested)</button>
    </div>
    <h2>Documents recorded</h2>
    ${recordCards(inc, 'evidence', { filter: (e) => filled(e.docType), empty: 'No documents recorded yet.' })}`, {
    'doc-photo': () => { const p = preset(); S.shell.capturePhoto(async (file) => go(href(inc, `r/evidence/${(await addEvidenceFile(file, { ...p, description: p.docType })).id}`))); },
    'doc-file': () => { const p = preset(); S.shell.chooseFile(async (file) => go(href(inc, `r/evidence/${(await addEvidenceFile(file, { ...p, description: file.name })).id}`))); },
    'doc-ref': async () => {
      const p = preset();
      let rec;
      if (await act((i, c) => { rec = M.addRecord(i, c, 'evidence', { ...p, description: p.docType, status: 'requested', preserved: 'unknown', source: '' }); }, false)) go(href(inc, `r/evidence/${rec.id}`));
    },
  });
};

// Critical risks and controls

SCREENS['s2/risks'] = (inc) => {
  const assessed = M.records(inc, 'controlsAssessed');
  const chosen = new Set(assessed.map((c) => c.risk));
  page(inc, 'risks', `
    <div class="notice"><strong>Sample library.</strong> These critical risks and controls are generic placeholders. Replace them with your organisation's approved critical controls.</div>
    <h2>Which critical risks apply?</h2>
    <div class="stack">${Object.entries(W.CRITICAL_RISKS).map(([k, r]) => `<button class="${chosen.has(k) ? 'opt on' : ''}" data-act="risk-add" data-k="${k}" ${chosen.has(k) ? 'disabled' : ''}>${esc(r.label)}${chosen.has(k) ? ' — added' : ''}</button>`).join('')}</div>
    ${[...chosen].filter((k) => W.CRITICAL_RISKS[k]).map((k) => `<h2>${esc(W.CRITICAL_RISKS[k].label)}</h2>
      <p class="muted">${esc(W.CRITICAL_RISKS[k].statement)} For each control: was it required, present, correctly implemented, verified, maintained, bypassed, and did conditions change?</p>
      ${recordCards(inc, 'controlsAssessed', { filter: (c) => c.risk === k })}`).join('')}
    ${assessed.some((c) => !W.CRITICAL_RISKS[c.risk]) ? `<h2>Other controls</h2>${recordCards(inc, 'controlsAssessed', { filter: (c) => !W.CRITICAL_RISKS[c.risk] })}` : ''}
    <div style="margin-top:12px">${addButton('controlsAssessed', 'Add another control', { riskLabel: 'Other' })}</div>
    <div class="notice" style="margin-top:12px">A signed document is not proof that a physical control was effective. Base each assessment on what was seen, measured or photographed, and link that evidence.</div>`, {
    'risk-add': (el) => act((i, c) => {
      const risk = W.CRITICAL_RISKS[el.dataset.k];
      for (const control of risk.controls) M.addRecord(i, c, 'controlsAssessed', { risk: el.dataset.k, riskLabel: risk.label, control });
      M.addEntry(i, c, { category: 'decision', text: `Critical risk identified as applicable: ${risk.label}` });
    }),
  });
};
RECORD_EXTRAS.controlsAssessed = {
  openDetails: (inc) => inc.stage === 3,
  summary: (inc, r) => `${esc(r.riskLabel ?? '')} · <strong>${esc(r.rating || 'Not yet assessed')}</strong> · ${plural((r.evidence ?? []).length, 'evidence link')}`,
};

SCREENS['s2/witnesses'] = (inc) => page(inc, 'witnesses', `
  <div class="notice">Record what each person may have seen or heard. Do not assess whether they are credible. Their accounts go on the timeline as <strong>witness accounts</strong>, kept apart from confirmed facts.</div>
  <div style="margin-top:12px">${recordCards(inc, 'witnesses')}</div>
  <div style="margin-top:10px">${addButton('witnesses', 'Add witness', {}, 'primary')}</div>`);
RECORD_EXTRAS.witnesses = {
  summary: (inc, r) => `${esc([r.employer, r.role].filter(Boolean).join(' · ') || 'Details to be added')} · interview ${r.interviewCompleted === 'yes' ? 'done' : 'not yet done'}${r.statementRequired === 'yes' && r.statementObtained !== 'yes' ? ' · statement needed' : ''}`,
};

// Photographs and evidence

SCREENS['s2/evidence'] = (inc) => {
  const items = inc.records.evidence ?? [];
  const live = items.filter((e) => !e.voided);
  page(inc, 'evidence', `
    <div class="stack">
      <button class="primary big" data-act="tool-photo">Take photo</button>
      <button data-act="tool-file">Attach a file, video or document</button>
      <button data-act="tool-voice">Record audio</button>
      <button data-act="ev-ref">Add evidence without a file</button>
    </div>
    <p class="muted">Originals are stored unchanged and are never overwritten. A mark-up is saved as a separate copy. After each photo you can add a voice caption.</p>
    <h2>Photo guide</h2>
    ${W.PHOTO_GUIDE.map((g) => {
      const n = live.filter((e) => e.guide === g).length;
      return `<div class="row between" style="padding:6px 0;border-top:1px solid var(--line)">
        <span>${n ? '<span class="tag v-confirmed">Done</span>' : '<span class="tag v-unknown">To do</span>'} ${esc(g)}${n > 1 ? ` (${n})` : ''}</span>
        <button class="small" data-act="guide-photo" data-g="${esc(g)}">Take</button></div>`;
    }).join('')}
    <h2>Evidence register (${live.length})</h2>
    ${items.length ? items.map((e) => `<a class="card ${e.voided ? 'voided' : ''}" href="${href(inc, `r/evidence/${e.id}`)}">
      <div class="row" style="flex-wrap:nowrap;align-items:flex-start">
        ${e.thumbKey ? `<span class="thumb" style="width:72px;flex:none" data-thumb="${e.id}"></span>` : ''}
        <span><strong>${esc(e.number)} · ${esc(e.description || e.kind || 'Evidence')}</strong>
        <span class="muted">${e.voided ? `Withdrawn: ${esc(e.voided.reason)}` : RECORD_EXTRAS.evidence.summary(inc, e)}</span></span>
      </div></a>`).join('') : '<p class="muted">No evidence recorded yet.</p>'}`, {
    'guide-photo': (el) => S.shell.capturePhoto(async (file) => go(href(inc, `r/evidence/${(await addEvidenceFile(file, { kind: 'Photograph', guide: el.dataset.g, description: el.dataset.g })).id}`))),
    'ev-ref': () => sheet('Add evidence without a file', `
      <p class="muted">For evidence held elsewhere or still to be obtained: a CCTV reference, a physical item, a monitoring record you have asked for.</p>
      <label>Type <select name="kind">${W.EVIDENCE_KINDS.map((k) => `<option>${esc(k)}</option>`).join('')}</select></label>
      <label>Description <textarea name="description" rows="3"></textarea></label>
      <label>Status <select name="status">${W.EVIDENCE_STATUS.map(([v, l]) => `<option value="${v}" ${v === 'requested' ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <div class="stack" style="margin-top:16px"><button class="primary" data-act="ev-ref-save">Add to the register</button></div>`, {
      'ev-ref-save': async () => {
        const v = sheetValues();
        let rec;
        if (await act((i, c) => { rec = M.addRecord(i, c, 'evidence', { ...v, preserved: 'unknown', source: '' }); }, false)) { closeSheet(); go(href(inc, `r/evidence/${rec.id}`)); }
      },
    }),
  });
  fillThumbs(inc);
};

SCREENS['s2/timeline'] = (inc) => {
  const all = M.chronology(inc);
  page(inc, 'timeline', `
    <p>The chronology builds itself from your entries, witness accounts, notifications, photographs, actions and documents. ${plural(all.length, 'entry', 'entries')} so far.</p>
    <ul class="plain">${Object.entries(W.CATEGORIES).map(([k, l]) => `<li>${esc(l)}: ${all.filter((e) => e.category === k).length}</li>`).join('')}</ul>
    <p>${all.filter((e) => e.verification !== 'confirmed' && !e.supersededBy).length} current entries are unverified or unknown. ${inc.conflicts.filter((c) => !c.resolvedAt).length} conflicts are flagged.</p>
    <div class="stack"><a class="button primary" href="${href(inc, 'timeline')}">Open the timeline</a><button data-act="tool-note">Add an entry</button></div>`);
};

// Preliminary classification. A suggestion is only ever a draft; a person saves it as a version, and an
// authorised person confirms it.

const classDrafts = new Map();

SCREENS['s2/classification'] = (inc) => {
  const current = M.currentClassification(inc);
  const suggestion = M.suggestClassification(inc);
  if (!classDrafts.has(inc.id)) classDrafts.set(inc.id, { ...(current?.values ?? {}) });
  const draft = classDrafts.get(inc.id);
  const show = (k, v) => (k === 'level' ? W.LEVELS[v]?.label ?? v : v);
  const list = (items) => `<ul class="plain">${items.map((i) => `<li>${esc(i)}</li>`).join('') || '<li>None</li>'}</ul>`;
  page(inc, 'classification', `
    <div class="notice"><strong>The final classification belongs to an authorised person.</strong> You can record a preliminary classification here. It stays marked "proposed" until an authorised person confirms it.</div>
    <h2>Suggestion ${draftTag}</h2>
    <div class="answered">
      <ul class="plain">${W.CLASSIFICATION_FIELDS.filter((f) => filled(suggestion.values[f.k])).map((f) => `<li>${esc(f.label)}: <strong>${esc(show(f.k, suggestion.values[f.k]))}</strong></li>`).join('')}</ul>
      <details class="more" open><summary>Why, and what it is based on</summary>
        <p class="label">Why the suggestion was made</p>${list(suggestion.why)}
        <p class="label">Information used</p>${list(suggestion.used)}
        <p class="label">Information missing</p>${list(suggestion.missing)}
        <p class="label">Applicable rule</p><p>${esc(suggestion.rule)}</p>
        <p class="label">Who must confirm it</p><p>${esc(suggestion.confirmBy)}</p>
      </details>
      <button class="small" data-act="class-use">Copy the suggestion into the form below</button>
    </div>
    <h2>Preliminary classification</h2>
    ${W.CLASSIFICATION_FIELDS.map((f) => fieldHtml(inc, f, draft[f.k], `draft|${f.k}`)).join('')}
    <div class="stack" style="margin-top:16px"><button class="primary" data-act="class-save">Save as version ${inc.classification.length + 1}</button></div>
    <h2>Versions</h2>
    ${inc.classification.length ? inc.classification.slice().reverse().map((v) => `<div class="answered">
      <p><strong>Version ${v.v}</strong> ${v.status === 'confirmed' ? `<span class="tag v-confirmed">Confirmed by ${esc(v.confirmedBy)}</span>` : '<span class="tag v-unverified">Proposed — not confirmed</span>'}${v === current ? ' <span class="tag cat">Current</span>' : ' <span class="tag cat">Superseded — kept</span>'}</p>
      <p class="muted">${dateTime(v.at)} by ${esc(v.by)}${v.confirmedAt ? ` · confirmed ${dateTime(v.confirmedAt)}` : ''}</p>
      <ul class="plain">${W.CLASSIFICATION_FIELDS.filter((f) => filled(v.values[f.k])).map((f) => `<li>${esc(f.label)}: ${esc(show(f.k, v.values[f.k]))}</li>`).join('')}</ul>
      ${v === current && v.status !== 'confirmed' ? '<button class="small" data-act="class-confirm">Confirm this version (authorised person)</button>' : ''}
    </div>`).join('') : '<p class="muted">No version saved yet.</p>'}`, {
    'class-use': () => { Object.assign(draft, suggestion.values); return S.shell.rerender(); },
    'class-save': async () => {
      if (!Object.values(draft).some(filled)) return toast('Fill in at least one line first.', 'error');
      if (await act((i, c) => M.proposeClassification(i, c, draft, 'advisor'))) toast('Saved as a new version. Earlier versions are kept.');
    },
    'class-confirm': () => sheet('Confirm classification', `
      <p>Confirming records that an authorised person has reviewed and accepted version ${current.v}.</p>
      <label>Name of the authorised person <input name="name" value="${esc(S.user.name)}" autocomplete="off"></label>
      <div class="stack" style="margin-top:16px"><button class="primary" data-act="class-confirm-save">Confirm</button></div>`, {
      'class-confirm-save': async () => { if (await act((i, c) => M.confirmClassification(i, c, sheetValues().name))) closeSheet(); },
    }),
  });
  // The form is a working copy until "Save as version" is tapped, so it is not bound to the incident.
  const root = S.shell.app;
  const bound = root.onchange;
  root.onchange = (e) => {
    const bind = e.target.dataset?.bind;
    if (bind?.startsWith('draft|')) draft[bind.slice(6)] = e.target.value.trim();
    else bound(e);
  };
};

// Information completeness review

SCREENS['s2/completeness'] = (inc) => {
  const gaps = M.completeness(inc);
  const complete = inc.stages[2]?.completedAt;
  const tasks = M.records(inc, 'tasks').filter((t) => t.fromGap).length;
  page(inc, 'completeness', `
    <p class="muted">What is known, what is not, and what still has to be done. You can continue with gaps: they are carried into the investigation plan.</p>
    ${Object.entries(M.COMPLETENESS_TITLES).map(([k, t]) => `<details class="more" ${['confirmed', 'unverified'].includes(k) || !gaps[k].length ? '' : 'open'}>
      <summary>${esc(t)} <span class="chip ${k === 'confirmed' || !gaps[k].length ? 'ok' : k === 'conflicting' && gaps[k].length ? 'urgent' : 'offline'}" style="margin-left:8px">${gaps[k].length}</span></summary>
      ${gaps[k].length ? `<ul class="plain">${gaps[k].map((g) => `<li>${k === 'confirmed' ? vTag('confirmed') : k === 'unverified' ? vTag('unverified') : ''} ${esc(g)}</li>`).join('')}</ul>` : '<p class="muted">Nothing outstanding.</p>'}
    </details>`).join('')}
    <div class="stack" style="margin-top:20px">
      <button data-act="plan-gaps">Add these gaps to the investigation plan${tasks ? ` (${tasks} already added)` : ''}</button>
      ${complete ? `<a class="button primary big" href="${href(inc, 's3')}">Go to Stage 3: Investigation</a>`
        : '<button class="primary big" data-act="complete2">Complete Stage 2 and move to Stage 3</button>'}
    </div>`, {
    'plan-gaps': async () => {
      let added = [];
      if (await act((i, c) => { added = M.planFromGaps(i, c); })) toast(added.length ? `${plural(added.length, 'task')} added to the investigation plan.` : 'Every gap is already in the investigation plan.');
    },
    complete2: async () => { if (await act((i, c) => M.completeStage(i, c, 2), false)) go(href(inc, 's3')); },
  });
};

