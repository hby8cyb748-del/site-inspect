import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/incident/model.js';
import * as W from '../js/incident/workflow.js';
import { advisor, manager, reviewer, newIncident, obtainedEvidence, rule } from './helpers.js';

const supportedFinding = (inc, extra = {}) => {
  const ev = obtainedEvidence(inc);
  return M.addRecord(inc, advisor, 'findings', { statement: 'The gate could be passed around.', facts: 'Gap measured at 600 mm.', evidence: [ev.id], uncertainty: 'None identified', ...extra });
};
const approvedFinding = (inc) => {
  const f = supportedFinding(inc);
  M.setFindingStatus(inc, advisor, f.id, 'submitted');
  M.setFindingStatus(inc, manager, f.id, 'approved', 'Test Manager');
  return f;
};

test('classification: the app suggests, a person proposes, only an authorised person confirms', () => {
  const inc = newIncident();
  const suggestion = M.suggestClassification(inc);
  assert.equal(suggestion.draft, true);
  assert.ok(Array.isArray(suggestion.used), 'the suggestion shows the information used');
  for (const key of ['missing', 'why']) assert.ok(suggestion[key].length, `the suggestion shows ${key}`);
  assert.ok(suggestion.rule && suggestion.confirmBy);
  assert.equal(inc.classification.length, 0, 'a suggestion is never saved by itself');
  rule(() => M.confirmClassification(inc, manager), /no classification/);
  M.proposeClassification(inc, advisor, suggestion.values, 'suggestion');
  assert.equal(M.currentClassification(inc).status, 'proposed');
  rule(() => M.confirmClassification(inc, advisor), /HSE Manager/);
  rule(() => M.confirmClassification(inc, reviewer), /HSE Manager/);
  M.confirmClassification(inc, manager, 'Test Manager');
  assert.equal(M.currentClassification(inc).status, 'confirmed');
  assert.equal(M.currentClassification(inc).confirmedBy, 'Test Manager');
});

test('classification is versioned: a change is a new version and the old one is kept', () => {
  const inc = newIncident();
  M.proposeClassification(inc, advisor, { injuryCategory: 'First aid injury' });
  M.confirmClassification(inc, manager);
  M.proposeClassification(inc, advisor, { injuryCategory: 'Medical treatment injury' });
  assert.equal(inc.classification.length, 2);
  assert.deepEqual(inc.classification.map((v) => [v.v, v.status, v.values.injuryCategory]), [[1, 'confirmed', 'First aid injury'], [2, 'proposed', 'Medical treatment injury']]);
  M.completeStage(inc, advisor, 1);
  assert.ok(M.openItems(inc).some((i) => i.key === 'classification'), 'the new version needs confirming again');
});

test('a critical risk with no injury is suggested for HIPO review, never decided', () => {
  const inc = newIncident();
  M.setAnswer(inc, advisor, 's1.p.injured', 'no');
  M.addRecord(inc, advisor, 'controlsAssessed', { risk: 'height', riskLabel: W.CRITICAL_RISKS.height.label, control: 'Access control', rating: 'Bypassed' });
  const { values } = M.suggestClassification(inc);
  assert.equal(values.hipo, 'Refer for HIPO review');
  assert.equal(values.cardinal, 'Possible breach — refer');
  assert.equal(values.level, '3');
});

test('a conclusion on an investigation question needs evidence or a statement that there is none', () => {
  const inc = newIncident();
  const q = M.addRecord(inc, advisor, 'questions', { question: 'How was the scaffold reached?' });
  rule(() => M.updateRecord(inc, advisor, 'questions', q.id, { conclusion: 'Around the gate' }), /needs linked evidence/);
  const requested = M.addRecord(inc, advisor, 'evidence', { kind: 'CCTV reference', status: 'requested' });
  M.updateRecord(inc, advisor, 'questions', q.id, { evidence: [requested.id] });
  rule(() => M.updateRecord(inc, advisor, 'questions', q.id, { conclusion: 'Around the gate' }), /obtained/);
  M.updateRecord(inc, advisor, 'questions', q.id, { evidenceUnavailable: 'CCTV was overwritten' });
  M.updateRecord(inc, advisor, 'questions', q.id, { conclusion: W.UNABLE_TO_DETERMINE });
});

