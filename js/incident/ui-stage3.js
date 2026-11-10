// Stage 3: Investigation. The depth follows the investigation level: sections a level does not need
// stay available but are marked "not needed", so a minor event is not pushed through a full ICAM.
import * as M from './model.js';
import * as W from './workflow.js';
import {
  S, SCREENS, RECORD_EXTRAS, esc, go, href, act, screen, frame, sheet, closeSheet, sheetValues, toast, live, draftTag,
  questionList, formHtml, recordCards, addButton, sectionFooter, stateChip, dateTime, plural, labelOf, filled,
} from './ui-core.js';
import { wordFile, evidenceImages } from './ui-overview.js';

const SECTIONS = W.STAGE3_SECTIONS;
const title = (key) => SECTIONS.find(([k]) => k === key)[1];
const needed = (inc, key) => !inc.level || SECTIONS.find(([k]) => k === key)[2].includes(inc.level);
const page = (inc, key, body, handlers) => screen(frame(inc, title(key), href(inc, 's3'), `
  ${needed(inc, key) ? '' : `<div class="notice">Not required for ${esc(W.LEVELS[inc.level].label)}. Use it if it helps.</div>`}
  ${body}${sectionFooter(inc, 3, key, SECTIONS)}`), handlers);
const problemList = (problems) => (problems.length ? `<div class="warn-box"><strong>Before this can go further</strong><ul class="plain">${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` : '');

const levelPicker = (inc) => `<div class="stack">${Object.entries(W.LEVELS).map(([n, l]) => `<button class="${inc.level === Number(n) ? 'opt on' : ''}" style="text-align:left" data-act="level" data-v="${n}">
    <strong>${esc(l.label)}</strong><br><span style="font-weight:400;font-size:15px">${esc(l.note)}</span></button>`).join('')}</div>`;
const levelHandler = { level: (el) => act((i, c) => M.setLevel(i, c, el.dataset.v)) };

SCREENS.s3 = (inc) => {
  const stage = inc.stages[3] ?? {};
  screen(frame(inc, 'Stage 3: Investigation', href(inc), `
    <h2>Investigation level</h2>
    <p class="muted">Set by the approved process and the classification. It decides which sections are needed.${M.currentClassification(inc)?.values.level ? ` The current classification suggests ${esc(W.LEVELS[M.currentClassification(inc).values.level]?.label ?? '')}.` : ''}</p>
    ${levelPicker(inc)}
    <h2>Sections</h2>
    ${SECTIONS.map(([key, t]) => `<a class="card" href="${href(inc, `s3/${key}`)}"><strong>${esc(t)}</strong>${stateChip(M.sectionState(inc, 3, key))}</a>`).join('')}
    ${stage.completedAt ? `<div class="notice" style="margin-top:16px">Submitted for review ${dateTime(stage.completedAt)}.${stage.approvedAt ? ` Approved by ${esc(stage.approvedBy)} ${dateTime(stage.approvedAt)}.` : ' Not yet approved.'}</div>` : ''}`), levelHandler);
};

// Investigation plan

SCREENS['s3/plan'] = (inc) => {
  const tasks = M.records(inc, 'tasks');
  page(inc, 'plan', `
    <h2>Level</h2>${levelPicker(inc)}
    <h2>Plan</h2>
    ${formHtml(inc, 'plan')}
    <h2>Investigation task list (${tasks.filter((t) => t.status !== 'done').length} open)</h2>
    <div class="stack"><button class="primary" data-act="plan-gaps">Create tasks from the information gaps</button></div>
    <p class="muted">Every gap found in the completeness review becomes a task: evidence to get, interviews to hold, conflicts to resolve, decisions outstanding.</p>
    ${tasks.map((t) => `<div class="item">
      <p>${t.status === 'done' ? '<span class="tag v-confirmed">Done</span>' : '<span class="tag v-unverified">Open</span>'} ${esc(t.text)}</p>
      <p class="muted">${esc(t.number)}${t.owner ? ` · ${esc(t.owner)}` : ''}${t.due ? ` · due ${esc(t.due)}` : ''}${t.fromGap ? ' · from an information gap' : ''}</p>
      <div class="row"><button class="small" data-act="task-toggle" data-id="${t.id}" data-v="${t.status === 'done' ? 'open' : 'done'}">${t.status === 'done' ? 'Reopen' : 'Mark done'}</button>
        <a class="button small" href="${href(inc, `r/tasks/${t.id}`)}">Owner and due date</a></div>
    </div>`).join('') || '<p class="muted">No tasks yet.</p>'}
    <div style="margin-top:10px">${addButton('tasks', 'Add a task')}</div>`, {
    ...levelHandler,
    'plan-gaps': async () => {
      let added = [];
      if (await act((i, c) => { added = M.planFromGaps(i, c); })) toast(added.length ? `${plural(added.length, 'task')} added from the information gaps.` : 'Every current gap is already on the task list.');
    },
    'task-toggle': (el) => act((i, c) => M.updateRecord(i, c, 'tasks', el.dataset.id, { status: el.dataset.v })),
  });
};

