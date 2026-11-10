// Demonstration scenarios A to D. Every name, place, company and event here is invented.
// Each scenario is built by calling the same rule functions the screens use, so the demo incidents
// have a real timeline, real open items and a real audit history. No screens or storage in this file.
import * as M from './model.js';
import { CRITICAL_RISKS, UNABLE_TO_DETERMINE } from './workflow.js';

const ADVISOR = 'Alex Example (demo advisor)';
const MANAGER = 'Morgan Example (demo HSE manager)';
const MINUTE = 60000;

// A clock for the scenario: at(10) is ten minutes after the event, stamped as the advisor.
function clock(now, minutesAgo) {
  const base = now - minutesAgo * MINUTE;
  const at = (minutes) => ({ by: ADVISOR, role: 'advisor', at: base + minutes * MINUTE });
  at.manager = (minutes) => ({ by: MANAGER, role: 'manager', at: base + minutes * MINUTE });
  at.base = base;
  return at;
}

const answers = (inc, ctx, map) => { for (const [k, v] of Object.entries(map)) M.setAnswer(inc, ctx, k, v); };
const fields = (inc, ctx, form, map) => { for (const [k, v] of Object.entries(map)) M.setField(inc, ctx, form, k, v); };
const photo = (inc, ctx, description, extra = {}) => M.addRecord(inc, ctx, 'evidence', { kind: 'Photograph', description, preserved: 'app', source: 'Demo placeholder image', demoImage: description, ...extra });
const evidence = (inc, ctx, kind, description, extra = {}) => M.addRecord(inc, ctx, 'evidence', { kind, description, preserved: 'elsewhere', source: 'Demo record (synthetic)', ...extra });

function addRisk(inc, ctx, key, assess) {
  const risk = CRITICAL_RISKS[key];
  M.addEntry(inc, ctx, { category: 'decision', text: `Critical risk identified as applicable: ${risk.label}` });
  risk.controls.forEach((control, i) => M.addRecord(inc, ctx, 'controlsAssessed', { risk: key, riskLabel: risk.label, control, ...assess[i] }));
}

function start(now, minutesAgo, key, details) {
  const at = clock(now, minutesAgo);
  const inc = M.createIncident(at(0), { ...details, when: at.base, demo: true, ref: `DEMO-${key}` });
  inc.demoKey = key;
  return { inc, at };
}

