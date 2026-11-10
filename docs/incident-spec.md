# Incident Response Advisor — specification

This is the specification as supplied, saved unchanged apart from Markdown formatting.

Build notes: the request that accompanied this spec said to build it into the existing
Site Inspect web app (not React Native), so the "React Native and TypeScript application"
line in section 6 is ignored. Everything else stands. See `ASSUMPTIONS.md` and `BUILD-NOTES.md`.

---

Build an iPhone-first mobile application called “Incident Response Advisor”.

The application is for HSE advisors responding to workplace incidents. Its purpose is to guide the advisor through the incident in three clear stages:

- Initial Response
- Information Capture
- Investigation

The app is a practical field guide and working incident file. It is not a replacement for emergency services, site emergency procedures, or competent HSE judgement.

==================================================

## 1. CORE USER EXPERIENCE

==================================================

The home screen must be simple and show:

- Start new incident
- Continue active incident
- View previous incident
- Emergency guidance
- Offline status
- Synchronisation status

When the advisor starts a new incident, ask only:

- What happened?
- Where did it happen?
- When did it happen?
- Is anyone still in danger?
- Is anyone injured or potentially exposed?

Then open Stage 1: Initial Response.

Use large buttons, short prompts, voice dictation, photo capture and automatic timestamps.

The app must work offline.

The advisor must always be able to:

- return to the incident overview;
- add a note, photograph or action;
- see what needs attention next;
- distinguish confirmed facts from unverified information;
- see what has not yet been completed; and
- generate a handover or incident summary.

## 2. STAGE 1: INITIAL RESPONSE

==================================================

Purpose:

Guide the HSE advisor through the first response so immediate risks are addressed, affected people are supported, the scene is controlled and the correct people are notified.

This stage must be short, operational and usable under pressure.

Present one question at a time.

### 2.1 Immediate danger

First ask:

“Is anyone in immediate danger or is the hazard still active?”

Provide the following responses:

- Yes
- No
- Unsure

If Yes or Unsure, prompt the advisor to consider:

- Stop work.
- Do not enter an unsafe area.
- Raise the site emergency response.
- Call emergency services if required.
- Isolate hazardous energy where authorised.
- Establish an exclusion zone.
- Evacuate people from danger.
- Prevent further exposure.
- Arrange first aid or medical assistance.
- Notify the site or project manager.
- Preserve safe access for emergency responders.

The app must not tell the advisor that a scene is safe.

Require the advisor to record:

- hazard status;
- people remaining at risk;
- immediate controls applied;
- person responsible for each control;
- time each action was initiated;
- whether each action has been verified; and
- any remaining uncontrolled exposure.

Show a red warning while immediate danger remains active or unknown.

### 2.2 People affected

Ask:

- Is anyone injured?
- Has anyone been exposed or potentially exposed?
- Is anyone missing or unaccounted for?
- Are members of the public involved?
- Are contractors involved?
- Has first aid been provided?
- Has an ambulance or medical review been arranged?
- Has the person’s supervisor been notified?

For each affected person, initially capture only:

- name or temporary identifier;
- employer;
- contact details if required;
- injury, symptom or suspected exposure;
- location;
- current condition;
- first aid provided;
- emergency or medical assistance arranged;
- current location, such as scene, first aid room or hospital; and
- person supporting them.

Do not require detailed injury classification during the immediate response.

Protect health information from general incident access.

### 2.3 Scene control

Guide the advisor to consider:

- Has work stopped?
- Is the hazard isolated?
- Has an exclusion zone been established?
- Is plant or equipment secure?
- Is the area safe for authorised responders to enter?
- Could conditions deteriorate?
- Is gas, dust, heat, electrical energy, stored energy or structural instability involved?
- Does monitoring need to continue?
- Could evidence be lost or disturbed?
- Has the scene been altered to rescue or protect someone?

Allow answers:

- Yes
- No
- Unsure
- Not applicable

