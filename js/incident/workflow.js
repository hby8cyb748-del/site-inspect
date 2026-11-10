// The incident workflow, written as data. Questions, lists, fields and wording live here so they can be
// changed without touching the screens (ui-*.js) or the rules (model.js). Nothing in this file runs.

const YES_NO_UNSURE = [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Unsure']];
const YES_NO_UNSURE_NA = [...YES_NO_UNSURE, ['na', 'Not applicable']];
const YES_NO_UNKNOWN = [['yes', 'Yes'], ['no', 'No'], ['unknown', 'Unknown']];
const NO_UNSURE = ['no', 'unsure'];
const YES_UNSURE = ['yes', 'unsure'];
const ALL_THREE = ['yes', 'no', 'unsure'];

export const CATEGORIES = {
  fact: 'Confirmed fact',
  witness: 'Witness account',
  reported: 'Reported information',
  assumption: 'Assumption',
  decision: 'Decision',
  action: 'Action',
  communication: 'Communication',
};

export const VERIFICATION = {
  confirmed: 'Confirmed',
  unverified: 'Reported but unverified',
  unknown: 'Unknown',
};

// How far each kind of timeline entry can be relied on until someone says otherwise.
export const CATEGORY_VERIFICATION = {
  fact: 'confirmed',
  witness: 'unverified',
  reported: 'unverified',
  assumption: 'unverified',
  decision: 'confirmed',
  action: 'confirmed',
  communication: 'confirmed',
};

export const STAGES = {
  1: { title: 'Initial response', status: 'Active — initial response' },
  2: { title: 'Information capture', status: 'Active — information capture' },
  3: { title: 'Investigation', status: 'Under investigation' },
};

// Roles are a placeholder for real sign-in. `can` lists what each role may do.
export const ROLES = {
  advisor: { label: 'HSE Advisor', can: ['edit', 'health'] },
  manager: { label: 'HSE Manager (authorised person)', can: ['edit', 'health', 'confirmClassification', 'approve', 'approveExport'] },
  reviewer: { label: 'Investigation reviewer / approver', can: ['edit', 'approve'] },
  viewer: { label: 'Read only (for example a site manager)', can: [] },
};

// Stage 1

export const DANGER_QUESTION = 's1.danger';

export const DANGER_PROMPTS = [
  'Stop work.',
  'Do not enter an unsafe area.',
  'Raise the site emergency response.',
  'Call emergency services if required.',
  'Isolate hazardous energy where authorised.',
  'Establish an exclusion zone.',
  'Evacuate people from danger.',
  'Prevent further exposure.',
  'Arrange first aid or medical assistance.',
  'Notify the site or project manager.',
  'Preserve safe access for emergency responders.',
];

// The app never says a scene is safe. "controlled" only records what the advisor reported.
export const HAZARD_STATUS = [
  ['active', 'Hazard still active'],
  ['unknown', 'Unknown — not yet assessed'],
  ['controlled', 'Controls applied — as recorded by the advisor'],
  ['none', 'No immediate danger reported'],
];

// flag: answers that raise an item needing attention. urgent: answers that make that item urgent.
// adverse: 'yes' marks questions where Yes is the worrying answer.
export const GROUPS = {
  danger: {
    stage: 1, section: 'danger', options: YES_NO_UNSURE, timeline: true,
    questions: [{ k: DANGER_QUESTION, q: 'Is anyone in immediate danger or is the hazard still active?' }],
  },
  people: {
    stage: 1, section: 'people', options: YES_NO_UNSURE_NA, timeline: true,
    questions: [
      { k: 's1.p.injured', q: 'Is anyone injured?', flag: YES_UNSURE, urgent: YES_UNSURE, item: 'Injury reported or not ruled out — record who is affected and their care' },
      { k: 's1.p.exposed', q: 'Has anyone been exposed or potentially exposed?', flag: YES_UNSURE, urgent: YES_UNSURE, item: 'Exposure reported or not ruled out — record who and arrange assessment' },
      { k: 's1.p.missing', q: 'Is anyone missing or unaccounted for?', flag: YES_UNSURE, urgent: YES_UNSURE, item: 'People not all accounted for — complete a head count' },
      { k: 's1.p.public', q: 'Are members of the public involved?', flag: YES_UNSURE, item: 'Members of the public may be involved — escalate and record details' },
      { k: 's1.p.contractors', q: 'Are contractors involved?', flag: YES_UNSURE, item: 'Contractors may be involved — make sure their employer is told' },
      { k: 's1.p.firstaid', q: 'Has first aid been provided?', flag: NO_UNSURE, urgent: NO_UNSURE, item: 'First aid not confirmed as provided' },
      { k: 's1.p.medical', q: 'Has an ambulance or medical review been arranged?', flag: NO_UNSURE, urgent: ['unsure'], item: 'Ambulance or medical review not confirmed as arranged' },
      { k: 's1.p.supervisor', q: 'Has the person’s supervisor been notified?', flag: NO_UNSURE, item: 'Supervisor of the affected person not yet notified' },
    ],
  },
  scene: {
    stage: 1, section: 'scene', options: YES_NO_UNSURE_NA, timeline: true,
    questions: [
      { k: 's1.s.stopped', q: 'Has work stopped?', flag: NO_UNSURE, urgent: NO_UNSURE },
      { k: 's1.s.isolated', q: 'Is the hazard isolated?', flag: NO_UNSURE, urgent: NO_UNSURE },
      { k: 's1.s.exclusion', q: 'Has an exclusion zone been established?', flag: NO_UNSURE, urgent: NO_UNSURE },
      { k: 's1.s.plant', q: 'Is plant or equipment secure?', flag: NO_UNSURE, urgent: NO_UNSURE },
      { k: 's1.s.entry', q: 'Is the area safe for authorised responders to enter?', flag: NO_UNSURE, urgent: NO_UNSURE },
      { k: 's1.s.deteriorate', q: 'Could conditions deteriorate?', adverse: 'yes', flag: ALL_THREE, urgent: YES_UNSURE },
      { k: 's1.s.energy', q: 'Is gas, dust, heat, electrical energy, stored energy or structural instability involved?', adverse: 'yes', flag: ALL_THREE, urgent: YES_UNSURE },
      { k: 's1.s.monitoring', q: 'Does monitoring need to continue?', adverse: 'yes', flag: ALL_THREE, urgent: ['unsure'] },
      { k: 's1.s.evidence', q: 'Could evidence be lost or disturbed?', adverse: 'yes', flag: ALL_THREE, urgent: ['unsure'] },
      { k: 's1.s.altered', q: 'Has the scene been altered to rescue or protect someone?', adverse: 'yes', flag: ALL_THREE },
    ],
  },
  notify: {
    stage: 1, section: 'notify', timeline: false,
    options: [['notified', 'Notified'], ['todo', 'Still to do'], ['notrequired', 'Not needed']],
    questions: [
      { k: 's1.n.emergency', q: 'Emergency services', flag: ['todo'], urgent: ['todo'], item: 'Emergency services still to be notified' },
      { k: 's1.n.sitepm', q: 'Site or project manager', flag: ['todo'], item: 'Site or project manager still to be notified' },
      { k: 's1.n.supervisor', q: 'Relevant supervisor', flag: ['todo'], item: 'Relevant supervisor still to be notified' },
      { k: 's1.n.hsem', q: 'HSE manager', flag: ['todo'], urgent: ['todo'], item: 'HSE manager still to be notified' },
      { k: 's1.n.client', q: 'Client representative', flag: ['todo'], item: 'Client representative still to be notified' },
      { k: 's1.n.principal', q: 'Principal contractor or asset owner', flag: ['todo'], item: 'Principal contractor or asset owner still to be notified' },
      { k: 's1.n.injury', q: 'Injury management', flag: ['todo'], item: 'Injury management still to be notified' },
      { k: 's1.n.senior', q: 'Senior management', flag: ['todo'], item: 'Senior management still to be notified' },
    ],
  },
  checklist: {
    stage: 1, section: 'review', timeline: false,
    options: [['done', 'Done'], ['open', 'Still open']],
    questions: [
      { k: 's1.c.danger', q: 'Immediate danger controlled or clearly recorded as ongoing' },
      { k: 's1.c.accounted', q: 'People accounted for' },
      { k: 's1.c.firstaid', q: 'First aid or medical assistance addressed' },
      { k: 's1.c.scene', q: 'Scene controlled' },
      { k: 's1.c.exposure', q: 'Further exposure prevented' },
      { k: 's1.c.escalation', q: 'Required initial escalation completed' },
      { k: 's1.c.evidence', q: 'Evidence preservation commenced' },
      { k: 's1.c.lead', q: 'Incident response lead identified' },
      { k: 's1.c.decision', q: 'Next operational decision identified' },
    ],
  },
  conditions: {
    stage: 2, section: 'conditions', timeline: false, notes: true,
    options: [['relevant', 'Relevant'], ['not', 'Not relevant'], ['unknown', 'Unknown']],
    questions: [
      ['lighting', 'Lighting'], ['weather', 'Weather'], ['heat', 'Heat'], ['wind', 'Wind'], ['noise', 'Noise'], ['dust', 'Dust'],
      ['gas', 'Gas or vapour'], ['visibility', 'Visibility'], ['access', 'Access'], ['housekeeping', 'Housekeeping'],
      ['congestion', 'Congestion'], ['simops', 'Simultaneous operations'], ['shift', 'Shift and time of day'],
      ['plant', 'Unusual plant conditions'], ['changes', 'Recent changes'],
    ].map(([k, q]) => ({ k: `s2.cond.${k}`, q })),
  },
  quality: {
    stage: 3, section: 'review', timeline: false, notes: true,
    options: [['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No']],
    questions: [
      ['facts', 'Are the facts supported?'],
      ['witness', 'Are witness accounts clearly identified?'],
      ['conflicts', 'Are conflicts acknowledged?'],
      ['sequence', 'Is the event sequence complete enough?'],
      ['controls', 'Are relevant critical controls assessed?'],
      ['causes', 'Are causes or contributing factors supported by evidence?'],
      ['actions', 'Does each action address an approved finding?'],
      ['hierarchy', 'Are higher-order controls considered?'],
      ['owners', 'Are responsibilities and due dates clear?'],
      ['notifications', 'Are notification matters closed or assigned?'],
      ['limitations', 'Are limitations stated?'],
      ['blame', 'Does the report avoid unsupported blame?'],
      ['pathway', 'Has the correct approval pathway been applied?'],
    ].map(([k, q]) => ({ k: `s3.q.${k}`, q })),
  },
};

export const QUESTIONS = Object.fromEntries(Object.entries(GROUPS).flatMap(([group, g]) =>
  g.questions.map((q) => [q.k, { ...q, group, stage: g.stage, section: g.section, options: g.options, timeline: g.timeline }])));

export const NOTIFICATION_BANNER = 'This incident may require formal notification. Notify the Manager HSE ASAP.';

export const STAGE1_STEPS = [
  ['danger', 'Immediate danger'],
  ['people', 'People affected'],
  ['scene', 'Scene control'],
  ['notify', 'Notifications and escalation'],
  ['review', 'Stage 1 review'],
];

// Stage 2 and 3 sections. `levels` says which investigation levels need the section.
export const STAGE2_SECTIONS = [
  ['details', 'Incident details'],
  ['people', 'People'],
  ['work', 'Work being undertaken'],
  ['conditions', 'Scene and conditions'],
  ['equipment', 'Equipment and materials'],
  ['documents', 'Documents'],
  ['risks', 'Critical risks and controls'],
  ['witnesses', 'Witnesses'],
  ['evidence', 'Photographs and evidence'],
  ['timeline', 'Timeline'],
  ['classification', 'Preliminary classification'],
  ['completeness', 'Information completeness review'],
];

export const LEVELS = {
  1: { label: 'Level 1 — local review', note: 'Minor event. A short review: what happened, what was found, what will change.' },
  2: { label: 'Level 2 — standard investigation', note: 'Evidence review, interviews, event sequence and control analysis.' },
  3: { label: 'Level 3 — full investigation (ICAM)', note: 'Serious or high-potential event. Every section, including contributing factors using ICAM.' },
};

export const STAGE3_SECTIONS = [
  ['plan', 'Investigation plan', [1, 2, 3]],
  ['evboard', 'Evidence review', [2, 3]],
  ['interviews', 'Interviews', [2, 3]],
  ['sequence', 'Event sequence', [2, 3]],
  ['compare', 'Task as planned versus task as performed', [3]],
  ['controls', 'Control analysis', [2, 3]],
  ['findings', 'Findings', [1, 2, 3]],
  ['factors', 'Contributing factors', [3]],
  ['actions', 'Actions', [1, 2, 3]],
  ['review', 'Review and approval', [1, 2, 3]],
];

// Forms: one value per field, saved under incident.fields[form][key].
export const FORMS = {
  danger: [
    { k: 'atRisk', label: 'People remaining at risk', type: 'area', hint: 'Who, how many and where. Write "None known" if that is what you have been told.' },
    { k: 'remaining', label: 'Remaining uncontrolled exposure', type: 'area', hint: 'Anything still not controlled.' },
  ],
  details: [
    { k: 'eventAt', label: 'Event date and time', type: 'datetime' },
    { k: 'discoveredAt', label: 'Discovery time (if different)', type: 'datetime' },
    { k: 'site', label: 'Site' },
    { k: 'project', label: 'Project' },
    { k: 'job', label: 'Job number or workgroup' },
    { k: 'location', label: 'Exact location' },
    { k: 'client', label: 'Client' },
    { k: 'principal', label: 'Principal contractor (where relevant)' },
    { k: 'employer', label: 'Employer of affected person' },
    { k: 'reporter', label: 'Person reporting' },
    { k: 'advisor', label: 'HSE advisor' },
    { k: 'siteManager', label: 'Site manager' },
    {
      k: 'description', label: 'Brief factual description', type: 'area', rows: 8,
      hint: 'Describe what was happening, what occurred, what the immediate outcome was, and what happened next. Do not include suspected causes here.',
    },
  ],
  work: [
    { k: 'planned', label: 'What task was planned?', type: 'area' },
    { k: 'performed', label: 'What work was actually being performed?', type: 'area' },
    { k: 'supervised', label: 'Who directed or supervised the work?', type: 'area' },
    { k: 'method', label: 'What method was intended?', type: 'area' },
    { k: 'different', label: 'Were conditions different from what was planned?', type: 'area' },
    { k: 'changed', label: 'Did the task or work environment change?', type: 'area' },
    { k: 'recognised', label: 'Was the change recognised?', type: 'area' },
    { k: 'reviewed', label: 'Was the risk assessment reviewed?', type: 'area' },
    { k: 'stopped', label: 'Was work stopped or reassessed?', type: 'area' },
  ],
  plan: [
    { k: 'scope', label: 'Investigation scope', type: 'area' },
    { k: 'objectives', label: 'Investigation objectives', type: 'area' },
    { k: 'lead', label: 'Investigation lead' },
    { k: 'team', label: 'Investigation team', type: 'area' },
    { k: 'methodology', label: 'Required level or methodology', hint: 'Set the level at the top of this screen. Add any methodology notes here.' },
    { k: 'interviewees', label: 'People to interview', type: 'area' },
    { k: 'evidenceToObtain', label: 'Evidence to obtain', type: 'area' },
    { k: 'expertise', label: 'Technical expertise required', type: 'area' },
    { k: 'client', label: 'Client involvement', type: 'area' },
    { k: 'legal', label: 'Legal or regulatory involvement', type: 'area' },
    { k: 'due', label: 'Due date', type: 'date' },
    { k: 'reviewAuthority', label: 'Review authority' },
    { k: 'approvalAuthority', label: 'Approval authority' },
  ],
};

export const COMPARE_ROWS = [
  ['method', 'Approved method', 'Actual method'],
  ['people', 'Required people', 'People present'],
  ['competency', 'Required competency', 'Actual competency'],
  ['equipment', 'Equipment', 'Equipment used'],
  ['permit', 'Permit', 'Permit conditions'],
  ['riskAssessment', 'Risk assessment', 'Changes or deviations'],
  ['controls', 'Critical controls', 'Actual controls'],
  ['supervision', 'Supervision', 'Supervision present'],
  ['conditions', 'Expected environmental conditions', 'Actual conditions'],
];

export const DOC_TYPES = [
  'SWMS', 'Permit', 'Take 5 or task risk assessment', 'Lift plan', 'Isolation plan', 'Scaffold documentation',
  'Work instruction', 'Procedure', 'Drawing', 'Pre-start or toolbox record',
];

export const EVIDENCE_KINDS = [
  'Photograph', 'Video', 'Audio', 'Witness statement', 'Document', 'Monitoring record', 'Equipment details', 'Tag or label',
  'Screenshot', 'Permit', 'Risk assessment', 'Training record', 'Inspection record', 'CCTV reference', 'Physical evidence reference',
];

export const EVIDENCE_STATUS = [
  ['obtained', 'Evidence obtained'],
  ['requested', 'Evidence requested'],
  ['unavailable', 'Evidence unavailable'],
  ['verify', 'Evidence requiring verification'],
  ['contradictory', 'Contradictory evidence'],
];

export const PHOTO_GUIDE = [
  'Overall scene', 'Approach to the scene', 'Location of people', 'Equipment position', 'Relevant controls',
  'Failed, missing or altered controls', 'Identifying labels or serial numbers', 'Environmental conditions', 'Damage',
  'Measurements or scale where needed',
];

export const CONTROL_RATINGS = [
  'Effective', 'Present but ineffective', 'Partially implemented', 'Absent', 'Bypassed', 'Degraded', 'Not applicable', 'Unable to determine',
];

export const CONTROL_AREAS = [
  'Physical controls', 'Engineering controls', 'Isolation', 'Access control', 'Planning', 'Work design', 'Equipment', 'Competency',
  'Supervision', 'Communication', 'Change management', 'Organisational arrangements', 'Assurance',
];

// A sample library only. Replace with the organisation's approved critical risks and critical controls.
export const CRITICAL_RISKS = {
  atmosphere: {
    label: 'Hazardous atmosphere or gas exposure',
    statement: 'Exposure to a toxic, flammable or oxygen-deficient atmosphere.',
    controls: ['Gas testing before entry or work', 'Continuous personal gas monitoring', 'Ventilation or purging', 'Isolation of the gas source', 'Emergency rescue and breathing apparatus arrangements'],
  },
  height: {
    label: 'Working at height',
    statement: 'Fall of a person from height.',
    controls: ['Complete work platform with edge protection', 'Access control to incomplete structures (tags and locked access)', 'Scaffold inspection and handover', 'Fall restraint or fall arrest system'],
  },
  dropped: {
    label: 'Dropped or falling objects',
    statement: 'A person struck by an object falling from height.',
    controls: ['Primary restraint (tool lanyards and tethering)', 'Secondary retention (toe boards, mesh, containment)', 'Exclusion zone below the work', 'Controlled method for raising and lowering materials'],
  },
  energy: {
    label: 'Hazardous energy and isolation',
    statement: 'Uncontrolled release of electrical, mechanical, pressure or stored energy.',
    controls: ['Isolation and lock-out', 'Verification of zero energy before work', 'Permit to work'],
  },
  plant: {
    label: 'Mobile plant and people',
    statement: 'A person struck by moving plant or a vehicle.',
    controls: ['Segregation of people and plant', 'Spotter or positive communication', 'Reversing and proximity aids working'],
  },
  lifting: {
    label: 'Lifting operations',
    statement: 'A dropped or uncontrolled load during a lift.',
    controls: ['Lift plan matched to the lift', 'Exclusion zone under and around the load', 'Inspected and rated lifting gear', 'Competent dogger and crane operator'],
  },
  confined: {
    label: 'Confined space',
    statement: 'A person overcome or trapped in a confined space.',
    controls: ['Confined space permit and risk assessment', 'Atmospheric testing and monitoring', 'Standby person and rescue plan'],
  },
};

export const CONSEQUENCES = [
  'No injury or damage', 'Minor (first aid level)', 'Moderate (medical treatment or restricted work)', 'Serious (lost time or hospital admission)',
  'Major (permanent disability)', 'Catastrophic (fatality)', 'Unknown',
];

export const INJURY_CATEGORIES = [
  'No injury', 'First aid injury', 'Medical treatment injury', 'Restricted work injury', 'Lost time injury',
  'Suspected exposure — not confirmed', 'Confirmed exposure', 'Unknown',
];

export const CLASSIFICATION_FIELDS = [
  { k: 'eventType', label: 'Event type', type: 'select', options: ['Injury', 'Illness or exposure', 'Near miss', 'Property or equipment damage', 'Environmental', 'Other'] },
  { k: 'eventSubtype', label: 'Event subtype' },
  { k: 'actual', label: 'Actual consequence', type: 'select', options: CONSEQUENCES },
  { k: 'potential', label: 'Potential consequence', type: 'select', options: CONSEQUENCES },
  { k: 'injuryCategory', label: 'Injury or exposure category', type: 'select', options: INJURY_CATEGORIES },
  { k: 'criticalRisk', label: 'Applicable critical risk', type: 'select', options: ['None identified', ...Object.values(CRITICAL_RISKS).map((r) => r.label)] },
  { k: 'riskStatement', label: 'Applicable risk statement', type: 'area' },
  { k: 'hipo', label: 'HIPO consideration', type: 'select', options: ['Refer for HIPO review', 'Not a HIPO', 'Undetermined'] },
  { k: 'cardinal', label: 'Cardinal Rule consideration', type: 'select', options: ['Possible breach — refer', 'No breach identified', 'Undetermined'] },
  { k: 'environmental', label: 'Environmental impact', type: 'select', options: ['None', 'Minor', 'Significant', 'Unknown'] },
  { k: 'publicImpact', label: 'Public impact', type: 'select', options: ['None', 'Members of the public involved', 'Community or media interest', 'Unknown'] },
  { k: 'level', label: 'Likely investigation level', type: 'select', options: Object.entries(LEVELS).map(([v, l]) => [v, l.label]) },
];

// The company's own classification rules are not loaded in the prototype.
export const RULE_PLACEHOLDER = 'Company classification rule: not loaded in this prototype (placeholder rule PR-CLASS-01).';

export const SEQUENCE_PHASES = [
  'Conditions before the event', 'Planning and preparation', 'Work commencement', 'Relevant changes',
  'Sequence immediately before the event', 'The event', 'Immediate response', 'Subsequent response', 'Current status',
];

export const FINDING_TYPES = [['fact', 'Fact'], ['observation', 'Observation'], ['finding', 'Finding'], ['conclusion', 'Conclusion'], ['recommendation', 'Recommendation']];
export const FINDING_STATUS = { draft: 'Draft', submitted: 'Submitted for review', approved: 'Approved', returned: 'Returned for more work' };
export const UNABLE_TO_DETERMINE = 'Unable to determine from the available evidence.';

export const FACTOR_CATEGORIES = [
  'Absent or failed defences', 'Individual or team actions', 'Task or environmental conditions', 'Organisational factors', 'Systemic issues',
];

export const ACTION_STATES = {
  proposed: 'Proposed', approved: 'Approved', assigned: 'Assigned', inprogress: 'In progress', implemented: 'Implemented',
  evidence: 'Evidence submitted', verified: 'Completion verified', reviewdue: 'Effectiveness review due', effective: 'Effective',
  ineffective: 'Ineffective', reopened: 'Reopened',
};

export const ACTION_FLOW = {
  proposed: ['approved'],
  approved: ['assigned'],
  assigned: ['inprogress'],
  inprogress: ['implemented'],
  implemented: ['evidence', 'reopened'],
  evidence: ['verified', 'reopened'],
  verified: ['reviewdue', 'reopened'],
  reviewdue: ['effective', 'ineffective'],
  effective: ['reopened'],
  ineffective: ['reopened'],
  reopened: ['assigned', 'inprogress'],
};
// Immediate actions taken during the response do not wait for a finding or an approver.
export const IMMEDIATE_FLOW = { proposed: ['assigned', 'inprogress', 'implemented'] };

export const HIERARCHY = ['Elimination', 'Substitution', 'Isolation', 'Engineering', 'Administrative', 'Personal protective equipment'];

export const EXPORT_STATES = {
  local: 'Local only', ready: 'Ready for review', approved: 'Approved for submission', pending: 'Submission pending',
  submitted: 'Submitted', failed: 'Submission failed',
};
export const EXPORT_FLOW = {
  local: ['ready'], ready: ['approved', 'local'], approved: ['pending', 'local'], pending: ['submitted', 'failed'],
  failed: ['pending', 'local'], submitted: [],
};

const yn = (k, label) => ({ k, label, type: 'select', options: YES_NO_UNKNOWN });
const evidenceLinks = (label = 'Linked evidence') => ({ k: 'evidence', label, type: 'evidence' });

// Records: lists of things the advisor adds. `health: true` fields are restricted health information.
// `timeline` describes the entry added to the chronology when a record is created (never health details).
export const COLLECTIONS = {
  people: {
    label: 'Affected person', plural: 'People affected', prefix: 'P', title: (r) => r.name || 'Name not yet recorded',
    timeline: (r) => ({ category: 'reported', text: `Affected person recorded: ${r.name || 'identity not yet known'}${r.currentLocation ? ` (now at: ${r.currentLocation})` : ''}` }),
    fields: [
      { k: 'name', label: 'Name or temporary identifier' },
      { k: 'employer', label: 'Employer' },
      { k: 'contact', label: 'Contact details (if required)' },
      { k: 'injury', label: 'Injury, symptom or suspected exposure', type: 'area', health: true },
      { k: 'location', label: 'Location when affected' },
      { k: 'condition', label: 'Current condition', health: true },
      { k: 'firstAid', label: 'First aid provided', health: true },
      { k: 'medical', label: 'Emergency or medical assistance arranged', health: true },
      { k: 'currentLocation', label: 'Current location', type: 'select', options: ['At the scene', 'First aid room', 'Medical centre', 'Hospital', 'Home', 'Unknown', 'Other'] },
      { k: 'supporter', label: 'Person supporting them' },
      { divider: 'More detail (Stage 2 — not needed during the first response)' },
      { k: 'role', label: 'Role or occupation' },
      { k: 'personType', label: 'Type of person', type: 'select', options: ['Employee', 'Contractor', 'Member of the public', 'Visitor', 'Unknown'] },
      { k: 'supervisor', label: 'Supervisor' },
      {
        k: 'exposureStatus', label: 'Exposure status', type: 'select',
        options: [['none', 'No exposure reported'], ['reported', 'Reported — not verified'], ['confirmed', 'Confirmed — evidence linked'], ['unknown', 'Unknown']],
      },
      evidenceLinks('Evidence for the exposure or injury status'),
      { k: 'treatment', label: 'Highest level of treatment so far', type: 'select', health: true, options: [['none', 'None'], ['firstaid', 'First aid'], ['medical', 'Medical treatment'], ['restricted', 'Restricted work'], ['losttime', 'Lost time'], ['unknown', 'Unknown']] },
      { k: 'restrictions', label: 'Work restrictions', type: 'area', health: true },
    ],
  },
  controls: {
    label: 'Immediate control', plural: 'Immediate controls applied', prefix: 'C', title: (r) => r.control || 'Control not described',
    timeline: (r) => ({ category: 'action', text: `Immediate control started: ${r.control || 'not described'}${r.responsible ? ` — responsible: ${r.responsible}` : ''}`, at: r.initiatedAt }),
    fields: [
      { k: 'control', label: 'Control applied' },
      { k: 'responsible', label: 'Person responsible' },
      { k: 'initiatedAt', label: 'Time started', type: 'datetime' },
      { k: 'verified', label: 'Has it been verified?', type: 'select', options: [['yes', 'Yes — verified'], ['no', 'Not yet verified']] },
      { k: 'verifiedBy', label: 'Verified by' },
      { k: 'note', label: 'Notes', type: 'area' },
    ],
  },
  notifications: {
    label: 'Notification', plural: 'Notifications', prefix: 'N', title: (r) => r.recipient || 'Recipient not recorded',
    timeline: (r) => ({ category: 'communication', text: `Notification ${r.completedAt ? 'made' : 'planned'}: ${r.recipient || 'recipient not recorded'}${r.method ? ` by ${r.method.toLowerCase()}` : ''}`, at: r.completedAt }),
    fields: [
      { k: 'recipient', label: 'Recipient' },
      { k: 'organisation', label: 'Organisation' },
      { k: 'reason', label: 'Reason' },
      { k: 'responsible', label: 'Person responsible' },
      { k: 'dueAt', label: 'Time due', type: 'datetime' },
      { k: 'completedAt', label: 'Time completed', type: 'datetime' },
      { k: 'method', label: 'Method', type: 'select', options: ['Phone', 'In person', 'Radio', 'Email', 'Text message', 'Other'] },
      { k: 'info', label: 'Information provided', type: 'area' },
      { k: 'followUp', label: 'Follow-up required', type: 'area' },
    ],
  },
  witnesses: {
    label: 'Witness', plural: 'Witnesses', prefix: 'W', title: (r) => r.name || 'Name not yet recorded',
    timeline: (r) => ({ category: 'reported', text: `Witness identified: ${r.name || 'name not yet recorded'}` }),
    fields: [
      { k: 'name', label: 'Witness name' },
      { k: 'employer', label: 'Employer' },
      { k: 'role', label: 'Role' },
      { k: 'contact', label: 'Contact details' },
      { k: 'location', label: 'Where the witness was located' },
      { k: 'account', label: 'What they may have seen or heard', type: 'area', hint: 'Recorded as a witness account, kept apart from confirmed facts.' },
      yn('interviewCompleted', 'Has an interview been completed?'),
      yn('statementRequired', 'Is a written statement required?'),
      yn('statementObtained', 'Has the written statement been obtained?'),
    ],
  },
  equipment: {
    label: 'Equipment or material', plural: 'Equipment and materials', prefix: 'Q', title: (r) => r.description || 'Not described',
    fields: [
      { k: 'description', label: 'Equipment or material' },
      { k: 'identifier', label: 'Serial number, asset number or tag' },
      { k: 'owner', label: 'Owner or supplier' },
      { k: 'condition', label: 'Condition as found', type: 'area' },
      { k: 'inspection', label: 'Inspection or maintenance status' },
      { k: 'location', label: 'Where it is now' },
      yn('quarantined', 'Has it been isolated or quarantined?'),
      evidenceLinks(),
    ],
  },
  evidence: {
    label: 'Evidence item', plural: 'Evidence', prefix: 'EV', title: (r) => r.description || r.kind || 'Evidence',
    timeline: (r) => ({ category: 'action', text: `${r.status === 'requested' ? 'Evidence requested' : 'Evidence recorded'}: ${r.kind || 'item'}${r.description ? ` — ${r.description}` : ''}`, at: r.capturedAt }),
    fields: [
      { k: 'kind', label: 'Type of evidence', type: 'select', options: EVIDENCE_KINDS },
      { k: 'description', label: 'Description', type: 'area' },
      { k: 'docType', label: 'Document type (if a document)', type: 'select', options: DOC_TYPES },
      { k: 'guide', label: 'Photo guide (if a photograph)', type: 'select', options: PHOTO_GUIDE },
      { k: 'capturedAt', label: 'Date and time captured', type: 'datetime' },
      { k: 'capturedBy', label: 'Who captured it' },
      { k: 'source', label: 'Original source' },
      { k: 'location', label: 'Location' },
      { k: 'relevance', label: 'Relevance', type: 'area' },
      { k: 'relatedIssue', label: 'Related issue' },
      { k: 'status', label: 'Status', type: 'select', options: EVIDENCE_STATUS },
      { k: 'restriction', label: 'Access restriction', type: 'select', options: [['none', 'None'], ['restricted', 'Restricted — investigation team only'], ['health', 'Health information'], ['legal', 'Sensitive — seek advice before sharing']] },
      { k: 'preserved', label: 'Has the original been preserved?', type: 'select', options: [['app', 'Yes — original stored unchanged in this app'], ['elsewhere', 'Yes — original held elsewhere'], ['no', 'No'], ['unknown', 'Unknown']] },
    ],
  },
  controlsAssessed: {
    label: 'Control', plural: 'Controls', prefix: 'K', title: (r) => r.control || 'Control not described',
    fields: [
      { k: 'control', label: 'Control expected' },
      { k: 'riskLabel', label: 'Critical risk' },
      yn('required', 'Was the control required?'),
      yn('present', 'Was it present?'),
      yn('implemented', 'Was it correctly implemented?'),
      yn('verifiedInPlace', 'Was it verified?'),
      yn('maintained', 'Was it maintained during the task?'),
      yn('bypassed', 'Was it bypassed or defeated?'),
      yn('changed', 'Did the conditions change?'),
      { k: 'evidenceNote', label: 'What evidence supports the answer?', type: 'area', hint: 'A signed document shows what was planned. It does not show the physical control worked.' },
      evidenceLinks('Supporting evidence'),
      { k: 'rating', label: 'Assessment', type: 'select', options: CONTROL_RATINGS },
      { divider: 'Control analysis (Stage 3)' },
      { k: 'source', label: 'Source requirement', hint: 'The procedure, standard, permit or plan that required this control.' },
      { k: 'why', label: 'Why the control did not prevent or reduce the event', type: 'area', hint: 'Look past "procedure not followed". What made the control weak, missing or easy to defeat?' },
      { k: 'uncertainty', label: 'Remaining uncertainty', type: 'area' },
      { k: 'considered', label: 'Areas considered', type: 'multi', options: CONTROL_AREAS },
    ],
  },
  questions: {
    label: 'Investigation question', plural: 'Investigation questions', prefix: 'IQ', title: (r) => r.question || 'Question not written',
    fields: [
      { k: 'question', label: 'Investigation question', type: 'area' },
      evidenceLinks(),
      { k: 'evidenceUnavailable', label: 'If there is no evidence, say why it is unavailable', type: 'area' },
      { k: 'conclusion', label: 'Conclusion', type: 'area', hint: 'Needs linked evidence, or the statement above that evidence is unavailable.' },
    ],
  },
  interviews: {
    label: 'Interview', plural: 'Interviews', prefix: 'I', title: (r) => r.person || 'Person not recorded',
    timeline: (r) => ({ category: 'action', text: `Interview record started: ${r.person || 'person not recorded'}`, at: r.at }),
    fields: [
      { k: 'person', label: 'Person interviewed' },
      { k: 'at', label: 'Date and time', type: 'datetime' },
      { k: 'interviewer', label: 'Interviewer' },
      { k: 'role', label: 'Person’s role' },
      { k: 'relationship', label: 'Relationship to the event' },
      { k: 'location', label: 'Location at the time' },
      { k: 'work', label: 'Work being performed', type: 'area' },
      { k: 'saw', label: 'What they saw or heard', type: 'area' },
      { k: 'actions', label: 'Actions they took', type: 'area' },
      { k: 'instructions', label: 'Instructions they received', type: 'area' },
      { k: 'expected', label: 'Controls they expected', type: 'area' },
      { k: 'observed', label: 'Controls they observed', type: 'area' },
      { k: 'changes', label: 'Changes they noticed', type: 'area' },
      { k: 'unusual', label: 'Anything unusual', type: 'area' },
      { k: 'identify', label: 'Documents or evidence they can identify', type: 'area' },
      { k: 'notes', label: 'Original interview notes (the person’s own words)', type: 'area', rows: 8, hint: 'These notes are the record. A summary never replaces them.' },
      evidenceLinks('Recording or statement'),
    ],
  },
  sequence: {
    label: 'Sequence entry', plural: 'Event sequence', prefix: 'S', title: (r) => r.text || 'Not described',
    fields: [
      { k: 'phase', label: 'Part of the sequence', type: 'select', options: SEQUENCE_PHASES },
      { k: 'text', label: 'What happened', type: 'area' },
      { k: 'at', label: 'Time (if known)', type: 'datetime' },
      { k: 'version', label: 'Possible sequence', type: 'select', options: ['A', 'B', 'C'], hint: 'Use B or C when the evidence supports more than one version of events.' },
      { k: 'standing', label: 'Standing', type: 'select', options: [['open', 'Open — not yet resolved'], ['supported', 'Supported by evidence'], ['ruledout', 'Ruled out by evidence']] },
      evidenceLinks(),
    ],
  },
  findings: {
    label: 'Finding', plural: 'Findings', prefix: 'F', title: (r) => r.statement || 'Statement not written',
    fields: [
      { k: 'type', label: 'Type', type: 'select', options: FINDING_TYPES },
      { k: 'statement', label: 'Statement', type: 'area' },
      { k: 'facts', label: 'Facts relied upon', type: 'area' },
      evidenceLinks('Evidence references'),
      { k: 'evidenceUnavailable', label: 'If there is no evidence, say why it is unavailable', type: 'area' },
      { k: 'requirement', label: 'Applicable requirement' },
      { k: 'expected', label: 'Expected condition', type: 'area' },
      { k: 'actual', label: 'Actual condition', type: 'area' },
      { k: 'effect', label: 'Effect on the event', type: 'area' },
      { k: 'uncertainty', label: 'Uncertainty or limitation', type: 'area' },
      { k: 'reviewer', label: 'Reviewer' },
    ],
  },
  factors: {
    label: 'Contributing factor', plural: 'Contributing factors', prefix: 'CF', title: (r) => r.text || 'Not described',
    fields: [
      { k: 'text', label: 'Contributing factor', type: 'area', hint: 'Describe conditions and arrangements. Do not describe what someone was thinking or intending.' },
      { k: 'category', label: 'Investigation category (ICAM)', type: 'select', options: FACTOR_CATEGORIES },
      evidenceLinks(),
      { k: 'finding', label: 'Related finding', type: 'ref', collection: 'findings' },
    ],
  },
  actions: {
    label: 'Action', plural: 'Actions', prefix: 'A', title: (r) => r.description || 'Action not described',
    timeline: (r) => ({ category: 'action', text: `${r.type === 'corrective' ? 'Corrective action proposed' : 'Action raised'}: ${r.description || 'not described'}${r.owner ? ` — owner: ${r.owner}` : ''}` }),
    fields: [
      { k: 'description', label: 'Action description', type: 'area' },
      { k: 'type', label: 'Kind of action', type: 'select', options: [['immediate', 'Immediate or interim action'], ['corrective', 'Corrective action from a finding']] },
      { k: 'finding', label: 'Finding addressed', type: 'ref', collection: 'findings' },
      { k: 'addresses', label: 'I have checked this action addresses the finding', type: 'check' },
      { k: 'gap', label: 'Risk or control gap', type: 'area' },
      { k: 'treatment', label: 'Temporary or permanent treatment', type: 'select', options: ['Temporary', 'Permanent'] },
      { k: 'hierarchy', label: 'Control hierarchy', type: 'select', options: HIERARCHY },
      { k: 'owner', label: 'Owner' },
      { k: 'dueDate', label: 'Due date', type: 'date' },
      { k: 'approver', label: 'Approver' },
      { k: 'evidenceRequired', label: 'Evidence required to show completion', type: 'area' },
      evidenceLinks('Completion evidence submitted'),
      { k: 'verifiedBy', label: 'Completion verified by' },
      { k: 'effectivenessReview', label: 'Effectiveness review (how and when)', type: 'area' },
      { k: 'effectivenessResult', label: 'Effectiveness review result', type: 'area' },
    ],
  },
  tasks: {
    label: 'Investigation task', plural: 'Investigation tasks', prefix: 'T', title: (r) => r.text || 'Task not described',
    fields: [
      { k: 'text', label: 'Task', type: 'area' },
      { k: 'owner', label: 'Owner' },
      { k: 'due', label: 'Due date', type: 'date' },
      { k: 'status', label: 'Status', type: 'select', options: [['open', 'Open'], ['done', 'Done']] },
    ],
  },
  support: {
    label: 'Support request', plural: 'Support requests', prefix: 'SR', title: (r) => r.kind || 'Support',
    timeline: (r) => ({ category: 'communication', text: `Support requested: ${r.kind || 'support'}${r.details ? ` — ${r.details}` : ''}` }),
    fields: [
      { k: 'kind', label: 'Support needed', type: 'select', options: ['HSE manager', 'Another HSE advisor', 'Emergency response team', 'Injury management', 'Technical specialist', 'Senior management', 'Other'] },
      { k: 'details', label: 'What is needed', type: 'area' },
      { k: 'status', label: 'Status', type: 'select', options: [['requested', 'Requested'], ['received', 'Received']] },
    ],
  },
};

export const HEALTH_FIELDS = Object.fromEntries(Object.entries(COLLECTIONS).map(([c, def]) =>
  [c, def.fields.filter((f) => f.health).map((f) => f.k)]));

// Shown from "View applicable procedure guidance". Generic prompts only: company procedures are not loaded.
export const GUIDANCE = {
  1: [
    'Your own safety comes first. Do not enter an area you cannot confirm is controlled.',
    'Follow the site emergency procedure. This app does not replace it, or emergency services.',
    'Deal with people first, then the scene, then notifications.',
    'Preserve evidence, but never at the cost of rescue or first aid. Record anything you had to move.',
    'Record times as you go. Mark anything you have only been told as unverified.',
  ],
  2: [
    'Record facts, not causes. Keep what people told you apart from what you have confirmed.',
    'A document shows what was planned. It does not show the control was in place.',
    'Photograph the scene wide, then close. Capture labels, tags and serial numbers.',
    'Never edit an original photo or file. Mark-ups are saved as a separate copy.',
    'Ask an authorised person to confirm the classification.',
  ],
  3: [
    'Match the depth of the investigation to the level set in the plan.',
    'Every finding needs evidence, or a clear statement that evidence is unavailable.',
    'Describe conditions and controls. Do not describe what someone was thinking or intending.',
    'An action that only retrains or reminds people rarely fixes the gap. Look higher up the hierarchy of control.',
    'Implemented is not the same as effective. Plan how effectiveness will be checked.',
  ],
};

export const EMERGENCY_GUIDANCE = [
  'If life is at risk, call emergency services now.',
  'Raise the site emergency response (radio channel, alarm or site emergency number).',
  'Do not enter an area that may be unsafe. Keep others out.',
  'Give first aid only if it is safe for you to do so.',
  'Send someone to meet and guide emergency responders.',
  'Account for everyone who was in the area.',
  'Tell the site or project manager and the Manager HSE as soon as you can.',
];
