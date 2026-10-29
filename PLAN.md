# Margin: project plan

**Margin puts the space back in your day.** It's a Chrome extension that reads your real calendar, finds the gaps, and protects them as breaks: lunch, water, a walk, a breather. It never nudges you mid-meeting. When there's no gap at all, it tells you that the calendar is the problem, not you.

- **Brief:** Compression burnout (Claude Code Impact Lab, Dublin). "AI makes each task faster, so we take on more of them. The breaks between tasks go first, then the evenings."
- **Idea from the slide:** *For you: a workload tracker*, extended. It reads your calendar, shows how much you're juggling, and plans the breaks back in.
- **Who it's for:** people whose calendars are back-to-back. Knowledge workers, students, and first-jobbers in Dublin who skip lunch because their day has no gaps.
- **Pitch:** *"Reclaim plans your work. Margin plans your wellbeing around it."*
- **The one rule:** give time back. Margin adds no work. Nudges arrive only in real gaps, the escalation can be switched off, and every minute taken is logged as "time given back".

---

## Features (nothing cut)

| # | Feature | Where | Owner | Baseline in repo | Your TODO |
|---|---|---|---|---|---|
| 1 | Chrome extension popup: next break, today's timeline, take/snooze/skip | `extension/popup.*` | P1 | ✅ works | polish UI, empty states |
| 2 | Break timer with `chrome.alarms` | `extension/background.js` | P2 | ✅ works | edge cases (laptop asleep, past breaks) |
| 3 | Gentle escalation: badge → notification → brief screen dim (opt-out) | `extension/nudge.js` | P1 | ✅ works | nicer dim overlay, sound off, test on real pages |
| 4 | Meeting-aware nudges: never mid-meeting, waits for the gap | `background.js` → `busyAt()` | P2 | ✅ works | test with an overlapping meeting |
| 5 | Real calendar: .ics secret link (Google/Outlook/iCloud) or uploaded .ics | `integration/calendar.js` | P2 | ✅ basic parser | RRULE (recurring), TZID, all-day events |
| 6 | Google Calendar OAuth (direct sign-in) | `integration/google.js` | P2 | ⚙️ code ready | needs Google Cloud OAuth client + `oauth2` in manifest |
| 7 | Busy blocks → gaps + day stats | `calendar.js → buildDay()` | P2 | ✅ works | none |
| 8 | Planner: lunch, water before long blocks, move after them, walk in longest gap, shutdown | `planner/planner.js` | P3 | ✅ works | water every N min inside gaps, smarter lunch, "no gap all day" |
| 9 | Morning energy check-in → lighter plan on low days | popup (P1) + `planner.js` (P3) | P1+P3 | ✅ works | make "low" visibly different (more, shorter breaks) |
| 10 | Claude break ideas that fit the minutes available ("4 min: box breathing") | `planner/ideas.js` | P3 | ✅ works with key, library fallback | tune prompt, cache per day |
| 11 | Weather-aware ideas ("walk outside, it's dry") | `planner/weather.js` | P3 | ✅ Open-Meteo, no key | none |
| 12 | Auto status sync: Slack status + Discord post when a break starts | `integration/status.js` | P2 | ✅ code ready | test with a real token/webhook |
| 13 | Shutdown ritual: tomorrow's top 3 → shown in popup next morning | `dashboard` + popup | P4+P1 | ✅ works | trigger from the shutdown nudge |
| 14 | Low-stimulation / accessibility mode: calm colours, no streaks, big targets | `shared/ui.css` + settings | P4 | ✅ works | keyboard nav check, contrast check |
| 15 | Local profile sign-in (real, saved on device; no fake auth) | `dashboard` #welcome | P4 | ✅ works | none |
| 16 | Dashboard: today timeline, stats, planned breaks | `dashboard` #today | P4 | ✅ works | visual polish |
| 17 | Time given back tracker (7-day chart of breaks actually taken) | `dashboard` #stats | P4 | ✅ works | none |
| 18 | Integrations page with real connection status | `dashboard` #integrations | P4 | ✅ works | none |
| 19 | Team mode: share your lunch slot, post to the team Discord | `dashboard` #team | P4 | ✅ works | "take lunch together" when teammates share times |
| 20 | Sample overloaded day for first run (clearly labelled "sample") | `sample-data/` | P2 | ✅ works | none |
| 21 | Demo helpers: test badge, notification and dim | dashboard → Settings | P4 | ✅ works | none |

Enhancements added beyond the original plan: meeting-aware postponing, weather, time-given-back tracker, Discord, a "the calendar is the problem" warning, demo helpers, and dark mode.

---

## Architecture

There's no server: everything runs inside the extension. Each user's own API keys stay in their browser.

```
 Calendar (.ics link / file / Google OAuth / sample)        integration/calendar.js, google.js   [P2]
        │  getDay(date) → Day {busy, gaps, stats}
        ▼
 Planner rules (+ energy)                                    planner/planner.js                   [P3]
        │  buildPlan(day, energy) → Plan {breaks, warnings}
        ▼
 Claude ideas (+ weather)                                    planner/ideas.js, weather.js         [P3]
        ▼
 background.js: saves margin.day / margin.plan, sets chrome.alarms     extension/background.js     [P2]
        ▼  alarm fires → in a meeting? wait : nudge
 nudge.js: badge → notification → dim                        extension/nudge.js                   [P1]
        ▼  "Take it"
 status.js: Slack/Discord status, log "time given back"      integration/status.js                [P2]

 UI reads chrome.storage:  popup (P1)  ·  dashboard (P4)
```