Every “No” or “Unsure” answer must create a visible item requiring attention.

### 2.4 Notifications and escalation

Prompt the advisor to notify or consider notifying:

- emergency services;
- site or project manager;
- relevant supervisor;
- HSE manager;
- client representative;
- principal contractor or asset owner;
- injury management;
- senior management;

The app must not make the final statutory notification decision.

Instead it must display:

“This incident may require formal notification. Notify the Manager HSE ASAP.

For each notification record:

- recipient;
- organisation;
- reason;
- person responsible;
- time due;
- time completed;
- method;
- information provided; and
- follow-up required.

### 2.5 Initial response checklist

Before allowing Stage 1 to be marked complete, show:

- Immediate danger controlled or clearly recorded as ongoing
- People accounted for
- First aid or medical assistance addressed
- Scene controlled
- Further exposure prevented
- Required initial escalation completed
- Evidence preservation commenced
- Incident response lead identified
- Next operational decision identified

Do not block the advisor from moving to Stage 2 if an item remains open.

Instead, carry the open item forward and keep it visible.

### 2.6 Stage 1 output

Generate a concise initial response brief containing:

- what occurred;
- current situation;
- people affected;
- immediate controls;
- remaining risks;
- notifications completed;
- assistance required;
- next actions; and
- information not yet confirmed.

All content must be marked either:

- Confirmed
- Reported but unverified
- Unknown

## 3. STAGE 2: INFORMATION CAPTURE

==================================================

Purpose:

Help the advisor capture a reliable factual record after immediate danger has been addressed.

The app must guide the advisor without overwhelming them with one large form.

Organise this stage into:

- Incident details
- People
- Work being undertaken
- Scene and conditions
- Equipment and materials
- Documents
- Witnesses
- Photographs and evidence
- Timeline
- Preliminary classification

### 3.1 Incident details

Capture:

- event date;
- event time;
- discovery time if different;
- site;
- project;
- job number or workgroup;
- exact location;
- client;
- principal contractor where relevant;
- employer of affected person;
- person reporting;
- HSE advisor;
- site manager;
- brief factual description; and
- current incident status.

Provide voice dictation for the description.

Prompt the advisor to describe:

- what was happening;
- what occurred;
- what the immediate outcome was; and
- what happened next.

Instruct the advisor not to include suspected causes in the factual event description.

### 3.2 Planned work and work as performed

Ask:

- What task was planned?
- What work was actually being performed?
- Who directed or supervised the work?
- What method was intended?
- Were conditions different from what was planned?
- Did the task or work environment change?
- Was the change recognised?
- Was the risk assessment reviewed?
- Was work stopped or reassessed?

Allow the advisor to attach:

- SWMS;
- permit;
- Take 5 or task risk assessment;
- lift plan;
- isolation plan;
- scaffold documentation;
- work instruction;
- procedure;
- drawing; and
- pre-start or toolbox record.

Do not assume that the existence of a document proves the control was implemented.

### 3.3 Scene and environmental conditions

Capture relevant conditions such as:

- lighting;
- weather;
- heat;
- wind;
- noise;
- dust;
- gas or vapour;
- visibility;
- access;
- housekeeping;
- congestion;
- simultaneous operations;
- shift and time of day;
- unusual plant conditions; and
- recent changes.

Allow the advisor to mark each item:

- Relevant
- Not relevant
- Unknown

### 3.4 Critical risks and controls

Allow the advisor to provide information on critical risk assement.

For each applicable critical risk, show the approved critical controls and ask:

- Was the control required?
- Was it present?
- Was it correctly implemented?
- Was it verified?
- Was it maintained during the task?
- Was it bypassed or defeated?
- Did the conditions change?
- What evidence supports the answer?

Use:

- Effective
- Present but ineffective
- Partially implemented
- Absent
- Bypassed
- Degraded
- Not applicable
- Unable to determine

The app must not treat a signed document as proof that a physical control was effective.

### 3.5 Witnesses

