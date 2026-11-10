// Incident home, Start incident and Stage 1: Initial response.
import * as M from './model.js';
import * as W from './workflow.js';
import * as store from './store.js';
import * as adapter from './adapter.js';
import {
  S, TOP, SCREENS, RECORD_EXTRAS, esc, go, ctx, href, act, save, screen, frame, sheet, closeSheet, sheetValues,
  optionButtons, questionFlow, questionList, formHtml, recordCards, addButton, sectionList, vTag,
  time, dateTime, toLocalInput, fromLocalInput, plural, labelOf,
} from './ui-core.js';

const DISCLAIMER = 'A field guide and working incident file. It does not replace emergency services, site emergency procedures or your own judgement.';

// Home (the "Incident" mode of the app's home screen)

export async function renderHome(top = '') {
  const all = await store.allIncidents();
  const active = all.filter((i) => !i.closedAt);
  const queued = all.reduce((n, i) => n + i.sync.pending, 0);
  const online = adapter.isOnline();
  const card = (i) => `<a class="card" href="#/inc/${i.id}">
      <strong>${esc(i.start.what || 'No description yet')}</strong>
      <span class="muted">${esc(i.ref)}${i.demo ? ' · Demo' : ''} · Stage ${i.stage} · ${esc(M.statusLabel(i))} · ${plural(M.urgentItems(i).length, 'urgent item')}</span>
    </a>`;
  screen(`${top}
    <div class="stack">
      <button class="primary big" data-act="start">Start new incident</button>
      ${active.length ? `<a class="button big" href="#/inc/${active[0].id}">Continue active incident</a>` : '<button class="big" disabled>Continue active incident</button>'}
      <a class="button" href="#/inc/previous">View previous incident</a>
      <a class="button emergency" href="#/inc/emergency">Emergency guidance</a>
    </div>
    <div class="status-lines">
      <p><span class="dot ${online ? 'on' : 'off'}"></span><strong>${online ? 'Online' : 'Offline'}</strong> — incidents are saved on this phone and everything here works with no signal.</p>
      <p><span class="dot ${queued ? 'wait' : 'on'}"></span><strong>Sync:</strong> ${!S.settings.mockSync ? 'switched off' : queued ? `${plural(queued, 'change')} queued` : 'nothing waiting'} <em class="muted">(placeholder — no server is connected in this prototype)</em></p>
    </div>
    ${active.length ? `<h2>Active incidents</h2>${active.map(card).join('')}` : ''}
    <p class="muted" style="margin-top:20px">${DISCLAIMER}</p>`, { start: () => go('#/inc/new') });
}

TOP.previous = async () => {
  const all = await store.allIncidents();
  screen(`${S.shell.header('Incidents', '#/inc')}
    ${all.length ? all.map((i) => `<a class="card" href="#/inc/${i.id}">
      <strong>${esc(i.start.what || 'No description yet')}</strong>
      <span class="muted">${esc(i.ref)}${i.demo ? ' · Demo' : ''} · ${dateTime(i.start.when)} · ${esc(M.statusLabel(i))}</span>
    </a>`).join('') : '<p class="muted">No incidents are stored on this phone.</p>'}`);
};

TOP.emergency = async () => {
  const number = S.settings.emergencyNumber || '000';
  screen(`${S.shell.header('Emergency guidance', '#/inc')}
    <div class="danger-banner static">If life is at risk, call emergency services now.</div>
    <div class="stack" style="margin-top:12px">
      <a class="button big emergency" href="tel:${esc(number)}">Call ${esc(number)}</a>
      ${S.settings.siteEmergency ? `<a class="button big" href="tel:${esc(S.settings.siteEmergency)}">Call site emergency ${esc(S.settings.siteEmergency)}</a>` : ''}
    </div>
    <h2>While help is coming</h2>
    <ol class="plain">${W.EMERGENCY_GUIDANCE.map((g) => `<li>${esc(g)}</li>`).join('')}</ol>
    <p class="muted">Emergency numbers can be changed in Settings › Incident settings. ${DISCLAIMER}</p>
    <div class="stack" style="margin-top:16px"><a class="button primary" href="#/inc/new">Start new incident</a></div>`);
};

