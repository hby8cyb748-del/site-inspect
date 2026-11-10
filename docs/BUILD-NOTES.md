# Build notes: Incident Response Advisor

Written for someone who does not program. It covers what was built, what is a placeholder, what has not been tested, and how to try it on your iPhone without touching the Site Inspect app you use today.

## The short version

- Site Inspect now has two modes on its home screen: **Site inspection** (the app you already have, unchanged) and **Incident** (new).
- Incident mode guides an HSE advisor through three stages: Initial response, Information capture, Investigation.
- Everything was built on a separate branch called `incident-advisor`. **Your live app has not changed.** The `main` branch is exactly as it was.
- It was tested in a desktop browser set to iPhone size. **It has not been run on a real iPhone.** That is the main thing still to do.

## Your current app is protected

| Protection | Status |
|---|---|
| Spec saved in the repo as `docs/incident-spec.md` | Done |
| All work on a branch called `incident-advisor`, nothing on `main` | Done |
| The original app marked so you can always get back to it | Partly — see below |
| Existing inspections survive an upgrade | Tested and passed |
| Existing features still work | Tested and passed |

**About the tag.** You asked for a tag called `site-inspect-v1`. I created it, but GitHub refused to accept a tag from this session (branches were accepted, tags were not). So that you still have a marker on GitHub, I pushed a branch called **`site-inspect-v1-backup`** that points at exactly the same version. To add the real tag yourself, which takes a minute:

1. On GitHub, open the repository and tap **Releases**, then **Create a new release**.
2. Under "Choose a tag", type `site-inspect-v1` and choose **Create new tag**.
3. Set the target to **main**. (Main is still the original version.)
4. Title it "Site Inspect v1" and tap **Publish release**.

**How the upgrade was tested.** I ran the original version, set a PIN, created an inspection with a photo, a typed note and a general note. Then I swapped in the new version at the same address, as an update would. After unlocking with the same PIN, the inspection, photo and notes were all there and opened. I then went *back* to the original version and it still opened everything, and forward again without losing the incident made in between. This works because incidents are kept in their own separate store and the inspections store is not altered.

## What works

All of this was exercised in a browser at iPhone screen size.

**Home and starting**
- Two modes on the home screen. The app opens in Site inspection, as now, until you choose Incident.
- Incident home: Start new incident, Continue active incident, View previous incident, Emergency guidance, offline status, sync status.
- Start incident asks only the five questions. None is compulsory. Then it goes straight to Stage 1.

**Stage 1: Initial response (complete)**
- Immediate danger: Yes / No / Unsure, the eleven "consider" prompts (tap to log one as a control with the time), hazard status, people at risk, controls with person responsible, start time and verified or not, remaining exposure.
- A red warning stays on every screen while danger is active or unknown. The app never says a scene is safe.
- People affected: eight questions one at a time, then a short record per person. Health details are hidden until you choose to show them.
- Scene control: ten questions one at a time. Every No or Unsure becomes a visible open item.
- Notifications: the eight parties, the formal-notification message, a record for each notification, and a place to record who made the notification decision. The app does not make that decision.
- Stage 1 review: the nine-line checklist. Open lines do not block you; they are carried forward and stay visible.
- Initial response brief, with every line marked Confirmed, Reported but unverified, or Unknown.

**On every incident screen**
- A status strip: stage, status, urgent items, last saved, online or offline, sync status, next recommended step.
- A toolbar: Note, Photo, Voice, Action, and More. "More" holds all twelve tools from the spec, including Request support, Mark information as unverified, Correct previous entry and Procedure guidance.

**Overview, timeline, open items, summaries**
- Incident Overview with what needs attention next, the three stages, counts and what is not yet completed.
- Timeline built automatically from everything recorded, in time order, in the seven categories. A correction is a new linked entry; the original stays visible. Conflicts can be flagged and resolved.
- Open items from every stage in one list.
- Handover summary, initial brief and investigation report: view, share as text, or save as a Word document.

