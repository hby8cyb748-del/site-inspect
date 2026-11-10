import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/incident/model.js';
import * as W from '../js/incident/workflow.js';
import { advisor, newIncident, openTexts, rule } from './helpers.js';

const tagsOf = (sections) => sections.flatMap((s) => s.items.map((i) => i.tag));

test('the workflow asks what the specification lists', () => {
  assert.equal(W.DANGER_PROMPTS.length, 11);
  assert.equal(W.GROUPS.people.questions.length, 8);
  assert.equal(W.GROUPS.scene.questions.length, 10);
  assert.equal(W.GROUPS.notify.questions.length, 8);
  assert.equal(W.GROUPS.checklist.questions.length, 9);
  assert.equal(W.GROUPS.conditions.questions.length, 15);
  assert.equal(W.GROUPS.quality.questions.length, 13);
  assert.equal(W.STAGE2_SECTIONS.length, 12);
  assert.equal(W.STAGE3_SECTIONS.length, 10);
  assert.equal(W.PHOTO_GUIDE.length, 10);
  assert.equal(W.CONTROL_RATINGS.length, 8);
  assert.equal(W.EVIDENCE_KINDS.length, 15);
  assert.equal(Object.keys(W.ACTION_STATES).length, 11);
  assert.equal(Object.keys(W.EXPORT_STATES).length, 6);
  assert.equal(W.NOTIFICATION_BANNER, 'This incident may require formal notification. Notify the Manager HSE ASAP.');
  assert.deepEqual(W.GROUPS.scene.options.map(([, l]) => l), ['Yes', 'No', 'Unsure', 'Not applicable']);
});

test('an incident can be started with nothing known, and danger is the first thing asked', () => {
  const inc = M.createIncident(advisor, {});
  assert.equal(inc.stage, 1);
  assert.equal(M.nextStep(inc).route, 's1/danger');
  assert.ok(M.urgentItems(inc).some((i) => i.key === 'danger'));
  assert.equal(inc.timeline.length, 1, 'the first timeline entry is made automatically');
});

test('the red warning stays while danger is active or unknown, and clears only when the advisor records otherwise', () => {
  for (const answer of ['yes', 'unsure']) {
    const inc = newIncident({ danger: answer });
    assert.equal(M.dangerActive(inc), true);
    assert.equal(M.field(inc, 'danger', 'status'), answer === 'yes' ? 'active' : 'unknown');
    M.addRecord(inc, advisor, 'controls', { control: 'Stop work.' });
    assert.equal(M.dangerActive(inc), true, 'recording a control does not clear the warning by itself');
    M.setField(inc, advisor, 'danger', 'status', 'controlled');
    assert.equal(M.dangerActive(inc), false);
    M.setAnswer(inc, advisor, 's1.danger', 'no');
    M.setAnswer(inc, advisor, 's1.danger', 'yes');
    assert.equal(M.dangerActive(inc), true, 'it comes back if the answer changes back');
  }
});

test('the app never describes the scene as safe', () => {
  const labels = [...W.HAZARD_STATUS.map(([, l]) => l), ...Object.values(W.STAGES).map((s) => s.status)];
  assert.ok(!labels.some((l) => /\bsafe\b/i.test(l)));
  const inc = newIncident({ danger: 'no' });
  const text = M.toText('x', M.initialBrief(inc)) + M.toText('x', M.handover(inc, advisor));
  assert.ok(!/scene is safe|area is safe|now safe/i.test(text));
});