Data shapes and storage keys are in **`CONTRACT.md`**. Read it before you write code.

## Repo map

```
manifest.json            P2   extension root = repo root (Load unpacked → this folder)
CONTRACT.md              P2   data shapes + storage keys
PLAN.md                  all  this file
README.md                P4   for strangers: what, who, install, use
shared/storage.js        P2   KEYS, get/set, settings defaults
shared/time.js           P2   local-time helpers
shared/ui.css            P4   design tokens, low-stim mode, dark mode
extension/background.js  P2   the glue + alarms + messages
extension/nudge.js       P1   escalation
extension/popup.*        P1   popup UI + energy check-in
integration/calendar.js  P2   ICS parse + gaps
integration/google.js    P2   Google OAuth (stretch)
integration/status.js    P2   Slack + Discord
planner/planner.js       P3   rules
planner/ideas.js         P3   Claude
planner/weather.js       P3   Open-Meteo
dashboard/*              P4   welcome, today, stats, integrations, team, shutdown, settings
sample-data/*            P2   overloaded-day.ics + example JSON
```

---

## Timeline (submit form closes 20:30 sharp)

| Time | Everyone |
|---|---|
| 18:35 | Pull the repo. `chrome://extensions` → Developer mode → **Load unpacked** → repo folder. Check that the sample day shows. |
| 18:40–19:40 | **Build in your own files** (checklists below). Commit and push small, every 15–20 min. |
| 19:40–19:55 | **Integration pass (P2 leads):** real calendar link → plan → nudges → status sync, end to end. |
| 19:55–20:05 | **Feature freeze.** Bug fixes only. |
| 20:05–20:15 | Fresh-clone test on a laptop that hasn't run it yet, following only the README. |
| 20:15 | Repo **public**. P4 submits on slide 16 with all team emails. |

## Checklists

### P1: Extension (popup + nudges)
- [ ] Popup: polish next-break card, timeline, energy check-in (`extension/popup.*`)
- [ ] Empty states: no plan yet, all breaks done, no gaps today
- [ ] Escalation: badge → notification → dim feels gentle; dim auto-fades and is dismissible
- [ ] Shutdown nudge opens `dashboard.html#shutdown`
- [ ] Test on 3 real sites that the dim overlay works

### P2: Integration + data (lead integrator)
- [ ] Push skeleton, share repo, make sure everyone can Load unpacked
- [ ] `calendar.js`: test with your **real** Google secret iCal link; add RRULE + TZID handling
- [ ] Meeting-aware: create a meeting "now" and check the nudge waits
- [ ] `status.js`: real Slack token test, real Discord webhook test
- [ ] Stretch: Google OAuth (`google.js` + `oauth2` in manifest)
- [ ] Run the 19:40 integration pass and own `manifest.json` + `background.js`

### P3: Planner + AI
- [ ] `planner.js`: water every `waterEvery` minutes **inside gaps only**
- [ ] Low energy visibly lighter: more, shorter breaks; flag heavy days
- [ ] "No gap all day" → clear warning + suggest which meeting to shorten
- [ ] `ideas.js`: tune the prompt, keep the 90-char limit, cache ideas per day
- [ ] Test with $100 API credits key (Console → API keys)

### P4: Dashboard + README + submission
- [ ] Dashboard polish: today timeline, stats, integrations, team, shutdown, settings
- [ ] Low-stim mode + keyboard navigation check
- [ ] **README** a stranger can follow (install in 3 steps, connect calendar, add key)
- [ ] Screenshots in `docs/`
- [ ] Submission form text (draft below); collect everyone's Claude account email

---

## Git rules (so integration doesn't break)

1. **Only edit files you own** (see Repo map). Need a change in someone else's file? Ask in the group chat.
2. `git pull --rebase` before every push. Commit small and often.
3. Never commit API keys or tokens. They go in the Settings page, never in code.
4. After pulling, hit **reload** on `chrome://extensions`.
5. Debug the background worker: `chrome://extensions` → Margin → "service worker" → Console.

## How this scores (judge reads README + code + form)

| Criterion | How Margin hits it |
|---|---|
| 30% Takes on the problem | Compression burnout: the breaks between tasks go first. Who it's for is stated. It fits "workload tracker". |
| 30% Actually works | Real calendar (.ics), real Claude call, real alarms and notifications. Sample day clearly labelled. Nothing mocked. |
| 20% Someone would use it | Install in 3 steps, works offline with built-in ideas, useful every workday after tonight. |
| 20% Gives time back | Nudges only in gaps, never mid-meeting. Escalation can be switched off. Tracks minutes given back. |

## Submission form draft

- **Team name:** _TBD_
- **Project name:** Margin
- **Link:** https://github.com/TarannumAhmedNowshin/Margin
- **What it does:** Margin is a Chrome extension for people with back-to-back calendars. It reads your real calendar (Google, Outlook or iCloud .ics), finds the gaps, and plans breaks into them: lunch, water, a walk, a breather, with ideas from Claude that fit the minutes you actually have. It never nudges mid-meeting, sets your Slack status while you're away, and tracks the time it gives back.