Capture:

- witness name;
- employer;
- role;
- contact details;
- where the witness was located;
- what they may have seen or heard;
- whether an interview has been completed; and
- whether a written statement is required.

Do not ask the advisor to assess witness credibility.

Keep witness accounts separate from confirmed facts.

### 3.6 Evidence capture

Support:

- witness Statements;
- photographs;
- video;
- audio;
- documents;
- monitoring records;
- equipment details;
- tags and labels;
- screenshots;
- permits;
- risk assessments;
- training records;
- inspection records;
- CCTV references; and
- physical evidence references.

For every item record:

- evidence number;
- description;
- date and time captured;
- who captured it;
- original source;
- location;
- relevance;
- related issue;
- access restriction; and
- whether the original has been preserved.

Never overwrite the original evidence file.

Annotations must create a separate copy.

### 3.7 Photographic guidance

When taking photographs, prompt the advisor to capture:

- Overall scene
- Approach to the scene
- Location of people
- Equipment position
- Relevant controls
- Failed, missing or altered controls
- Identifying labels or serial numbers
- Environmental conditions
- Damage
- Measurements or scale where needed

Allow the advisor to add a voice caption immediately after each photograph.

### 3.8 Timeline

Build a time-ordered chronology from:

- advisor entries;
- witness information;
- phone calls;
- notifications;
- photographs;
- actions;
- emergency response;
- medical response; and
- uploaded documents.

Each entry must be categorised as:

- Confirmed fact
- Witness account
- Reported information
- Assumption
- Decision
- Action
- Communication

Original entries must remain visible if corrected.

A correction must create a new, linked entry.

### 3.9 Preliminary classification

Guide the advisor through:

- event type;
- event subtype;
- actual consequence;
- potential consequence;
- injury or exposure category;
- applicable critical risk;
- applicable risk statement;
- HIPO consideration;
- Cardinal Rule consideration;
- environmental impact;
- public impact; and
- likely investigation level.

The app may suggest a classification, but it must show:

- information used;
- information missing;
- applicable Downer rule;
- why the suggestion was made; and
- who must confirm it.

Final classification requires an authorised person.

### 3.10 Information completeness review

Before entering Stage 3, show:

- Confirmed information
- Unverified information
- Missing information
- Conflicting information
- Evidence still required
- Interviews still required
- Classification decisions outstanding
- Notification decisions outstanding
- Immediate actions still open

Allow the advisor to continue even if information is incomplete, but carry all gaps into the investigation plan.

==================================================

## 4. STAGE 3: INVESTIGATION

Purpose:

Guide the advisor through a proportionate, evidence-based investigation using investigation methodology.

The app must scale the investigation according to the approved process. It must not force a minor event through the same workflow as a serious or high-potential event.

Use these sections:

- Investigation plan
- Evidence review
- Interviews
- Event sequence
- Task as planned versus task as performed
- Control analysis
- Findings
- Contributing factors
- Actions
- Review and approval

### 4.1 Investigation plan

Prompt the advisor to define:

- investigation scope;
- investigation objectives;
- investigation lead;
- investigation team;
- required level or methodology;
- people to interview;
- evidence to obtain;
- technical expertise required;
- client involvement;
- legal or regulatory involvement;
- due date;
- review authority; and
- approval authority.

Generate an investigation task list.

### 4.2 Evidence review

Display an evidence board showing:

- evidence obtained;
- evidence requested;
- evidence unavailable;
- evidence requiring verification;
- contradictory evidence; and
- sensitive or restricted evidence.

For each investigation question, allow evidence items to be linked directly.

No conclusion should be recorded without an evidence link or an explicit statement that evidence is unavailable.

### 4.3 Interviews

For each interview, guide the advisor through:

- person’s role;
- relationship to the event;
- location at the time;
- work being performed;
- what they saw or heard;
- actions they took;
- instructions they received;
- controls they expected;
- controls they observed;
- changes they noticed;
- anything unusual; and
- documents or evidence they can identify.

