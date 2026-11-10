import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/incident/model.js';
import { CATEGORIES } from '../js/incident/workflow.js';
import { advisor, viewer, newIncident, rule } from './helpers.js';

test('a timeline entry must be one of the seven categories', () => {
  const inc = newIncident();
  assert.deepEqual(Object.values(CATEGORIES), ['Confirmed fact', 'Witness account', 'Reported information', 'Assumption', 'Decision', 'Action', 'Communication']);
  for (const category of Object.keys(CATEGORIES)) M.addEntry(inc, advisor, { category, text: `An entry of type ${category}` });
  rule(() => M.addEntry(inc, advisor, { category: 'rumour', text: 'x' }));
  rule(() => M.addEntry(inc, advisor, { category: 'fact', text: '   ' }));
});

test('only a confirmed fact starts out as confirmed information', () => {
  const inc = newIncident();
  assert.equal(M.addEntry(inc, advisor, { category: 'fact', text: 'Measured 600 mm' }).verification, 'confirmed');
  assert.equal(M.addEntry(inc, advisor, { category: 'witness', text: 'Says the gate was open' }).verification, 'unverified');
  assert.equal(M.addEntry(inc, advisor, { category: 'reported', text: 'Told work had stopped' }).verification, 'unverified');
  assert.equal(M.addEntry(inc, advisor, { category: 'assumption', text: 'Probably the night shift' }).verification, 'unverified');
});

test('a correction is a new linked entry and the original stays visible', () => {
  const inc = newIncident();
  const original = M.addEntry(inc, advisor, { category: 'fact', text: 'Fell three metres' });
  const before = inc.timeline.length;
  const correction = M.correctEntry(inc, advisor, original.id, { text: 'Fell about four metres', reason: 'Measured on site' });
  assert.equal(inc.timeline.length, before + 1);
  assert.equal(correction.corrects, original.id);
  assert.equal(inc.timeline.find((e) => e.id === original.id).text, 'Fell three metres', 'the original text is untouched');
  const view = M.chronology(inc);
  assert.equal(view.find((e) => e.id === original.id).supersededBy, correction.n);
  assert.equal(view.find((e) => e.id === correction.id).correctsN, original.n);
  assert.ok(!M.effectiveEntries(inc).some((e) => e.id === original.id), 'the current view uses the correction');
  assert.ok(view.some((e) => e.id === original.id), 'the full timeline still shows the original');
});

test('a correction needs a reason, and an already corrected entry cannot be corrected again', () => {
  const inc = newIncident();
  const original = M.addEntry(inc, advisor, { category: 'reported', text: 'Two people involved' });
  rule(() => M.correctEntry(inc, advisor, original.id, { text: 'Three people involved' }), /why/i);
  M.correctEntry(inc, advisor, original.id, { text: 'Three people involved', reason: 'Head count' });
  rule(() => M.correctEntry(inc, advisor, original.id, { text: 'Four', reason: 'x' }), /already been corrected/);
});

test('marking a confirmed fact as unverified keeps the original and adds a linked entry', () => {
  const inc = newIncident();
  const fact = M.addEntry(inc, advisor, { category: 'fact', text: 'Gas monitor alarmed at 10 ppm' });
  const changed = M.markUnverified(inc, advisor, fact.id, 'Reading not yet downloaded');
  assert.equal(changed.category, 'reported');
  assert.equal(changed.verification, 'unverified');
  assert.equal(changed.corrects, fact.id);
  assert.equal(inc.timeline.find((e) => e.id === fact.id).verification, 'confirmed', 'the original entry is not rewritten');
  rule(() => M.markUnverified(inc, advisor, changed.id, 'again'));
});

test('the chronology is in event-time order whatever order things were entered in', () => {
  const inc = M.createIncident({ ...advisor, at: 1_000_000 }, { what: 'x', when: 1_000_000 });
  M.addEntry(inc, { ...advisor, at: 5_000_000 }, { category: 'reported', text: 'later event', at: 3_000_000 });
  M.addEntry(inc, { ...advisor, at: 6_000_000 }, { category: 'reported', text: 'earlier event, entered afterwards', at: 2_000_000 });
  const texts = M.chronology(inc).map((e) => e.text);
  assert.ok(texts.indexOf('earlier event, entered afterwards') < texts.indexOf('later event'));
});

test('the chronology builds itself from answers, people, notifications, evidence and actions', () => {
  const inc = newIncident({ danger: 'yes' });
  M.setAnswer(inc, advisor, 's1.s.stopped', 'yes');
  M.addRecord(inc, advisor, 'people', { name: 'Person One' });
  M.addRecord(inc, advisor, 'notifications', { recipient: 'HSE manager', completedAt: Date.now(), method: 'Phone' });
  M.addRecord(inc, advisor, 'evidence', { kind: 'Photograph', description: 'Scene' });
  M.addRecord(inc, advisor, 'actions', { description: 'Barricade the area' });
  M.addRecord(inc, advisor, 'witnesses', { name: 'Witness One', account: 'Saw the load swing' });
  const categories = inc.timeline.map((e) => e.category);
  for (const c of ['reported', 'communication', 'action']) assert.ok(categories.includes(c), `${c} entry was added automatically`);
  assert.ok(inc.timeline.length >= 7);
});

