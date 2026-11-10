// The incident rules. No screens and no storage here, so every rule can be tested on its own (see /tests).
// An incident is one plain object. Every change goes through a function in this file, which records
// it in the audit list and keeps the chronology and the open items up to date.
import {
  CATEGORIES, CATEGORY_VERIFICATION, VERIFICATION, STAGES, ROLES, QUESTIONS, GROUPS, DANGER_QUESTION, HAZARD_STATUS,
  COLLECTIONS, HEALTH_FIELDS, FORMS, STAGE1_STEPS, STAGE2_SECTIONS, STAGE3_SECTIONS, LEVELS, CRITICAL_RISKS,
  COMPARE_ROWS, SEQUENCE_PHASES, FINDING_STATUS, FINDING_TYPES, UNABLE_TO_DETERMINE, ACTION_STATES, ACTION_FLOW,
  IMMEDIATE_FLOW, EXPORT_STATES, EXPORT_FLOW, RULE_PLACEHOLDER, EVIDENCE_STATUS, CONSEQUENCES,
} from './workflow.js';

export const SCHEMA = 1;

// A rule the advisor has run into. The screens show the message instead of treating it as a crash.
export class RuleError extends Error {
  constructor(message) {
    super(message);
    this.rule = true;
  }
}

const uid = () => crypto.randomUUID();
const when = (ctx) => ctx?.at ?? Date.now();
const who = (ctx) => ctx?.by || 'Advisor';
const filled = (v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== '');
const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
const labelOf = (options, value) => {
  const hit = options.find((o) => (Array.isArray(o) ? o[0] : o) === value);
  return hit ? (Array.isArray(hit) ? hit[1] : hit) : value ?? '';
};
const clock = (t) => (t ? new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'time not recorded');

export const can = (role, permission) => ROLES[role ?? 'advisor']?.can.includes(permission) ?? false;

function need(ctx, permission, what) {
  if (can(ctx?.role, permission)) return;
  const allowed = Object.values(ROLES).filter((r) => r.can.includes(permission)).map((r) => r.label).join(' or ');
  throw new RuleError(`${what} needs ${allowed}. You are signed in as ${ROLES[ctx?.role ?? 'advisor']?.label ?? 'an unknown role'}.`);
}
const editing = (ctx) => need(ctx, 'edit', 'Changing the incident file');

function audit(inc, ctx, action, target, detail) {
  (inc._audit ??= []).push({ at: when(ctx), by: who(ctx), role: ctx?.role ?? 'advisor', action, target, detail });
  inc.updatedAt = when(ctx);
}

// Looking is not changing, but looking at restricted information is still written to the audit history.
export function recordAccess(inc, ctx, what) {
  audit(inc, ctx, 'access', what, {});
}

// Creating an incident

export function createIncident(ctx, start = {}) {
  const at = when(ctx);
  const stamp = new Date(at);
  const pad = (n) => String(n).padStart(2, '0');
  const inc = {
    schema: SCHEMA,
    id: uid(),
    ref: `INC-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}`,
    createdAt: at,
    updatedAt: at,
    createdBy: who(ctx),
    demo: false,
    stage: 1,
    level: null,
    closedAt: null,
    start: {
      what: (start.what ?? '').trim(),
      where: (start.where ?? '').trim(),
      when: start.when ?? at,
      injured: start.injured ?? null,
      v: {},
    },
    answers: {},
    notes: {},
    fields: {},
    records: {},
    counters: {},
    timeline: [],
    conflicts: [],
    openItems: [],
    classification: [],
    drafts: [],
    stages: { 1: { startedAt: at } },
    done: {},
    exportState: { status: 'local', history: [] },
    sync: { pending: 0, lastSyncedAt: null, lastError: null },
    audit: { count: 0, hash: '' },
    _audit: [],
  };
  for (const key of ['what', 'where']) inc.start.v[key] = inc.start[key] ? 'unverified' : 'unknown';
  inc.start.v.when = 'unverified';
  editing(ctx);
  audit(inc, ctx, 'incident.create', inc.ref, { what: inc.start.what, where: inc.start.where, when: inc.start.when });
  entry(inc, ctx, {
    category: 'reported',
    text: `Incident reported: ${inc.start.what || 'no description yet'}${inc.start.where ? ` — at ${inc.start.where}` : ''}`,
    at: inc.start.when,
    ref: { type: 'start' },
  });
  if (start.danger) setAnswer(inc, ctx, DANGER_QUESTION, start.danger);
  refresh(inc, ctx);
  return inc;
}

export const statusLabel = (inc) => (inc.closedAt ? 'Closed' : STAGES[inc.stage].status);

export function setStart(inc, ctx, key, value) {
  editing(ctx);
  if (same(inc.start[key], value)) return;
  audit(inc, ctx, 'start.set', key, { from: inc.start[key], to: value });
  inc.start[key] = value;
  if (key in inc.start.v && !filled(value)) inc.start.v[key] = 'unknown';
  else if (inc.start.v[key] === 'unknown') inc.start.v[key] = 'unverified';
  refresh(inc, ctx);
}

export function setStartVerification(inc, ctx, key, verification) {
  editing(ctx);
  if (!VERIFICATION[verification]) throw new RuleError('Choose Confirmed, Reported but unverified, or Unknown.');
  if (inc.start.v[key] === verification) return;
  audit(inc, ctx, 'start.verification', key, { from: inc.start.v[key], to: verification });
  inc.start.v[key] = verification;
}

// Timeline. Entries are never edited or removed. A correction is a new entry that points at the old one.

function entry(inc, ctx, { category, text, at, verification, source = 'advisor', ref = null, corrects = null, reason }) {
  const e = {
    id: uid(),
    n: inc.timeline.length + 1,
    at: at || when(ctx),
    recordedAt: when(ctx),
    by: who(ctx),
    category,
    text,
    verification: verification ?? CATEGORY_VERIFICATION[category],
    source,
    ref,
    corrects,
  };
  if (reason) e.reason = reason;
  inc.timeline.push(e);
  audit(inc, ctx, corrects ? 'timeline.correct' : 'timeline.add', `#${e.n}`, { category, text, verification: e.verification, corrects: corrects ? numberOf(inc, corrects) : undefined, reason });
  return e;
}

const numberOf = (inc, id) => inc.timeline.find((e) => e.id === id)?.n;
const supersededBy = (inc, id) => inc.timeline.find((e) => e.corrects === id);

export function addEntry(inc, ctx, { category, text, at, source, verification }) {
  editing(ctx);
  if (!CATEGORIES[category]) throw new RuleError('Choose what kind of entry this is.');
  if (!filled(text)) throw new RuleError('Write the entry first.');
  if (verification && !VERIFICATION[verification]) throw new RuleError('Unknown verification status.');
  return entry(inc, ctx, { category, text: text.trim(), at, source, verification });
}

export function correctEntry(inc, ctx, id, { text, category, at, verification, reason } = {}) {
  editing(ctx);
  const original = inc.timeline.find((e) => e.id === id);
  if (!original) throw new RuleError('That entry could not be found.');
  const newer = supersededBy(inc, id);
  if (newer) throw new RuleError(`Entry #${original.n} has already been corrected by entry #${newer.n}. Correct the newest version instead.`);
  if (!filled(reason)) throw new RuleError('Say why the entry is being corrected.');
  if (category && !CATEGORIES[category]) throw new RuleError('Choose what kind of entry this is.');
  const nextCategory = category ?? original.category;
  return entry(inc, ctx, {
    category: nextCategory,
    text: filled(text) ? text.trim() : original.text,
    at: at ?? original.at,
    verification: verification ?? (nextCategory === original.category ? original.verification : CATEGORY_VERIFICATION[nextCategory]),
    source: original.source,
    ref: original.ref,
    corrects: original.id,
    reason: reason.trim(),
  });
}

// A confirmed fact that turns out not to be confirmed becomes reported information. The original stays.
export function markUnverified(inc, ctx, id, reason) {
  const original = inc.timeline.find((e) => e.id === id);
  if (original?.verification !== 'confirmed') throw new RuleError('Only confirmed entries can be marked as unverified.');
  return correctEntry(inc, ctx, id, {
    category: original.category === 'fact' ? 'reported' : original.category,
    verification: 'unverified',
    reason: reason || 'Marked as unverified',
  });
}

// Time order, with each entry told which entry replaced it (if any) and which one it replaced.
export function chronology(inc) {
  return inc.timeline
    .map((e) => ({ ...e, supersededBy: supersededBy(inc, e.id)?.n ?? null, correctsN: e.corrects ? numberOf(inc, e.corrects) : null }))
    .sort((a, b) => a.at - b.at || a.n - b.n);
}
export const effectiveEntries = (inc) => chronology(inc).filter((e) => !e.supersededBy);

export function flagConflict(inc, ctx, a, b, note) {
  editing(ctx);
  if (!filled(note)) throw new RuleError('Describe what conflicts.');
  const conflict = { id: uid(), a: a ?? null, b: b ?? null, note: note.trim(), at: when(ctx), by: who(ctx), resolvedAt: null, resolution: '' };
  inc.conflicts.push(conflict);
  audit(inc, ctx, 'conflict.flag', [a, b].filter(Boolean).map((id) => `#${numberOf(inc, id)}`).join(' vs ') || 'general', { note: conflict.note });
  return conflict;
}

export function resolveConflict(inc, ctx, id, resolution) {
  editing(ctx);
  const conflict = inc.conflicts.find((c) => c.id === id);
  if (!conflict) throw new RuleError('That conflict could not be found.');
  if (!filled(resolution)) throw new RuleError('Say how the conflict was resolved and what evidence resolved it.');
  conflict.resolvedAt = when(ctx);
  conflict.resolution = resolution.trim();
  audit(inc, ctx, 'conflict.resolve', conflict.note, { resolution: conflict.resolution });
}

// Answers to the yes / no / unsure style questions

export const answer = (inc, key) => inc.answers[key]?.value ?? null;
const answerLabel = (key, value) => labelOf(QUESTIONS[key].options, value);

export function setAnswer(inc, ctx, key, value) {
  editing(ctx);
  const def = QUESTIONS[key];
  if (!def) throw new RuleError(`Unknown question: ${key}`);
  if (!def.options.some(([v]) => v === value)) throw new RuleError('That is not one of the answers offered.');
  const previous = inc.answers[key];
  if (previous?.value === value) return previous;
  let entryId = previous?.entryId ?? null;
  if (def.timeline) {
    entryId = entry(inc, ctx, {
      category: 'reported',
      verification: value === 'unsure' ? 'unknown' : 'unverified',
      text: `${def.q} ${answerLabel(key, value)}.`,
      ref: { type: 'answer', key },
      corrects: previous?.entryId ?? null,
      reason: previous ? 'Answer changed' : undefined,
    }).id;
  }
  inc.answers[key] = { value, at: when(ctx), by: who(ctx), entryId, verified: false };
  audit(inc, ctx, 'answer.set', key, { question: def.q, from: previous?.value, to: value });
  if (key === DANGER_QUESTION) {
    const status = { yes: 'active', unsure: 'unknown', no: 'none' }[value];
    (inc.fields.danger ??= {}).status = status;
    audit(inc, ctx, 'field.set', 'danger.status', { to: status, because: 'danger answer' });
  }
  refresh(inc, ctx);
  return inc.answers[key];
}