// Scenario A: suspected H2S exposure. Exposure is reported, not confirmed. One person is unknown.
function scenarioA(now) {
  const { inc, at } = start(now, 95, 'A', {
    what: 'Three workers report symptoms after a rotten-egg smell near the wet well',
    where: 'Demo Treatment Plant (synthetic), Wet Well 2',
    danger: 'unsure',
    injured: 'yes',
  });
  M.addRecord(inc, at(3), 'controls', { control: 'Stop work.', responsible: 'Demo Supervisor 1', verified: 'yes', verifiedBy: ADVISOR });
  M.addRecord(inc, at(4), 'controls', { control: 'Evacuate people from danger.', responsible: 'Demo Supervisor 1', verified: 'yes', verifiedBy: ADVISOR });
  M.addRecord(inc, at(6), 'controls', { control: 'Establish an exclusion zone.', responsible: 'Demo Supervisor 1' });
  fields(inc, at(7), 'danger', {
    atRisk: 'None known. All three workers moved upwind to the muster point.',
    remaining: 'The source of the gas has not been identified. The wet well lid is still open.',
  });
  answers(inc, at(9), { 's1.p.injured': 'unsure', 's1.p.exposed': 'yes', 's1.p.missing': 'no', 's1.p.public': 'no', 's1.p.contractors': 'yes', 's1.p.firstaid': 'yes', 's1.p.medical': 'yes', 's1.p.supervisor': 'yes' });
  const worker1 = M.addRecord(inc, at(10), 'people', {
    name: 'Demo Worker 1', employer: 'Demo Contracting (synthetic)', injury: 'Headache and nausea, reported by the worker', condition: 'Alert and talking',
    firstAid: 'Moved to fresh air, oxygen given by the site first aider', medical: 'Taken to the site medical centre for assessment', location: 'Beside Wet Well 2',
    currentLocation: 'Medical centre', supporter: 'Demo First Aider', personType: 'Contractor', exposureStatus: 'reported', treatment: 'firstaid',
  });
  M.addRecord(inc, at(11), 'people', {
    name: 'Demo Worker 2', employer: 'Demo Contracting (synthetic)', injury: 'Eye irritation and dizziness, reported by the worker', condition: 'Alert',
    firstAid: 'Moved to fresh air, eyes rinsed', medical: 'Medical review arranged', location: 'Beside Wet Well 2', currentLocation: 'First aid room',
    supporter: 'Demo First Aider', personType: 'Contractor', exposureStatus: 'reported', treatment: 'firstaid',
  });
  M.addRecord(inc, at(12), 'people', {
    name: 'Demo Worker 3', employer: 'Demo Contracting (synthetic)', injury: 'No symptoms reported', condition: 'No complaint', location: 'About ten metres from Wet Well 2',
    currentLocation: 'At the scene', personType: 'Contractor', exposureStatus: 'unknown', verification: 'unknown',
  });
  answers(inc, at(15), { 's1.s.stopped': 'yes', 's1.s.isolated': 'unsure', 's1.s.exclusion': 'yes', 's1.s.plant': 'yes', 's1.s.entry': 'unsure', 's1.s.deteriorate': 'yes', 's1.s.energy': 'yes', 's1.s.monitoring': 'yes', 's1.s.evidence': 'yes', 's1.s.altered': 'no' });
  M.verifyAnswer(inc, at(16), 's1.s.stopped');
  M.setField(inc, at(17), 'danger', 'status', 'controlled');
  answers(inc, at(18), { 's1.n.emergency': 'notrequired', 's1.n.sitepm': 'notified', 's1.n.hsem': 'notified', 's1.n.injury': 'todo', 's1.n.client': 'todo' });
  M.addRecord(inc, at(18), 'notifications', { party: 's1.n.hsem', recipient: 'HSE manager', organisation: 'Demo Company (synthetic)', reason: 'Suspected gas exposure, three workers', responsible: ADVISOR, completedAt: at(18).at, method: 'Phone', info: 'Three workers with symptoms. Exposure not confirmed. Work stopped.', followUp: 'Call back once the medical assessment is known' });
  M.addRecord(inc, at(19), 'notifications', { party: 's1.n.sitepm', recipient: 'Site or project manager', responsible: ADVISOR, completedAt: at(19).at, method: 'In person' });
  M.addEntry(inc, at(20), { category: 'witness', text: 'Demo Worker 3 says the smell started when the wet well lid was lifted, a few minutes before the others felt unwell.' });
  M.addRecord(inc, at(21), 'actions', { type: 'immediate', description: 'Download the alarm history from the personal gas monitor worn by Demo Worker 1', owner: ADVISOR });
  answers(inc, at(24), { 's1.c.danger': 'done', 's1.c.accounted': 'done', 's1.c.firstaid': 'done', 's1.c.scene': 'open', 's1.c.exposure': 'open', 's1.c.escalation': 'done', 's1.c.evidence': 'done', 's1.c.lead': 'done', 's1.c.decision': 'open' });
  fields(inc, at(24), 'response', { lead: 'Demo Supervisor 1', nextDecision: 'Whether to re-enter to close the wet well lid. Site manager to decide after gas testing.' });
  M.completeStage(inc, at(25), 1);

  fields(inc, at(40), 'details', { eventAt: at.base, site: 'Demo Treatment Plant (synthetic)', project: 'Demo maintenance programme', location: 'Wet Well 2, north side', employer: 'Demo Contracting (synthetic)', reporter: 'Demo Supervisor 1', advisor: ADVISOR,
    description: 'A three-person crew was cleaning screens beside Wet Well 2. The wet well lid was lifted. Workers noticed a rotten-egg smell. Two workers reported feeling unwell and the crew moved upwind. The supervisor stopped the work and called the first aider.' });
  answers(inc, at(42), { 's2.cond.gas': 'relevant', 's2.cond.wind': 'relevant', 's2.cond.weather': 'not', 's2.cond.lighting': 'not', 's2.cond.plant': 'unknown' });
  M.setNote(inc, at(42), 's2.cond.wind', 'Light wind from the south, as reported by the supervisor');
  const scene = photo(inc, at(45), 'Wet well lid open, overall scene', { guide: 'Overall scene' });
  photo(inc, at(46), 'Gas monitor display as found (demo)', { guide: 'Identifying labels or serial numbers' });
  evidence(inc, at(50), 'Monitoring record', 'Alarm history download from the personal gas monitor worn by Demo Worker 1', { status: 'requested' });
  evidence(inc, at(51), 'Document', 'Medical assessment outcome for Demo Workers 1 and 2', { status: 'requested', restriction: 'health' });
  M.addRecord(inc, at(55), 'witnesses', { name: 'Demo Worker 3', employer: 'Demo Contracting (synthetic)', role: 'Labourer', location: 'About ten metres from Wet Well 2', account: 'Smelt rotten eggs when the lid was lifted. Saw Demo Worker 1 sit down holding his head.', interviewCompleted: 'no', statementRequired: 'yes' });
  addRisk(inc, at(60), 'atmosphere', [
    { rating: 'Unable to determine', evidenceNote: 'No gas test record found yet.' },
    { rating: 'Unable to determine', evidenceNote: 'One monitor was worn. Its alarm history has not been downloaded.' },
    { rating: 'Not applicable' },
    { rating: 'Absent', present: 'no', evidenceNote: 'The lid was open and the source was not isolated.', evidence: [scene.id] },
    {},
  ]);
  M.proposeClassification(inc, at(70), M.suggestClassification(inc).values, 'suggestion');
  return inc;
}