test('a witness account goes on the timeline as a witness account, and an update links to the earlier one', () => {
  const inc = newIncident();
  const w = M.addRecord(inc, advisor, 'witnesses', { name: 'Witness One' });
  M.updateRecord(inc, advisor, 'witnesses', w.id, { account: 'Heard a bang' });
  M.updateRecord(inc, advisor, 'witnesses', w.id, { account: 'Heard a bang at about nine' });
  const accounts = inc.timeline.filter((e) => e.category === 'witness');
  assert.equal(accounts.length, 2);
  assert.equal(accounts[1].corrects, accounts[0].id);
  assert.ok(accounts.every((e) => e.verification === 'unverified'), 'a witness account is never marked confirmed by the app');
});

test('every change is written to the audit history', () => {
  const inc = newIncident();
  const count = () => inc._audit.length;
  let before = count();
  const changed = (what) => { assert.ok(count() > before, `${what} was audited`); before = count(); };
  M.setAnswer(inc, advisor, 's1.danger', 'unsure'); changed('an answer');
  M.setField(inc, advisor, 'danger', 'atRisk', 'Two people'); changed('a field');
  const p = M.addRecord(inc, advisor, 'people', { name: 'Person One' }); changed('a new record');
  M.updateRecord(inc, advisor, 'people', p.id, { employer: 'Test Co' }); changed('a record change');
  M.addEntry(inc, advisor, { category: 'fact', text: 'x' }); changed('a timeline entry');
  M.voidRecord(inc, advisor, 'people', p.id, 'Entered twice'); changed('a withdrawal');
  M.completeStage(inc, advisor, 1); changed('a stage change');
  const last = inc._audit.at(-1);
  assert.ok(last.at && last.by === 'Test Advisor' && last.role === 'advisor' && last.action);
});

test('the audit history is a chain: a changed, removed or reordered entry is detected', async () => {
  const inc = newIncident({ danger: 'yes' });
  M.addRecord(inc, advisor, 'controls', { control: 'Stop work.' });
  const first = await M.sealAudit(inc._audit.splice(0));
  M.addEntry(inc, advisor, { category: 'fact', text: 'Second batch' });
  const second = await M.sealAudit(inc._audit.splice(0), first.head);
  const entries = [...first.entries, ...second.entries];
  assert.deepEqual(await M.verifyAudit(entries, second.head), { ok: true, count: entries.length, brokenAt: null });
  assert.equal(entries[0].prev, '');
  assert.equal(entries[1].prev, entries[0].hash);

  const edited = structuredClone(entries);
  edited[2].by = 'Someone Else';
  assert.equal((await M.verifyAudit(edited, second.head)).ok, false);
  assert.equal((await M.verifyAudit(edited, second.head)).brokenAt, 3);
  assert.equal((await M.verifyAudit(entries.filter((_, i) => i !== 1), second.head)).ok, false, 'a removed entry');
  assert.equal((await M.verifyAudit(entries.slice(0, -1), second.head)).ok, false, 'a missing last entry');
});

test('health details never appear in the audit history or in a timeline entry', () => {
  const inc = newIncident();
  const p = M.addRecord(inc, advisor, 'people', { name: 'Person One', injury: 'SECRET-INJURY', firstAid: 'SECRET-AID' });
  M.updateRecord(inc, advisor, 'people', p.id, { condition: 'SECRET-CONDITION', treatment: 'medical' });
  const everything = JSON.stringify(inc._audit) + JSON.stringify(inc.timeline);
  assert.ok(!everything.includes('SECRET'));
  assert.ok(JSON.stringify(inc._audit).includes('restricted'));
});

test('nothing is deleted: a withdrawn record stays on file with who and why', () => {
  const inc = newIncident();
  const w = M.addRecord(inc, advisor, 'witnesses', { name: 'Witness One' });
  rule(() => M.voidRecord(inc, advisor, 'witnesses', w.id, ''), /why/i);
  M.voidRecord(inc, advisor, 'witnesses', w.id, 'Was not on site');
  assert.equal(M.records(inc, 'witnesses').length, 0);
  assert.equal(inc.records.witnesses.length, 1);
  assert.equal(inc.records.witnesses[0].voided.reason, 'Was not on site');
  rule(() => M.updateRecord(inc, advisor, 'witnesses', w.id, { name: 'Changed' }), /withdrawn/);
});

test('a read-only role cannot change anything', () => {
  const inc = newIncident();
  rule(() => M.addEntry(inc, viewer, { category: 'fact', text: 'x' }), /Read only/);
  rule(() => M.setAnswer(inc, viewer, 's1.danger', 'no'));
  rule(() => M.addRecord(inc, viewer, 'people', {}));
  assert.equal(M.can('viewer', 'health'), false);
  assert.equal(M.can('reviewer', 'health'), false);
  assert.equal(M.can('advisor', 'health'), true);
});
