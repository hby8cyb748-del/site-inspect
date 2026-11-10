# Assumptions made while building the Incident Response Advisor

You asked me not to stop and ask questions. These are the decisions I made instead. If any is wrong, it can be changed.

## How it fits into the existing app

1. **The app keeps the name "Site Inspect".** The home screen has two modes, "Site inspection" and "Incident". Site inspection is the default, so the app opens exactly as it does today until you tap "Incident". It remembers the last mode you used.
2. **Incidents are stored in their own database on the phone**, next to the inspections database, not inside it. The inspections database is not altered in any way. This is why an upgrade cannot damage stored inspections, and why you could go back to the old version and still open them.
3. **The same PIN protects both.** Incidents are encrypted with the same key as inspections. There is no separate incident PIN.
4. **"Your name" in Settings is used as the advisor's name** on every incident entry.
5. **The React Native / TypeScript line in the spec was ignored**, as instructed. "API-ready backend" was taken to mean: the logic is separate from the screens, and the sync and INX pieces sit behind a small adapter file that a real connection would replace.
6. **A `package.json` file was added** only so the tests can be run with one command. There is still no build step and nothing to install.

## Wording and behaviour

7. **"Downer" in the spec.** The spec names a company rule set ("applicable Downer rule"). No company rules, classifications or procedures were supplied, and you asked for no real companies, so the app shows "Company classification rule: not loaded in this prototype (placeholder rule PR-CLASS-01)". The critical risk and critical control lists are a generic sample library and say so on screen.
8. **Emergency number.** Defaults to 000, changeable in Settings › Incident settings, with an optional site emergency number.
9. **The start screen has no compulsory fields.** Every one of the five questions can be left blank so an incident can be started in seconds. Blank answers show as "Unknown".
10. **Stage 1 "Immediate controls" screen.** The spec lists "Immediate controls" as a screen but describes "Scene control" as the section. They are one step: the scene control questions with the list of immediate controls underneath. The controls list also appears on the Immediate danger screen.
11. **"Require the advisor to record…"** (hazard status, people at risk, controls and so on) is done with open items, not by blocking the screen. The advisor is never stopped mid-response; anything not recorded stays visible as an open item until it is.
12. **"Every No or Unsure answer must create a visible item"** is applied literally to the scene control questions. For the five questions where *Yes* is the worrying answer (for example "Could conditions deteriorate?"), Yes raises an item too. A "No" on those raises a low-priority "confirm it still holds" item.
13. **"Not applicable" was added to the people questions** (the spec lists it only for scene control), because "Has first aid been provided?" has no honest answer when nobody is hurt.
14. **A Yes or No answer is "Reported but unverified" until the advisor taps "I have confirmed this myself".** Unsure and unanswered are "Unknown". This is the cautious reading of "distinguish confirmed facts from unverified information".
15. **Tapping "Notified" creates the notification record** with the current time and your name, so one tap is enough under pressure. The details can be filled in afterwards.
16. **The formal notification decision is recorded, never made.** The app asks who decided and what they decided. It does not check that person's role, because the advisor is recording someone else's decision.
17. **Timeline entries are never edited or deleted.** Records such as people or witnesses can be edited (every change is in the audit history) and can be "withdrawn" with a reason, but not deleted.
18. **Marking information as unverified** adds a linked entry that turns a confirmed fact into reported information. The original stays visible.
19. **A whole incident can be deleted from the phone** (Overview › Delete, typing DELETE). This is for a prototype on a personal phone. A production version would restrict or remove it.
20. **Health information** means: injury or symptoms, current condition, first aid given, medical help arranged, treatment level and work restrictions. It is hidden on screen until "Show health information" is tapped (each viewing is logged), left out of summaries unless deliberately included, never written into the timeline or audit history, replaced with a marker in the INX export, and never sent to AI. It is encrypted with everything else, not separately.
21. **Confirmed exposure needs evidence.** The app refuses "Confirmed" for a person's exposure unless an obtained evidence item (such as a medical assessment or monitoring record) is linked.
22. **Classification suggestion rules are simple and generic**: highest treatment recorded, whether exposure is reported or confirmed, whether a critical risk is involved, whether a control was bypassed. They are stand-ins for the company's real rules.
23. **Investigation levels.** Three levels were assumed: Level 1 local review, Level 2 standard investigation, Level 3 full investigation (ICAM). Sections a level does not need are marked "Not needed at this level" but stay available.
24. **Wording checks are word lists.** The checks for causal language ("caused", "because", "due to"…) and for blame or intent ("careless", "deliberately", "complacent"…) look for words, not meaning. They prompt the advisor; they can miss things and can flag harmless sentences.
25. **Findings are stopped at "Draft"** when they lack evidence or contain unsupported causal or blame wording. You can still type them; they cannot be submitted or approved, and the report marks them as drafts.
26. **Immediate actions skip the approval steps.** Actions added from the toolbar during the response do not need a finding or an approver. Corrective actions do.
27. **"Repeats an earlier action"** is checked only against other actions in the same incident, by comparing wording.
28. **The same person can submit and approve** in this prototype if they switch role. Separation of duties is not enforced because sign-in is a placeholder.

## Placeholders

29. **Sign-in and roles**: you pick a name and a role in Settings › Incident settings. Nothing checks it. Four roles: HSE Advisor, HSE Manager (authorised person), Investigation reviewer/approver, Read only.
30. **Sync**: changes are counted as "queued" and a mock service clears the count when the phone is online. Nothing is sent anywhere.
31. **INX export**: the app builds the export package and walks it through the six statuses against a mock adapter. "Submitted" only appears after the mock returns an acknowledgement. You can share the package as a JSON file.
32. **Procedure guidance**: generic prompts only. No company procedures are loaded.

## AI

33. **AI drafts use the Anthropic key already in Settings** and the same model the inspection report uses. Five drafts exist: handover narrative, brief narrative, report executive summary, interview summary, and follow-up questions.
34. **Names are swapped for record numbers before sending** (P-001, W-002…) and put back afterwards. This only catches names recorded in the name fields; a name typed inside a description is still sent. The screen says so before anything is sent.
35. **Photos and audio are never sent to AI** in incident mode.

## Demo data

36. **All demo names contain "Demo", "Example" or "synthetic"** so they cannot be mistaken for real people, companies or sites. A test checks this.
37. **Demo photos are grey placeholder images** labelled "SYNTHETIC DEMO IMAGE".