**Stage 2: Information capture (all twelve sections)**
- Incident details, people, work being undertaken, scene and conditions, equipment, documents, critical risks and controls, witnesses, photographs and evidence, timeline, preliminary classification, completeness review.
- Evidence: the original file is stored once and never overwritten. Marking up a photo saves a separate copy. Each item has a fingerprint so a change could be detected. A photo guide lists the ten shots to take. A voice caption can be added to any item.
- Classification: the app can suggest one, labelled Draft, showing what it used, what is missing, why, and who must confirm. Each save is a new version; old versions are kept. Only the HSE Manager role can confirm.
- Completeness review: confirmed, unverified, missing, conflicting, evidence required, interviews required, and outstanding decisions. Gaps become investigation tasks.

**Stage 3: Investigation (all ten sections)**
- Scales by level: Level 1 needs four sections, Level 3 needs all ten.
- Investigation plan with a task list created from the information gaps.
- Evidence board, investigation questions, interviews, event sequence (more than one possible sequence can stay open), planned versus performed side by side, control analysis.
- Findings must link to evidence, or state that evidence is unavailable. Unsupported causal wording and wording about blame or intent stop a finding going past Draft.
- Contributing factors must link to evidence and an ICAM category.
- Actions come from approved findings and move through the eleven states. Implemented is shown separately from effective. The app prompts about retraining-only actions, reminders, repeats, missing owner, missing evidence and missing effectiveness check.
- Review: the thirteen-question quality check, a review pack as a Word document, submit, and recorded approval.

**Audit history**
- Every change is recorded with who, when and what. Entries are only ever added, and each is chained to the one before, so a changed or missing entry is detected by "Check the history is intact".

**AI drafts**
- Draft narratives for the handover, brief and report; a draft interview summary; suggested follow-up questions. Always labelled Draft, never applied to the record automatically, nothing sent until you agree. Health details, photos and audio are never sent.

**Demo scenarios**
- Settings › Incident settings › Demo scenarios: A (suspected H2S exposure), B (incomplete scaffold access), C (dropped object), D (injury classification changes). All synthetic and marked "Demo".

**Automated tests**
- 61 tests of the rules, all passing. They cover the timeline, corrections, audit chain, open items, Stage 1 rules, briefs, classification, findings, actions, export status and all four scenarios.

## What is a placeholder

These are clearly labelled "Placeholder" in the app.

| Thing | What it really does |
|---|---|
| **Sign-in and roles** | You choose a name and role in Settings › Incident settings. Nothing checks who you are. Roles do control what the app allows (for example only "HSE Manager" can confirm a classification). |
| **Sync** | Counts changes as "queued" and pretends to send them when online. Nothing leaves the phone. There is no server. |
| **INX export** | Builds the export package and shows the six statuses. A mock stands in for INX. "Submitted" only appears after the mock acknowledges. You can share the package as a file. |
| **Company rules and procedures** | Not loaded. The classification rule, critical risks, critical controls and procedure guidance are generic samples. |
| **Request support** | Records the request and lets you share the text yourself. It does not send anything. |

## What is untested

Be cautious about these until you have tried them.

1. **A real iPhone.** Everything was tested in desktop Chrome at iPhone size. Safari on iPhone behaves differently in places. Not yet checked on a phone: the camera, the microphone, keyboard dictation, the share sheet, Add to Home Screen, working offline, and how the layout feels in the hand.
2. **A real AI call.** The AI draft feature was tested against a simulated reply, not the real service. The first real use needs your Anthropic key and may show an error I have not seen.
3. **Transcribing incident voice notes.** The recording was tested. Turning it into text reuses the inspection transcription, but was not run for incident recordings.
4. **Word documents opened in Word.** The files are built the same way as the inspection report and their structure was checked, but I did not open the incident documents in Word itself.
5. **Large files.** Long videos or very large documents may use more memory than the phone allows. Photos and short recordings are the safe case.
6. **Long, real incidents.** The largest test had about 200 audit entries and 50 timeline entries. A file many times that size has not been tried.
7. **Time zones and clock changes.** Times use the phone's clock and time zone. Not tested across a time-zone change.
8. **The wording checks** (causal and blame language) are word lists. They will miss some things and flag some harmless sentences.