test('a finding cannot go forward without evidence', () => {
  const inc = newIncident();
  const f = M.addRecord(inc, advisor, 'findings', { statement: 'The toe board had a gap under it.', uncertainty: 'None' });
  assert.ok(M.findingProblems(inc, f).some((p) => p.blocking && /Link evidence/.test(p.text)));
  rule(() => M.setFindingStatus(inc, advisor, f.id, 'submitted'), /not ready/);
  const ev = obtainedEvidence(inc);
  M.updateRecord(inc, advisor, 'findings', f.id, { evidence: [ev.id] });
  assert.deepEqual(M.findingProblems(inc, f).filter((p) => p.blocking), []);
  M.setFindingStatus(inc, advisor, f.id, 'submitted');
});

test('unsupported causal language and blame are not accepted in a finding', () => {
  const inc = newIncident();
  const f = M.addRecord(inc, advisor, 'findings', { statement: 'The missing lanyard caused the spanner to fall.' });
  assert.ok(M.findingProblems(inc, f).some((p) => /Causal wording/.test(p.text)));
  const ev = obtainedEvidence(inc);
  M.updateRecord(inc, advisor, 'findings', f.id, { evidence: [ev.id] });
  assert.ok(M.findingProblems(inc, f).some((p) => /Causal wording/.test(p.text)), 'evidence alone is not enough: the facts relied upon are needed');
  M.updateRecord(inc, advisor, 'findings', f.id, { facts: 'No lanyard point on the tool. Tool found nine metres below.' });
  assert.ok(!M.findingProblems(inc, f).some((p) => p.blocking));

  for (const statement of ['The worker was careless.', 'He deliberately ignored the tag.', 'The crew were complacent.', 'The supervisor is to blame.', 'The witness was lying.']) {
    const blamed = supportedFinding(inc, { statement });
    assert.ok(M.findingProblems(inc, blamed).some((p) => p.blocking && /blame, attitude or intent/.test(p.text)), statement);
    rule(() => M.setFindingStatus(inc, advisor, blamed.id, 'submitted'));
  }
});

test('"Unable to determine from the available evidence." is always allowed', () => {
  const inc = newIncident();
  const f = M.addRecord(inc, advisor, 'findings', { type: 'conclusion', statement: W.UNABLE_TO_DETERMINE });
  assert.deepEqual(M.findingProblems(inc, f).filter((p) => p.blocking), []);
});

test('only a reviewer or manager can approve a finding, and editing an approved finding sends it back to draft', () => {
  const inc = newIncident();
  const f = supportedFinding(inc);
  M.setFindingStatus(inc, advisor, f.id, 'submitted');
  rule(() => M.setFindingStatus(inc, advisor, f.id, 'approved'), /reviewer|Manager/i);
  M.setFindingStatus(inc, reviewer, f.id, 'approved', 'Test Reviewer');
  assert.equal(f.status, 'approved');
  rule(() => M.updateRecord(inc, advisor, 'findings', f.id, { status: 'draft' }), /buttons/);
  M.updateRecord(inc, advisor, 'findings', f.id, { statement: 'The gate could be passed around on the left side.' });
  assert.equal(f.status, 'draft');
});

test('facts, observations, findings, conclusions and recommendations are kept separate', () => {
  const inc = newIncident();
  for (const [type] of W.FINDING_TYPES) supportedFinding(inc, { type });
  const titles = M.investigationReport(inc).map((s) => s.title);
  for (const t of ['Facts', 'Observations', 'Findings', 'Conclusions', 'Recommendations']) assert.ok(titles.includes(t));
});