// Evidence review: the board, then the questions the investigation has to answer.

SCREENS['s3/evboard'] = (inc) => {
  const evidence = M.records(inc, 'evidence');
  const columns = [
    ...W.EVIDENCE_STATUS.map(([status, label]) => [label, evidence.filter((e) => e.status === status)]),
    ['Sensitive or restricted evidence', evidence.filter((e) => e.restriction && e.restriction !== 'none')],
  ];
  page(inc, 'evboard', `
    <div class="board">${columns.map(([label, list]) => `<h3><span>${esc(label)}</span><span class="chip">${list.length}</span></h3>
      ${list.map((e) => `<a class="card" href="${href(inc, `r/evidence/${e.id}`)}"><strong>${esc(e.number)} · ${esc(e.description || e.kind || 'Evidence')}</strong>
        <span class="muted">${esc(e.kind ?? '')}${e.restriction && e.restriction !== 'none' ? ' · restricted' : ''}</span></a>`).join('') || '<p class="muted">None.</p>'}`).join('')}</div>
    <div class="stack" style="margin-top:12px"><a class="button" href="${href(inc, 's2/evidence')}">Add or capture evidence</a></div>
    <h2>Investigation questions</h2>
    <p class="muted">Link evidence to each question. A conclusion is only accepted with linked evidence that has been obtained, or a clear statement that evidence is unavailable.</p>
    ${recordCards(inc, 'questions')}
    <div style="margin-top:10px">${addButton('questions', 'Add an investigation question', {}, 'primary')}</div>`);
};
RECORD_EXTRAS.questions = {
  summary: (inc, r) => `${plural((r.evidence ?? []).length, 'evidence link')} · ${filled(r.conclusion) ? 'conclusion recorded' : filled(r.evidenceUnavailable) ? 'evidence unavailable' : 'no conclusion yet'}`,
  top: () => '<div class="notice">Write the question, link the evidence, then record the conclusion. Without evidence, state why it is unavailable. The app will not save a conclusion that has neither.</div>',
};

// Interviews

SCREENS['s3/interviews'] = (inc) => page(inc, 'interviews', `
  <div class="notice">Record what the person says in their own words. This app does not judge whether someone is truthful, infer motive, score credibility or label anyone. A summary never replaces the original notes or recording.</div>
  <div style="margin-top:12px">${recordCards(inc, 'interviews')}</div>
  <div style="margin-top:10px">${addButton('interviews', 'Start an interview record', {}, 'primary')}</div>
  ${M.records(inc, 'witnesses').filter((w) => w.interviewCompleted !== 'yes').length ? `<h2>Still to interview</h2><ul class="plain">${M.records(inc, 'witnesses').filter((w) => w.interviewCompleted !== 'yes').map((w) => `<li>${esc(w.name || w.number)} <button class="small" data-act="add-record" data-c="interviews" data-preset="${esc(JSON.stringify({ person: w.name ?? '', role: w.role ?? '', witness: w.id }))}">Start</button></li>`).join('')}</ul>` : ''}`);

export const INTERVIEW_EXTRAS = []; // AI drafts add to the interview record