The app may suggest follow-up questions based on information gaps.

It must not:

- determine whether a witness is truthful;
- infer a person’s motive;
- score credibility;
- label a person deceptive; or
- replace the witness’s words with an AI summary.

Keep the original interview notes or recording.

Clearly label any generated summary as Draft.

### 4.4 Event sequence

Help the advisor construct:

- conditions before the event;
- planning and preparation;
- work commencement;
- relevant changes;
- sequence immediately before the event;
- the event;
- immediate response;
- subsequent response; and
- current status.

Display gaps and conflicts in the sequence.

Allow multiple possible sequences to remain open until evidence resolves them.

### 4.5 Task as planned versus task as performed

Create a side-by-side comparison:

Task as planned:

* approved method;
* required people;
* required competency;
* equipment;
* permit;
* risk assessment;
* critical controls;
* supervision;
* expected environmental conditions.

Task as performed:

* actual method;
* people present;
* actual competency;
* equipment used;
* permit conditions;
* actual controls;
* supervision present;
* actual conditions;
* changes or deviations.

Highlight differences without automatically treating every difference as a cause.

### 4.6 Control analysis

For each relevant control, capture:

- control expected;
- source requirement;
- whether required;
- whether present;
- whether implemented correctly;
- whether verified;
- whether maintained;
- whether bypassed;
- whether conditions changed;
- why the control did not prevent or reduce the event;
- supporting evidence; and
- remaining uncertainty.

Avoid reducing the analysis to “procedure not followed”.

Prompt consideration of:

- physical controls;
- engineering controls;
- isolation;
- access control;
- planning;
- work design;
- equipment;
- competency;
- supervision;
- communication;
- change management;
- organisational arrangements; and
- assurance.

### 4.7 Findings

Each finding must include:

- finding statement;
- finding type;
- facts relied upon;
- evidence references;
- applicable requirement;
- expected condition;
- actual condition;
- effect on the event;
- uncertainty or limitation;
- reviewer; and
- approval status.

Keep separate:

- Facts
- Observations
- Findings
- Conclusions
- Recommendations

Do not permit unsupported causal language.

Allow:

“Unable to determine from the available evidence.”

### 4.8 Contributing factors

Use ICAM methodology where required.

The app should guide consideration of:

- absent or failed defences;
- individual or team actions;
- task or environmental conditions;
- organisational factors; and
- systemic issues.

Do not automatically assign blame.

Do not infer a psychological state, attitude or intent.

Every contributing factor must link to evidence and an approved investigation category.

### 4.9 Corrective actions

Create actions from approved findings.

Each action must record:

- finding addressed;
- risk or control gap;
- action description;
- temporary or permanent treatment;
- control hierarchy;
- owner;
- due date;
- approver;
- evidence required;
- implementation status;
- completion verification; and
- effectiveness review.

Use these action states:

- Proposed
- Approved
- Assigned
- In progress
- Implemented
- Evidence submitted
- Completion verified
- Effectiveness review due
- Effective
- Ineffective
- Reopened

Do not treat implemented as effective.

Prompt the advisor if an action:

- relies only on retraining;
- relies only on reminding workers;
- repeats an earlier action;
- does not address the finding;
- has no accountable owner;
- has no objective completion evidence; or
- does not include an effectiveness check.

### 4.10 Investigation review

Before submitting the investigation, perform a structured quality check:

- Are the facts supported?
- Are witness accounts clearly identified?
- Are conflicts acknowledged?
- Is the event sequence complete enough?
- Are relevant critical controls assessed?
- Are causes or contributing factors supported by evidence?
- Does each action address an approved finding?
- Are higher-order controls considered?
- Are responsibilities and due dates clear?
- Are notification matters closed or assigned?
- Are limitations stated?
- Does the report avoid unsupported blame?
- Has the correct approval pathway been applied?

Generate a review pack for the nominated reviewer or approver.