test('a contributing factor must link to evidence and an investigation category', () => {
  const inc = newIncident();
  const f = M.addRecord(inc, advisor, 'factors', { text: 'No arrangement for retrieving items from a closed scaffold' });
  assert.equal(M.factorProblems(inc, f).length, 2);
  M.updateRecord(inc, advisor, 'factors', f.id, { category: 'Organisational factors', evidence: [obtainedEvidence(inc).id] });
  assert.deepEqual(M.factorProblems(inc, f), []);
  M.updateRecord(inc, advisor, 'factors', f.id, { text: 'The worker had a bad attitude' });
  assert.ok(M.factorProblems(inc, f).some((p) => /attitude/.test(p)));
});

test('a corrective action can only be created from an approved finding', () => {
  const inc = newIncident();
  const draft = supportedFinding(inc);
  rule(() => M.actionFromFinding(inc, advisor, draft.id), /approved/);
  const f = approvedFinding(inc);
  const a = M.actionFromFinding(inc, advisor, f.id, { description: 'Fit mesh infill panels at every gate' });
  assert.equal(a.type, 'corrective');
  assert.equal(a.finding, f.id);
  assert.equal(a.state, 'proposed');
});

test('an action moves one state at a time and each step needs its own record', () => {
  const inc = newIncident();
  const f = approvedFinding(inc);
  const a = M.actionFromFinding(inc, advisor, f.id, { description: 'Fit mesh infill panels at every gate' });
  rule(() => M.moveAction(inc, advisor, a.id, 'implemented'), /cannot move straight/);
  rule(() => M.moveAction(inc, advisor, a.id, 'approved'), /needs/);
  rule(() => M.moveAction(inc, manager, a.id, 'approved'), /approver/);
  M.updateRecord(inc, advisor, 'actions', a.id, { approver: 'Test Manager' });
  M.moveAction(inc, manager, a.id, 'approved');
  rule(() => M.moveAction(inc, advisor, a.id, 'assigned'), /owner/);
  M.updateRecord(inc, advisor, 'actions', a.id, { owner: 'Person One', dueDate: '2027-01-31' });
  for (const state of ['assigned', 'inprogress', 'implemented']) M.moveAction(inc, advisor, a.id, state);
  rule(() => M.moveAction(inc, advisor, a.id, 'evidence'), /completion evidence/);
  M.updateRecord(inc, advisor, 'actions', a.id, { evidence: [obtainedEvidence(inc, 'Photo of panels').id] });
  M.moveAction(inc, advisor, a.id, 'evidence');
  rule(() => M.moveAction(inc, advisor, a.id, 'verified'), /who verified/);
  M.updateRecord(inc, advisor, 'actions', a.id, { verifiedBy: 'Test Manager' });
  M.moveAction(inc, advisor, a.id, 'verified');
  rule(() => M.moveAction(inc, advisor, a.id, 'reviewdue'), /effectiveness/);
  M.updateRecord(inc, advisor, 'actions', a.id, { effectivenessReview: 'Walk every gate in one month' });
  M.moveAction(inc, advisor, a.id, 'reviewdue');
  rule(() => M.moveAction(inc, advisor, a.id, 'effective'), /result/);
  M.updateRecord(inc, advisor, 'actions', a.id, { effectivenessResult: 'No gate could be passed' });
  M.moveAction(inc, advisor, a.id, 'effective');
  assert.equal(a.history.length, 8);
  M.moveAction(inc, advisor, a.id, 'reopened');
  assert.equal(a.state, 'reopened');
});

test('implemented is not effective', () => {
  const inc = newIncident();
  const a = M.addRecord(inc, advisor, 'actions', { description: 'Barricade the area', owner: 'Person One' });
  M.moveAction(inc, advisor, a.id, 'implemented');
  assert.equal(M.actionFinished(a), false);
  const counts = M.actionCounts(inc);
  assert.equal(counts.implementedNotVerified, 1);
  assert.equal(counts.effective, 0);
  rule(() => M.moveAction(inc, advisor, a.id, 'effective'), /cannot move straight/);
});