// Start incident: five questions, nothing compulsory, then straight into Stage 1.

TOP.new = async () => {
  const picked = { danger: null, injured: null };
  const pick = (name) => `<div class="opts opts-3">${[['yes', 'Yes'], ['no', 'No'], ['unsure', 'Unsure']].map(([v, l]) =>
    `<button type="button" class="opt" data-act="pick" data-name="${name}" data-v="${v}" aria-pressed="false">${l}</button>`).join('')}</div>`;
  screen(`${S.shell.header('Start incident', '#/inc')}
    <p class="muted">Five quick questions. Leave anything you do not know yet.</p>
    <label>What happened? <textarea name="what" rows="3" placeholder="Type, or tap the mic on your keyboard to dictate"></textarea></label>
    <label>Where did it happen? <input name="where" autocomplete="off"></label>
    <label>When did it happen? <input name="when" type="datetime-local" value="${toLocalInput(Date.now())}"></label>
    <p class="q small">Is anyone still in danger?</p>${pick('danger')}
    <p class="q small">Is anyone injured or potentially exposed?</p>${pick('injured')}
    <button class="primary big" style="margin-top:20px" data-act="begin">Start initial response</button>
    <p class="muted">${DISCLAIMER}</p>`, {
    pick: (el) => {
      picked[el.dataset.name] = el.dataset.v;
      for (const b of el.parentElement.children) {
        b.classList.toggle('on', b === el);
        b.setAttribute('aria-pressed', b === el);
      }
    },
    begin: async (el) => {
      el.disabled = true;
      const value = (name) => S.shell.app.querySelector(`[name=${name}]`).value;
      S.inc = M.createIncident(ctx(), { what: value('what'), where: value('where'), when: fromLocalInput(value('when')) ?? Date.now(), ...picked });
      await save();
      go(href(S.inc, 's1/danger'));
    },
  });
};

// Stage 1 screens

const stepNav = (inc, key) => {
  const i = W.STAGE1_STEPS.findIndex(([k]) => k === key);
  const next = W.STAGE1_STEPS[i + 1];
  const previous = W.STAGE1_STEPS[i - 1];
  return `<div class="stack" style="margin-top:24px">
      ${next ? `<a class="button primary big" href="${href(inc, `s1/${next[0]}`)}">Next: ${esc(next[1])}</a>` : ''}
      ${previous ? `<a class="button" href="${href(inc, `s1/${previous[0]}`)}">Back: ${esc(previous[1])}</a>` : ''}
    </div>`;
};
const stepLabel = (key) => `<p class="muted">Stage 1 · Step ${W.STAGE1_STEPS.findIndex(([k]) => k === key) + 1} of ${W.STAGE1_STEPS.length}</p>`;

SCREENS.s1 = (inc) => {
  screen(frame(inc, 'Stage 1: Initial response', href(inc), `
    <p class="muted">Short and in order: danger, people, scene, notifications, review.</p>
    ${sectionList(inc, 1, W.STAGE1_STEPS)}`));
};

// The immediate controls list, shown on the danger screen and the scene screen.
function controlsBlock(inc) {
  const list = M.records(inc, 'controls');
  return `<h2>Immediate controls applied</h2>
    ${list.length ? '' : '<p class="muted">None recorded yet. Tap a prompt above, or add one here.</p>'}
    ${list.map((c) => `<div class="card control">
      <div class="row between"><strong>${esc(c.number)}</strong><a href="${href(inc, `r/controls/${c.id}`)}">More</a></div>
      <label>Control applied <input data-bind="r|controls|${c.id}|control" value="${esc(c.control)}" autocomplete="off"></label>
      <label>Person responsible <input data-bind="r|controls|${c.id}|responsible" value="${esc(c.responsible)}" autocomplete="off" placeholder="Who is doing this?"></label>
      <label>Time started <input type="datetime-local" data-type="datetime" data-bind="r|controls|${c.id}|initiatedAt" value="${toLocalInput(c.initiatedAt)}"></label>
      <div class="opts opts-2">
        <button class="opt ${c.verified === 'yes' ? 'on' : ''}" data-act="control-verify" data-id="${c.id}" data-v="yes">Verified</button>
        <button class="opt ${c.verified === 'yes' ? '' : 'on'}" data-act="control-verify" data-id="${c.id}" data-v="no">Not yet verified</button>
      </div>
    </div>`).join('')}
    <div style="margin-top:10px"><button data-act="control-add">Add a control</button></div>`;
}

