// Incident Overview, Timeline, Open items, Summary and handover, Audit history, Guidance,
// Incident settings, and the toolbar that is on every incident screen.
import * as M from './model.js';
import * as W from './workflow.js';
import * as store from './store.js';
import * as adapter from './adapter.js';
import {
  S, TOP, SCREENS, GLOBAL, esc, go, ctx, href, act, screen, frame, sheet, closeSheet, sheetValues, toast, vTag, stateChip,
  time, dateTime, toLocalInput, plural, loadUser, saveSettings, forget,
} from './ui-core.js';
import { addEvidenceFile } from './ui-evidence.js';

// Toolbar: five buttons always in reach, with every tool one tap further under "More".

const TOOLS = [
  ['tool-note', 'Add note'],
  ['tool-photo', 'Take photo'],
  ['tool-voice', 'Record voice note'],
  ['tool-action', 'Add action'],
  ['tool-witness', 'Add witness'],
  ['tool-open', 'View open items'],
  ['tool-timeline', 'View timeline'],
  ['tool-summary', 'Generate current summary'],
  ['tool-support', 'Request support'],
  ['tool-unverify', 'Mark information as unverified'],
  ['tool-correct', 'Correct previous entry'],
  ['tool-guidance', 'View applicable procedure guidance'],
  ['tool-file', 'Attach a file or document'],
  ['tool-overview', 'Incident overview'],
];

S.toolbar = () => `<nav class="toolbar" aria-label="Incident tools">
    <button data-act="tool-note">Note</button>
    <button data-act="tool-photo">Photo</button>
    <button data-act="tool-voice">Voice</button>
    <button data-act="tool-action">Action</button>
    <button data-act="tool-more">More</button>
  </nav>`;