==================================================

## 5. ALWAYS-AVAILABLE ADVISOR TOOLS

Include these controls on every incident screen:

- Add note
- Take photo
- Record voice note
- Add action
- Add witness
- View open items
- View timeline
- Generate current summary
- Request support
- Mark information as unverified
- Correct previous entry
- View applicable procedure guidance

The app should always show:

- Current stage
- Current incident status
- Open urgent items
- Last saved time
- Offline or online status
- Synchronisation status
- Next recommended step

==================================================

## 6. TECHNICAL REQUIREMENTS

Build:

- iPhone-first interface;
- React Native and TypeScript application;
- secure authentication placeholder;
- encrypted local incident storage;
- offline operation;
- queued synchronisation;
- photo and document capture;
- voice dictation;
- role-based permissions;
- immutable audit history;
- configurable workflow engine;
- API-ready backend;
- synthetic demonstration data;
- automated tests.

The prototype must not require production access to INX.

Create a mock integration adapter that exports:

- incident details;
- people affected;
- consequence assessment;
- critical risks;
- initial actions;
- evidence index;
- notifications;
- investigation findings; and
- corrective actions.

Show the export status clearly:

- Local only
- Ready for review
- Approved for submission
- Submission pending
- Submitted
- Submission failed

Never display “Submitted” without a confirmed acknowledgement from the receiving system.

==================================================

## 8. INITIAL PROTOTYPE SCREENS

Build these screens first:

- Incident home
- Start incident
- Immediate danger
- People affected
- Immediate controls
- Notification and escalation
- Stage 1 review
- Incident overview
- Incident details
- Work as planned and performed
- Critical risks and controls
- Witnesses
- Evidence capture
- Timeline
- Preliminary classification
- Information completeness
- Investigation plan
- Evidence review
- Interviews
- Event sequence
- Control analysis
- Findings
- Actions
- Investigation review
- Incident summary

## 9. TEST SCENARIOS

==================================================

Use synthetic data to test:

Scenario A: Suspected H2S exposure

* Multiple workers report symptoms.
* Exposure is suspected but not confirmed.
* Medical assessment and gas-monitoring evidence are required.
* Test the difference between reported exposure, confirmed exposure and unknown exposure.

Scenario B: Incomplete scaffold access

* A worker bypasses a locked gate and accesses an incomplete scaffold.
* Missing components create approximately four metres of fall exposure.
* No injury occurs.
* Test access controls, deliberate bypass, fall-risk controls, HIPO review, evidence collection and investigation.

Scenario C: Dropped object

* An object falls from height.
* No one is struck.
* Test primary restraint, secondary retention, exclusion zone, evidence and potential consequence.

Scenario D: Injury classification changes

* First aid is initially provided.
* Further medical treatment and work restrictions occur later.
* Test versioned classification and restricted health information.

==================================================

## 10. ACCEPTANCE CRITERIA

The prototype is complete when:

- An advisor can start an incident in less than 30 seconds.
- Immediate danger is addressed before detailed data entry.
- The app works without network coverage.
- The advisor can complete the initial response using voice and large touch controls.
- Open immediate-response items remain visible.
- The app clearly separates confirmed and unverified information.
- Photos and evidence retain their original files.
- A chronology is generated automatically.
- The advisor is guided through information capture.
- The advisor can create an investigation plan from identified information gaps.
- Findings must link to evidence.
- Actions must link to findings.
- Action implementation and effectiveness are separate.
- AI suggestions are labelled Draft.
- Final classification requires human confirmation.
- Notification decisions require human confirmation.
- The app produces a concise initial brief and structured investigation report.
- All changes are recorded in an audit history.
- All demonstration information is synthetic.

Begin by creating a functional prototype, not just a design document.

Build the three-stage navigation, implement the Stage 1 Initial Response workflow in full, create working Incident Overview and Timeline screens, then scaffold Stages 2 and 3 with functional synthetic data.