test('with danger present, the required records are open items until they are made', () => {
  const inc = newIncident({ danger: 'yes' });
  assert.ok(openTexts(inc).includes('Record the people remaining at risk'));
  assert.ok(openTexts(inc).includes('Record any remaining uncontrolled exposure'));
  assert.ok(openTexts(inc).includes('Record the immediate controls applied'));
  const c = M.addRecord(inc, advisor, 'controls', { control: 'Establish an exclusion zone.' });
  assert.ok(c.initiatedAt, 'the start time is stamped automatically');
  assert.ok(openTexts(inc).some((t) => t.startsWith('Immediate control not yet verified')));
  assert.ok(openTexts(inc).some((t) => t.startsWith('No person responsible recorded')));
  M.updateRecord(inc, advisor, 'controls', c.id, { responsible: 'Person One', verified: 'yes' });
  M.setField(inc, advisor, 'danger', 'atRisk', 'None known');
  M.setField(inc, advisor, 'danger', 'remaining', 'None known');
  assert.ok(!openTexts(inc).some((t) => /control|remaining|at risk/i.test(t)));
});

test('every No or Unsure scene answer creates a visible item, and it goes when the answer changes', () => {
  for (const q of W.GROUPS.scene.questions) {
    for (const value of ['no', 'unsure']) {
      const inc = newIncident({ danger: 'no' });
      const before = M.openItems(inc).length;
      M.setAnswer(inc, advisor, q.k, value);
      assert.equal(M.openItems(inc).length, before + 1, `${q.q} answered ${value}`);
    }
  }
  const inc = newIncident({ danger: 'no' });
  M.setAnswer(inc, advisor, 's1.s.stopped', 'no');
  assert.ok(M.urgentItems(inc).some((i) => i.key === 'q:s1.s.stopped'));
  M.setAnswer(inc, advisor, 's1.s.stopped', 'yes');
  assert.ok(!M.openItems(inc).some((i) => i.key === 'q:s1.s.stopped'));
  M.setAnswer(inc, advisor, 's1.s.exclusion', 'na');
  assert.ok(!M.openItems(inc).some((i) => i.key === 'q:s1.s.exclusion'), 'Not applicable raises nothing');
});

test('a worrying Yes also raises an item', () => {
  const inc = newIncident({ danger: 'no' });
  M.setAnswer(inc, advisor, 's1.s.deteriorate', 'yes');
  M.setAnswer(inc, advisor, 's1.p.missing', 'yes');
  assert.ok(M.urgentItems(inc).some((i) => i.key === 'q:s1.s.deteriorate'));
  assert.ok(M.urgentItems(inc).some((i) => i.key === 'q:s1.p.missing'));
});

test('an item closed by the advisor stays closed, but reopens if the answer behind it changes', () => {
  const inc = newIncident({ danger: 'no' });
  M.setAnswer(inc, advisor, 's1.s.isolated', 'unsure');
  const item = M.openItems(inc).find((i) => i.key === 'q:s1.s.isolated');
  rule(() => M.closeItem(inc, advisor, item.id, ''), /how/i);
  M.closeItem(inc, advisor, item.id, 'Electrician confirmed isolation at the board');
  M.setAnswer(inc, advisor, 's1.s.stopped', 'yes');
  assert.ok(!M.openItems(inc).some((i) => i.key === 'q:s1.s.isolated'));
  M.setAnswer(inc, advisor, 's1.s.isolated', 'no');
  assert.ok(M.openItems(inc).some((i) => i.key === 'q:s1.s.isolated'));
});

test('the danger item cannot be closed with a note: the hazard status has to change', () => {
  const inc = newIncident({ danger: 'yes' });
  const item = M.openItems(inc).find((i) => i.key === 'danger');
  rule(() => M.closeItem(inc, advisor, item.id, 'fine now'), /closes by itself/);
});

test('Stage 1 can be completed with items open, and they are carried forward and stay visible', () => {
  const inc = newIncident({ danger: 'unsure' });
  M.setAnswer(inc, advisor, 's1.c.danger', 'done');
  M.setAnswer(inc, advisor, 's1.c.scene', 'open');
  const before = M.openItems(inc).length;
  M.completeStage(inc, advisor, 1);
  assert.equal(inc.stage, 2);
  const carried = openTexts(inc).filter((t) => t.startsWith('Carried forward from Stage 1'));
  assert.equal(carried.length, 8, 'eight of nine checklist lines were not marked done');
  assert.ok(M.openItems(inc).length >= before + 8);
  assert.ok(M.dangerActive(inc), 'the danger warning is still showing in Stage 2');
  assert.ok(M.completeness(inc).actionsOpen.length > 0);
});