const categoryOptions = (selected) => Object.entries(W.CATEGORIES).map(([v, l]) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${esc(l)}</option>`).join('');
const entryLabel = (e) => `#${e.n} ${time(e.at)} ${e.text}`.slice(0, 110);

function entryPicker(entries, action, empty) {
  if (!entries.length) return `<p class="muted">${esc(empty)}</p>`;
  return entries.slice().reverse().map((e) => `<button class="pick" style="text-align:left;margin-top:8px" data-act="${action}" data-id="${e.id}">${esc(entryLabel(e))}</button>`).join('');
}

function correctSheet(id) {
  const e = S.inc.timeline.find((x) => x.id === id);
  sheet(`Correct entry #${e.n}`, `
    <p class="muted">The original entry stays in the timeline. Your correction is added as a new entry linked to it.</p>
    <label>Corrected entry <textarea name="text" rows="4">${esc(e.text)}</textarea></label>
    <label>Kind of entry <select name="category">${categoryOptions(e.category)}</select></label>
    <label>When it happened <input name="at" type="datetime-local" value="${toLocalInput(e.at)}"></label>
    <label>Why is it being corrected? <input name="reason" autocomplete="off"></label>
    <div class="stack" style="margin-top:16px"><button class="primary" data-act="correct-save">Save correction</button></div>`, {
    'correct-save': async () => {
      const v = sheetValues();
      if (await act((i, c) => M.correctEntry(i, c, id, { text: v.text, category: v.category, at: v.at ?? undefined, reason: v.reason }), false)) {
        closeSheet();
        await S.shell.rerender();
      }
    },
  });
}

function unverifySheet(id) {
  const e = S.inc.timeline.find((x) => x.id === id);
  sheet(`Mark entry #${e.n} as unverified`, `
    <p>${esc(e.text)}</p>
    <label>Why is it no longer confirmed? <input name="reason" autocomplete="off"></label>
    <div class="stack" style="margin-top:16px"><button class="primary" data-act="unverify-save">Mark as unverified</button></div>`, {
    'unverify-save': async () => {
      if (await act((i, c) => M.markUnverified(i, c, id, sheetValues().reason), false)) {
        closeSheet();
        await S.shell.rerender();
      }
    },
  });
}

function noteSheet() {
  sheet('Add note', `
    <label>Note <textarea name="text" rows="4" placeholder="Type, or tap the mic on your keyboard to dictate"></textarea></label>
    <label>Kind of entry <select name="category">${categoryOptions('reported')}</select>
      <span class="hint">"Confirmed fact" means you have checked it yourself. If someone told you, use "Reported information" or "Witness account".</span></label>
    <label>When it happened <input name="at" type="datetime-local" value="${toLocalInput(Date.now())}"></label>
    <div class="stack" style="margin-top:16px"><button class="primary big" data-act="note-save">Save note</button></div>`, {
    'note-save': async () => {
      const v = sheetValues();
      if (await act((i, c) => M.addEntry(i, c, { text: v.text, category: v.category, at: v.at ?? undefined }), false)) {
        closeSheet();
        await S.shell.rerender();
        toast('Note added to the timeline.');
      }
    },
  });
}

Object.assign(GLOBAL, {
  'tool-more': () => sheet('Incident tools', `<div class="tools">${TOOLS.map(([a, l]) => `<button data-act="${a}">${esc(l)}</button>`).join('')}</div>`),
  'tool-overview': () => { closeSheet(); go(href(S.inc)); },
  'tool-open': () => { closeSheet(); go(href(S.inc, 'open')); },
  'tool-timeline': () => { closeSheet(); go(href(S.inc, 'timeline')); },
  'tool-summary': () => { closeSheet(); go(href(S.inc, 'summary')); },
  'tool-guidance': () => { closeSheet(); go(href(S.inc, 'guidance')); },
  'tool-note': noteSheet,
  'tool-photo': () => {
    closeSheet();
    S.shell.capturePhoto(async (file) => {
      const rec = await addEvidenceFile(file, { kind: 'Photograph' });
      go(href(S.inc, `r/evidence/${rec.id}`));
    });
  },
  'tool-file': () => {
    closeSheet();
    S.shell.chooseFile(async (file) => {
      const rec = await addEvidenceFile(file, { description: file.name });
      go(href(S.inc, `r/evidence/${rec.id}`));
    });
  },
  'tool-voice': () => sheet('Record voice note', `
    <p class="muted">The recording is saved as evidence and added to the timeline. You can transcribe it afterwards.</p>
    <button class="primary big" data-act="voice-toggle">Start recording</button>
    <p class="error" data-role="voice-error" hidden></p>`, {
    'voice-toggle': (el) => S.shell.recordAudio(el, async (blob) => {
      const rec = await addEvidenceFile(new File([blob], 'voice-note', { type: blob.type }), { kind: 'Audio', description: 'Voice note' });
      closeSheet();
      go(href(S.inc, `r/evidence/${rec.id}`));
    }, (message) => {
      const error = S.shell.app.querySelector('[data-role=voice-error]');
      error.textContent = message;
      error.hidden = false;
    }),
  }),
  'tool-action': () => sheet('Add action', `
    <label>What needs to be done? <textarea name="description" rows="3" placeholder="Type, or tap the mic on your keyboard to dictate"></textarea></label>
    <label>Owner <input name="owner" autocomplete="off"></label>
    <label>Due <input name="dueDate" type="date"></label>
    <div class="stack" style="margin-top:16px"><button class="primary big" data-act="action-save">Save action</button></div>`, {
    'action-save': async () => {
      const v = sheetValues();
      if (!v.description) return toast('Describe the action first.', 'error');
      if (await act((i, c) => M.addRecord(i, c, 'actions', { ...v, type: 'immediate' }), false)) {
        closeSheet();
        await S.shell.rerender();
        toast('Action added. It stays in the open items until it is done.');
      }
    },
  }),
  'tool-witness': async () => {
    closeSheet();
    let rec;
    if (await act((i, c) => { rec = M.addRecord(i, c, 'witnesses', {}); }, false)) go(href(S.inc, `r/witnesses/${rec.id}`));
  },
  'tool-support': () => sheet('Request support', `
    <p class="muted">This records the request and adds it to the open items. The prototype does not send it: use Share afterwards, or phone.</p>
    <label>Support needed <select name="kind">${W.COLLECTIONS.support.fields[0].options.map((o) => `<option>${esc(o)}</option>`).join('')}</select></label>
    <label>What is needed? <textarea name="details" rows="3"></textarea></label>
    <div class="stack" style="margin-top:16px"><button class="primary big" data-act="support-save">Record request</button></div>`, {
    'support-save': async () => {
      const v = sheetValues();
      if (!await act((i, c) => M.addRecord(i, c, 'support', v), false)) return;
      const text = `Support requested for incident ${S.inc.ref}: ${v.kind}. ${v.details}\n${S.inc.start.what} — ${S.inc.start.where}`;
      sheet('Request recorded', `<p>The request is on the file. Send it yourself now:</p>
        <textarea readonly rows="5">${esc(text)}</textarea>
        <div class="stack" style="margin-top:12px"><button class="primary" data-act="support-share">Share or copy the request</button></div>`, {
        'support-share': () => shareText(text),
        'sheet-close': async () => { closeSheet(); await S.shell.rerender(); },
      });
    },
  }),
  'tool-unverify': () => sheet('Mark information as unverified', `
    <p class="muted">Choose a confirmed entry. It stays visible, and a linked entry records that it is no longer confirmed.</p>
    ${entryPicker(M.effectiveEntries(S.inc).filter((e) => e.verification === 'confirmed'), 'unverify-pick', 'There are no confirmed entries.')}`, {
    'unverify-pick': (el) => unverifySheet(el.dataset.id),
  }),
  'tool-correct': () => sheet('Correct previous entry', `
    <p class="muted">Choose the entry to correct. The original stays visible.</p>
    ${entryPicker(M.effectiveEntries(S.inc), 'correct-pick', 'There are no entries yet.')}`, {
    'correct-pick': (el) => correctSheet(el.dataset.id),
  }),
});

async function shareText(text, title = 'Incident') {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied. Paste it into a message or email.');
  } catch {
    toast('Press and hold the text to copy it.', 'error');
  }
}