const controlHandlers = {
  'control-verify': (el) => act((inc, c) => M.updateRecord(inc, c, 'controls', el.dataset.id, { verified: el.dataset.v, verifiedBy: el.dataset.v === 'yes' ? c.by : '' })),
  'control-add': (el) => act((inc, c) => M.addRecord(inc, c, 'controls', { control: el.dataset.text ?? '' })),
};

SCREENS['s1/danger'] = (inc) => {
  const value = M.answer(inc, W.DANGER_QUESTION);
  const a = inc.answers[W.DANGER_QUESTION];
  const status = M.field(inc, 'danger', 'status');
  const concern = value === 'yes' || value === 'unsure';
  const used = new Set(M.records(inc, 'controls').map((c) => c.control));
  screen(frame(inc, 'Immediate danger', href(inc, 's1'), `
    ${stepLabel('danger')}
    <div class="qcard">
      <p class="q">${esc(W.QUESTIONS[W.DANGER_QUESTION].q)}</p>
      ${optionButtons(W.DANGER_QUESTION, W.GROUPS.danger.options, value)}
      ${a ? `<p class="muted">Answered ${time(a.at)} by ${esc(a.by)}. Change it whenever the situation changes.</p>` : ''}
    </div>
    ${concern ? `<div class="warn-box">
      <strong>Consider now</strong>
      <ul class="prompts">${W.DANGER_PROMPTS.map((p) => `<li><span>${esc(p)}</span>
        ${used.has(p) ? '<span class="tag v-confirmed">Recorded</span>' : `<button class="small" data-act="control-add" data-text="${esc(p)}">Record</button>`}</li>`).join('')}</ul>
      <p class="muted">Tap "Record" when you start one of these. It is logged with the time as an immediate control. This app cannot tell you the scene is safe.</p>
    </div>` : ''}
    ${value === 'no' ? `<div class="notice">Recorded: no immediate danger reported. This is your report at ${time(a.at)}, not a statement that the scene is safe. Change the answer if conditions change.</div>` : ''}
    ${value ? `<h2>Hazard status</h2>
      <div class="opts opts-2">${W.HAZARD_STATUS.map(([v, l]) => `<button class="opt ${status === v ? 'on' : ''}" data-act="hazard" data-v="${v}">${esc(l)}</button>`).join('')}</div>
      ${concern ? formHtml(inc, 'danger') : ''}
      ${concern || M.records(inc, 'controls').length ? controlsBlock(inc) : ''}` : ''}
    ${stepNav(inc, 'danger')}`), {
    ...controlHandlers,
    hazard: (el) => act((i, c) => M.setField(i, c, 'danger', 'status', el.dataset.v)),
  });
};

SCREENS['s1/people'] = (inc) => {
  screen(frame(inc, 'People affected', href(inc, 's1'), `
    ${stepLabel('people')}
    ${questionFlow(inc, 'people')}
    <h2>People affected</h2>
    <p class="muted">Only the basics for now. A temporary identifier is fine. Detailed injury classification comes later.</p>
    ${recordCards(inc, 'people', { empty: 'No one recorded yet.' })}
    <div style="margin-top:10px">${addButton('people', 'Add affected person', {}, 'primary')}</div>
    ${stepNav(inc, 'people')}`));
};