test('the app does not make the notification decision: it records a named person\'s decision', () => {
  const inc = newIncident();
  assert.ok(openTexts(inc).includes(W.NOTIFICATION_BANNER));
  assert.equal(inc.fields.notify?.decision, undefined);
  M.setAnswer(inc, advisor, 's1.n.hsem', 'notified');
  assert.ok(openTexts(inc).some((t) => /decision not yet recorded/.test(t)), 'telling the manager is not the decision');
  rule(() => M.recordNotificationDecision(inc, advisor, { decidedBy: '', outcome: 'Not notifiable' }), /who made/);
  M.recordNotificationDecision(inc, advisor, { decidedBy: 'Test Manager', outcome: 'Notifiable, regulator called' });
  assert.ok(!M.openItems(inc).some((i) => i.key === 'notify.formal'));
  assert.equal(inc.timeline.at(-1).category, 'decision');
});

test('every line of the initial brief is marked Confirmed, Reported but unverified, or Unknown', () => {
  const inc = newIncident({ danger: 'unsure', injured: 'yes' });
  M.setAnswer(inc, advisor, 's1.s.stopped', 'yes');
  M.verifyAnswer(inc, advisor, 's1.s.stopped');
  M.setAnswer(inc, advisor, 's1.s.isolated', 'unsure');
  const c = M.addRecord(inc, advisor, 'controls', { control: 'Stop work.', responsible: 'Person One' });
  M.addRecord(inc, advisor, 'people', { name: 'Person One', injury: 'SECRET-INJURY' });
  const brief = M.initialBrief(inc);
  assert.deepEqual(brief.map((s) => s.title), ['What occurred', 'Current situation', 'People affected', 'Immediate controls', 'Remaining risks', 'Notifications completed', 'Assistance required', 'Next actions', 'Information not yet confirmed']);
  assert.ok(tagsOf(brief).every((t) => ['confirmed', 'unverified', 'unknown'].includes(t)));
  const line = (text) => brief.flatMap((s) => s.items).find((i) => i.text.includes(text));
  assert.equal(line('Has work stopped?').tag, 'confirmed');
  assert.equal(line('Is the hazard isolated?').tag, 'unknown');
  assert.equal(line('Stop work.').tag, 'unverified');
  M.updateRecord(inc, advisor, 'controls', c.id, { verified: 'yes' });
  assert.equal(M.initialBrief(inc).flatMap((s) => s.items).find((i) => i.text.includes('Stop work.')).tag, 'confirmed');
});

test('health details are left out of briefs, handovers and exports unless deliberately included', () => {
  const inc = newIncident();
  M.addRecord(inc, advisor, 'people', { name: 'Person One', injury: 'SECRET-INJURY', restrictions: 'SECRET-RESTRICTION' });
  const outputs = [M.toText('b', M.initialBrief(inc)), M.toText('h', M.handover(inc, advisor)), M.toText('r', M.investigationReport(inc)), JSON.stringify(M.exportPayload(inc))];
  for (const text of outputs) assert.ok(!text.includes('SECRET'));
  assert.ok(outputs[0].includes('health details restricted'));
  assert.ok(M.toText('b', M.initialBrief(inc, { health: true })).includes('SECRET-INJURY'));
});

test('the status strip always has a next step', () => {
  const inc = newIncident({ danger: 'no' });
  assert.match(M.nextStep(inc).text, /Stage 1/);
  M.completeStage(inc, advisor, 1);
  assert.ok(M.nextStep(inc).route);
  M.closeIncident(inc, advisor, 'Test closure');
  assert.equal(M.statusLabel(inc), 'Closed');
});