// Scenario B: incomplete scaffold access. No injury, high potential. Taken through to Stage 3.
function scenarioB(now) {
  const { inc, at } = start(now, 3 * 24 * 60, 'B', {
    what: 'Worker found on an incomplete scaffold bay behind a locked access gate',
    where: 'Demo Site North (synthetic), Scaffold S-12, east face',
    danger: 'no',
    injured: 'no',
  });
  M.addRecord(inc, at(4), 'controls', { control: 'Stop work.', responsible: 'Demo Supervisor 2', verified: 'yes', verifiedBy: ADVISOR });
  M.addRecord(inc, at(8), 'controls', { control: 'Scaffold S-12 access re-secured and re-tagged "Do not use"', responsible: 'Demo Scaffolder', verified: 'yes', verifiedBy: ADVISOR });
  answers(inc, at(10), { 's1.p.injured': 'no', 's1.p.exposed': 'no', 's1.p.missing': 'no', 's1.p.public': 'no', 's1.p.contractors': 'yes', 's1.p.firstaid': 'na', 's1.p.medical': 'na', 's1.p.supervisor': 'yes' });
  answers(inc, at(12), { 's1.s.stopped': 'yes', 's1.s.isolated': 'yes', 's1.s.exclusion': 'yes', 's1.s.plant': 'yes', 's1.s.entry': 'yes', 's1.s.deteriorate': 'no', 's1.s.energy': 'no', 's1.s.monitoring': 'no', 's1.s.evidence': 'yes', 's1.s.altered': 'no' });
  answers(inc, at(15), { 's1.n.emergency': 'notrequired', 's1.n.sitepm': 'notified', 's1.n.supervisor': 'notified', 's1.n.hsem': 'notified', 's1.n.client': 'notified', 's1.n.principal': 'notrequired', 's1.n.injury': 'notrequired', 's1.n.senior': 'notified' });
  M.addRecord(inc, at(15), 'notifications', { party: 's1.n.hsem', recipient: 'HSE manager', responsible: ADVISOR, completedAt: at(15).at, method: 'Phone', info: 'No injury. About four metres of fall exposure. Possible high-potential event.' });
  M.recordNotificationDecision(inc, at(40), { decidedBy: MANAGER, outcome: 'Not notifiable on the information available. To be reviewed after the HIPO review.' });
  for (const item of M.openItems(inc).filter((i) => !i.locked)) M.closeItem(inc, at(42), item.id, 'Checked at the scene and recorded in the scene control answers.');
  answers(inc, at(44), Object.fromEntries(['danger', 'accounted', 'firstaid', 'scene', 'exposure', 'escalation', 'evidence', 'lead', 'decision'].map((k) => [`s1.c.${k}`, 'done'])));
  fields(inc, at(44), 'response', { lead: 'Demo Supervisor 2', nextDecision: 'When scaffold work on the east face can restart. Site manager.' });
  M.completeStage(inc, at(45), 1);

  fields(inc, at(60), 'details', { eventAt: at.base, site: 'Demo Site North (synthetic)', project: 'Demo building project', location: 'Scaffold S-12, east face, second lift', employer: 'Demo Contracting (synthetic)', reporter: 'Demo Scaffolder', advisor: ADVISOR, siteManager: 'Demo Site Manager',
    description: 'Scaffold S-12 was part-built and tagged "Do not use". Its access gate was locked. A worker was seen on the second lift, where a mid-rail and two planks were not yet fitted. The open edge was about four metres above the ground. The worker came down when called. No one was hurt.' });
  fields(inc, at(62), 'work', { planned: 'Scaffold erection by the scaffold crew only. No other trades on S-12 until handover.', performed: 'A worker from another trade went onto the second lift.', supervised: 'Demo Supervisor 2 (trade crew). Demo Scaffolder (scaffold crew).', method: 'Access only by tagged, handed-over scaffold.', different: 'A tool bag had been left on the platform the day before.', changed: 'Yes. The bay had been stripped back for modification overnight.', recognised: 'Unknown', reviewed: 'Unknown', stopped: 'Yes, once the worker was seen.' });
  const gate = photo(inc, at(65), 'Locked access gate, with a 600 mm gap between the gate post and the building', { guide: 'Failed, missing or altered controls' });
  const edge = photo(inc, at(66), 'Second lift: mid-rail and two planks not fitted, open edge about four metres up', { guide: 'Overall scene' });
  const tag = photo(inc, at(67), 'Red "Do not use" scaffold tag at the access gate', { guide: 'Relevant controls' });
  const register = evidence(inc, at(70), 'Inspection record', 'Scaffold handover register: S-12 not handed over');
  const statement = evidence(inc, at(90), 'Witness statement', 'Written statement from Demo Worker 4');
  evidence(inc, at(92), 'CCTV reference', 'Camera 7, east face, 06:30 to 07:30 on the day', { status: 'requested' });
  M.addRecord(inc, at(95), 'witnesses', { name: 'Demo Worker 4', employer: 'Demo Contracting (synthetic)', role: 'Trade worker', location: 'On scaffold S-12', account: 'Says he went around the gate post to fetch a tool bag left on the platform the day before, and did not unlock the gate.', interviewCompleted: 'yes', statementRequired: 'yes', statementObtained: 'yes' });
  M.addRecord(inc, at(97), 'witnesses', { name: 'Demo Scaffolder', employer: 'Demo Scaffolding (synthetic)', role: 'Scaffolder', location: 'Ground level, east face', account: 'Says the bay was tagged and the gate locked at the end of the previous shift.', interviewCompleted: 'yes', statementRequired: 'no' });
  addRisk(inc, at(100), 'height', [
    { rating: 'Absent', required: 'yes', present: 'no', evidence: [edge.id], evidenceNote: 'The bay was part-built. The platform and edge protection were incomplete.', why: 'The bay was mid-modification, so the platform could not protect anyone on it. Protection depended entirely on keeping people off.', considered: ['Physical controls', 'Planning', 'Change management'] },
    { rating: 'Bypassed', required: 'yes', present: 'yes', implemented: 'no', bypassed: 'yes', evidence: [gate.id, statement.id], evidenceNote: 'The gate was locked but a person could pass around the post.', source: 'Demo scaffold access procedure (synthetic)', why: 'The gate closed the opening but not the gap beside it. A locked gate that can be walked around is a sign, not a barrier.', uncertainty: 'CCTV has been requested to confirm the route taken.', considered: ['Access control', 'Physical controls', 'Assurance', 'Work design'] },
    { rating: 'Effective', required: 'yes', present: 'yes', implemented: 'yes', verifiedInPlace: 'yes', evidence: [tag.id, register.id], evidenceNote: 'The tag and the register both showed the scaffold was not handed over.' },
    { rating: 'Absent', required: 'yes', present: 'no', evidence: [statement.id], evidenceNote: 'No harness was worn.' },
  ]);
  M.proposeClassification(inc, at(110), { ...M.suggestClassification(inc).values, eventType: 'Near miss', eventSubtype: 'Unauthorised access to incomplete scaffold', actual: 'No injury or damage', injuryCategory: 'No injury', environmental: 'None', publicImpact: 'None' });
  M.confirmClassification(inc, at.manager(130), MANAGER);
  M.completeStage(inc, at(140), 2);

  M.setLevel(inc, at(150), 3);
  fields(inc, at(155), 'plan', { scope: 'Access to scaffold S-12 on the day, and how scaffold access is controlled across the site.', objectives: 'Establish how access was gained, which controls were relied on, and what would stop it happening again.', lead: ADVISOR, team: 'Demo Site Manager, Demo Scaffolder', interviewees: 'Demo Worker 4, Demo Scaffolder, Demo Supervisor 2', evidenceToObtain: 'CCTV camera 7', reviewAuthority: MANAGER, approvalAuthority: 'Demo General Manager' });
  const seq = (minutes, phase, text, links, extra = {}) => M.addRecord(inc, at(minutes), 'sequence', { phase, text, evidence: links, standing: links.length ? 'supported' : 'open', ...extra });
  seq(160, 'Conditions before the event', 'S-12 was part-built, tagged "Do not use" and not handed over.', [tag.id, register.id]);
  seq(161, 'Planning and preparation', 'The bay was stripped back for modification on the previous shift. A tool bag was left on the platform.', [statement.id]);
  seq(162, 'Sequence immediately before the event', 'The worker went around the gate post without unlocking the gate (his account).', [statement.id]);
  seq(163, 'Sequence immediately before the event', 'The gate was unlocked at the time (raised as a possibility by the supervisor).', [], { version: 'B' });
  seq(164, 'The event', 'The worker was on the second lift next to an open edge about four metres up.', [edge.id]);
  seq(165, 'Immediate response', 'The scaffolder called the worker down. Work stopped and the access was re-secured.', [register.id]);
  fields(inc, at(170), 'compare', { 'method.planned': 'Access only by handed-over scaffold with a green tag', 'method.performed': 'Access to a red-tagged scaffold around a locked gate', 'people.planned': 'Scaffold crew only', 'people.performed': 'A worker from another trade', 'supervision.planned': 'Scaffold supervisor present during erection', 'supervision.performed': 'Scaffold supervisor present during erection', 'controls.planned': 'Locked gate, tag, complete platform before use', 'controls.performed': 'Locked gate with a gap beside it, tag in place, platform incomplete' });

  const approve = (finding) => { M.setFindingStatus(inc, at(200), finding.id, 'submitted'); M.setFindingStatus(inc, at.manager(230), finding.id, 'approved', MANAGER); return finding; };
  const f1 = approve(M.addRecord(inc, at(180), 'findings', { type: 'finding', statement: 'The locked gate did not prevent access. A 600 mm gap beside the gate post let a person pass around it.', facts: 'The gate was locked. The gap measured 600 mm. The worker states he went around the post.', evidence: [gate.id, statement.id], requirement: 'Demo scaffold access procedure (synthetic): incomplete scaffolds must be physically closed off.', expected: 'No route onto an incomplete scaffold without removing a physical barrier.', actual: 'A route existed beside the gate.', effect: 'Access to the incomplete bay was possible without defeating the lock.', uncertainty: 'CCTV has been requested and may confirm the route.' }));
  approve(M.addRecord(inc, at(182), 'findings', { type: 'fact', statement: 'Scaffold S-12 was incomplete and tagged "Do not use", with about four metres of fall exposure at the open edge.', facts: 'Photographs of the second lift and the tag. The handover register.', evidence: [edge.id, tag.id, register.id], uncertainty: 'None identified.' }));
  M.addRecord(inc, at(184), 'findings', { type: 'conclusion', statement: 'The worker deliberately bypassed the gate because he was careless.', uncertainty: '' });
  M.addRecord(inc, at(186), 'findings', { type: 'conclusion', statement: UNABLE_TO_DETERMINE, facts: 'Whether anyone told the worker he could fetch the tool bag.', evidenceUnavailable: 'No record of any instruction exists and the accounts do not address it.', uncertainty: 'May be resolved by further interviews.' });
  M.addRecord(inc, at(190), 'factors', { category: 'Absent or failed defences', text: 'The access barrier could be passed without unlocking it.', evidence: [gate.id], finding: f1.id });
  M.addRecord(inc, at(192), 'factors', { category: 'Organisational factors', text: 'There was no arrangement for getting back items left on a scaffold that had been taken out of service.', evidence: [statement.id] });
  const a1 = M.actionFromFinding(inc, at(240), f1.id, { description: 'Fit full-width mesh infill panels at every scaffold access gate so the gate cannot be passed around', addresses: true, treatment: 'Permanent', hierarchy: 'Engineering', owner: 'Demo Site Manager', dueDate: new Date(now + 7 * 86400000).toISOString().slice(0, 10), approver: MANAGER, evidenceRequired: 'Photographs of each gate with the infill fitted, and the updated scaffold inspection checklist', effectivenessReview: 'Walk every scaffold access point one month after fitting and try to pass each gate.' });
  M.moveAction(inc, at.manager(250), a1.id, 'approved');
  for (const [minutes, state] of [[260, 'assigned'], [300, 'inprogress'], [1500, 'implemented']]) M.moveAction(inc, at(minutes), a1.id, state);
  M.actionFromFinding(inc, at(245), f1.id, { description: 'Retrain all workers on scaffold tag rules' });
  const a3 = M.addRecord(inc, at(50), 'actions', { type: 'immediate', description: 'Inspect every other scaffold access gate on site for gaps', owner: 'Demo Scaffolder' });
  M.moveAction(inc, at(120), a3.id, 'implemented');
  answers(inc, at(1600), { 's3.q.witness': 'yes', 's3.q.conflicts': 'partly', 's3.q.blame': 'no' });
  M.setNote(inc, at(1600), 's3.q.blame', 'One draft conclusion uses wording about intent. To be rewritten or withdrawn.');
  return inc;
}