// The advisor saying "I have checked this myself". Adds a linked entry; the first answer stays visible.
export function verifyAnswer(inc, ctx, key, verified = true) {
  editing(ctx);
  const def = QUESTIONS[key];
  const current = inc.answers[key];
  if (!current) throw new RuleError('Answer the question first.');
  if (current.value === 'unsure') throw new RuleError('An "Unsure" answer cannot be marked as confirmed. Change the answer once you know.');
  if (current.verified === verified) return;
  if (def.timeline) {
    current.entryId = entry(inc, ctx, {
      category: verified ? 'fact' : 'reported',
      text: `${def.q} ${answerLabel(key, current.value)}.`,
      ref: { type: 'answer', key },
      corrects: current.entryId,
      reason: verified ? `Confirmed by ${who(ctx)}` : 'No longer confirmed',
    }).id;
  }
  current.verified = verified;
  audit(inc, ctx, 'answer.verify', key, { verified });
}

export function setNote(inc, ctx, key, text) {
  editing(ctx);
  if (same(inc.notes[key], text)) return;
  audit(inc, ctx, 'note.set', key, { from: inc.notes[key], to: text });
  inc.notes[key] = text;
}

// Form fields

export const field = (inc, form, key) => inc.fields[form]?.[key] ?? '';

export function setField(inc, ctx, form, key, value) {
  editing(ctx);
  const previous = inc.fields[form]?.[key];
  if (same(previous, value)) return;
  if (form === 'danger' && key === 'status') {
    if (!HAZARD_STATUS.some(([v]) => v === value)) throw new RuleError('Unknown hazard status.');
    entry(inc, ctx, {
      category: 'reported',
      verification: value === 'unknown' ? 'unknown' : 'unverified',
      text: `Hazard status recorded: ${labelOf(HAZARD_STATUS, value)}.`,
      ref: { type: 'field', key: 'danger.status' },
    });
  }
  (inc.fields[form] ??= {})[key] = value;
  audit(inc, ctx, 'field.set', `${form}.${key}`, { from: previous, to: value });
  refresh(inc, ctx);
}

// The decision itself belongs to a named person. The app only records who made it and what they decided.
export function recordNotificationDecision(inc, ctx, { decidedBy, outcome }) {
  editing(ctx);
  if (!filled(decidedBy)) throw new RuleError('Record who made the notification decision. The app cannot make it.');
  if (!filled(outcome)) throw new RuleError('Record what was decided.');
  const decision = { decidedBy: decidedBy.trim(), outcome: outcome.trim(), at: when(ctx), recordedBy: who(ctx) };
  (inc.fields.notify ??= {}).decision = decision;
  audit(inc, ctx, 'notification.decision', 'formal notification', decision);
  entry(inc, ctx, { category: 'decision', text: `Formal notification decision by ${decision.decidedBy}: ${decision.outcome}`, ref: { type: 'field', key: 'notify.decision' } });
  refresh(inc, ctx);
}

// Records (people, controls, notifications, witnesses, evidence, findings, actions and so on)

export const records = (inc, collection) => (inc.records[collection] ?? []).filter((r) => !r.voided);
export const record = (inc, collection, id) => (inc.records[collection] ?? []).find((r) => r.id === id);
export const recordTitle = (collection, rec) => `${rec.number} ${COLLECTIONS[collection].title(rec)}`;

const DEFAULTS = {
  people: () => ({ verification: 'unverified' }),
  controls: (ctx) => ({ initiatedAt: when(ctx), verified: 'no' }),
  evidence: (ctx) => ({ capturedAt: when(ctx), capturedBy: who(ctx), status: 'obtained', restriction: 'none', preserved: 'unknown' }),
  findings: () => ({ type: 'finding', status: 'draft' }),
  actions: () => ({ type: 'immediate', state: 'proposed' }),
  sequence: () => ({ version: 'A', standing: 'open' }),
  tasks: () => ({ status: 'open' }),
  support: () => ({ status: 'requested' }),
  interviews: (ctx) => ({ at: when(ctx), interviewer: who(ctx) }),
};

// Set once and then fixed, or only changed through their own function.
const LOCKED_FIELDS = {
  evidence: ['mediaKey', 'sha256', 'fileName', 'mediaType', 'size', 'derivedFrom'],
  actions: ['state'],
  findings: ['status'],
};

const obtained = (inc, ids) => (ids ?? []).map((id) => record(inc, 'evidence', id)).filter((e) => e && !e.voided && e.status === 'obtained');

const VALIDATE = {
  people(inc, next) {
    if (next.exposureStatus === 'confirmed' && !obtained(inc, next.evidence).length) {
      throw new RuleError('Confirmed exposure needs linked evidence that has been obtained, such as a medical assessment or a monitoring record. Until then, leave it as "Reported — not verified" or "Unknown".');
    }
  },
  questions(inc, next) {
    if (filled(next.conclusion) && !obtained(inc, next.evidence).length && !filled(next.evidenceUnavailable)) {
      throw new RuleError('A conclusion needs linked evidence that has been obtained, or a statement that evidence is unavailable.');
    }
  },
  actions(inc, next) {
    if (next.finding && !record(inc, 'findings', next.finding)) throw new RuleError('That finding could not be found.');
  },
};

const redact = (collection, data) => Object.fromEntries(Object.entries(data).map(([k, v]) =>
  [k, HEALTH_FIELDS[collection]?.includes(k) ? '[restricted health information]' : v]));

export function addRecord(inc, ctx, collection, data = {}) {
  editing(ctx);
  const def = COLLECTIONS[collection];
  if (!def) throw new RuleError(`Unknown list: ${collection}`);
  const n = (inc.counters[collection] = (inc.counters[collection] ?? 0) + 1);
  const rec = {
    ...DEFAULTS[collection]?.(ctx),
    ...data,
    id: uid(),
    number: `${def.prefix}-${String(n).padStart(3, '0')}`,
    createdAt: when(ctx),
    createdBy: who(ctx),
  };
  VALIDATE[collection]?.(inc, rec);
  (inc.records[collection] ??= []).push(rec);
  audit(inc, ctx, 'record.add', `${collection}/${rec.number}`, redact(collection, data));
  const line = def.timeline?.(rec);
  if (line) rec.entryId = entry(inc, ctx, { ...line, ref: { type: collection, id: rec.id } }).id;
  refresh(inc, ctx);
  return rec;
}

// What gets added to the chronology when particular fields change.
const ON_CHANGE = {
  controls: { verified: (r) => r.verified === 'yes' && { category: 'action', text: `Immediate control verified${r.verifiedBy ? ` by ${r.verifiedBy}` : ''}: ${r.control}` } },
  notifications: { completedAt: (r, prev) => r.completedAt && !prev && { category: 'communication', text: `Notification made: ${r.recipient || 'recipient not recorded'}`, at: r.completedAt } },
  people: {
    currentLocation: (r) => r.currentLocation && { category: 'reported', text: `${r.name || r.number} now at: ${r.currentLocation}` },
    exposureStatus: (r) => r.exposureStatus && {
      category: r.exposureStatus === 'confirmed' ? 'fact' : 'reported',
      verification: { confirmed: 'confirmed', unknown: 'unknown' }[r.exposureStatus] ?? 'unverified',
      text: `Exposure status for ${r.name || r.number}: ${labelOf(COLLECTIONS.people.fields.find((f) => f.k === 'exposureStatus').options, r.exposureStatus)}`,
    },
  },
  witnesses: { interviewCompleted: (r) => r.interviewCompleted === 'yes' && { category: 'action', text: `Interview completed with witness ${r.name || r.number}` } },
  evidence: { status: (r) => ({ category: 'action', text: `Evidence ${r.number} status: ${labelOf(EVIDENCE_STATUS, r.status)}` }) },
  support: { status: (r) => r.status === 'received' && { category: 'communication', text: `Support received: ${r.kind || 'support'}` } },
};

const FINDING_CONTENT = ['type', 'statement', 'facts', 'evidence', 'evidenceUnavailable', 'requirement', 'expected', 'actual', 'effect'];

export function updateRecord(inc, ctx, collection, id, patch) {
  editing(ctx);
  const rec = record(inc, collection, id);
  if (!rec) throw new RuleError('That record could not be found.');
  if (rec.voided) throw new RuleError('That record has been withdrawn and can no longer be changed.');
  const changes = Object.entries(patch).filter(([k, v]) => !same(rec[k], v));
  if (!changes.length) return rec;
  for (const [k] of changes) {
    if (LOCKED_FIELDS[collection]?.includes(k) && (filled(rec[k]) || k === 'state' || k === 'status')) {
      throw new RuleError(collection === 'evidence' ? 'An original evidence file is never replaced. Add a new evidence item instead.' : 'Use the buttons on the record to change its status.');
    }
  }
  VALIDATE[collection]?.(inc, { ...rec, ...patch });
  for (const [k, v] of changes) {
    const previous = rec[k];
    const restricted = HEALTH_FIELDS[collection]?.includes(k);
    audit(inc, ctx, 'record.update', `${collection}/${rec.number}.${k}`, restricted ? { restricted: true } : { from: previous, to: v });
    rec[k] = v;
    const line = ON_CHANGE[collection]?.[k]?.(rec, previous);
    if (line) entry(inc, ctx, { ...line, ref: { type: collection, id: rec.id } });
  }
  rec.updatedAt = when(ctx);
  // Changing what an approved finding says sends it back to draft so it is reviewed again.
  if (collection === 'findings' && rec.status !== 'draft' && changes.some(([k]) => FINDING_CONTENT.includes(k))) {
    audit(inc, ctx, 'finding.status', rec.number, { from: rec.status, to: 'draft', because: 'content changed' });
    rec.status = 'draft';
  }
  refresh(inc, ctx);
  return rec;
}

// Nothing is deleted. A withdrawn record stays in the file, marked with who withdrew it and why.
export function voidRecord(inc, ctx, collection, id, reason) {
  editing(ctx);
  const rec = record(inc, collection, id);
  if (!rec || rec.voided) throw new RuleError('That record could not be found.');
  if (!filled(reason)) throw new RuleError('Say why the record is being withdrawn.');
  rec.voided = { at: when(ctx), by: who(ctx), reason: reason.trim() };
  audit(inc, ctx, 'record.void', `${collection}/${rec.number}`, { reason: rec.voided.reason });
  if (COLLECTIONS[collection].timeline) {
    entry(inc, ctx, { category: 'decision', text: `${COLLECTIONS[collection].label} ${rec.number} withdrawn: ${rec.voided.reason}`, ref: { type: collection, id }, corrects: supersededBy(inc, rec.entryId) ? null : rec.entryId ?? null, reason: rec.voided.reason });
  }
  refresh(inc, ctx);
}

// Open items. Most are worked out from the state of the file, so they cannot be forgotten or quietly
// dropped: they close when the underlying record changes, or when the advisor closes them with a note.