RECORD_EXTRAS.interviews = {
  summary: (inc, r) => `${dateTime(r.at)} · ${filled(r.notes) ? 'notes recorded' : 'no notes yet'} · ${plural((r.evidence ?? []).length, 'recording or statement', 'recordings or statements')}`,
  bottom: (inc, r) => `
    <h2>Suggested follow-up questions ${draftTag}</h2>
    <p class="muted">Prompts drawn from gaps in the file. They are suggestions for you to judge, not a script.</p>
    ${live('followups', () => {
      const list = M.suggestFollowUps(inc, r);
      return list.length ? `<ul class="plain">${list.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>` : '<p class="muted">No gaps found to prompt from.</p>';
    })}
    ${INTERVIEW_EXTRAS.map((x) => x.html(inc, r)).join('')}`,
  handlers: (inc, r) => Object.assign({}, ...INTERVIEW_EXTRAS.map((x) => x.handlers(inc, r))),
};

// Event sequence

SCREENS['s3/sequence'] = (inc) => {
  const entries = M.records(inc, 'sequence');
  page(inc, 'sequence', `
    ${live('sequence-review', () => {
      const review = M.sequenceReview(inc);
      return `${review.conflicts.length ? `<div class="warn-box"><strong>Conflicts (${review.conflicts.length})</strong><ul class="plain">${review.conflicts.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
        <details class="more" ${review.gaps.length && entries.length ? 'open' : ''}><summary>Gaps (${review.gaps.length})</summary><ul class="plain">${review.gaps.map((g) => `<li>${esc(g)}</li>`).join('') || '<li>None found.</li>'}</ul></details>`;
    })}
    <p class="muted">More than one possible sequence can stay open (A, B, C) until evidence settles it. Mark a version "ruled out" when the evidence does.</p>
    ${W.SEQUENCE_PHASES.map((phase) => `<h3>${esc(phase)}</h3>
      ${entries.filter((e) => e.phase === phase).map((e) => `<a class="card" href="${href(inc, `r/sequence/${e.id}`)}">
        <strong>${e.version && e.version !== 'A' ? `Possible sequence ${esc(e.version)}: ` : ''}${esc(e.text || 'Not described')}</strong>
        <span class="muted">${esc(labelOf(W.COLLECTIONS.sequence.fields.find((f) => f.k === 'standing').options, e.standing))} · ${plural((e.evidence ?? []).length, 'evidence link')}${e.at ? ` · ${dateTime(e.at)}` : ''}</span></a>`).join('')}
      <div style="margin-top:6px">${addButton('sequence', 'Add', { phase }, 'small')}</div>`).join('')}`);
};

// Task as planned versus task as performed

SCREENS['s3/compare'] = (inc) => {
  const flag = (r) => (r.incomplete ? '<span class="muted">Fill in both sides to compare.</span>' : r.different ? '<span class="tag v-unverified">Different</span> A difference is not automatically a cause. Check it against the evidence.' : '<span class="tag v-confirmed">Same</span>');
  page(inc, 'compare', `
    <div class="notice">Differences are highlighted so they can be examined. A difference between the plan and what was done is <strong>not automatically a cause</strong>.</div>
    ${M.compareRows(inc).map((r) => `<div class="compare">
      <label>${esc(r.plannedLabel)} <span class="hint">As planned</span><textarea rows="3" data-bind="f|compare|${r.key}.planned">${esc(r.planned)}</textarea></label>
      <label>${esc(r.performedLabel)} <span class="hint">As performed</span><textarea rows="3" data-bind="f|compare|${r.key}.performed">${esc(r.performed)}</textarea></label>
      <div class="wide">${live(`compare-${r.key}`, () => flag(M.compareRows(inc).find((x) => x.key === r.key)))}</div>
    </div>`).join('')}`);
};

// Control analysis

SCREENS['s3/controls'] = (inc) => page(inc, 'controls', `
  <div class="notice">Do not stop at "procedure not followed". For each control ask why it did not prevent or reduce the event, and what made it weak, missing or easy to defeat.</div>
  <p class="muted" style="margin-top:12px">Consider: ${W.CONTROL_AREAS.map((a) => a.toLowerCase()).join(', ')}.</p>
  ${recordCards(inc, 'controlsAssessed', { empty: 'No controls yet. Choose the critical risks in Stage 2, or add a control here.' })}
  <div class="stack" style="margin-top:10px">${addButton('controlsAssessed', 'Add a control', { riskLabel: 'Other' }, 'primary')}
    <a class="button" href="${href(inc, 's2/risks')}">Choose critical risks (Stage 2)</a></div>`);

// Findings

const findingStatus = (f) => `<span class="tag ${f.status === 'approved' ? 'v-confirmed' : f.status === 'draft' ? 'draft' : 'v-unverified'}">${esc(W.FINDING_STATUS[f.status])}</span>`;

SCREENS['s3/findings'] = (inc) => page(inc, 'findings', `
  <p class="muted">Facts, observations, findings, conclusions and recommendations are kept apart. Each needs evidence, or a statement that evidence is unavailable. Causal wording without evidence is not accepted.</p>
  ${W.FINDING_TYPES.map(([type, label]) => `<h3>${esc(label)}s</h3>
    ${recordCards(inc, 'findings', { filter: (f) => f.type === type, empty: `No ${label.toLowerCase()}s yet.` })}
    <div style="margin-top:6px">${addButton('findings', `Add ${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${label.toLowerCase()}`, { type }, 'small')}</div>`).join('')}`);

RECORD_EXTRAS.findings = {
  summary: (inc, r) => `${findingStatus(r)} · ${plural((r.evidence ?? []).length, 'evidence link')}${M.findingProblems(inc, r).some((p) => p.blocking) ? ' · needs work' : ''}`,
  top: (inc, r) => live('finding', () => {
    const problems = M.findingProblems(inc, r);
    return `<p>${findingStatus(r)}${r.approvedAt ? ` by ${esc(r.reviewer)} ${dateTime(r.approvedAt)}` : ''}</p>
      ${problemList(problems.filter((p) => p.blocking).map((p) => p.text))}
      ${problems.filter((p) => !p.blocking).map((p) => `<p class="muted">${esc(p.text)}</p>`).join('')}`;
  }),
  bottom: (inc, r) => {
    const actions = M.records(inc, 'actions').filter((a) => a.finding === r.id);
    return `<div class="stack" style="margin-top:16px">
      <button data-act="finding-unable">Use: "${esc(W.UNABLE_TO_DETERMINE)}"</button>
      ${r.status === 'draft' || r.status === 'returned' ? '<button class="primary" data-act="finding-to" data-v="submitted">Submit for review</button>' : ''}
      ${r.status === 'submitted' ? '<button class="primary" data-act="finding-approve">Approve (reviewer or approver)</button><button data-act="finding-to" data-v="returned">Return for more work</button>' : ''}
      ${r.status === 'approved' ? '<button class="primary" data-act="finding-action">Create a corrective action from this finding</button><button data-act="finding-to" data-v="returned">Reopen this finding</button>' : ''}
    </div>
    ${actions.length ? `<p class="label">Actions addressing this finding</p>${actions.map((a) => `<a class="chip link" href="${href(inc, `r/actions/${a.id}`)}">${esc(a.number)} · ${esc(W.ACTION_STATES[a.state])}</a>`).join(' ')}` : ''}`;
  },
  handlers: (inc, r) => ({
    'finding-unable': () => act((i, c) => M.updateRecord(i, c, 'findings', r.id, { statement: W.UNABLE_TO_DETERMINE })),
    'finding-to': (el) => act((i, c) => M.setFindingStatus(i, c, r.id, el.dataset.v)),
    'finding-approve': () => sheet('Approve finding', `
      <label>Reviewer or approver <input name="reviewer" value="${esc(r.reviewer || S.user.name)}" autocomplete="off"></label>
      <div class="stack" style="margin-top:16px"><button class="primary" data-act="finding-approve-save">Approve</button></div>`, {
      'finding-approve-save': async () => { if (await act((i, c) => M.setFindingStatus(i, c, r.id, 'approved', sheetValues().reviewer))) closeSheet(); },
    }),
    'finding-action': async () => {
      let action;
      if (await act((i, c) => { action = M.actionFromFinding(i, c, r.id); }, false)) go(href(inc, `r/actions/${action.id}`));
    },
  }),
};

// Contributing factors

SCREENS['s3/factors'] = (inc) => page(inc, 'factors', `
  <div class="notice">Using ICAM: consider absent or failed defences, individual or team actions, task or environmental conditions, organisational factors and systemic issues. Describe conditions and arrangements. Do not assign blame, and do not describe what someone was thinking, feeling or intending.</div>
  ${W.FACTOR_CATEGORIES.map((category) => `<h3>${esc(category)}</h3>
    ${recordCards(inc, 'factors', { filter: (f) => f.category === category, empty: 'None recorded.' })}
    <div style="margin-top:6px">${addButton('factors', 'Add', { category }, 'small')}</div>`).join('')}
  ${M.records(inc, 'factors').some((f) => !W.FACTOR_CATEGORIES.includes(f.category)) ? `<h3>No category yet</h3>${recordCards(inc, 'factors', { filter: (f) => !W.FACTOR_CATEGORIES.includes(f.category) })}` : ''}`);
RECORD_EXTRAS.factors = {
  summary: (inc, r) => `${plural((r.evidence ?? []).length, 'evidence link')}${M.factorProblems(inc, r).length ? ' · needs work' : ' · supported'}`,
  top: (inc, r) => live('factor', () => problemList(M.factorProblems(inc, r))),
};

// Actions

const actionState = (a) => `<span class="tag ${a.state === 'effective' ? 'v-confirmed' : a.state === 'ineffective' ? 'critical' : 'v-unverified'}">${esc(W.ACTION_STATES[a.state])}</span>`;

SCREENS['s3/actions'] = (inc) => {
  const counts = M.actionCounts(inc);
  const approved = M.records(inc, 'findings').filter((f) => f.status === 'approved');
  page(inc, 'actions', `
    <div class="stat-grid">
      <div class="stat"><strong>${counts.notStarted + counts.inProgress}</strong><span>Not yet implemented</span></div>
      <div class="stat"><strong>${counts.implementedNotVerified + counts.verifiedNotEffective}</strong><span>Implemented, not yet shown effective</span></div>
      <div class="stat"><strong>${counts.effective}</strong><span>Reviewed as effective</span></div>
    </div>
    <div class="notice">Implemented does not mean effective. An action is only finished when its effectiveness review says it worked.</div>
    <h2>Corrective actions</h2>
    ${recordCards(inc, 'actions', { filter: (a) => a.type === 'corrective', empty: 'None yet. Corrective actions are created from approved findings.' })}
    <div class="stack" style="margin-top:10px">
      ${approved.length ? '<button class="primary" data-act="from-finding">Create an action from an approved finding</button>' : '<p class="muted">Approve a finding first. Then create the action from it.</p>'}
    </div>
    <h2>Immediate and interim actions</h2>
    ${recordCards(inc, 'actions', { filter: (a) => a.type !== 'corrective', empty: 'None recorded.' })}
    <div style="margin-top:10px"><button data-act="tool-action">Add an immediate action</button></div>`, {
    'from-finding': () => sheet('Choose the finding', approved.map((f) => `<button class="pick" style="text-align:left;margin-top:8px" data-act="from-finding-pick" data-id="${f.id}">${esc(M.recordTitle('findings', f).slice(0, 120))}</button>`).join(''), {
      'from-finding-pick': async (el) => {
        let action;
        if (await act((i, c) => { action = M.actionFromFinding(i, c, el.dataset.id); }, false)) { closeSheet(); go(href(inc, `r/actions/${action.id}`)); }
      },
    }),
  });
};

RECORD_EXTRAS.actions = {
  summary: (inc, r) => `${actionState(r)} · ${esc(r.owner || 'no owner')}${r.dueDate ? ` · due ${esc(r.dueDate)}` : ''}${M.actionWarnings(inc, r).length ? ` · ${plural(M.actionWarnings(inc, r).length, 'prompt')}` : ''}`,
  hide: (inc, r) => (r.type === 'corrective' ? ['type'] : ['finding', 'addresses', 'gap', 'approver']),
  top: (inc, r) => live('action', () => {
    const warnings = M.actionWarnings(inc, r);
    return `<p>${actionState(r)} ${r.type === 'corrective' ? '<span class="tag cat">Corrective</span>' : '<span class="tag cat">Immediate or interim</span>'}</p>
      ${warnings.length ? `<div class="warn-box"><strong>Check this action</strong><ul class="plain">${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}`;
  }),
  bottom: (inc, r) => `<h2>Move this action on</h2>
    <p class="muted">Each step needs its own record: an owner before it is assigned, evidence before completion is verified, a review before it is called effective.</p>
    <div class="stack">${M.actionFlow(r).map((to) => `<button class="${to === 'reopened' || to === 'ineffective' ? '' : 'primary'}" data-act="action-to" data-v="${to}">Mark as: ${esc(W.ACTION_STATES[to])}</button>`).join('')}</div>
    ${(r.history ?? []).length ? `<p class="label">History</p><ul class="plain muted">${r.history.map((h) => `<li>${dateTime(h.at)} — ${esc(W.ACTION_STATES[h.state])} by ${esc(h.by)}</li>`).join('')}</ul>` : ''}`,
  handlers: (inc, r) => ({ 'action-to': (el) => act((i, c) => M.moveAction(i, c, r.id, el.dataset.v)) }),
};
RECORD_EXTRAS.tasks = { summary: (inc, r) => `${r.status === 'done' ? 'Done' : 'Open'}${r.owner ? ` · ${esc(r.owner)}` : ''}` };
RECORD_EXTRAS.support = { summary: (inc, r) => `${r.status === 'received' ? 'Received' : 'Requested'} · ${dateTime(r.createdAt)}` };