// Scenario C: dropped object. No one struck. Primary restraint, secondary retention, exclusion zone.
function scenarioC(now) {
  const { inc, at } = start(now, 26 * 60, 'C', {
    what: 'A 1.2 kg podger spanner fell about nine metres from a work platform. No one was struck.',
    where: 'Demo Site North (synthetic), Tower 2, level 3 platform',
    danger: 'no',
    injured: 'no',
  });
  M.addRecord(inc, at(3), 'controls', { control: 'Stop work.', responsible: 'Demo Supervisor 3', verified: 'yes', verifiedBy: ADVISOR });
  M.addRecord(inc, at(6), 'controls', { control: 'Exclusion zone below Tower 2 re-established on all four sides', responsible: 'Demo Supervisor 3', verified: 'yes', verifiedBy: ADVISOR });
  answers(inc, at(8), { 's1.p.injured': 'no', 's1.p.exposed': 'no', 's1.p.missing': 'no', 's1.p.public': 'no', 's1.p.contractors': 'no', 's1.p.firstaid': 'na', 's1.p.medical': 'na', 's1.p.supervisor': 'yes' });
  answers(inc, at(10), { 's1.s.stopped': 'yes', 's1.s.isolated': 'yes', 's1.s.exclusion': 'yes', 's1.s.plant': 'yes', 's1.s.entry': 'yes', 's1.s.deteriorate': 'no', 's1.s.energy': 'no', 's1.s.monitoring': 'no', 's1.s.evidence': 'yes', 's1.s.altered': 'no' });
  answers(inc, at(12), { 's1.n.sitepm': 'notified', 's1.n.hsem': 'notified', 's1.n.emergency': 'notrequired' });
  M.addRecord(inc, at(12), 'notifications', { party: 's1.n.hsem', recipient: 'HSE manager', responsible: ADVISOR, completedAt: at(12).at, method: 'Phone', info: 'Dropped object from about nine metres. No one struck.' });
  M.addEntry(inc, at(14), { category: 'witness', text: 'Demo Worker 6 says he was walking about two metres from where the spanner landed and heard it hit the ground.' });
  M.addEntry(inc, at(16), { category: 'fact', text: 'Spanner weighed on site scales: 1.2 kg.' });
  answers(inc, at(20), Object.fromEntries(['danger', 'accounted', 'firstaid', 'scene', 'exposure', 'escalation', 'evidence', 'lead'].map((k) => [`s1.c.${k}`, 'done'])));
  fields(inc, at(20), 'response', { lead: 'Demo Supervisor 3' });
  M.completeStage(inc, at(22), 1);

  fields(inc, at(40), 'details', { eventAt: at.base, site: 'Demo Site North (synthetic)', location: 'Tower 2, level 3 platform, west edge', reporter: 'Demo Supervisor 3', advisor: ADVISOR,
    description: 'A two-person crew was tightening bolts on the level 3 platform of Tower 2. A podger spanner went over the west edge and landed on the ground about nine metres below. A worker was walking nearby. No one was struck.' });
  const spanner = photo(inc, at(45), 'Spanner where it landed, with a tape measure for scale. No lanyard attachment point on the tool', { guide: 'Measurements or scale where needed' });
  const toeboard = photo(inc, at(47), 'Gap between the toe board and the deck at the west edge', { guide: 'Failed, missing or altered controls' });
  const zone = photo(inc, at(49), 'Barricade tape below Tower 2: three sides taped, west side open', { guide: 'Relevant controls' });
  evidence(inc, at(55), 'Document', 'Dropped-object consequence estimate for 1.2 kg from nine metres', { status: 'verify' });
  M.addRecord(inc, at(58), 'equipment', { description: 'Podger spanner', identifier: 'No asset number', condition: 'Undamaged. No lanyard attachment point.', location: 'Held in the site office', quarantined: 'yes', evidence: [spanner.id] });
  M.addRecord(inc, at(60), 'witnesses', { name: 'Demo Worker 6', employer: 'Demo Company (synthetic)', role: 'Labourer', location: 'Ground level, west of Tower 2', account: 'Heard the spanner land about two metres away. Did not see it fall.', interviewCompleted: 'no', statementRequired: 'yes' });
  addRisk(inc, at(70), 'dropped', [
    { rating: 'Absent', required: 'yes', present: 'no', evidence: [spanner.id], evidenceNote: 'The tool had no lanyard attachment point and no lanyard was in use.' },
    { rating: 'Present but ineffective', required: 'yes', present: 'yes', implemented: 'no', evidence: [toeboard.id], evidenceNote: 'A toe board was fitted, with a gap under it at the west edge.' },
    { rating: 'Partially implemented', required: 'yes', present: 'yes', implemented: 'no', maintained: 'unknown', evidence: [zone.id], evidenceNote: 'Three of four sides were taped.' },
    { rating: 'Not applicable' },
  ]);
  M.proposeClassification(inc, at(80), { ...M.suggestClassification(inc).values, eventType: 'Near miss', eventSubtype: 'Dropped object', actual: 'No injury or damage', injuryCategory: 'No injury', environmental: 'None' });
  M.completeStage(inc, at(90), 2);
  return inc;
}