RECORD_EXTRAS.people = {
  summary: (inc, r) => `${esc([r.employer, r.currentLocation].filter(Boolean).join(' · ') || 'Details to be added')} ${vTag(r.verification ?? 'unverified')}`,
  top: (inc, r) => `<p class="label">How sure is this information?</p>
    <div class="opts opts-3">${Object.entries(W.VERIFICATION).map(([v, l]) => `<button class="opt ${(r.verification ?? 'unverified') === v ? 'on' : ''}" data-act="set-verification" data-v="${v}">${esc(l)}</button>`).join('')}</div>`,
  handlers: (inc, r) => ({ 'set-verification': (el) => act((i, c) => M.updateRecord(i, c, 'people', r.id, { verification: el.dataset.v })) }),
};
RECORD_EXTRAS.controls = {
  summary: (inc, r) => `${esc(r.responsible || 'No person responsible')} · started ${time(r.initiatedAt)} · ${r.verified === 'yes' ? vTag('confirmed') : '<span class="tag v-unverified">Not yet verified</span>'}`,
};
RECORD_EXTRAS.notifications = {
  summary: (inc, r) => (r.completedAt ? `Completed ${dateTime(r.completedAt)}${r.method ? ` · ${esc(r.method)}` : ''}` : `Not yet completed${r.dueAt ? ` · due ${dateTime(r.dueAt)}` : ''}`),
};

SCREENS['s1/scene'] = (inc) => {
  screen(frame(inc, 'Scene control', href(inc, 's1'), `
    ${stepLabel('scene')}
    <p class="muted">Every "No" or "Unsure" becomes an item that stays visible until it is dealt with.</p>
    ${questionFlow(inc, 'scene')}
    ${controlsBlock(inc)}
    ${stepNav(inc, 'scene')}`), controlHandlers);
};

SCREENS['s1/notify'] = (inc) => {
  const g = W.GROUPS.notify;
  const decision = inc.fields.notify?.decision;
  screen(frame(inc, 'Notifications and escalation', href(inc, 's1'), `
    ${stepLabel('notify')}
    <div class="notify-banner">${esc(W.NOTIFICATION_BANNER)}</div>
    <p class="muted">This app does not decide whether formal (statutory) notification is required. An authorised person makes that decision.</p>
    <h2>Notify or consider notifying</h2>
    ${g.questions.map((q) => {
      const recs = M.records(inc, 'notifications').filter((n) => n.party === q.k);
      return `<div class="answered">
        <p><strong>${esc(q.q)}</strong></p>
        <div class="opts opts-3">${g.options.map(([v, l]) => `<button class="opt ${M.answer(inc, q.k) === v ? 'on' : ''}" data-act="party" data-k="${q.k}" data-v="${v}">${esc(l)}</button>`).join('')}</div>
        ${recs.map((n) => `<a class="chip link" href="${href(inc, `r/notifications/${n.id}`)}">${esc(n.number)} · ${n.completedAt ? time(n.completedAt) : 'not completed'} · add details</a>`).join(' ')}
      </div>`;
    }).join('')}
    <h2>Notification records</h2>
    <p class="muted">For each one record who, why, by whom, when due, when done, how, what was said and any follow-up.</p>
    ${recordCards(inc, 'notifications')}
    <div style="margin-top:10px">${addButton('notifications', 'Add a notification', { responsible: S.user.name })}</div>
    <h2>Formal notification decision</h2>
    ${decision
      ? `<div class="notice">Decided by <strong>${esc(decision.decidedBy)}</strong>: ${esc(decision.outcome)}<br><span class="muted">Recorded ${dateTime(decision.at)} by ${esc(decision.recordedBy)}</span></div>`
      : '<p class="muted">Not yet recorded. Record who decided and what they decided. The app cannot make this decision.</p>'}
    <div style="margin-top:10px"><button data-act="decision">${decision ? 'Record a new decision' : 'Record the decision'}</button></div>
    ${stepNav(inc, 'notify')}`), {
    party: (el) => act((i, c) => {
      const { k, v } = el.dataset;
      M.setAnswer(i, c, k, v);
      if (v === 'notified' && !M.records(i, 'notifications').some((n) => n.party === k)) {
        M.addRecord(i, c, 'notifications', { party: k, recipient: W.QUESTIONS[k].q, completedAt: Date.now(), responsible: c.by });
      }
    }),
    decision: () => sheet('Formal notification decision', `
      <p class="muted">Record a decision made by an authorised person. If no decision has been made, close this and notify the Manager HSE.</p>
      <label>Who made the decision? <input name="decidedBy" autocomplete="off" placeholder="Name and role"></label>
      <label>What was decided? <textarea name="outcome" rows="3" placeholder="For example: notifiable, regulator called at 10:40; or not notifiable, with the reason"></textarea></label>
      <div class="stack" style="margin-top:16px"><button class="primary" data-act="decision-save">Record decision</button></div>`, {
      'decision-save': async () => {
        const values = sheetValues();
        if (await act((i, c) => M.recordNotificationDecision(i, c, values))) closeSheet();
      },
    }),
  });
};