// Review and approval

SCREENS['s3/review'] = (inc) => {
  const checks = M.qualityChecks(inc);
  const stage = inc.stages[3] ?? {};
  const byKey = Object.fromEntries(checks.map((c) => [c.key, c]));
  page(inc, 'review', `
    <p class="muted">A structured quality check before the investigation is submitted. Each line shows what the file itself indicates, then your own answer.</p>
    ${questionList(inc, 'quality', (q) => `<p class="muted">${byKey[q.k].auto === 'pass' ? '<span class="tag v-confirmed">No issue found</span>' : '<span class="tag v-unverified">Needs attention</span>'} ${esc(byKey[q.k].detail)}</p>`)}
    <h2>Review pack</h2>
    <p class="muted">The investigation report, this quality check and the evidence photographs in one Word document for the nominated reviewer or approver${M.field(inc, 'plan', 'reviewAuthority') ? ` (${esc(M.field(inc, 'plan', 'reviewAuthority'))})` : ''}.</p>
    <div class="stack">
      <button class="primary" data-act="pack">Generate the review pack</button>
      <p class="error" data-role="error" hidden></p>
      <a class="button" href="${href(inc, 'summary/report')}">View the investigation report</a>
    </div>
    <h2>Submit and approve</h2>
    ${stage.completedAt ? `<div class="notice">Submitted for review ${dateTime(stage.completedAt)} by ${esc(stage.completedBy)}.${stage.approvedAt ? ` <strong>Approved by ${esc(stage.approvedBy)}</strong> ${dateTime(stage.approvedAt)}.` : ' Not yet approved.'}</div>` : ''}
    <div class="stack" style="margin-top:10px">
      ${stage.completedAt ? '' : '<button class="primary big" data-act="submit">Submit the investigation for review</button>'}
      ${stage.completedAt && !stage.approvedAt ? '<button class="primary" data-act="approve">Record approval (reviewer or approver)</button>' : ''}
    </div>`, {
    pack: async (el) => {
      const error = S.shell.app.querySelector('[data-role=error]');
      error.hidden = true;
      el.disabled = true;
      el.textContent = 'Building document…';
      try {
        const file = await wordFile(inc, `Investigation review pack — ${inc.ref}`, M.investigationReport(inc), await evidenceImages(inc));
        el.textContent = 'Share or save the review pack';
        el.disabled = false;
        S.handlers.pack = () => S.shell.deliver(file);
        if (!navigator.canShare?.({ files: [file] })) S.shell.deliver(file);
      } catch (err) {
        el.textContent = 'Generate the review pack';
        el.disabled = false;
        error.textContent = `Couldn't build the document. ${err.message}`;
        error.hidden = false;
      }
    },
    submit: () => {
      const open = checks.filter((c) => c.auto !== 'pass').length;
      sheet('Submit for review', `<p>${open ? `${plural(open, 'quality check')} still need attention. You can submit anyway: they are listed in the review pack.` : 'No quality checks need attention.'}</p>
        <div class="stack" style="margin-top:16px"><button class="primary" data-act="submit-save">Submit for review</button></div>`, {
        'submit-save': async () => { if (await act((i, c) => M.completeStage(i, c, 3))) closeSheet(); },
      });
    },
    approve: () => sheet('Record approval', `
      <label>Name of the reviewer or approver <input name="name" value="${esc(S.user.name)}" autocomplete="off"></label>
      <div class="stack" style="margin-top:16px"><button class="primary" data-act="approve-save">Record approval</button></div>`, {
      'approve-save': async () => { if (await act((i, c) => M.approveInvestigation(i, c, sheetValues().name))) closeSheet(); },
    }),
  });
};