test('the advisor is prompted about weak actions', () => {
  const inc = newIncident();
  const f = approvedFinding(inc);
  const warn = (data) => M.actionWarnings(inc, M.actionFromFinding(inc, advisor, f.id, data)).join(' | ');
  assert.match(warn({ description: 'Retrain all workers on scaffold tags' }), /only on retraining/);
  assert.match(warn({ description: 'Remind workers to check tags at pre-start' }), /only on reminding/);
  assert.match(warn({ description: 'Fit mesh panels' }), /No accountable owner/);
  assert.match(warn({ description: 'Fit mesh panels', owner: 'x' }), /No objective completion evidence/);
  assert.match(warn({ description: 'Fit mesh panels', owner: 'x', evidenceRequired: 'photos' }), /No effectiveness check/);
  assert.match(warn({ description: 'Fit mesh panels', owner: 'x' }), /tick the box/);
  M.actionFromFinding(inc, advisor, f.id, { description: 'Install lockable full height gate with infill mesh' });
  assert.match(warn({ description: 'Install lockable full height gate with infill mesh' }), /repeats an earlier action/);
  const unlinked = M.addRecord(inc, advisor, 'actions', { type: 'corrective', description: 'Replace the gate' });
  assert.match(M.actionWarnings(inc, unlinked).join(' '), /not linked to a finding/);
  const strong = M.actionFromFinding(inc, advisor, f.id, { description: 'Engineer a physical interlock and brief crews on it during training', hierarchy: 'Engineering', owner: 'x', evidenceRequired: 'photos', effectivenessReview: 'audit in a month', addresses: true });
  assert.deepEqual(M.actionWarnings(inc, strong), []);
});

test('the event sequence shows gaps and keeps more than one possible sequence open', () => {
  const inc = newIncident();
  assert.equal(M.sequenceReview(inc).gaps.length, W.SEQUENCE_PHASES.length);
  const ev = obtainedEvidence(inc);
  const a = M.addRecord(inc, advisor, 'sequence', { phase: 'The event', text: 'Went around the gate', evidence: [ev.id], standing: 'supported' });
  const b = M.addRecord(inc, advisor, 'sequence', { phase: 'The event', text: 'Gate was unlocked', version: 'B' });
  let review = M.sequenceReview(inc);
  assert.equal(review.conflicts.length, 1);
  assert.ok(review.gaps.some((g) => g.includes(b.number)), 'an entry with no evidence is a gap');
  M.updateRecord(inc, advisor, 'sequence', b.id, { standing: 'ruledout' });
  review = M.sequenceReview(inc);
  assert.equal(review.conflicts.length, 0);
  assert.ok(a.id);
});

test('planned versus performed highlights differences without calling them causes', () => {
  const inc = newIncident();
  M.setField(inc, advisor, 'compare', 'method.planned', 'Access by tagged scaffold');
  M.setField(inc, advisor, 'compare', 'method.performed', 'Access around a locked gate');
  M.setField(inc, advisor, 'compare', 'supervision.planned', 'Supervisor present');
  M.setField(inc, advisor, 'compare', 'supervision.performed', 'supervisor present.');
  const rows = Object.fromEntries(M.compareRows(inc).map((r) => [r.key, r]));
  assert.equal(rows.method.different, true);
  assert.equal(rows.supervision.different, false);
  assert.equal(rows.permit.incomplete, true);
  assert.equal(M.records(inc, 'findings').length, 0, 'a difference never becomes a finding by itself');
});