// Overview

SCREENS[''] = (inc) => {
  const st = M.stats(inc);
  const urgent = M.urgentItems(inc);
  const next = M.nextStep(inc);
  const stage = (n, sections) => {
    const p = M.stageProgress(inc, n);
    return `<a class="card" href="${href(inc, `s${n}`)}">
      <strong>Stage ${n} · ${esc(W.STAGES[n].title)}</strong>${stateChip(p.complete ? 'done' : inc.stage === n ? 'started' : inc.stage > n ? 'started' : 'todo')}
      <span class="muted">${p.done} of ${p.total} ${sections} done${p.complete ? ` · marked complete ${dateTime(inc.stages[n].completedAt)}` : ''}${n === 3 && inc.level ? ` · ${esc(W.LEVELS[inc.level].label)}` : ''}</span></a>`;
  };
  const sections = inc.stage === 1 ? W.STAGE1_STEPS : inc.stage === 2 ? W.STAGE2_SECTIONS : W.STAGE3_SECTIONS;
  const notDone = sections.filter(([k]) => ['todo', 'started', 'attention'].includes(M.sectionState(inc, inc.stage, k)));
  const stat = (n, label, path) => `<a class="stat" href="${href(inc, path)}"><strong>${n}</strong><span>${label}</span></a>`;
  screen(frame(inc, inc.ref, '#/inc', `
    <p class="q small" style="margin-top:0">${esc(inc.start.what || 'No description yet')}</p>
    <p class="muted">${esc(inc.start.where || 'Location not yet known')} · ${dateTime(inc.start.when)}${inc.demo ? ' · Demonstration incident: all details are synthetic' : ''}</p>
    <h2>Needs attention next</h2>
    ${urgent.slice(0, 3).map((i) => `<a class="item urgent" style="display:block;color:inherit;text-decoration:none" href="${href(inc, i.link ?? 'open')}"><p><strong>Urgent:</strong> ${esc(i.text)}</p></a>`).join('')}
    ${urgent.length > 3 ? `<p><a href="${href(inc, 'open')}">and ${urgent.length - 3} more urgent</a></p>` : ''}
    ${next.route ? `<a class="button primary big" style="margin-top:10px" href="${href(inc, next.route)}">${esc(next.text)}</a>` : `<p>${esc(next.text)}</p>`}
    <h2>Stages</h2>
    ${stage(1, 'steps')}${stage(2, 'sections')}${stage(3, 'sections')}
    <div class="stat-grid">
      ${stat(st.open, 'Open items', 'open')}${stat(st.timeline, 'Timeline entries', 'timeline')}${stat(st.unverified, 'Unverified', 'timeline')}
      ${stat(st.evidence, 'Evidence', 's2/evidence')}${stat(st.people, 'People', 's2/people')}${stat(st.actions, 'Actions', 's3/actions')}
    </div>
    <div class="stack">
      <a class="button" href="${href(inc, 'summary')}">Summary and handover</a>
      <a class="button" href="${href(inc, 'timeline')}">Timeline</a>
      <a class="button" href="${href(inc, 'open')}">Open items</a>
    </div>
    <h2>Not yet completed in Stage ${inc.stage}</h2>
    ${notDone.length ? `<ul class="plain">${notDone.map(([k, t]) => `<li><a href="${href(inc, `s${inc.stage}/${k}`)}">${esc(t)}</a></li>`).join('')}</ul>` : '<p class="muted">Every section of this stage is done.</p>'}
    <h2>Incident file</h2>
    <div class="stack">
      <a class="button" href="${href(inc, 'summary/export')}">Export status (INX placeholder)</a>
      <a class="button" href="${href(inc, 'audit')}">Audit history</a>
      <a class="button" href="${href(inc, 'guidance')}">Procedure guidance</a>
      ${inc.closedAt ? '<button data-act="reopen">Reopen this incident file</button>' : '<button data-act="close">Close this incident file</button>'}
      <button class="danger" data-act="delete">Delete this incident from this phone</button>
    </div>`), {
    close: () => sheet('Close incident file', `
      <p>${st.open ? `${plural(st.open, 'item')} still open. They stay on the file.` : 'No open items.'} A closed file can be reopened.</p>
      <label>Closing note <textarea name="note" rows="3"></textarea></label>
      <div class="stack" style="margin-top:16px"><button class="primary" data-act="close-save">Close the file</button></div>`, {
      'close-save': async () => { if (await act((i, c) => M.closeIncident(i, c, sheetValues().note))) closeSheet(); },
    }),
    reopen: () => act((i, c) => M.reopenIncident(i, c)),
    delete: () => sheet('Delete this incident', `
      <p>This removes the incident, its evidence files and its audit history from this phone. It cannot be undone. In a production version this would be limited to authorised roles.</p>
      <label>Type DELETE to confirm <input name="confirm" autocomplete="off" autocapitalize="characters"></label>
      <div class="stack" style="margin-top:16px"><button class="danger" data-act="delete-confirm">Delete from this phone</button></div>`, {
      'delete-confirm': async () => {
        if (sheetValues().confirm !== 'DELETE') return toast('Type DELETE in capitals to confirm.', 'error');
        await S.saving.catch(() => {});
        await store.deleteIncident(inc.id);
        forget();
        go('#/inc');
      },
    }),
  });
};