## How to try it on your iPhone without replacing your current app

Your current Site Inspect icon keeps working as it does now. The trial is a **second, separate icon** with its own storage and its own PIN. It starts empty: your real inspections are not in it, and nothing you do in it can reach them.

There are two ways. The first needs only a web browser.

### Way 1: a second copy on GitHub (about ten minutes)

1. In a browser, sign in to GitHub and go to **github.com/new/import**.
2. In "Your source repository details", paste: `https://github.com/hby8cyb748-del/site-inspect`
3. Name the new repository `incident-trial`. Choose **Public**. Tap **Begin import** and wait for it to finish.
4. Open the new `incident-trial` repository. Go to **Settings**, then **Pages**.
5. Under "Build and deployment", set Source to **Deploy from a branch**. Set Branch to **incident-advisor** and the folder to **/ (root)**. Tap **Save**.
6. Wait a minute or two and refresh the page. It shows the address, which will look like `https://hby8cyb748-del.github.io/incident-trial/`
7. On your iPhone, open that address in **Safari**.
8. Tap the **Share** button, then **Add to Home Screen**. Change the name to **Incident trial** so you can tell the two icons apart. Tap **Add**.
9. Open the new icon. Set a PIN (this is a new, separate PIN for the trial).
   - If it asks for your *existing* PIN instead and shows your real inspections, the iPhone is sharing storage between the two icons. That is still safe: this version does not alter stored inspections, and incidents are kept separately. But treat anything you add there as real, and use Way 2 if you want a fully separate trial.
10. Tap **Incident** at the top of the home screen.

### Way 2: a temporary site from a computer

1. On a computer, open the repository on GitHub. Use the branch menu (it says "main") to switch to **incident-advisor**.
2. Tap the green **Code** button, then **Download ZIP**. Unzip it.
3. Go to **app.netlify.com/drop** and drag the unzipped folder onto the page. You will need a free Netlify account to keep the site.
4. It gives you an address. Follow steps 7 to 10 above with that address.

### What to try first

1. **Settings › Incident settings and demo scenarios.** Type your name. Load **Scenario B** and look around a finished example: Overview, Timeline, Stage 3, Summary.
2. Go back to the Incident home and tap **Start new incident**. Time yourself to the first Stage 1 question.
3. Answer "Unsure" to the danger question and watch the red warning and the open items.
4. Take a photo from the toolbar, then **Mark up a copy**. Check the original is unchanged.
5. Put the phone in **Flight mode** and keep working. Then turn it back on.
6. Open **Summary** and save the Word document.
7. In Incident settings, change the role to **HSE Manager** and confirm a classification. Change it back and see that an advisor cannot.
8. If you want on-phone transcription in the trial, download the speech model in Settings first (the trial has its own storage).

### When you are finished with the trial

Delete the trial icon from your Home Screen. You can also delete the `incident-trial` repository. Neither affects your real app.

### Making it the real app later

When you are happy, the `incident-advisor` branch is merged into `main` on GitHub. Your existing Site Inspect icon then updates itself the next time it is opened with a connection (close and reopen it once or twice). Your PIN and your stored inspections carry over; this is the upgrade that was tested. Until that merge happens, your current app does not change.

## Where things are, if someone technical asks

- `js/incident/workflow.js` — every question, list and field, as data. Change wording here.
- `js/incident/model.js` — the rules (timeline, open items, audit, findings, actions). No screens.
- `js/incident/store.js` — encrypted storage for incidents, separate from inspections.
- `js/incident/adapter.js` — the sign-in, sync and INX placeholders. A real connection replaces this file.
- `js/incident/ui-*.js` — the screens.
- `js/incident/demo.js` — the four demo scenarios.
- `tests/` — the automated tests. Run with `npm test` (needs Node.js; nothing to install).
- Changes to the original app: `js/app.js` gained the mode switch and shares its camera, recorder, Word and AI helpers; `js/docx.js` and `js/ai.js` each gained one general-purpose function; `sw.js` lists the new files; `style.css` has the new styles added at the end. The security policy in `index.html` is unchanged.