// What the file already says about each checklist line, to help the advisor answer honestly.
function checklistDetail(inc, key) {
  const label = (k) => (M.answer(inc, k) ? labelOf(W.QUESTIONS[k].options, M.answer(inc, k)) : 'not answered');
  const scene = W.GROUPS.scene.questions;
  const details = {
    's1.c.danger': `Hazard status: ${M.field(inc, 'danger', 'status') ? labelOf(W.HAZARD_STATUS, M.field(inc, 'danger', 'status')) : 'not recorded'}`,
    's1.c.accounted': `Anyone missing: ${label('s1.p.missing')} · ${plural(M.records(inc, 'people').length, 'person', 'people')} recorded`,
    's1.c.firstaid': `First aid: ${label('s1.p.firstaid')} · Medical: ${label('s1.p.medical')}`,
    's1.c.scene': `${scene.filter((q) => M.answer(inc, q.k)).length} of ${scene.length} scene questions answered · ${plural(M.records(inc, 'controls').length, 'control')} recorded`,
    's1.c.exposure': `Remaining exposure: ${M.field(inc, 'danger', 'remaining') || 'not recorded'}`,
    's1.c.escalation': `${W.GROUPS.notify.questions.filter((q) => M.answer(inc, q.k) === 'notified').length} parties notified · formal decision ${inc.fields.notify?.decision ? 'recorded' : 'not recorded'}`,
    's1.c.evidence': `${plural(M.records(inc, 'evidence').length, 'evidence item')} captured · could evidence be lost: ${label('s1.s.evidence')}`,
  };
  if (key === 's1.c.lead') return `<input aria-label="Incident response lead" placeholder="Who is leading the response?" data-bind="f|response|lead" value="${esc(M.field(inc, 'response', 'lead'))}">`;
  if (key === 's1.c.decision') return `<input aria-label="Next operational decision" placeholder="What is the next decision, and whose is it?" data-bind="f|response|nextDecision" value="${esc(M.field(inc, 'response', 'nextDecision'))}">`;
  return `<p class="muted">${esc(details[key])}</p>`;
}

SCREENS['s1/review'] = (inc) => {
  const open = M.openItems(inc);
  const complete = inc.stages[1]?.completedAt;
  const unticked = W.GROUPS.checklist.questions.filter((q) => M.answer(inc, q.k) !== 'done').length;
  screen(frame(inc, 'Stage 1 review', href(inc, 's1'), `
    ${stepLabel('review')}
    <p class="muted">Mark each line Done or Still open. Open lines do not stop you: they are carried forward and stay visible.</p>
    ${questionList(inc, 'checklist', (q) => checklistDetail(inc, q.k))}
    <h2>Open items</h2>
    <p>${open.length ? `${plural(open.length, 'item')} open, ${M.urgentItems(inc).length} urgent.` : 'No open items.'} <a href="${href(inc, 'open')}">View open items</a></p>
    <div class="stack" style="margin-top:16px">
      <a class="button" href="${href(inc, 'summary/brief')}">View the initial response brief</a>
      ${complete
        ? `<div class="notice">Stage 1 was marked complete at ${dateTime(complete)}. You can still change anything above.</div>
           <a class="button primary big" href="${href(inc, 's2')}">Go to Stage 2: Information capture</a>`
        : `<button class="primary big" data-act="complete">Complete Stage 1 and move to Stage 2</button>
           <p class="muted">${unticked ? `${plural(unticked, 'checklist line')} not marked Done will be carried forward as open items.` : 'All checklist lines are marked Done.'}</p>`}
    </div>
    ${stepNav(inc, 'review')}`), {
    complete: async () => {
      if (await act((i, c) => M.completeStage(i, c, 1), false)) go(href(inc, 's2'));
    },
  });
};
