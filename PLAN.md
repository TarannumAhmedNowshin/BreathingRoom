# Breathing Room: team plan

**One site, two pages, one shared day:**
```
web/  (Day overview, React)                     breathing-room/  (Break room, plain JS)
  Import calendar (.ics) ─┐                       Reminders: once, quietly, never mid-meeting
  As booked / With breaks │  localStorage         Energy check-in → lighter plan
  "Start my day" ─────────┼──────────────────▶    Break mode (box breathing)
                          │  breathing-room:v1    Add breaks to my calendar (.ics)
                          └─ planner.js + ics.js ◀ Worth fixing today · Time taken back
```
The dashboard loads the break room's `planner.js` and `ics.js`, so both pages show **the same plan**.

## Run
```bash
npm run setup && npm run dev     # overview at /, break room at /room/
npm test                         # planner + calendar tests
```
Live: GitHub Actions deploys `web/dist` to Pages on every push to `main`.
One-time: repo **Settings → Pages → Source: GitHub Actions**. The repo must be **public**.

## Who owns what
| Area | Files |
|---|---|
| Day overview | `web/src/App.tsx`, `web/src/index.css`, `web/src/plan.ts` |
| Break room | `breathing-room/*` |
| Integration (shared state, build, deploy) | `web/src/room.ts`, `web/vite.config.ts`, `.github/workflows/pages.yml`, `breathing-room/overview-link.js` |
| README + submission | `README.md` |

**Rules:** only edit your own files. Run `git pull --no-rebase` before you push. Never commit keys.

## Timeline
| Time | |
|---|---|
| now–19:55 | Polish only, no new features that could break the flow |
| 19:55 | **Feature freeze** |
| 20:00 | Open the live site on a phone and a laptop that haven't used it before; import `breathing-room/example.ics`; Start my day |
| 20:15 | Repo public, submit on slide 16 |

## Judging checklist
- [x] About compression burnout, says who it's for, fits "workload tracker" (README top)
- [x] Works end to end: import → plan → break room → reminders → .ics export. Nothing mocked: the example day is labelled.
- [x] README a stranger can follow, plus a live site
- [x] Gives time back: one reminder, never mid-meeting, no streaks, counts time taken back

## Submission form draft
- **Project:** Breathing Room
- **Link:** https://tarannumahmednowshin.github.io/Margin/ (repo: https://github.com/TarannumAhmedNowshin/Margin)
- **What it does:** For people whose calendars are back-to-back. Import your calendar and Breathing Room shows where your day has no rest, then plans water, movement, lunch and a shutdown into the real gaps between meetings. It reminds you once, quietly, never mid-meeting, and can put the breaks into your calendar as busy time so nobody books over them. It runs in the browser, with no sign-in, and your calendar never leaves your device.