test('the completeness review sorts what is known from what is not, and gaps become investigation tasks', () => {
  const inc = newIncident({ danger: 'no' });
  M.addEntry(inc, advisor, { category: 'fact', text: 'Measured drop of nine metres' });
  const said = M.addEntry(inc, advisor, { category: 'witness', text: 'Heard it land' });
  M.addRecord(inc, advisor, 'evidence', { kind: 'CCTV reference', description: 'Camera 7', status: 'requested' });
  M.addRecord(inc, advisor, 'witnesses', { name: 'Witness One', statementRequired: 'yes' });
  M.flagConflict(inc, advisor, said.id, null, 'Two accounts differ on the time');
  const gaps = M.completeness(inc);
  assert.deepEqual(Object.keys(gaps), Object.keys(M.COMPLETENESS_TITLES));
  assert.ok(gaps.confirmed.some((t) => t.includes('nine metres')));
  assert.ok(gaps.unverified.some((t) => t.includes('Heard it land')));
  assert.equal(gaps.conflicting.length, 1);
  assert.equal(gaps.evidenceRequired.length, 1);
  assert.equal(gaps.interviewsRequired.length, 2);
  assert.equal(gaps.classificationOutstanding.length, 1);
  assert.ok(gaps.notificationOutstanding.length >= 2);

  M.completeStage(inc, advisor, 1);
  M.completeStage(inc, advisor, 2);
  const tasks = M.records(inc, 'tasks').map((t) => t.text);
  assert.ok(tasks.some((t) => t.startsWith('Obtain evidence') && t.includes('Camera 7')));
  assert.ok(tasks.some((t) => t.startsWith('Interviews')));
  assert.ok(tasks.some((t) => t.startsWith('Resolve conflict')));
  assert.ok(tasks.some((t) => t.startsWith('Classification')));
  const count = tasks.length;
  assert.equal(M.planFromGaps(inc, advisor).length, 0, 'running it again adds nothing twice');
  assert.equal(M.records(inc, 'tasks').length, count);
});

test('the investigation scales: a Level 1 review does not need the full ICAM sections', () => {
  const inc = newIncident();
  M.setLevel(inc, advisor, 1);
  const state = (k) => M.sectionState(inc, 3, k);
  for (const k of ['evboard', 'interviews', 'sequence', 'compare', 'controls', 'factors']) assert.equal(state(k), 'notneeded', k);
  for (const k of ['plan', 'findings', 'actions', 'review']) assert.notEqual(state(k), 'notneeded', k);
  assert.equal(M.stageProgress(inc, 3).total, 4);
  M.setLevel(inc, advisor, 3);
  assert.equal(M.stageProgress(inc, 3).total, 10);
});

test('the quality check covers all thirteen questions and flags unsupported work', () => {
  const inc = newIncident();
  M.addRecord(inc, advisor, 'findings', { statement: 'The worker was careless' });
  const checks = Object.fromEntries(M.qualityChecks(inc).map((c) => [c.key.split('.').pop(), c]));
  assert.equal(Object.keys(checks).length, 13);
  assert.equal(checks.facts.auto, 'attention');
  assert.equal(checks.blame.auto, 'attention');
  assert.match(checks.blame.detail, /careless/);
});

test('an investigation is approved by a named reviewer, after it is submitted', () => {
  const inc = newIncident();
  rule(() => M.approveInvestigation(inc, manager, 'Test Manager'), /Submit/);
  M.completeStage(inc, advisor, 3);
  rule(() => M.approveInvestigation(inc, advisor, 'Test Advisor'), /needs/);
  M.approveInvestigation(inc, reviewer, 'Test Reviewer');
  assert.equal(inc.stages[3].approvedBy, 'Test Reviewer');
});