// Scenario D: an injury whose classification changes. First aid at first, then medical treatment and
// restricted work. Earlier versions and the original timeline entry stay on the file.
function scenarioD(now) {
  const { inc, at } = start(now, 2 * 24 * 60, 'D', {
    what: 'Worker cut their left forearm on a sheet-metal offcut while clearing a work bench',
    where: 'Demo Workshop (synthetic), Bay 4',
    danger: 'no',
    injured: 'yes',
  });
  answers(inc, at(3), { 's1.p.injured': 'yes', 's1.p.exposed': 'no', 's1.p.missing': 'no', 's1.p.public': 'no', 's1.p.contractors': 'no', 's1.p.firstaid': 'yes', 's1.p.medical': 'no', 's1.p.supervisor': 'yes' });
  const worker = M.addRecord(inc, at(5), 'people', {
    name: 'Demo Worker 5', employer: 'Demo Company (synthetic)', injury: 'Cut to the left forearm, about four centimetres long', condition: 'Bleeding controlled',
    firstAid: 'Wound cleaned and dressed by the site first aider', location: 'Bay 4 work bench', currentLocation: 'First aid room', supporter: 'Demo First Aider',
    personType: 'Employee', treatment: 'firstaid', verification: 'confirmed',
  });
  M.addRecord(inc, at(6), 'controls', { control: 'Offcut bin emptied and bench cleared with cut-resistant gloves', responsible: 'Demo Supervisor 4', verified: 'yes', verifiedBy: ADVISOR });
  answers(inc, at(8), { 's1.s.stopped': 'yes', 's1.s.isolated': 'yes', 's1.s.exclusion': 'na', 's1.s.plant': 'yes', 's1.s.entry': 'yes', 's1.s.deteriorate': 'no', 's1.s.energy': 'no', 's1.s.monitoring': 'no', 's1.s.evidence': 'no', 's1.s.altered': 'yes' });
  answers(inc, at(10), { 's1.n.sitepm': 'notified', 's1.n.hsem': 'notified', 's1.n.injury': 'notified', 's1.n.emergency': 'notrequired' });
  M.addRecord(inc, at(10), 'notifications', { party: 's1.n.hsem', recipient: 'HSE manager', responsible: ADVISOR, completedAt: at(10).at, method: 'Phone', info: 'First aid injury, cut to forearm.' });
  const original = M.addEntry(inc, at(30), { category: 'fact', text: 'First aid only. Demo Worker 5 returned to normal duties.' });
  M.completeStage(inc, at(35), 1);
  M.proposeClassification(inc, at(45), { eventType: 'Injury', eventSubtype: 'Laceration', actual: 'Minor (first aid level)', potential: 'Moderate (medical treatment or restricted work)', injuryCategory: 'First aid injury', criticalRisk: 'None identified', hipo: 'Not a HIPO', cardinal: 'No breach identified', environmental: 'None', publicImpact: 'None', level: '1' });
  M.confirmClassification(inc, at.manager(60), MANAGER);

  // The next day: further treatment and work restrictions.
  const day = 24 * 60;
  M.addEntry(inc, at(day + 20), { category: 'reported', text: 'Demo Worker 5 reports the wound reopened overnight and is going to the medical centre.' });
  const certificate = evidence(inc, at(day + 150), 'Document', 'Medical certificate for Demo Worker 5', { restriction: 'health' });
  M.updateRecord(inc, at(day + 155), 'people', worker.id, { treatment: 'restricted', medical: 'Wound closed with sutures at the medical centre', restrictions: 'No lifting over five kilograms with the left arm for seven days', currentLocation: 'Home', evidence: [certificate.id] });
  M.correctEntry(inc, at(day + 160), original.id, { text: 'First aid on the day. Medical treatment (sutures) and restricted duties followed the next day.', reason: 'Further treatment and work restrictions after the first entry was made' });
  M.proposeClassification(inc, at(day + 170), { eventType: 'Injury', eventSubtype: 'Laceration', actual: 'Moderate (medical treatment or restricted work)', potential: 'Moderate (medical treatment or restricted work)', injuryCategory: 'Restricted work injury', criticalRisk: 'None identified', hipo: 'Not a HIPO', cardinal: 'No breach identified', environmental: 'None', publicImpact: 'None', level: '2' });
  return inc;
}

export const SCENARIOS = {
  A: { title: 'Scenario A: Suspected H2S exposure', about: 'Several workers report symptoms. Exposure is reported, not confirmed, and unknown for one person. Evidence has been requested. Left in Stage 2.', build: scenarioA },
  B: { title: 'Scenario B: Incomplete scaffold access', about: 'A locked gate is bypassed and a worker reaches an incomplete scaffold with about four metres of fall exposure. No injury. Taken into a full Stage 3 investigation.', build: scenarioB },
  C: { title: 'Scenario C: Dropped object', about: 'A spanner falls about nine metres. No one is struck. Primary restraint, secondary retention and the exclusion zone are assessed. Ready to start Stage 3.', build: scenarioC },
  D: { title: 'Scenario D: Injury classification changes', about: 'First aid at first, then medical treatment and restricted work. Two classification versions and restricted health information. Left in Stage 2.', build: scenarioD },
};

export const buildScenario = (key, now = Date.now()) => SCENARIOS[key].build(now);