// Timeline

const timelineView = { category: 'all', unverifiedOnly: false, newestFirst: true };

SCREENS.timeline = (inc) => {
  const all = M.chronology(inc);
  const shown = all.filter((e) => (timelineView.category === 'all' || e.category === timelineView.category)
    && (!timelineView.unverifiedOnly || (e.verification !== 'confirmed' && !e.supersededBy)));
  if (timelineView.newestFirst) shown.reverse();
  const conflicts = inc.conflicts.filter((c) => !c.resolvedAt);
  const n = (id) => inc.timeline.find((e) => e.id === id)?.n;
  screen(frame(inc, 'Timeline', href(inc), `
    <div class="stack"><button class="primary" data-act="tool-note">Add entry</button></div>
    <div class="chips" style="margin-top:12px">
      <button class="chip ${timelineView.category === 'all' ? 'stage' : ''}" data-act="filter" data-v="all">All ${all.length}</button>
      ${Object.entries(W.CATEGORIES).map(([v, l]) => `<button class="chip ${timelineView.category === v ? 'stage' : ''}" data-act="filter" data-v="${v}">${esc(l)} ${all.filter((e) => e.category === v).length}</button>`).join('')}
    </div>
    <div class="chips" style="margin-top:6px">
      <button class="chip ${timelineView.unverifiedOnly ? 'stage' : ''}" data-act="only-unverified">Only unverified or unknown</button>
      <button class="chip" data-act="order">${timelineView.newestFirst ? 'Newest first' : 'Oldest first'} — switch</button>
    </div>
    ${conflicts.length ? `<h2>Conflicting information</h2>${conflicts.map((c) => `<div class="item urgent">
      <p>${[c.a, c.b].filter(Boolean).map((id) => `#${n(id)}`).join(' and ')} ${esc(c.note)}</p>
      <button class="small" data-act="resolve" data-id="${c.id}">Record how it was resolved</button></div>`).join('')}` : ''}
    <p class="muted" style="margin-top:12px">Built automatically from everything recorded, in time order. Entries are never edited or removed: a correction is a new, linked entry.</p>
    ${shown.map((e) => `<div class="entry v-${e.verification} ${e.supersededBy ? 'superseded' : ''}" id="e${e.n}">
      <p class="meta"><strong>${dateTime(e.at)}</strong> · #${e.n} <span class="tag cat">${esc(W.CATEGORIES[e.category])}</span> ${vTag(e.verification)}</p>
      <p class="text">${esc(e.text)}</p>
      ${e.supersededBy ? `<p class="meta">Original kept. Corrected by <a href="#e${e.supersededBy}" data-act="jump" data-n="${e.supersededBy}">entry #${e.supersededBy}</a>.</p>` : ''}
      ${e.correctsN ? `<p class="meta">Correction of entry #${e.correctsN}${e.reason ? `: ${esc(e.reason)}` : ''}</p>` : ''}
      <p class="meta">Recorded ${dateTime(e.recordedAt)} by ${esc(e.by)}${Math.abs(e.recordedAt - e.at) > 300000 ? ' (entered after the event)' : ''}</p>
      ${e.supersededBy ? '' : `<div class="row">
        <button class="small" data-act="correct-pick" data-id="${e.id}">Correct</button>
        ${e.verification === 'confirmed' ? `<button class="small" data-act="unverify-pick" data-id="${e.id}">Mark unverified</button>` : ''}
        <button class="small" data-act="conflict" data-id="${e.id}">Flag conflict</button>
      </div>`}
    </div>`).join('') || '<p class="muted">No entries match.</p>'}`), {
    filter: (el) => { timelineView.category = el.dataset.v; return S.shell.rerender(); },
    'only-unverified': () => { timelineView.unverifiedOnly = !timelineView.unverifiedOnly; return S.shell.rerender(); },
    order: () => { timelineView.newestFirst = !timelineView.newestFirst; return S.shell.rerender(); },
    jump: (el) => document.getElementById(`e${el.dataset.n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    'correct-pick': (el) => correctSheet(el.dataset.id),
    'unverify-pick': (el) => unverifySheet(el.dataset.id),
    conflict: (el) => {
      const others = M.effectiveEntries(inc).filter((e) => e.id !== el.dataset.id);
      sheet('Flag conflicting information', `
        <label>Which entry does it conflict with? <select name="b"><option value="">Something not in the timeline</option>${others.map((e) => `<option value="${e.id}">${esc(entryLabel(e))}</option>`).join('')}</select></label>
        <label>What conflicts? <textarea name="note" rows="3"></textarea></label>
        <div class="stack" style="margin-top:16px"><button class="primary" data-act="conflict-save">Flag the conflict</button></div>`, {
        'conflict-save': async () => {
          const v = sheetValues();
          if (await act((i, c) => M.flagConflict(i, c, el.dataset.id, v.b || null, v.note))) closeSheet();
        },
      });
    },
    resolve: (el) => sheet('Resolve conflict', `
      <label>How was it resolved, and what evidence resolved it? <textarea name="resolution" rows="3"></textarea></label>
      <div class="stack" style="margin-top:16px"><button class="primary" data-act="resolve-save">Record resolution</button></div>`, {
      'resolve-save': async () => { if (await act((i, c) => M.resolveConflict(i, c, el.dataset.id, sheetValues().resolution))) closeSheet(); },
    }),
  });
};

// Open items

SCREENS.open = (inc) => {
  const open = M.openItems(inc);
  const closed = inc.openItems.filter((i) => i.status === 'closed').sort((a, b) => b.closedAt - a.closedAt);
  const row = (i) => `<div class="item ${i.urgent ? 'urgent' : ''}">
      <p>${i.urgent ? '<strong>Urgent:</strong> ' : ''}${esc(i.text)}</p>
      <p class="muted">Stage ${i.stage} · open since ${dateTime(i.openedAt)}${i.auto ? '' : ` · added by ${esc(i.openedBy)}`}</p>
      <div class="row">
        ${i.link ? `<a class="button small" href="${href(inc, i.link)}">Go to it</a>` : ''}
        ${i.locked ? '<span class="muted">Closes when the record is updated</span>' : `<button class="small" data-act="close-item" data-id="${i.id}">Close with a note</button>`}
      </div>
    </div>`;
  screen(frame(inc, 'Open items', href(inc), `
    <p class="muted">Everything not yet dealt with, from every stage. Nothing drops off this list until it is closed.</p>
    ${open.length ? open.map(row).join('') : '<div class="notice">No open items.</div>'}
    <div class="stack" style="margin-top:16px"><button data-act="add-item">Add an item</button></div>
    ${closed.length ? `<details class="more"><summary>Closed items (${closed.length})</summary>${closed.map((i) => `<div class="item">
      <p>${esc(i.text)}</p><p class="muted">Closed ${dateTime(i.closedAt)} by ${esc(i.closedBy)}: ${esc(i.note)}</p></div>`).join('')}</details>` : ''}`), {
    'close-item': (el) => sheet('Close item', `
      <label>How was it dealt with? <textarea name="note" rows="3"></textarea></label>
      <div class="stack" style="margin-top:16px"><button class="primary" data-act="close-item-save">Close item</button></div>`, {
      'close-item-save': async () => { if (await act((i, c) => M.closeItem(i, c, el.dataset.id, sheetValues().note))) closeSheet(); },
    }),
    'add-item': () => sheet('Add an open item', `
      <label>What needs attention? <textarea name="text" rows="3"></textarea></label>
      <label class="check"><input type="checkbox" name="urgent"> <span>Urgent</span></label>
      <div class="stack" style="margin-top:16px"><button class="primary" data-act="add-item-save">Add item</button></div>`, {
      'add-item-save': async () => { if (await act((i, c) => M.addOpenItem(i, c, sheetValues()))) closeSheet(); },
    }),
  });
};

// Summary and handover

const summaryView = { health: false };
const TABS = [['handover', 'Handover'], ['brief', 'Initial brief'], ['report', 'Investigation report'], ['export', 'Export']];
const TAG_FILL = { confirmed: 'C8E6C9', unverified: 'FFE0B2', unknown: 'E0E0E0' };
export const SUMMARY_EXTRAS = {}; // other modules (AI drafts) add a block under a summary tab

function summaryOf(inc, tab) {
  const options = { health: summaryView.health && M.can(S.user.role, 'health') };
  if (tab === 'brief') return { title: `Initial response brief — ${inc.ref}`, sections: M.initialBrief(inc, options) };
  if (tab === 'report') return { title: `Investigation report — ${inc.ref}`, sections: M.investigationReport(inc, options) };
  return { title: `Handover summary — ${inc.ref}`, sections: M.handover(inc, ctx(), options) };
}

const sectionsHtml = (sections) => `<div class="brief">${sections.map((s) => `<h3>${esc(s.title)}</h3>
    <ul>${s.items.map((i) => `<li>${vTag(i.tag)} ${esc(i.text)}</li>`).join('')}</ul>`).join('')}</div>`;

// Photos that are not restricted are added to the Word version of the investigation report.
export async function evidenceImages(inc) {
  const blocks = [];
  const photos = M.records(inc, 'evidence').filter((e) => e.mediaType?.startsWith('image/') && (e.restriction ?? 'none') === 'none').slice(0, 40);
  for (const e of photos) {
    try {
      const { bytes, width, height } = await S.shell.toJpeg(await store.getMedia(e.mediaKey), 1400, 0.8);
      blocks.push({ image: { jpeg: bytes, width, height }, caption: `${e.number} — ${e.description || 'no description'} (${dateTime(e.capturedAt)})` });
    } catch {
      blocks.push({ p: `${e.number} could not be added as a picture. The original is in the app.` });
    }
  }
  return blocks.length ? [{ h1: 'Evidence photographs' }, ...blocks] : [];
}

export async function wordFile(inc, title, sections, extraBlocks = []) {
  const blocks = sections.flatMap((s) => [{ h1: s.title }, { rows: s.items.map((i) => [i.tag ? W.VERIFICATION[i.tag] : '', i.text, TAG_FILL[i.tag]]) }]);
  const blob = S.shell.buildDocument({
    title,
    details: [
      ['Reference', inc.ref],
      ['Status', `Stage ${inc.stage}: ${W.STAGES[inc.stage].title} — ${M.statusLabel(inc)}`],
      ['Prepared', `${ctx().by} — ${dateTime(Date.now())}`],
      ['Reading this document', 'Each line is marked Confirmed, Reported but unverified, or Unknown.'],
      ...(inc.demo ? [['Demonstration', 'All details in this document are synthetic.']] : []),
    ],
    blocks: [...blocks, ...extraBlocks],
  });
  return new File([blob], `${title.replace(/—/g, '-').replace(/[^\w -]+/g, '').trim()}.docx`, { type: blob.type });
}

SCREENS.summary = (inc, [, tab = 'handover']) => {
  const tabs = `<div class="chips">${TABS.map(([k, l]) => `<a class="chip ${tab === k ? 'stage' : 'link'}" href="${href(inc, `summary/${k}`)}">${l}</a>`).join('')}</div>`;
  if (tab === 'export') return exportScreen(inc, tabs);
  const { title, sections } = summaryOf(inc, tab);
  const canHealth = M.can(S.user.role, 'health');
  screen(frame(inc, 'Summary', href(inc), `
    ${tabs}
    <div class="stack" style="margin-top:12px">
      <button class="primary" data-act="share">Share or copy as text</button>
      <button data-act="word">Save Word document</button>
      <p class="error" data-role="error" hidden></p>
    </div>
    <div class="notice health" style="margin-top:12px">${summaryView.health && canHealth
      ? 'Health details are included below. Handle this summary as restricted. <button class="small" data-act="health-summary">Leave them out</button>'
      : `Health details are left out. ${canHealth ? '<button class="small" data-act="health-summary">Include health details</button>' : ''}`}</div>
    ${SUMMARY_EXTRAS[tab]?.(inc) ?? ''}
    <h2>${esc(title)}</h2>
    <p class="muted">Generated ${dateTime(Date.now())} from the incident file. ${tab === 'report' ? 'Findings that are not approved are marked as such.' : ''}</p>
    ${sectionsHtml(sections)}`), {
    share: () => shareText(M.toText(title, sections), title),
    word: async (el) => {
      const error = S.shell.app.querySelector('[data-role=error]');
      error.hidden = true;
      el.disabled = true;
      el.textContent = 'Building document…';
      try {
        const file = await wordFile(inc, title, sections, tab === 'report' ? await evidenceImages(inc) : []);
        el.textContent = 'Share or save document';
        el.disabled = false;
        // Building can take long enough that iOS no longer counts it as a tap, so sharing needs a second one.
        S.handlers.word = () => S.shell.deliver(file);
        if (!navigator.canShare?.({ files: [file] })) S.shell.deliver(file);
      } catch (err) {
        el.textContent = 'Save Word document';
        el.disabled = false;
        error.textContent = `Couldn't build the document. ${err.message}`;
        error.hidden = false;
      }
    },
    'health-summary': async () => {
      summaryView.health = !summaryView.health;
      if (summaryView.health) await act((i, c) => M.recordAccess(i, c, 'Health details included in a summary'), false);
      return S.shell.rerender();
    },
    ...SUMMARY_EXTRAS.handlers?.(inc, tab),
  });
};

// Export to INX. PLACEHOLDER: the mock adapter stands in for the real system.
function exportScreen(inc, tabs) {
  const state = inc.exportState;
  const allowed = W.EXPORT_FLOW[state.status];
  const payload = M.exportPayload(inc);
  const last = state.history.at(-1);
  const order = ['local', 'ready', 'approved', 'pending', 'submitted'];
  screen(frame(inc, 'Export', href(inc), `
    ${tabs}
    <div class="notice" style="margin-top:12px"><strong>Placeholder.</strong> There is no connection to INX in this prototype. A mock adapter receives the export package and answers the way a real system would. Nothing leaves this phone.</div>
    <h2>Export status</h2>
    <div class="chips">${order.map((s) => `<span class="chip ${state.status === s ? 'stage' : ''}">${esc(W.EXPORT_STATES[s])}</span>`).join('')}
      ${state.status === 'failed' ? `<span class="chip urgent">${esc(W.EXPORT_STATES.failed)}</span>` : ''}</div>
    ${state.status === 'submitted' ? `<p>Acknowledged by the receiving system: <strong>${esc(last.ack)}</strong> at ${dateTime(last.at)} (mock).</p>` : ''}
    ${state.status === 'failed' ? `<p class="error">${esc(last.error ?? 'Submission failed.')}</p>` : ''}
    ${state.status === 'pending' ? '<p>Waiting for the receiving system to acknowledge. It is not shown as submitted until it does.</p>' : ''}
    <div class="stack" style="margin-top:12px">
      ${allowed.includes('ready') ? '<button class="primary" data-act="export-to" data-v="ready">Mark ready for review</button>' : ''}
      ${allowed.includes('approved') ? '<button class="primary" data-act="export-to" data-v="approved">Approve for submission (authorised person)</button>' : ''}
      ${allowed.includes('pending') ? `<button class="primary" data-act="export-submit">${state.status === 'failed' ? 'Try the submission again' : 'Submit to INX (mock)'}</button>` : ''}
      ${allowed.includes('local') ? '<button data-act="export-to" data-v="local">Return to local only</button>' : ''}
      <button data-act="export-share">Share the export package (JSON file)</button>
    </div>
    <h2>What would be sent</h2>
    <p class="muted">Incident details, people affected, consequence assessment, critical risks, initial actions, evidence index, notifications, approved findings and corrective actions. Health details are replaced with a restricted marker.</p>
    <details class="more"><summary>Show the export package</summary><pre class="export">${esc(JSON.stringify(payload, null, 2))}</pre></details>
    ${state.history.length ? `<h2>History</h2><ul class="plain">${state.history.map((h) => `<li>${dateTime(h.at)} — ${esc(W.EXPORT_STATES[h.status])} by ${esc(h.by)}${h.ack ? ` — ${esc(h.ack)}` : ''}${h.error ? ` — ${esc(h.error)}` : ''}</li>`).join('')}</ul>` : ''}`), {
    'export-to': (el) => act((i, c) => M.setExportStatus(i, c, el.dataset.v)),
    'export-submit': async (el) => {
      el.disabled = true;
      if (!await act((i, c) => M.setExportStatus(i, c, 'pending'))) return;
      try {
        const { ack } = await adapter.submitToInx(payload, { fail: S.settings.failExport });
        await act((i, c) => M.setExportStatus(i, c, 'submitted', { ack }));
      } catch (err) {
        await act((i, c) => M.setExportStatus(i, c, 'failed', { error: err.message }));
      }
    },
    'export-share': () => S.shell.deliver(new File([JSON.stringify(payload, null, 2)], `${inc.ref}-export.json`, { type: 'application/json' })),
  });
}

// Audit history

SCREENS.audit = async (inc) => {
  await S.saving.catch(() => {});
  const entries = await store.auditFor(inc.id);
  const detail = (d) => Object.entries(d ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ').slice(0, 260);
  screen(frame(inc, 'Audit history', href(inc), `
    <p class="muted">Every change to this incident, in order. Entries are only ever added. Each one is chained to the one before it, so a changed or missing entry can be detected.</p>
    <div class="stack"><button data-act="verify-audit">Check the history is intact</button></div>
    <p data-role="audit-result" role="status"></p>
    <p><strong>${plural(entries.length, 'entry', 'entries')}</strong>, newest first.</p>
    ${entries.slice().reverse().slice(0, 300).map((e) => `<div class="entry">
      <p class="meta"><strong>${dateTime(e.at)}</strong> · #${e.seq} · ${esc(e.by)} (${esc(W.ROLES[e.role]?.label ?? e.role)})</p>
      <p><strong>${esc(e.action)}</strong> ${esc(e.target ?? '')}</p>
      ${detail(e.detail) ? `<p class="meta">${esc(detail(e.detail))}</p>` : ''}
    </div>`).join('')}
    ${entries.length > 300 ? `<p class="muted">Showing the newest 300 of ${entries.length}.</p>` : ''}`), {
    'verify-audit': async () => {
      const result = await M.verifyAudit(entries, inc.audit);
      S.shell.app.querySelector('[data-role=audit-result]').innerHTML = result.ok
        ? `<span class="tag v-confirmed">Intact</span> All ${result.count} entries are present and unchanged.`
        : `<span class="tag critical">Problem</span> The history does not check out at entry ${result.brokenAt}.`;
    },
  });
};

// Guidance

SCREENS.guidance = (inc) => {
  const risks = [...new Set(M.records(inc, 'controlsAssessed').map((c) => c.risk).filter((r) => W.CRITICAL_RISKS[r]))];
  screen(frame(inc, 'Procedure guidance', href(inc), `
    <div class="notice"><strong>Placeholder.</strong> Your organisation's procedures are not loaded in this prototype. These are general prompts. Follow your site emergency procedure and company procedures.</div>
    ${[inc.stage, ...[1, 2, 3].filter((n) => n !== inc.stage)].map((n) => `<details class="more" ${n === inc.stage ? 'open' : ''}>
      <summary>Stage ${n}: ${esc(W.STAGES[n].title)}${n === inc.stage ? ' (current)' : ''}</summary>
      <ul class="plain">${W.GUIDANCE[n].map((g) => `<li>${esc(g)}</li>`).join('')}</ul></details>`).join('')}
    ${risks.length ? `<h2>Critical controls for the risks selected</h2>${risks.map((r) => `<h3>${esc(W.CRITICAL_RISKS[r].label)}</h3>
      <ul class="plain">${W.CRITICAL_RISKS[r].controls.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`).join('')}
      <p class="muted">Sample control library. Replace it with your approved critical controls.</p>` : ''}
    <div class="stack" style="margin-top:16px"><a class="button emergency" href="#/inc/emergency">Emergency guidance</a></div>`));
};

// Incident settings. Sign-in, roles and sync are placeholders and say so.
export const SETTINGS_EXTRAS = []; // other modules (demo scenarios) add sections

TOP.settings = async () => {
  await loadUser();
  const count = (await store.allIncidents()).length;
  const extras = await Promise.all(SETTINGS_EXTRAS.map((x) => x()));
  screen(`${S.shell.header('Incident settings', '#/settings')}
    <h2>Signed in as <span class="tag ai">Placeholder</span></h2>
    <p class="muted">There is no real sign-in yet. The name and role below are trusted as typed. They are stamped on every entry and decide what the app lets you do.</p>
    <label>Your name <input data-set="name" value="${esc(S.user.name)}" autocomplete="name"></label>
    <label>Role <select data-set="role">${Object.entries(W.ROLES).map(([k, r]) => `<option value="${k}" ${S.user.role === k ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></label>
    <ul class="plain muted">
      <li>HSE Advisor: record and edit, view health information.</li>
      <li>HSE Manager: also confirm the classification, approve findings and actions, approve the export.</li>
      <li>Reviewer: record, edit and approve findings and actions. No health information.</li>
      <li>Read only: view. No changes, no health information.</li>
    </ul>
    <h2>Synchronisation <span class="tag ai">Placeholder</span></h2>
    <p class="muted">No server is connected. Changes are counted as "queued" and a mock service clears the queue when the phone is online.</p>
    <label class="check"><input type="checkbox" data-flag="mockSync" ${S.settings.mockSync ? 'checked' : ''}> <span>Run the mock sync</span></label>
    <label class="check"><input type="checkbox" data-flag="failSync" ${S.settings.failSync ? 'checked' : ''}> <span>Make the mock sync fail (to see what failure looks like)</span></label>
    <label class="check"><input type="checkbox" data-flag="failExport" ${S.settings.failExport ? 'checked' : ''}> <span>Make the mock INX submission fail</span></label>
    <h2>Emergency numbers</h2>
    <label>Emergency services number <input data-text="emergencyNumber" value="${esc(S.settings.emergencyNumber)}" inputmode="tel"></label>
    <label>Site emergency number (optional) <input data-text="siteEmergency" value="${esc(S.settings.siteEmergency)}" inputmode="tel"></label>
    ${extras.map((x) => x.html).join('')}
    <p class="muted" style="margin-top:20px">${plural(count, 'incident')} stored on this phone, encrypted with your PIN.</p>`, Object.assign({}, ...extras.map((x) => x.handlers)));
  // These are app settings, not incident data, so they are saved directly.
  const root = S.shell.app;
  root.onchange = async (e) => {
    const el = e.target;
    if (el.dataset.set === 'name') await S.shell.db.setSetting('inspector', el.value.trim());
    else if (el.dataset.set === 'role') await S.shell.db.setSetting('incidentRole', el.value);
    else if (el.dataset.flag) await saveSettings({ [el.dataset.flag]: el.checked });
    else if (el.dataset.text) await saveSettings({ [el.dataset.text]: el.value.trim() });
    await loadUser();
  };
};

