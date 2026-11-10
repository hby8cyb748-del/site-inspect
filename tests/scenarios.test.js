import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/incident/model.js';
import { SCENARIOS, buildScenario } from '../js/incident/demo.js';
import { buildDocument } from '../js/docx.js';
import { advisor, manager, rule } from './helpers.js';

const NOW = Date.UTC(2026, 10, 10, 2, 0, 0);
const person = (inc, name) => M.records(inc, 'people').find((p) => p.name === name);
const evidenceLike = (inc, text) => M.records(inc, 'evidence').find((e) => e.description.includes(text));
const control = (inc, text) => M.records(inc, 'controlsAssessed').find((c) => c.control.includes(text));

test('all four scenarios build, are flagged as demos, and have a valid audit chain', async () => {
  assert.deepEqual(Object.keys(SCENARIOS), ['A', 'B', 'C', 'D']);
  for (const key of Object.keys(SCENARIOS)) {
    const inc = buildScenario(key, NOW);
    assert.equal(inc.demo, true);
    assert.equal(inc.ref, `DEMO-${key}`);
    assert.ok(inc.timeline.length > 20, 'a chronology was generated');
    const { entries, head } = await M.sealAudit(inc._audit);
    assert.equal((await M.verifyAudit(entries, head)).ok, true);
    assert.ok(M.exportPayload(inc).synthetic);
  }
});

test('all demonstration information is synthetic', () => {
  for (const key of Object.keys(SCENARIOS)) {
    const inc = buildScenario(key, NOW);
    const names = [
      ...M.records(inc, 'people').map((p) => p.name),
      ...M.records(inc, 'witnesses').map((w) => w.name),
      ...M.records(inc, 'people').map((p) => p.employer),
      ...M.records(inc, 'controls').map((c) => c.responsible),
      ...M.records(inc, 'actions').map((a) => a.owner).filter(Boolean),
    ];
    for (const name of names) assert.match(name, /Demo|Example|synthetic/, `"${name}" in scenario ${key} must be visibly invented`);
    assert.match(inc.start.where, /Demo .*\(synthetic\)/);
    assert.match(inc.createdBy, /demo/);
  }
});

test('Scenario A: reported, confirmed and unknown exposure are different things', () => {
  const inc = buildScenario('A', NOW);
  assert.equal(person(inc, 'Demo Worker 1').exposureStatus, 'reported');
  assert.equal(person(inc, 'Demo Worker 2').exposureStatus, 'reported');
  assert.equal(person(inc, 'Demo Worker 3').exposureStatus, 'unknown');
  assert.equal(M.currentClassification(inc).values.injuryCategory, 'Suspected exposure — not confirmed');
  assert.equal(M.currentClassification(inc).status, 'proposed');

  const gaps = M.completeness(inc);
  assert.equal(gaps.evidenceRequired.filter((g) => g.startsWith('Medical assessment or monitoring evidence')).length, 3);
  assert.ok(gaps.evidenceRequired.some((g) => g.includes('gas monitor')));
  assert.ok(M.openItems(inc).some((i) => /Demo Worker 3 is unknown/.test(i.text)));

  const worker = person(inc, 'Demo Worker 1');
  rule(() => M.updateRecord(inc, advisor, 'people', worker.id, { exposureStatus: 'confirmed' }), /needs linked evidence/);
  const requested = evidenceLike(inc, 'Alarm history');
  M.updateRecord(inc, advisor, 'people', worker.id, { evidence: [requested.id] });
  rule(() => M.updateRecord(inc, advisor, 'people', worker.id, { exposureStatus: 'confirmed' }), /obtained/);
  M.updateRecord(inc, advisor, 'evidence', requested.id, { status: 'obtained' });
  M.updateRecord(inc, advisor, 'people', worker.id, { exposureStatus: 'confirmed' });
  assert.equal(inc.timeline.at(-1).category, 'fact');
  assert.equal(M.suggestClassification(inc).values.injuryCategory, 'Confirmed exposure');
  assert.equal(M.completeness(inc).evidenceRequired.filter((g) => g.startsWith('Medical assessment')).length, 2);

  const brief = M.toText('brief', M.initialBrief(inc));
  assert.match(brief, /Demo Worker 1.*exposure: Confirmed/);
  assert.match(brief, /Demo Worker 2.*exposure: Reported — not verified/);
  assert.match(brief, /\[Unknown\].*Demo Worker 3.*exposure: Unknown/);
  assert.ok(!brief.includes('Headache'), 'symptoms are health information and stay out of the brief');
});