function derivedItems(inc) {
  const items = [];
  const add = (key, text, extra = {}) => items.push({ key, text, urgent: false, stage: 1, basis: '', locked: true, ...extra });
  const danger = answer(inc, DANGER_QUESTION);
  const status = field(inc, 'danger', 'status');

  if (!danger) {
    add('danger', 'Immediate danger question not yet answered', { urgent: true, basis: 'unanswered', link: 's1/danger' });
  } else if (status === 'active' || status === 'unknown') {
    add('danger', status === 'unknown' ? 'Immediate danger is unknown — assess it and record the controls' : 'Immediate danger is recorded as still active', { urgent: true, basis: status, link: 's1/danger' });
  }
  if (danger === 'yes' || danger === 'unsure') {
    if (!filled(field(inc, 'danger', 'atRisk'))) add('danger.atRisk', 'Record the people remaining at risk', { link: 's1/danger' });
    if (!filled(field(inc, 'danger', 'remaining'))) add('danger.remaining', 'Record any remaining uncontrolled exposure', { link: 's1/danger' });
    if (!records(inc, 'controls').length) add('danger.controls', 'Record the immediate controls applied', { urgent: true, link: 's1/danger' });
  }
  for (const c of records(inc, 'controls')) {
    if (c.verified !== 'yes') add(`control.verify:${c.id}`, `Immediate control not yet verified: ${c.control || c.number}`, { link: `r/controls/${c.id}` });
    if (!filled(c.responsible)) add(`control.owner:${c.id}`, `No person responsible recorded for control: ${c.control || c.number}`, { link: `r/controls/${c.id}` });
  }

  for (const [key, def] of Object.entries(QUESTIONS)) {
    const value = answer(inc, key);
    if (!value || !def.flag?.includes(value)) continue;
    const reassurance = def.adverse === 'yes' && value === 'no';
    add(`q:${key}`, def.item ?? (reassurance ? `Recorded as No — confirm it still holds: ${def.q}` : `${def.q} ${answerLabel(key, value)}`), {
      urgent: def.urgent?.includes(value) ?? false, stage: def.stage, basis: value, locked: false, link: `s${def.stage}/${def.section}`,
    });
  }

  const nobodyAffected = answer(inc, 's1.p.injured') === 'no' && answer(inc, 's1.p.exposed') === 'no';
  if ((inc.start.injured === 'yes' || inc.start.injured === 'unsure') && !records(inc, 'people').length && !nobodyAffected) {
    add('start.injured', 'People were reported injured or potentially exposed — record who is affected', { urgent: true, link: 's1/people' });
  }

  if (!inc.fields.notify?.decision) {
    const told = answer(inc, 's1.n.hsem') === 'notified';
    add('notify.formal', told
      ? 'Formal notification decision not yet recorded — it must be made by an authorised person'
      : 'This incident may require formal notification. Notify the Manager HSE ASAP.', { urgent: !told, basis: told ? 'told' : 'untold', link: 's1/notify' });
  }
  for (const n of records(inc, 'notifications')) {
    if (!n.completedAt) add(`notification:${n.id}`, `Notification not yet completed: ${n.recipient || n.number}${n.dueAt ? ` (due ${clock(n.dueAt)})` : ''}`, { link: `r/notifications/${n.id}` });
    else if (filled(n.followUp) && !n.followUpDone) add(`notification.follow:${n.id}`, `Follow-up after notifying ${n.recipient || n.number}: ${n.followUp}`, { locked: false, basis: n.followUp, link: `r/notifications/${n.id}` });
  }

  if (inc.stages[1]?.completedAt) {
    for (const q of GROUPS.checklist.questions) {
      if (answer(inc, q.k) !== 'done') add(`c:${q.k}`, `Carried forward from Stage 1: ${q.q}`, { basis: answer(inc, q.k) ?? 'unanswered', locked: false, link: 's1/review' });
    }
  }
  for (const s of records(inc, 'support')) {
    if (s.status !== 'received') add(`support:${s.id}`, `Support requested, not yet received: ${s.kind || 'support'}`, { stage: inc.stage, link: `r/support/${s.id}` });
  }
  for (const a of records(inc, 'actions')) {
    if (a.type === 'immediate' && ['proposed', 'assigned', 'inprogress', 'reopened'].includes(a.state)) {
      add(`action:${a.id}`, `Immediate action still open: ${a.description || a.number}`, { stage: inc.stage, link: `r/actions/${a.id}` });
    }
  }
  if (inc.stage >= 2) {
    for (const p of records(inc, 'people')) {
      if ((p.exposureStatus === 'reported' || p.exposureStatus === 'unknown') && !obtained(inc, p.evidence).length) {
        add(`exposure:${p.id}`, `Exposure for ${p.name || p.number} is ${p.exposureStatus === 'reported' ? 'reported but not verified' : 'unknown'} — medical assessment or monitoring evidence is needed`, { stage: 2, basis: p.exposureStatus, link: `r/people/${p.id}` });
      }
    }
    if (currentClassification(inc)?.status !== 'confirmed') {
      add('classification', inc.classification.length ? 'Classification proposed but not yet confirmed by an authorised person' : 'Preliminary classification not yet recorded', { stage: 2, basis: String(inc.classification.length), link: 's2/classification' });
    }
  }
  return items;
}

function refresh(inc, ctx) {
  const wanted = new Map(derivedItems(inc).map((w) => [w.key, w]));
  for (const item of inc.openItems.filter((i) => i.auto)) {
    const w = wanted.get(item.key);
    wanted.delete(item.key);
    if (!w) {
      if (item.status === 'open') {
        Object.assign(item, { status: 'closed', closedAt: when(ctx), closedBy: 'System', note: 'The underlying record changed', closedAuto: true });
        audit(inc, ctx, 'item.close', item.text, { auto: true });
      }
      continue;
    }
    // A manually closed item stays closed unless what it was based on has changed since.
    if (item.status === 'closed' && (item.closedAuto || item.basis !== w.basis)) {
      Object.assign(item, { status: 'open', closedAt: null, closedBy: null, note: '', closedAuto: false, openedAt: when(ctx) });
      audit(inc, ctx, 'item.reopen', w.text, {});
    }
    if (item.status === 'open') Object.assign(item, w);
    else item.basis = w.basis;
  }
  for (const w of wanted.values()) {
    inc.openItems.push({ id: uid(), auto: true, status: 'open', openedAt: when(ctx), openedBy: 'System', ...w });
    audit(inc, ctx, 'item.open', w.text, { urgent: w.urgent });
  }
}

export function addOpenItem(inc, ctx, { text, urgent = false }) {
  editing(ctx);
  if (!filled(text)) throw new RuleError('Describe what needs attention.');
  const item = { id: uid(), key: `manual:${uid()}`, auto: false, locked: false, status: 'open', text: text.trim(), urgent, stage: inc.stage, openedAt: when(ctx), openedBy: who(ctx) };
  inc.openItems.push(item);
  audit(inc, ctx, 'item.open', item.text, { urgent });
  return item;
}

export function closeItem(inc, ctx, id, note) {
  editing(ctx);
  const item = inc.openItems.find((i) => i.id === id);
  if (!item || item.status !== 'open') throw new RuleError('That item is not open.');
  if (item.locked) throw new RuleError('This item closes by itself when the record behind it is updated. Open it to make the change.');
  if (!filled(note)) throw new RuleError('Say how the item was dealt with.');
  Object.assign(item, { status: 'closed', closedAt: when(ctx), closedBy: who(ctx), note: note.trim(), closedAuto: false });
  audit(inc, ctx, 'item.close', item.text, { note: item.note });
}

export const openItems = (inc) => inc.openItems.filter((i) => i.status === 'open').sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.openedAt - b.openedAt);
export const urgentItems = (inc) => openItems(inc).filter((i) => i.urgent);
export const dangerActive = (inc) => inc.openItems.some((i) => i.key === 'danger' && i.status === 'open');

// Stages

export function completeStage(inc, ctx, n) {
  editing(ctx);
  if (!STAGES[n]) throw new RuleError('Unknown stage.');
  inc.stages[n] = { ...inc.stages[n], completedAt: when(ctx), completedBy: who(ctx) };
  if (n < 3) {
    inc.stage = Math.max(inc.stage, n + 1);
    inc.stages[n + 1] ??= { startedAt: when(ctx) };
  }
  audit(inc, ctx, 'stage.complete', `Stage ${n}`, {});
  refresh(inc, ctx);
  const open = openItems(inc).length;
  entry(inc, ctx, {
    category: 'decision',
    text: `Stage ${n} (${STAGES[n].title}) marked complete${open ? ` with ${open} open item${open === 1 ? '' : 's'} carried forward` : ''}.`,
    ref: { type: 'stage', n },
  });
  if (n === 2) planFromGaps(inc, ctx);
}

export function setLevel(inc, ctx, level) {
  editing(ctx);
  const value = Number(level);
  if (!LEVELS[value]) throw new RuleError('Choose an investigation level.');
  if (inc.level === value) return;
  audit(inc, ctx, 'investigation.level', 'level', { from: inc.level, to: value });
  inc.level = value;
  entry(inc, ctx, { category: 'decision', text: `Investigation level set: ${LEVELS[value].label}` });
}

export function markSection(inc, ctx, key, done = true) {
  editing(ctx);
  if (Boolean(inc.done[key]) === done) return;
  if (done) inc.done[key] = when(ctx);
  else delete inc.done[key];
  audit(inc, ctx, done ? 'section.done' : 'section.reopen', key, {});
}

export function closeIncident(inc, ctx, note) {
  editing(ctx);
  if (!filled(note)) throw new RuleError('Add a closing note. Any open items stay on the file.');
  inc.closedAt = when(ctx);
  audit(inc, ctx, 'incident.close', inc.ref, { note, openItems: openItems(inc).length });
  entry(inc, ctx, { category: 'decision', text: `Incident file closed: ${note.trim()}` });
}

export function reopenIncident(inc, ctx) {
  editing(ctx);
  inc.closedAt = null;
  audit(inc, ctx, 'incident.reopen', inc.ref, {});
  entry(inc, ctx, { category: 'decision', text: 'Incident file reopened.' });
}

// Classification. Every change is a new version. The app may suggest one, but only an authorised
// person can confirm it.

export const currentClassification = (inc) => inc.classification.at(-1) ?? null;