test('the export carries the nine parts and never shows Submitted without an acknowledgement', () => {
  const inc = newIncident();
  const payload = M.exportPayload(inc);
  for (const part of ['incidentDetails', 'peopleAffected', 'consequenceAssessment', 'criticalRisks', 'initialActions', 'evidenceIndex', 'notifications', 'investigationFindings', 'correctiveActions']) assert.ok(part in payload, part);
  assert.equal(inc.exportState.status, 'local');
  rule(() => M.setExportStatus(inc, advisor, 'submitted', { ack: 'X' }), /cannot move/);
  M.setExportStatus(inc, advisor, 'ready');
  rule(() => M.setExportStatus(inc, advisor, 'approved'), /HSE Manager/);
  M.setExportStatus(inc, manager, 'approved');
  M.setExportStatus(inc, advisor, 'pending');
  rule(() => M.setExportStatus(inc, advisor, 'submitted'), /acknowledgement/);
  rule(() => M.setExportStatus(inc, advisor, 'submitted', { ack: '  ' }), /acknowledgement/);
  assert.equal(inc.exportState.status, 'pending');
  M.setExportStatus(inc, advisor, 'failed', { error: 'No connection' });
  M.setExportStatus(inc, advisor, 'pending');
  M.setExportStatus(inc, advisor, 'submitted', { ack: 'ACK-123' });
  assert.equal(inc.exportState.history.at(-1).ack, 'ACK-123');
  assert.deepEqual(Object.values(W.EXPORT_STATES), ['Local only', 'Ready for review', 'Approved for submission', 'Submission pending', 'Submitted', 'Submission failed']);
});

test('only approved findings are exported as findings', () => {
  const inc = newIncident();
  supportedFinding(inc);
  approvedFinding(inc);
  assert.equal(M.exportPayload(inc).investigationFindings.length, 1);
});

test('an original evidence file cannot be replaced', () => {
  const inc = newIncident();
  const ev = M.addRecord(inc, advisor, 'evidence', { kind: 'Photograph', mediaKey: 'key-1', sha256: 'abc', fileName: 'a.jpg' });
  rule(() => M.updateRecord(inc, advisor, 'evidence', ev.id, { mediaKey: 'key-2' }), /never replaced/);
  rule(() => M.updateRecord(inc, advisor, 'evidence', ev.id, { sha256: 'def' }), /never replaced/);
  M.updateRecord(inc, advisor, 'evidence', ev.id, { description: 'A better description' });
  const copy = M.addRecord(inc, advisor, 'evidence', { kind: 'Photograph', mediaKey: 'key-3', derivedFrom: ev.id });
  assert.equal(copy.derivedFrom, ev.id);
  assert.equal(M.record(inc, 'evidence', ev.id).mediaKey, 'key-1');
  assert.notEqual(copy.number, ev.number);
});

test('AI drafts are stored as drafts and never change the record', () => {
  const inc = newIncident();
  const before = JSON.stringify({ t: inc.timeline, r: inc.records, f: inc.fields });
  const d = M.addDraft(inc, advisor, { kind: 'summary:handover', title: 'Draft narrative', text: 'Draft text' });
  assert.equal(d.status, 'draft');
  assert.equal(JSON.stringify({ t: inc.timeline, r: inc.records, f: inc.fields }), before);
  M.reviewDraft(inc, advisor, d.id, 'reviewed');
  assert.equal(M.drafts(inc, 'summary:handover').length, 1);
  assert.equal(d.reviewedBy, 'Test Advisor');
  M.reviewDraft(inc, advisor, d.id, 'discarded');
  assert.equal(M.drafts(inc, 'summary:handover').length, 0);
  assert.equal(inc.drafts.length, 1, 'a discarded draft is still on file');
});

test('follow-up prompts come from gaps and never judge the person', () => {
  const inc = newIncident();
  const i = M.addRecord(inc, advisor, 'interviews', { person: 'Witness One', saw: 'Saw the load swing' });
  const prompts = M.suggestFollowUps(inc, i);
  assert.ok(prompts.length > 3);
  assert.ok(!prompts.some((p) => /credib|truth|lying|honest|motive/i.test(p)));
  assert.ok(!prompts.some((p) => /what they saw or heard/.test(p)), 'a covered topic is not asked again');
});