test('Scenario B: bypassed access control, fall-risk controls, HIPO review, evidence and investigation', () => {
  const inc = buildScenario('B', NOW);
  assert.equal(inc.stage, 3);
  assert.equal(inc.level, 3);
  assert.equal(M.records(inc, 'people').length, 0, 'no one was injured');
  assert.equal(control(inc, 'Access control').rating, 'Bypassed');
  assert.equal(control(inc, 'Complete work platform').rating, 'Absent');
  assert.equal(control(inc, 'Scaffold inspection').rating, 'Effective');
  const c = M.currentClassification(inc);
  assert.equal(c.status, 'confirmed');
  assert.equal(c.values.hipo, 'Refer for HIPO review');
  assert.equal(c.values.cardinal, 'Possible breach — refer');
  assert.equal(c.values.actual, 'No injury or damage');
  assert.equal(M.records(inc, 'evidence').length, 6);
  assert.ok(inc.fields.notify.decision.decidedBy.includes('Morgan Example'));

  const findings = M.records(inc, 'findings');
  const approved = findings.filter((f) => f.status === 'approved');
  assert.equal(approved.length, 2);
  for (const f of approved) assert.ok(f.evidence.length >= 2, 'approved findings rest on evidence');
  const intent = findings.find((f) => f.statement.includes('deliberately'));
  assert.equal(intent.status, 'draft');
  assert.ok(M.findingProblems(inc, intent).some((p) => /deliberately/.test(p.text) && /careless/.test(p.text)), 'wording about intent is flagged');
  rule(() => M.setFindingStatus(inc, advisor, intent.id, 'submitted'), /not ready/);

  assert.equal(M.sequenceReview(inc).conflicts.length, 1, 'two possible sequences are still open');
  assert.ok(M.compareRows(inc).some((r) => r.different));
  for (const f of M.records(inc, 'factors')) assert.deepEqual(M.factorProblems(inc, f), []);

  const actions = M.records(inc, 'actions');
  const mesh = actions.find((a) => a.description.includes('mesh'));
  assert.equal(mesh.state, 'implemented');
  assert.equal(M.actionFinished(mesh), false);
  assert.equal(M.record(inc, 'findings', mesh.finding).status, 'approved');
  assert.match(M.actionWarnings(inc, actions.find((a) => a.description.startsWith('Retrain'))).join(' '), /only on retraining/);
  assert.equal(M.qualityChecks(inc).find((q) => q.key === 's3.q.blame').auto, 'attention');
  assert.ok(M.records(inc, 'tasks').length > 0, 'the plan was created from the information gaps');
});

test('Scenario C: primary restraint, secondary retention, exclusion zone and potential consequence', () => {
  const inc = buildScenario('C', NOW);
  assert.equal(control(inc, 'Primary restraint').rating, 'Absent');
  assert.equal(control(inc, 'Secondary retention').rating, 'Present but ineffective');
  assert.equal(control(inc, 'Exclusion zone').rating, 'Partially implemented');
  for (const name of ['Primary restraint', 'Secondary retention', 'Exclusion zone']) assert.equal(control(inc, name).evidence.length, 1, `${name} rests on a photograph`);
  const c = M.currentClassification(inc).values;
  assert.equal(c.actual, 'No injury or damage');
  assert.equal(c.potential, 'Catastrophic (fatality)');
  assert.equal(c.hipo, 'Refer for HIPO review');
  assert.equal(M.currentClassification(inc).status, 'proposed', 'still needs an authorised person');
  assert.equal(inc.stage, 3);
  assert.ok(M.completeness(inc).evidenceRequired.some((g) => g.includes('consequence estimate')));
  assert.ok(M.effectiveEntries(inc).some((e) => e.category === 'witness' && e.verification === 'unverified'));
  assert.ok(M.effectiveEntries(inc).some((e) => e.category === 'fact' && e.text.includes('1.2 kg')));
});

test('Scenario D: versioned classification and restricted health information', () => {
  const inc = buildScenario('D', NOW);
  assert.deepEqual(inc.classification.map((v) => [v.v, v.status, v.values.injuryCategory]), [[1, 'confirmed', 'First aid injury'], [2, 'proposed', 'Restricted work injury']]);
  assert.equal(M.currentClassification(inc).v, 2);
  assert.ok(M.openItems(inc).some((i) => i.key === 'classification'));
  rule(() => M.confirmClassification(inc, advisor), /HSE Manager/);
  M.confirmClassification(inc, manager, 'Morgan Example (demo HSE manager)');
  assert.equal(inc.classification[0].values.injuryCategory, 'First aid injury', 'version 1 is unchanged');

  const original = inc.timeline.find((e) => e.text.startsWith('First aid only'));
  const correction = inc.timeline.find((e) => e.corrects === original.id);
  assert.ok(correction, 'the first entry was corrected with a linked entry, not rewritten');
  assert.match(correction.text, /sutures/);

  const worker = person(inc, 'Demo Worker 5');
  assert.equal(worker.treatment, 'restricted');
  const outputs = [M.toText('b', M.initialBrief(inc)), M.toText('h', M.handover(inc, advisor)), M.toText('r', M.investigationReport(inc)), JSON.stringify(M.exportPayload(inc)), JSON.stringify(inc._audit)];
  for (const text of outputs) {
    assert.ok(!text.includes('four centimetres'), 'the injury description is restricted');
    assert.ok(!text.includes('five kilograms'), 'the work restriction is restricted');
  }
  assert.equal(evidenceLike(inc, 'Medical certificate').restriction, 'health');
  assert.equal(M.suggestClassification(inc).values.injuryCategory, 'Restricted work injury', 'the suggestion follows the latest treatment');
});

test('a brief or report can be built as a Word document', async () => {
  const inc = buildScenario('B', NOW);
  const sections = M.investigationReport(inc);
  const blob = buildDocument({
    title: 'Investigation report',
    details: [['Reference', inc.ref]],
    blocks: [...sections.flatMap((s) => [{ h1: s.title }, { rows: s.items.map((i) => [i.tag ?? '', i.text]) }]), { image: { jpeg: new Uint8Array([255, 216, 255, 217]), width: 4, height: 3 }, caption: 'EV-001' }],
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04], 'it is a zip file, which is what a .docx is');
  const text = new TextDecoder().decode(bytes);
  for (const part of ['word/document.xml', 'word/media/image1.jpg', 'Corrective actions', 'DEMO-B']) assert.ok(text.includes(part), part);
});