export function suggestClassification(inc) {
  const people = records(inc, 'people');
  const controls = records(inc, 'controlsAssessed');
  const risks = [...new Set(controls.map((c) => c.risk).filter((r) => CRITICAL_RISKS[r]))];
  const used = [];
  const missing = [];
  const why = [];
  const values = {};
  const rank = ['none', 'firstaid', 'medical', 'restricted', 'losttime'];
  const treatments = people.map((p) => p.treatment).filter((t) => rank.includes(t));
  const worst = treatments.sort((a, b) => rank.indexOf(b) - rank.indexOf(a))[0];
  const exposures = people.map((p) => p.exposureStatus);

  if (people.length) used.push(`${people.length} affected ${people.length === 1 ? 'person' : 'people'} recorded`);
  else missing.push('No affected people recorded');
  for (const p of people) {
    if (!rank.includes(p.treatment)) missing.push(`Treatment level not recorded for ${p.name || p.number}`);
  }

  if (worst && worst !== 'none') {
    values.eventType = 'Injury';
    values.injuryCategory = { firstaid: 'First aid injury', medical: 'Medical treatment injury', restricted: 'Restricted work injury', losttime: 'Lost time injury' }[worst];
    values.actual = { firstaid: CONSEQUENCES[1], medical: CONSEQUENCES[2], restricted: CONSEQUENCES[2], losttime: CONSEQUENCES[3] }[worst];
    used.push(`Highest treatment recorded: ${values.injuryCategory.toLowerCase()}`);
    why.push('The injury category follows the highest level of treatment recorded so far. It changes if treatment changes.');
  } else if (exposures.includes('confirmed')) {
    values.eventType = 'Illness or exposure';
    values.injuryCategory = 'Confirmed exposure';
    values.actual = 'Unknown';
    used.push('At least one exposure is confirmed with linked evidence');
    missing.push('Medical outcome of the confirmed exposure');
  } else if (exposures.includes('reported') || exposures.includes('unknown')) {
    values.eventType = 'Illness or exposure';
    values.injuryCategory = 'Suspected exposure — not confirmed';
    values.actual = 'Unknown';
    used.push('Exposure is reported or unknown, and not confirmed');
    missing.push('Medical assessment or monitoring evidence to confirm or rule out exposure');
    why.push('Exposure has been reported but there is no evidence yet, so it is treated as suspected, not confirmed.');
  } else if (people.length || answer(inc, 's1.p.injured') === 'no') {
    values.injuryCategory = 'No injury';
    values.actual = CONSEQUENCES[0];
    used.push('No injury or exposure recorded');
  } else {
    values.injuryCategory = 'Unknown';
    values.actual = 'Unknown';
    missing.push('Whether anyone was injured or exposed');
  }

  if (risks.length) {
    const risk = CRITICAL_RISKS[risks[0]];
    values.criticalRisk = risk.label;
    values.riskStatement = risk.statement;
    values.potential = CONSEQUENCES[5];
    used.push(`Critical risk selected: ${risks.map((r) => CRITICAL_RISKS[r].label).join(', ')}`);
    why.push('A critical risk is involved. Critical risks are those that can kill, so the potential consequence is set at the top of the scale for an authorised person to review.');
  } else {
    values.criticalRisk = 'None identified';
    values.potential = values.actual === CONSEQUENCES[0] ? 'Unknown' : values.actual;
    missing.push('No critical risk has been selected in "Critical risks and controls"');
  }
  if (!values.eventType) values.eventType = risks.length ? 'Near miss' : '';

  const serious = [CONSEQUENCES[3], CONSEQUENCES[4], CONSEQUENCES[5]];
  if (serious.includes(values.potential) && !serious.includes(values.actual)) {
    values.hipo = 'Refer for HIPO review';
    why.push('The actual outcome was less than serious but the potential outcome was serious or worse, which is the pattern of a high-potential (HIPO) event.');
  } else {
    values.hipo = 'Undetermined';
  }
  if (controls.some((c) => c.rating === 'Bypassed' || c.bypassed === 'yes')) {
    values.cardinal = 'Possible breach — refer';
    used.push('A critical control is recorded as bypassed');
    why.push('A critical control was recorded as bypassed. Whether that breaches a Cardinal Rule is for an authorised person to decide.');
  } else {
    values.cardinal = 'Undetermined';
  }
  const publicInvolved = answer(inc, 's1.p.public');
  values.publicImpact = { yes: 'Members of the public involved', no: 'None' }[publicInvolved] ?? 'Unknown';
  if (publicInvolved) used.push(`Public involvement answered: ${answerLabel('s1.p.public', publicInvolved)}`);
  else missing.push('Whether members of the public were involved');
  values.environmental = 'Unknown';
  missing.push('Environmental impact has not been assessed');

  values.level = values.hipo === 'Refer for HIPO review' || serious.includes(values.actual) ? '3'
    : values.actual === CONSEQUENCES[2] || values.eventType === 'Illness or exposure' ? '2' : '1';
  why.push(`Suggested ${LEVELS[values.level].label.toLowerCase()} from the actual and potential consequence.`);

  return { draft: true, values, used, missing, why, rule: RULE_PLACEHOLDER, confirmBy: 'An authorised person (for example the HSE Manager) must confirm the classification.' };
}

export function proposeClassification(inc, ctx, values, source = 'advisor') {
  editing(ctx);
  const version = { v: inc.classification.length + 1, at: when(ctx), by: who(ctx), source, values: { ...values }, status: 'proposed', confirmedBy: null, confirmedAt: null };
  inc.classification.push(version);
  audit(inc, ctx, 'classification.propose', `v${version.v}`, { values: version.values, source });
  entry(inc, ctx, { category: 'decision', text: `Preliminary classification version ${version.v} proposed${values.injuryCategory ? ` (${values.injuryCategory})` : ''} — not yet confirmed.`, ref: { type: 'classification', v: version.v } });
  if (values.level && !inc.level) inc.level = Number(values.level);
  refresh(inc, ctx);
  return version;
}

export function confirmClassification(inc, ctx, name) {
  need(ctx, 'confirmClassification', 'Confirming the classification');
  const version = currentClassification(inc);
  if (!version) throw new RuleError('There is no classification to confirm yet.');
  if (version.status === 'confirmed') return version;
  Object.assign(version, { status: 'confirmed', confirmedBy: (name || who(ctx)).trim(), confirmedAt: when(ctx) });
  audit(inc, ctx, 'classification.confirm', `v${version.v}`, { confirmedBy: version.confirmedBy });
  entry(inc, ctx, { category: 'decision', text: `Classification version ${version.v} confirmed by ${version.confirmedBy}.`, ref: { type: 'classification', v: version.v } });
  refresh(inc, ctx);
  return version;
}

// Wording checks. These look for words, not meaning, so they prompt the advisor rather than decide.

const CAUSAL = /\b(caus(?:e|ed|es|ing)|because|due to|as a result of|result(?:ed|s|ing)? in|led to|leading to|root cause|responsible for|fail(?:ed|ure) to|should have|contributed to)\b/gi;
const BLAME = /\b(careless(?:ness|ly)?|negligen(?:t|ce|tly)|reckless(?:ly|ness)?|lazy|laziness|complacen(?:t|cy)|incompeten(?:t|ce)|stupid(?:ity|ly)?|foolish(?:ly)?|at fault|blam(?:e|ed|es)|deliberate(?:ly)?|intentional(?:ly)?|wil+ful(?:ly)?|knowingly|did(?:n'?t| not) care|bad attitude|poor attitude|distracted|inattenti(?:ve|on)|poor judge?ment|l(?:ying|ied)|dishonest|deceptive|untruthful|not credible|unreliable witness)\b/gi;

export function textIssues(text) {
  const found = (re) => [...new Set((String(text ?? '').match(re) ?? []).map((m) => m.toLowerCase()))];
  return { causal: found(CAUSAL), blame: found(BLAME) };
}

// Findings

export function findingProblems(inc, f) {
  const problems = [];
  const block = (text) => problems.push({ text, blocking: true });
  const supported = obtained(inc, f.evidence).length > 0;
  const unable = /unable to determine/i.test(f.statement ?? '');
  const { causal, blame } = textIssues([f.statement, f.effect].join(' '));
  if (!filled(f.statement)) block('Write the finding statement.');
  if (!FINDING_TYPES.some(([v]) => v === f.type)) block('Choose whether this is a fact, observation, finding, conclusion or recommendation.');
  if (!supported && !filled(f.evidenceUnavailable) && !unable) {
    block((f.evidence ?? []).length ? 'None of the linked evidence has been obtained yet. Obtain it, or state why evidence is unavailable.' : 'Link evidence, or state why evidence is unavailable.');
  }
  if (causal.length && !unable && (!supported || !filled(f.facts))) {
    block(`Causal wording (“${causal.join('”, “')}”) needs linked evidence that has been obtained and the facts relied upon. Otherwise use: “${UNABLE_TO_DETERMINE}”`);
  }
  if (blame.length) block(`Wording about blame, attitude or intent (“${blame.join('”, “')}”). Describe what happened and the conditions instead.`);
  if (!filled(f.uncertainty)) problems.push({ text: 'State any uncertainty or limitation, or write "None identified".', blocking: false });
  return problems;
}

const FINDING_FLOW = { draft: ['submitted'], submitted: ['approved', 'returned'], returned: ['submitted'], approved: ['returned'] };

export function setFindingStatus(inc, ctx, id, status, reviewer) {
  editing(ctx);
  const f = record(inc, 'findings', id);
  if (!f || f.voided) throw new RuleError('That finding could not be found.');
  if (!FINDING_FLOW[f.status]?.includes(status)) throw new RuleError(`A finding that is "${FINDING_STATUS[f.status]}" cannot move to "${FINDING_STATUS[status] ?? status}".`);
  if (status !== 'returned') {
    const blocking = findingProblems(inc, f).filter((p) => p.blocking);
    if (blocking.length) throw new RuleError(`This finding is not ready: ${blocking.map((p) => p.text).join(' ')}`);
  }
  if (status === 'approved' || f.status === 'approved') need(ctx, 'approve', 'Approving a finding or reopening an approved one');
  if (status === 'approved') {
    f.reviewer = (reviewer || f.reviewer || who(ctx)).trim();
    f.approvedAt = when(ctx);
  }
  audit(inc, ctx, 'finding.status', f.number, { from: f.status, to: status, reviewer: f.reviewer });
  f.status = status;
  entry(inc, ctx, { category: 'decision', text: `Finding ${f.number} ${FINDING_STATUS[status].toLowerCase()}${status === 'approved' ? ` by ${f.reviewer}` : ''}.`, ref: { type: 'findings', id } });
  return f;
}

export function factorProblems(inc, f) {
  const problems = [];
  if (!filled(f.text)) problems.push('Describe the contributing factor.');
  if (!filled(f.category)) problems.push('Choose an investigation category.');
  if (!obtained(inc, f.evidence).length) problems.push('Link evidence that has been obtained. A contributing factor must rest on evidence.');
  const { blame } = textIssues(f.text);
  if (blame.length) problems.push(`Wording about blame, attitude or intent (“${blame.join('”, “')}”). Describe conditions and arrangements instead.`);
  return problems;
}

// Actions

export const actionFlow = (a) => [...new Set([...(a.type === 'immediate' ? IMMEDIATE_FLOW[a.state] ?? [] : []), ...(ACTION_FLOW[a.state] ?? [])])];

export function actionFromFinding(inc, ctx, findingId, data = {}) {
  const f = record(inc, 'findings', findingId);
  if (!f || f.voided) throw new RuleError('That finding could not be found.');
  if (f.status !== 'approved') throw new RuleError('Corrective actions are created from approved findings. This finding has not been approved yet.');
  return addRecord(inc, ctx, 'actions', { gap: f.statement, ...data, type: 'corrective', finding: findingId });
}

export function moveAction(inc, ctx, id, to) {
  editing(ctx);
  const a = record(inc, 'actions', id);
  if (!a || a.voided) throw new RuleError('That action could not be found.');
  if (!actionFlow(a).includes(to)) throw new RuleError(`An action that is "${ACTION_STATES[a.state]}" cannot move straight to "${ACTION_STATES[to] ?? to}".`);
  const missing = [];
  if (to === 'approved') {
    need(ctx, 'approve', 'Approving an action');
    if (record(inc, 'findings', a.finding)?.status !== 'approved') missing.push('a link to an approved finding');
    if (!filled(a.approver)) missing.push('the approver');
  }
  if (to === 'assigned' && !filled(a.owner)) missing.push('an accountable owner');
  if (to === 'assigned' && a.type === 'corrective' && !filled(a.dueDate)) missing.push('a due date');
  if (to === 'evidence' && !(a.evidence ?? []).length) missing.push('linked completion evidence');
  if (to === 'verified' && !filled(a.verifiedBy)) missing.push('who verified completion');
  if (to === 'reviewdue' && !filled(a.effectivenessReview)) missing.push('how and when effectiveness will be reviewed');
  if ((to === 'effective' || to === 'ineffective') && !filled(a.effectivenessResult)) missing.push('the effectiveness review result');
  if (missing.length) throw new RuleError(`Before this action can be "${ACTION_STATES[to]}", record ${missing.join(', ')}.`);
  audit(inc, ctx, 'action.state', a.number, { from: a.state, to });
  a.state = to;
  (a.history ??= []).push({ state: to, at: when(ctx), by: who(ctx) });
  entry(inc, ctx, { category: 'action', text: `Action ${a.number} is now ${ACTION_STATES[to].toLowerCase()}: ${a.description || 'not described'}`, ref: { type: 'actions', id } });
  refresh(inc, ctx);
  return a;
}

// Implemented is not effective: an action only counts as finished once its effectiveness review says so.
export const actionFinished = (a) => a.state === 'effective';

const words = (text) => new Set(String(text ?? '').toLowerCase().match(/[a-z]{4,}/g) ?? []);
const overlap = (a, b) => {
  const [x, y] = [words(a), words(b)];
  if (!x.size || !y.size) return 0;
  return [...x].filter((w) => y.has(w)).length / Math.min(x.size, y.size);
};
const TRAINING = /\b(re-?train(?:ing|ed)?|train(?:ing)?|re-?induct(?:ion)?|toolbox(?: talk)?|refresher|competency assessment)\b/i;
const REMINDING = /\b(remind(?:er|ed|ing)?|re-?brief|reinforce|raise awareness|awareness|be more careful|take (?:more )?care|safety alert|communicate to (?:all )?workers|tell workers)\b/i;
const HIGHER_ORDER = /\b(eliminat|substitut|isolat|engineer|guard|barrier|interlock|redesign|lock|physical|install|replace|remove|automat)/i;

export function actionWarnings(inc, a) {
  const warnings = [];
  const text = a.description ?? '';
  const soft = !HIGHER_ORDER.test(text) && !['Elimination', 'Substitution', 'Isolation', 'Engineering'].includes(a.hierarchy);
  if (TRAINING.test(text) && soft) warnings.push('This action relies only on retraining. Consider a control higher up the hierarchy as well.');
  if (REMINDING.test(text) && soft) warnings.push('This action relies only on reminding workers. Consider a control that does not depend on memory.');
  const twin = records(inc, 'actions').find((b) => b.id !== a.id && b.createdAt <= a.createdAt && filled(b.description) && overlap(b.description, text) >= 0.8);
  if (twin) warnings.push(`This repeats an earlier action (${twin.number}). Check why the earlier one did not work.`);
  if (a.type === 'corrective') {
    const f = record(inc, 'findings', a.finding);
    if (!f || f.voided) warnings.push('This action is not linked to a finding.');
    else if (f.status !== 'approved') warnings.push(`The finding it addresses (${f.number}) has not been approved.`);
    else if (!a.addresses) warnings.push('Check that this action addresses the finding, then tick the box to say so.');
  }
  if (!filled(a.owner)) warnings.push('No accountable owner.');
  if (!filled(a.evidenceRequired)) warnings.push('No objective completion evidence is defined.');
  if (a.type === 'corrective' && !filled(a.effectivenessReview)) warnings.push('No effectiveness check is planned.');
  return warnings;
}

export function actionCounts(inc) {
  const all = records(inc, 'actions');
  const count = (states) => all.filter((a) => states.includes(a.state)).length;
  return {
    total: all.length,
    notStarted: count(['proposed', 'approved', 'assigned', 'reopened']),
    inProgress: count(['inprogress']),
    implementedNotVerified: count(['implemented', 'evidence']),
    verifiedNotEffective: count(['verified', 'reviewdue']),
    effective: count(['effective']),
    ineffective: count(['ineffective']),
  };
}

// Event sequence and comparison

export function sequenceReview(inc) {
  const entries = records(inc, 'sequence');
  const gaps = [];
  const conflicts = [];
  for (const phase of SEQUENCE_PHASES) {
    const here = entries.filter((e) => e.phase === phase && e.standing !== 'ruledout');
    if (!here.length) gaps.push(`Nothing recorded for: ${phase}`);
    const versions = [...new Set(here.map((e) => e.version || 'A'))];
    if (versions.length > 1) conflicts.push(`${phase}: ${versions.length} possible sequences are still open (${versions.sort().join(', ')})`);
  }
  for (const e of entries) {
    if (e.standing !== 'ruledout' && !obtained(inc, e.evidence).length) gaps.push(`No evidence linked for ${e.number}: ${(e.text || 'not described').slice(0, 60)}`);
    if (e.standing === 'supported' && !obtained(inc, e.evidence).length) conflicts.push(`${e.number} is marked as supported by evidence but none is linked`);
  }
  return { gaps, conflicts };
}

const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function compareRows(inc) {
  return COMPARE_ROWS.map(([key, plannedLabel, performedLabel]) => {
    const planned = field(inc, 'compare', `${key}.planned`);
    const performed = field(inc, 'compare', `${key}.performed`);
    const complete = filled(planned) && filled(performed);
    return { key, plannedLabel, performedLabel, planned, performed, different: complete && squash(planned) !== squash(performed), incomplete: !complete };
  });
}

// What is known, what is not, and what still has to be done

export function completeness(inc) {
  const timeline = effectiveEntries(inc);
  const line = (e) => `#${e.n} ${e.text}`;
  const evidence = records(inc, 'evidence');
  const missing = [];
  for (const [key, label] of [['what', 'What happened'], ['where', 'Where it happened']]) if (!filled(inc.start[key])) missing.push(label);
  for (const f of FORMS.details) if (!filled(field(inc, 'details', f.k)) && f.k !== 'discoveredAt' && f.k !== 'principal') missing.push(`Incident details: ${f.label}`);
  for (const f of FORMS.work) if (!filled(field(inc, 'work', f.k))) missing.push(`Work: ${f.label}`);
  for (const group of ['people', 'scene', 'conditions']) {
    for (const q of GROUPS[group].questions) {
      const value = answer(inc, q.k);
      if (!value) missing.push(`Not answered: ${q.q}`);
      else if (value === 'unsure' || value === 'unknown') missing.push(`Still unknown: ${q.q}`);
    }
  }
  if (!records(inc, 'controlsAssessed').length) missing.push('No critical risks or controls have been assessed');

  const conflicting = [
    ...inc.conflicts.filter((c) => !c.resolvedAt).map((c) => `${[c.a, c.b].filter(Boolean).map((id) => `#${numberOf(inc, id)}`).join(' and ')} ${c.note}`.trim()),
    ...evidence.filter((e) => e.status === 'contradictory').map((e) => `Contradictory evidence: ${recordTitle('evidence', e)}`),
    ...sequenceReview(inc).conflicts,
  ];
  const evidenceRequired = [
    ...evidence.filter((e) => e.status === 'requested').map((e) => `Requested, not yet obtained: ${recordTitle('evidence', e)}`),
    ...evidence.filter((e) => e.status === 'verify').map((e) => `Needs verification: ${recordTitle('evidence', e)}`),
    ...records(inc, 'people').filter((p) => ['reported', 'unknown'].includes(p.exposureStatus) && !obtained(inc, p.evidence).length)
      .map((p) => `Medical assessment or monitoring evidence for ${p.name || p.number} (exposure ${p.exposureStatus === 'reported' ? 'reported, not verified' : 'unknown'})`),
    ...records(inc, 'controlsAssessed').filter((c) => !filled(c.rating) || c.rating === 'Unable to determine' || !obtained(inc, c.evidence).length)
      .map((c) => `Evidence for the control "${c.control}"${c.rating === 'Unable to determine' ? ' (unable to determine)' : ''}`),
  ];
  const interviewsRequired = records(inc, 'witnesses').flatMap((w) => [
    w.interviewCompleted !== 'yes' ? `Interview ${w.name || w.number}` : null,
    w.statementRequired === 'yes' && w.statementObtained !== 'yes' ? `Written statement from ${w.name || w.number}` : null,
  ]).filter(Boolean);
  const classification = currentClassification(inc);
  const hsem = answer(inc, 's1.n.hsem');

  return {
    confirmed: timeline.filter((e) => e.verification === 'confirmed').map(line),
    unverified: timeline.filter((e) => e.verification !== 'confirmed').map(line),
    missing,
    conflicting,
    evidenceRequired,
    interviewsRequired,
    classificationOutstanding: !classification ? ['No preliminary classification recorded']
      : classification.status !== 'confirmed' ? [`Version ${classification.v} is proposed but not confirmed by an authorised person`] : [],
    notificationOutstanding: [
      ...(inc.fields.notify?.decision ? [] : ['Formal notification decision not recorded (an authorised person must make it)']),
      ...(hsem === 'notified' ? [] : ['Manager HSE not recorded as notified']),
      ...GROUPS.notify.questions.filter((q) => answer(inc, q.k) === 'todo').map((q) => `Still to notify: ${q.q}`),
      ...records(inc, 'notifications').filter((n) => !n.completedAt).map((n) => `Notification not completed: ${n.recipient || n.number}`),
    ],
    actionsOpen: [
      ...records(inc, 'actions').filter((a) => a.type === 'immediate' && !['implemented', 'evidence', 'verified', 'reviewdue', 'effective'].includes(a.state)).map((a) => `${a.number} ${a.description || 'not described'} (${ACTION_STATES[a.state]})`),
      ...openItems(inc).filter((i) => i.stage === 1).map((i) => i.text),
    ],
  };
}

export const COMPLETENESS_TITLES = {
  confirmed: 'Confirmed information',
  unverified: 'Unverified information',
  missing: 'Missing information',
  conflicting: 'Conflicting information',
  evidenceRequired: 'Evidence still required',
  interviewsRequired: 'Interviews still required',
  classificationOutstanding: 'Classification decisions outstanding',
  notificationOutstanding: 'Notification decisions outstanding',
  actionsOpen: 'Immediate actions still open',
};

// Blank fields and unanswered questions become one task per group, so the plan stays readable.
// Things recorded as unknown are real gaps and each gets its own task.
function groupMissing(missing) {
  const tasks = [];
  for (const [prefix, label] of [['Incident details: ', 'Complete the incident details'], ['Work: ', 'Complete "Work being undertaken"'], ['Not answered: ', 'Answer the outstanding questions']]) {
    const group = missing.filter((m) => m.startsWith(prefix)).map((m) => m.slice(prefix.length));
    if (group.length) tasks.push(`Find out — ${label} (${group.length} outstanding: ${group.slice(0, 4).join('; ')}${group.length > 4 ? '; and more' : ''})`);
  }
  return [...tasks, ...missing.filter((m) => !/^(Incident details|Work|Not answered): /.test(m)).map((m) => `Find out — ${m}`)];
}

// Turns every gap into an investigation task. Safe to run again: a gap already on the list is skipped.
export function planFromGaps(inc, ctx) {
  editing(ctx);
  const gaps = completeness(inc);
  const wanted = [
    ...gaps.evidenceRequired.map((t) => `Obtain evidence — ${t}`),
    ...gaps.interviewsRequired.map((t) => `Interviews — ${t}`),
    ...gaps.conflicting.map((t) => `Resolve conflict — ${t}`),
    ...groupMissing(gaps.missing),
    ...gaps.classificationOutstanding.map((t) => `Classification — ${t}`),
    ...gaps.notificationOutstanding.map((t) => `Notification — ${t}`),
    ...gaps.actionsOpen.map((t) => `Close out — ${t}`),
    ...(gaps.unverified.length ? [`Verify or keep marked as unverified — ${gaps.unverified.length} unverified timeline entr${gaps.unverified.length === 1 ? 'y' : 'ies'}`] : []),
  ];
  const existing = new Set((inc.records.tasks ?? []).map((t) => t.source));
  const added = [];
  for (const text of wanted) {
    if (existing.has(text)) continue;
    added.push(addRecord(inc, ctx, 'tasks', { text, source: text, fromGap: true }));
  }
  return added;
}

// Follow-up questions are prompts drawn from gaps. They never judge the person being interviewed.
export function suggestFollowUps(inc, interview) {
  const out = [];
  const prompts = { work: 'the work being performed', saw: 'what they saw or heard', actions: 'the actions they took', instructions: 'the instructions they received', expected: 'the controls they expected to be in place', observed: 'the controls they actually saw in place', changes: 'any changes they noticed', unusual: 'anything unusual', identify: 'documents or evidence they can point to' };
  for (const [k, label] of Object.entries(prompts)) if (!filled(interview[k])) out.push(`Not yet covered: ask about ${label}.`);
  for (const gap of sequenceReview(inc).gaps.filter((g) => g.startsWith('Nothing recorded')).slice(0, 4)) out.push(`The event sequence has a gap — ${gap.replace('Nothing recorded for: ', '').toLowerCase()}. Ask what they know about it.`);
  for (const c of records(inc, 'controlsAssessed').filter((c) => c.rating === 'Unable to determine' || !filled(c.rating)).slice(0, 4)) out.push(`The control "${c.control}" could not be assessed. Ask what they saw of it.`);
  for (const c of inc.conflicts.filter((c) => !c.resolvedAt).slice(0, 3)) out.push(`There is conflicting information (${c.note}). Ask them to describe that part again in their own words.`);
  return out;
}

// Investigation review

export function qualityChecks(inc) {
  const findings = records(inc, 'findings');
  const approved = findings.filter((f) => f.status === 'approved');
  const actions = records(inc, 'actions').filter((a) => a.type === 'corrective');
  const factors = records(inc, 'factors');
  const controls = records(inc, 'controlsAssessed');
  const seq = sequenceReview(inc);
  const gaps = completeness(inc);
  const text = [...findings.map((f) => `${f.statement} ${f.effect}`), ...factors.map((f) => f.text)].join(' ');
  const auto = {
    facts: findings.length ? [findings.every((f) => !findingProblems(inc, f).some((p) => p.blocking)), `${findings.filter((f) => findingProblems(inc, f).some((p) => p.blocking)).length} of ${findings.length} findings have unresolved problems`] : [false, 'No findings recorded'],
    witness: [true, `${inc.timeline.filter((e) => e.category === 'witness').length} timeline entries are marked as witness accounts; ${records(inc, 'interviews').length} interviews recorded`],
    conflicts: [gaps.conflicting.length === 0, gaps.conflicting.length ? `${gaps.conflicting.length} conflicts are open and must be acknowledged in the report` : 'No open conflicts'],
    sequence: [seq.gaps.length === 0 && seq.conflicts.length === 0, `${seq.gaps.length} gaps, ${seq.conflicts.length} conflicts in the event sequence`],
    controls: controls.length ? [controls.every((c) => filled(c.rating)), `${controls.filter((c) => !filled(c.rating)).length} of ${controls.length} controls not yet assessed`] : [false, 'No controls assessed'],
    causes: [factors.every((f) => !factorProblems(inc, f).length), factors.length ? `${factors.filter((f) => factorProblems(inc, f).length).length} of ${factors.length} contributing factors have problems` : 'No contributing factors recorded'],
    actions: actions.length ? [actions.every((a) => record(inc, 'findings', a.finding)?.status === 'approved'), `${actions.filter((a) => record(inc, 'findings', a.finding)?.status !== 'approved').length} of ${actions.length} corrective actions are not linked to an approved finding`] : [approved.length === 0, approved.length ? 'Approved findings have no corrective actions' : 'No corrective actions'],
    hierarchy: actions.length ? [actions.some((a) => ['Elimination', 'Substitution', 'Isolation', 'Engineering'].includes(a.hierarchy)), 'Looks for at least one action above administrative controls'] : [false, 'No corrective actions'],
    owners: [actions.every((a) => filled(a.owner) && filled(a.dueDate)), `${actions.filter((a) => !filled(a.owner) || !filled(a.dueDate)).length} corrective actions lack an owner or due date`],
    notifications: [gaps.notificationOutstanding.length === 0, `${gaps.notificationOutstanding.length} notification matters open`],
    limitations: findings.length ? [findings.every((f) => filled(f.uncertainty)), `${findings.filter((f) => !filled(f.uncertainty)).length} findings have no uncertainty or limitation stated`] : [false, 'No findings recorded'],
    blame: [textIssues(text).blame.length === 0, textIssues(text).blame.length ? `Wording to review: ${textIssues(text).blame.join(', ')}` : 'No blame wording detected (a word check only)'],
    pathway: [filled(field(inc, 'plan', 'reviewAuthority')) && filled(field(inc, 'plan', 'approvalAuthority')) && Boolean(inc.level), 'Needs the level, review authority and approval authority in the plan'],
  };
  return GROUPS.quality.questions.map((q) => {
    const [pass, detail] = auto[q.k.split('.').pop()];
    return { key: q.k, question: q.q, auto: pass ? 'pass' : 'attention', detail, answer: answer(inc, q.k), note: inc.notes[q.k] ?? '' };
  });
}

// Progress and what to do next

const groupState = (inc, group) => {
  const answered = GROUPS[group].questions.filter((q) => answer(inc, q.k)).length;
  return answered === 0 ? 'todo' : answered === GROUPS[group].questions.length ? 'done' : 'started';
};

const HAS_DATA = {
  details: (inc) => Object.values(inc.fields.details ?? {}).some(filled),
  people: (inc) => records(inc, 'people').length > 0,
  work: (inc) => Object.values(inc.fields.work ?? {}).some(filled),
  conditions: (inc) => groupState(inc, 'conditions') !== 'todo',
  equipment: (inc) => records(inc, 'equipment').length > 0,
  documents: (inc) => records(inc, 'evidence').some((e) => filled(e.docType)),
  risks: (inc) => records(inc, 'controlsAssessed').length > 0,
  witnesses: (inc) => records(inc, 'witnesses').length > 0,
  evidence: (inc) => records(inc, 'evidence').length > 0,
  timeline: (inc) => inc.timeline.length > 1,
  classification: (inc) => inc.classification.length > 0,
  completeness: () => false,
  plan: (inc) => Object.values(inc.fields.plan ?? {}).some(filled) || records(inc, 'tasks').length > 0,
  evboard: (inc) => records(inc, 'questions').length > 0,
  interviews: (inc) => records(inc, 'interviews').length > 0,
  sequence: (inc) => records(inc, 'sequence').length > 0,
  compare: (inc) => Object.values(inc.fields.compare ?? {}).some(filled),
  controls: (inc) => records(inc, 'controlsAssessed').some((c) => filled(c.why) || filled(c.source)),
  findings: (inc) => records(inc, 'findings').length > 0,
  factors: (inc) => records(inc, 'factors').length > 0,
  actions: (inc) => records(inc, 'actions').some((a) => a.type === 'corrective'),
  review: (inc) => GROUPS.quality.questions.some((q) => answer(inc, q.k)),
};

// 'todo' | 'started' | 'done' | 'attention' | 'notneeded'
export function sectionState(inc, stage, key) {
  if (stage === 1) {
    if (key === 'danger') {
      const value = answer(inc, DANGER_QUESTION);
      if (!value) return 'todo';
      if (dangerActive(inc)) return 'attention';
      if (value === 'no') return 'done';
      return ['danger.atRisk', 'danger.remaining', 'danger.controls'].some((k) => inc.openItems.some((i) => i.key === k && i.status === 'open')) ? 'started' : 'done';
    }
    if (key === 'review') return inc.stages[1]?.completedAt ? 'done' : groupState(inc, 'checklist') === 'todo' ? 'todo' : 'started';
    return groupState(inc, key);
  }
  const done = inc.done[`s${stage}.${key}`];
  if (stage === 3) {
    const levels = STAGE3_SECTIONS.find(([k]) => k === key)?.[2] ?? [];
    if (inc.level && !levels.includes(inc.level) && !done && !HAS_DATA[key]?.(inc)) return 'notneeded';
  }
  if (done) return 'done';
  return HAS_DATA[key]?.(inc) ? 'started' : 'todo';
}

export function stageProgress(inc, stage) {
  const sections = stage === 1 ? STAGE1_STEPS : stage === 2 ? STAGE2_SECTIONS : STAGE3_SECTIONS;
  const states = sections.map(([key]) => sectionState(inc, stage, key));
  const needed = states.filter((s) => s !== 'notneeded');
  return { done: needed.filter((s) => s === 'done').length, total: needed.length, complete: Boolean(inc.stages[stage]?.completedAt) };
}

// One thing to do next, with the screen that does it.
export function nextStep(inc) {
  if (inc.closedAt) return { text: 'This incident file is closed.', route: '' };
  if (!answer(inc, DANGER_QUESTION)) return { text: 'Answer the immediate danger question.', route: 's1/danger' };
  if (dangerActive(inc)) return { text: 'Immediate danger is active or unknown. Review the hazard and its controls.', route: 's1/danger' };
  const urgent = urgentItems(inc);
  const stage = inc.stage;
  const sections = stage === 1 ? STAGE1_STEPS : stage === 2 ? STAGE2_SECTIONS : STAGE3_SECTIONS;
  const next = sections.find(([key]) => ['todo', 'started', 'attention'].includes(sectionState(inc, stage, key)));
  if (stage === 1 && next) return { text: `${urgent.length ? `${urgent.length} urgent item${urgent.length === 1 ? '' : 's'} open. ` : ''}Continue Stage 1: ${next[1]}.`, route: `s1/${next[0]}` };
  if (urgent.length) return { text: `Deal with ${urgent.length} urgent open item${urgent.length === 1 ? '' : 's'}: ${urgent[0].text}`, route: 'open' };
  if (next) return { text: `Continue Stage ${stage}: ${next[1]}.`, route: `s${stage}/${next[0]}` };
  if (stage < 3) return { text: `Stage ${stage} sections are complete. Move to Stage ${stage + 1}.`, route: `s${stage}` };
  if (inc.exportState.status !== 'submitted') return { text: 'Investigation sections are complete. Review the export status.', route: 'summary/export' };
  return { text: 'Nothing outstanding. Check the open items list before closing the file.', route: 'open' };
}

export function stats(inc) {
  return {
    open: openItems(inc).length,
    urgent: urgentItems(inc).length,
    timeline: inc.timeline.length,
    evidence: records(inc, 'evidence').length,
    people: records(inc, 'people').length,
    actions: records(inc, 'actions').length,
    unverified: effectiveEntries(inc).filter((e) => e.verification !== 'confirmed').length,
  };
}

// Briefs and reports. Each is a list of sections; each line carries how far it can be relied on.

const answerTag = (inc, key) => {
  const a = inc.answers[key];
  return !a || a.value === 'unsure' ? 'unknown' : a.verified ? 'confirmed' : 'unverified';
};
const answerLine = (inc, key) => {
  const a = inc.answers[key];
  return { text: `${QUESTIONS[key].q} ${a ? answerLabel(key, a.value) : 'Not yet answered'}`, tag: answerTag(inc, key) };
};
const none = (items, text = 'Nothing recorded', tag = 'unknown') => (items.length ? items : [{ text, tag }]);
const RESTRICTED = 'health details restricted';

function personLine(inc, p, health) {
  const parts = [p.number, p.name || 'identity not yet known', p.employer, p.currentLocation && `now at: ${p.currentLocation}`, p.supporter && `supported by ${p.supporter}`].filter(Boolean);
  const healthParts = [p.injury, p.condition && `condition: ${p.condition}`, p.firstAid && `first aid: ${p.firstAid}`, p.medical && `medical: ${p.medical}`].filter(Boolean);
  const exposure = p.exposureStatus ? `exposure: ${labelOf(COLLECTIONS.people.fields.find((f) => f.k === 'exposureStatus').options, p.exposureStatus)}` : '';
  return {
    text: [...parts, exposure, health ? healthParts.join('; ') : healthParts.length ? `(${RESTRICTED})` : ''].filter(Boolean).join(' — '),
    tag: p.verification ?? 'unverified',
  };
}

function startLines(inc) {
  return [
    { text: `What: ${inc.start.what || 'not yet known'}`, tag: inc.start.v.what },
    { text: `Where: ${inc.start.where || 'not yet known'}`, tag: inc.start.v.where },
    { text: `When: ${clock(inc.start.when)}`, tag: inc.start.v.when },
  ];
}

function situationLines(inc) {
  const status = field(inc, 'danger', 'status');
  const lines = [{
    text: `Hazard status: ${status ? labelOf(HAZARD_STATUS, status) : 'not yet recorded'}`,
    tag: !status || status === 'unknown' ? 'unknown' : inc.answers[DANGER_QUESTION]?.verified ? 'confirmed' : 'unverified',
  }];
  if (filled(field(inc, 'danger', 'atRisk'))) lines.push({ text: `People remaining at risk: ${field(inc, 'danger', 'atRisk')}`, tag: 'unverified' });
  if (filled(field(inc, 'response', 'lead'))) lines.push({ text: `Incident response lead: ${field(inc, 'response', 'lead')}`, tag: 'confirmed' });
  for (const q of GROUPS.scene.questions) if (answer(inc, q.k)) lines.push(answerLine(inc, q.k));
  return lines;
}

const controlLines = (inc) => records(inc, 'controls').map((c) => ({
  text: `${c.control || 'Control not described'} — responsible: ${c.responsible || 'not recorded'} — started ${clock(c.initiatedAt)} — ${c.verified === 'yes' ? `verified${c.verifiedBy ? ` by ${c.verifiedBy}` : ''}` : 'not yet verified'}`,
  tag: c.verified === 'yes' ? 'confirmed' : 'unverified',
}));

const notificationLines = (inc, done) => records(inc, 'notifications').filter((n) => Boolean(n.completedAt) === done).map((n) => ({
  text: `${n.recipient || 'Recipient not recorded'}${n.organisation ? ` (${n.organisation})` : ''} — ${done ? `${clock(n.completedAt)}${n.method ? ` by ${n.method.toLowerCase()}` : ''}` : `not yet done${n.dueAt ? `, due ${clock(n.dueAt)}` : ''}`}${n.responsible ? ` — by ${n.responsible}` : ''}`,
  tag: done ? 'confirmed' : 'unknown',
}));

const unconfirmedLines = (inc) => [
  ...startLines(inc).filter((l) => l.tag !== 'confirmed'),
  ...effectiveEntries(inc).filter((e) => e.verification !== 'confirmed' && e.ref?.type !== 'start').map((e) => ({ text: `${clock(e.at)} ${e.text} (${CATEGORIES[e.category].toLowerCase()})`, tag: e.verification })),
  ...['danger', 'people', 'scene'].flatMap((g) => GROUPS[g].questions).filter((q) => !answer(inc, q.k)).map((q) => ({ text: `Not yet answered: ${q.q}`, tag: 'unknown' })),
];

export function initialBrief(inc, { health = false } = {}) {
  const decision = inc.fields.notify?.decision;
  return [
    { title: 'What occurred', items: startLines(inc) },
    { title: 'Current situation', items: situationLines(inc) },
    { title: 'People affected', items: none([...records(inc, 'people').map((p) => personLine(inc, p, health)), ...GROUPS.people.questions.filter((q) => answer(inc, q.k)).map((q) => answerLine(inc, q.k))], 'No affected people recorded') },
    { title: 'Immediate controls', items: none(controlLines(inc), 'No immediate controls recorded') },
    {
      title: 'Remaining risks',
      items: none([
        ...(filled(field(inc, 'danger', 'remaining')) ? [{ text: `Remaining uncontrolled exposure: ${field(inc, 'danger', 'remaining')}`, tag: 'unverified' }] : []),
        ...urgentItems(inc).map((i) => ({ text: i.text, tag: i.key === 'danger' && field(inc, 'danger', 'status') === 'unknown' ? 'unknown' : 'unverified' })),
      ], 'No remaining risks recorded'),
    },
    {
      title: 'Notifications completed',
      items: none([
        ...notificationLines(inc, true),
        ...(decision ? [{ text: `Formal notification decision by ${decision.decidedBy}: ${decision.outcome}`, tag: 'confirmed' }] : [{ text: 'Formal notification decision: not yet made. An authorised person must decide.', tag: 'unknown' }]),
      ]),
    },
    { title: 'Assistance required', items: none(records(inc, 'support').filter((s) => s.status !== 'received').map((s) => ({ text: `${s.kind || 'Support'}${s.details ? `: ${s.details}` : ''} — requested ${clock(s.createdAt)}`, tag: 'confirmed' })), 'No assistance requested', 'confirmed') },
    {
      title: 'Next actions',
      items: none([
        ...(filled(field(inc, 'response', 'nextDecision')) ? [{ text: `Next operational decision: ${field(inc, 'response', 'nextDecision')}`, tag: 'confirmed' }] : []),
        ...notificationLines(inc, false),
        ...records(inc, 'actions').filter((a) => !actionFinished(a)).map((a) => ({ text: `${a.number} ${a.description || 'not described'} — ${a.owner || 'no owner'} — ${ACTION_STATES[a.state]}`, tag: 'confirmed' })),
        ...openItems(inc).filter((i) => !i.urgent && !i.key.startsWith('action:') && !i.key.startsWith('notification:')).map((i) => ({ text: i.text, tag: 'unverified' })),
      ], 'No next actions recorded'),
    },
    { title: 'Information not yet confirmed', items: none(unconfirmedLines(inc), 'Everything recorded so far is marked as confirmed', 'confirmed') },
  ];
}

export function handover(inc, ctx, { health = false } = {}) {
  const step = nextStep(inc);
  const recent = effectiveEntries(inc).slice(-8);
  return [
    {
      title: 'Incident',
      items: [
        { text: `Reference ${inc.ref} — Stage ${inc.stage}: ${STAGES[inc.stage].title} — ${statusLabel(inc)}` },
        ...startLines(inc),
      ],
    },
    { title: 'Needs attention now', items: none(urgentItems(inc).map((i) => ({ text: i.text, tag: 'unverified' })), 'No urgent items open', 'confirmed') },
    { title: 'Current situation', items: situationLines(inc) },
    { title: 'People affected', items: none(records(inc, 'people').map((p) => personLine(inc, p, health)), 'No affected people recorded') },
    { title: 'Immediate controls', items: none(controlLines(inc), 'No immediate controls recorded') },
    { title: 'Notifications', items: none([...notificationLines(inc, true), ...notificationLines(inc, false)], 'No notifications recorded') },
    { title: 'Open items', items: none(openItems(inc).filter((i) => !i.urgent).map((i) => ({ text: i.text, tag: 'unverified' })), 'No other open items', 'confirmed') },
    { title: 'Actions', items: none(records(inc, 'actions').map((a) => ({ text: `${a.number} ${a.description || 'not described'} — ${a.owner || 'no owner'} — ${ACTION_STATES[a.state]}`, tag: 'confirmed' })), 'No actions recorded', 'confirmed') },
    { title: 'Latest timeline entries', items: none(recent.map((e) => ({ text: `${clock(e.at)} ${e.text}`, tag: e.verification }))) },
    { title: 'Information not yet confirmed', items: none(unconfirmedLines(inc).slice(0, 25), 'Everything recorded so far is marked as confirmed', 'confirmed') },
    { title: 'Next recommended step', items: [{ text: step.text }] },
    { title: 'Prepared', items: [{ text: `${who(ctx)} — ${clock(when(ctx))}. Health details are ${health ? 'included: handle as restricted information' : 'left out'}.` }] },
  ];
}

export function investigationReport(inc, { health = false } = {}) {
  const classification = currentClassification(inc);
  const findings = records(inc, 'findings');
  const seq = sequenceReview(inc);
  const gaps = completeness(inc);
  const evidenceRefs = (ids) => (ids ?? []).map((id) => record(inc, 'evidence', id)?.number).filter(Boolean).join(', ') || 'none linked';
  const findingLine = (f) => ({
    text: `${f.number} [${FINDING_STATUS[f.status]}] ${f.statement || 'not written'} — evidence: ${evidenceRefs(f.evidence)}${f.evidenceUnavailable ? ` — evidence unavailable: ${f.evidenceUnavailable}` : ''}${f.uncertainty ? ` — limitation: ${f.uncertainty}` : ''}`,
    tag: f.status === 'approved' ? 'confirmed' : 'unverified',
  });
  const counts = actionCounts(inc);
  return [
    {
      title: 'Incident details',
      items: [
        { text: `Reference ${inc.ref} — ${statusLabel(inc)}${inc.level ? ` — ${LEVELS[inc.level].label}` : ''}` },
        ...startLines(inc),
        ...FORMS.details.filter((f) => f.k !== 'description' && filled(field(inc, 'details', f.k))).map((f) => ({ text: `${f.label}: ${f.type === 'datetime' ? clock(field(inc, 'details', f.k)) : field(inc, 'details', f.k)}` })),
      ],
    },
    { title: 'Factual description', items: none(filled(field(inc, 'details', 'description')) ? [{ text: field(inc, 'details', 'description'), tag: 'unverified' }] : [], 'No factual description recorded') },
    {
      title: 'Classification',
      items: classification ? [
        { text: `Version ${classification.v} — ${classification.status === 'confirmed' ? `confirmed by ${classification.confirmedBy}` : 'PROPOSED, not confirmed by an authorised person'}`, tag: classification.status === 'confirmed' ? 'confirmed' : 'unverified' },
        ...Object.entries(classification.values).filter(([, v]) => filled(v)).map(([k, v]) => ({ text: `${k}: ${k === 'level' ? LEVELS[v]?.label ?? v : v}` })),
        ...(inc.classification.length > 1 ? [{ text: `${inc.classification.length - 1} earlier version${inc.classification.length === 2 ? '' : 's'} kept in the file.` }] : []),
      ] : [{ text: 'No classification recorded', tag: 'unknown' }],
    },
    { title: 'People affected', items: none(records(inc, 'people').map((p) => personLine(inc, p, health)), 'No affected people recorded') },
    { title: 'Chronology', items: none(effectiveEntries(inc).map((e) => ({ text: `${clock(e.at)} [${CATEGORIES[e.category]}] ${e.text}`, tag: e.verification }))) },
    { title: 'Evidence index', items: none(records(inc, 'evidence').map((e) => ({ text: `${e.number} ${e.kind || 'Item'} — ${e.description || 'no description'} — ${labelOf(EVIDENCE_STATUS, e.status)}${e.restriction && e.restriction !== 'none' ? ' — restricted' : ''}`, tag: e.status === 'obtained' ? 'confirmed' : 'unverified' })), 'No evidence recorded') },
    { title: 'Controls assessed', items: none(records(inc, 'controlsAssessed').map((c) => ({ text: `${c.control} — ${c.rating || 'not yet assessed'}${c.why ? ` — ${c.why}` : ''} — evidence: ${evidenceRefs(c.evidence)}`, tag: obtained(inc, c.evidence).length ? 'confirmed' : 'unverified' })), 'No controls assessed') },
    {
      title: 'Event sequence',
      items: none([
        ...SEQUENCE_PHASES.flatMap((phase) => records(inc, 'sequence').filter((s) => s.phase === phase).map((s) => ({ text: `${phase}${s.version && s.version !== 'A' ? ` (possible sequence ${s.version})` : ''}: ${s.text || 'not described'} — evidence: ${evidenceRefs(s.evidence)}${s.standing === 'ruledout' ? ' — ruled out' : ''}`, tag: s.standing === 'supported' ? 'confirmed' : 'unverified' }))),
        ...seq.conflicts.map((c) => ({ text: `Open conflict: ${c}`, tag: 'unknown' })),
      ], 'No event sequence recorded'),
    },
    { title: 'Task as planned and as performed', items: none(compareRows(inc).filter((r) => !r.incomplete).map((r) => ({ text: `${r.plannedLabel}: ${r.planned} | ${r.performedLabel}: ${r.performed}${r.different ? ' — DIFFERENT (a difference is not automatically a cause)' : ''}` })), 'No comparison recorded') },
    ...FINDING_TYPES.map(([type, label]) => ({ title: `${label}s`, items: none(findings.filter((f) => f.type === type).map(findingLine), `No ${label.toLowerCase()}s recorded`, 'confirmed') })),
    { title: 'Contributing factors', items: none(records(inc, 'factors').map((f) => ({ text: `${f.number} [${f.category || 'no category'}] ${f.text || 'not described'} — evidence: ${evidenceRefs(f.evidence)}`, tag: factorProblems(inc, f).length ? 'unverified' : 'confirmed' })), 'No contributing factors recorded', 'confirmed') },
    {
      title: 'Corrective actions',
      items: none([
        ...records(inc, 'actions').map((a) => ({ text: `${a.number} [${ACTION_STATES[a.state]}] ${a.description || 'not described'} — owner: ${a.owner || 'none'} — due: ${a.dueDate || 'not set'}${a.finding ? ` — addresses ${record(inc, 'findings', a.finding)?.number ?? 'a withdrawn finding'}` : ''}` })),
        ...(counts.total ? [{ text: `Implemented is not the same as effective: ${counts.effective} of ${counts.total} actions have been reviewed as effective.` }] : []),
      ], 'No actions recorded', 'confirmed'),
    },
    {
      title: 'Limitations and open matters',
      items: none([
        ...gaps.conflicting.map((t) => ({ text: `Conflict: ${t}`, tag: 'unknown' })),
        ...gaps.evidenceRequired.map((t) => ({ text: `Evidence outstanding: ${t}`, tag: 'unknown' })),
        ...gaps.interviewsRequired.map((t) => ({ text: `Interview outstanding: ${t}`, tag: 'unknown' })),
        ...findings.filter((f) => filled(f.uncertainty)).map((f) => ({ text: `${f.number}: ${f.uncertainty}`, tag: 'unverified' })),
        ...openItems(inc).map((i) => ({ text: `Open item: ${i.text}`, tag: 'unverified' })),
      ], 'No limitations or open matters recorded', 'confirmed'),
    },
    { title: 'Review and approval', items: qualityChecks(inc).map((c) => ({ text: `${c.question} Advisor: ${c.answer ? labelOf(GROUPS.quality.options, c.answer) : 'not answered'}. Check: ${c.auto === 'pass' ? 'no issue found' : 'needs attention'} — ${c.detail}.${c.note ? ` Note: ${c.note}` : ''}` })) },
  ];
}

export function toText(title, sections) {
  const lines = [title, ''];
  for (const s of sections) {
    lines.push(s.title.toUpperCase());
    for (const i of s.items) lines.push(`- ${i.tag ? `[${VERIFICATION[i.tag]}] ` : ''}${i.text}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}

// Export to the incident system (INX). The prototype only builds the package and tracks its status.

export function exportPayload(inc) {
  const classification = currentClassification(inc);
  const strip = (collection, rec) => {
    const { id, entryId, thumb, ...rest } = rec;
    return redact(collection, rest);
  };
  return {
    format: 'incident-export/1',
    reference: inc.ref,
    synthetic: Boolean(inc.demo),
    incidentDetails: { ...inc.start, status: statusLabel(inc), stage: inc.stage, ...inc.fields.details },
    peopleAffected: records(inc, 'people').map((p) => strip('people', p)),
    consequenceAssessment: classification ? { version: classification.v, status: classification.status, confirmedBy: classification.confirmedBy, ...classification.values } : null,
    criticalRisks: records(inc, 'controlsAssessed').map((c) => ({ risk: c.riskLabel, control: c.control, rating: c.rating ?? null })),
    initialActions: [...records(inc, 'controls').map((c) => strip('controls', c)), ...records(inc, 'actions').filter((a) => a.type === 'immediate').map((a) => strip('actions', a))],
    evidenceIndex: records(inc, 'evidence').map(({ number, kind, description, capturedAt, capturedBy, status, restriction, preserved, sha256 }) => ({ number, kind, description, capturedAt, capturedBy, status, restriction, preserved, sha256 })),
    notifications: records(inc, 'notifications').map((n) => strip('notifications', n)),
    investigationFindings: records(inc, 'findings').filter((f) => f.status === 'approved').map((f) => strip('findings', f)),
    correctiveActions: records(inc, 'actions').filter((a) => a.type === 'corrective').map((a) => strip('actions', a)),
  };
}

export function setExportStatus(inc, ctx, to, { ack, error } = {}) {
  editing(ctx);
  const from = inc.exportState.status;
  if (!EXPORT_FLOW[from]?.includes(to)) throw new RuleError(`An export that is "${EXPORT_STATES[from]}" cannot move to "${EXPORT_STATES[to] ?? to}".`);
  if (to === 'approved') need(ctx, 'approveExport', 'Approving the export for submission');
  if (to === 'submitted' && !filled(ack)) throw new RuleError('"Submitted" needs a confirmed acknowledgement from the receiving system.');
  inc.exportState.status = to;
  inc.exportState.history.push({ status: to, at: when(ctx), by: who(ctx), ack: ack ?? null, error: error ?? null });
  audit(inc, ctx, 'export.status', inc.ref, { from, to, ack, error });
}

// Audit history. Each entry carries a hash of itself and the entry before it, so a changed or missing
// entry shows up when the chain is checked. Entries are only ever added (see store.js).

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sealAudit(pending, head = { count: 0, hash: '' }) {
  let { count, hash } = head;
  const entries = [];
  for (const p of pending) {
    const body = JSON.parse(JSON.stringify({ seq: ++count, ...p, prev: hash }));
    hash = await sha256(JSON.stringify(body));
    entries.push({ ...body, hash });
  }
  return { entries, head: { count, hash } };
}

export async function verifyAudit(entries, head) {
  let prev = '';
  for (const [i, e] of entries.entries()) {
    const { hash, ...body } = e;
    if (body.seq !== i + 1 || body.prev !== prev || await sha256(JSON.stringify(body)) !== hash) return { ok: false, count: entries.length, brokenAt: i + 1 };
    prev = hash;
  }
  if (head && (head.count !== entries.length || head.hash !== prev)) return { ok: false, count: entries.length, brokenAt: entries.length + 1 };
  return { ok: true, count: entries.length, brokenAt: null };
}

// AI drafts. Stored apart from the record, always labelled Draft, never applied without a person choosing to.

export function addDraft(inc, ctx, { kind, target = null, title, text, model }) {
  editing(ctx);
  const draft = { id: uid(), kind, target, title, text, model: model ?? null, at: when(ctx), by: who(ctx), status: 'draft', reviewedBy: null };
  inc.drafts.push(draft);
  audit(inc, ctx, 'draft.add', title, { kind, model });
  return draft;
}

export function reviewDraft(inc, ctx, id, status) {
  editing(ctx);
  const draft = inc.drafts.find((d) => d.id === id);
  if (!draft) throw new RuleError('That draft could not be found.');
  if (!['reviewed', 'discarded'].includes(status)) throw new RuleError('Unknown draft status.');
  Object.assign(draft, { status, reviewedBy: who(ctx), reviewedAt: when(ctx) });
  audit(inc, ctx, 'draft.review', draft.title, { status });
}

export const drafts = (inc, kind, target = null) => inc.drafts.filter((d) => d.kind === kind && d.target === target && d.status !== 'discarded');
