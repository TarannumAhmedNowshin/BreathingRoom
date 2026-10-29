# Breathing Room
[![Tests and deploy](https://github.com/TarannumAhmedNowshin/BreathingRoom/actions/workflows/pages.yml/badge.svg)](https://github.com/TarannumAhmedNowshin/BreathingRoom/actions/workflows/pages.yml)

**Breaks planned around your real day. A response to compression burnout.**

**Live:** https://tarannumahmednowshin.github.io/BreathingRoom/ (no install, no sign-in, no server holding your data)

> **Try it in 30 seconds:** download the [example calendar](https://tarannumahmednowshin.github.io/BreathingRoom/room/example.ics), which works on any day. Open the live site, click **Import your calendar (.ics)**, switch to **With breaks**, then **Start my day**.

---

## The problem
AI makes each task faster, so we take on more of them. The first thing to go is the gap *between* tasks, then the lunch break, then the evening. That's **compression burnout**: a calendar that looks productive and a person running from 10:00 to 13:00 without standing up.

Most wellbeing tools add to the load: another app, another stream of nudges, another streak. Breathing Room works the other way. It reads the calendar you already have and gives time back inside it.

**Who it's for:** people whose day is run by meetings and screens. Knowledge workers, team leads, developers, teachers, students and first-jobbers.
**Brief fit:** the *"A workload tracker"* idea, extended. It doesn't just show the load, it plans the recovery and helps you fix the cause.

## What it does
| | |
|---|---|
| **See the day as booked** | Imports your calendar (`.ics` file or a live iCal link that refreshes every 15 min) and flags every stretch with no rest, e.g. *"Your day has no breathing room from 10:00 to 13:00."* |
| **Plan breaks into real gaps** | Water, movement, lunch and an end-of-day shutdown, placed **only** between meetings, never on top of one. Back-to-back invites, overlaps and repeating meetings are handled. |
| **Adapts to how you feel** | A one-tap mood/energy check-in. Low energy means longer, more frequent breaks. Claude can plan your free time around today's mood. |
| **Fix the day** | For each stretch with no gap, it names the meeting to shorten and **drafts the request to the organiser** with AI (Gemini, with a built-in fallback). One shorter recurring meeting gives a break back every week. |
| **One quiet reminder** | The break room reminds you **once** per break, waits if a meeting overruns, and opens a calm full-screen break with a box-breathing guide. It doesn't nag, escalate or keep streaks. |
| **Breaks in your calendar** | One click exports the breaks as busy events, with reminders on your phone and watch, so nobody books over them and no tab needs to stay open. |
| **Counts time given back** | *"You've taken 2 breaks today: 35 min back."* It only counts breaks you actually took. |

## Why it gives time back (the one rule)
- **No setup work:** import once and the plan is done.
- **Fewer interruptions:** one reminder per break, never mid-meeting, pausable.
- **It fixes the cause, not just the symptom:** "Fix the day" removes the back-to-back stretch at its source.
- **The saved time goes back to the person:** it becomes rest that's tracked, not more work.

## Architecture
```
            ┌───────────────────────── one static site (GitHub Pages) ─────────────────────────┐
            │                                                                                   │
 .ics file ─┤   web/  Day overview (React + TypeScript + Vite)        breathing-room/  Break room │
 iCal link ─┼─▶ calendar-proxy (Vercel fn) ─▶ import ─▶ plan ─────────▶ reminders · break mode  │
            │        As booked / With breaks · Fix the day · mood        calendar export (.ics)   │
            │                       │                                         │                   │
            │                       └──────── shared localStorage state ──────┘                   │
            │                         planner.js + ics.js (one planner, one truth)               │
            └───────────────────────────────────────────────────────────────────────────────────┘
                     optional AI: Claude (break ideas, free-time plan) · Gemini (meeting requests)
```
- **One planner, one source of truth.** The overview loads the break room's pure, tested `planner.js` and `ics.js`, so both pages always show the same plan.
- **Local-first.** All state lives in the browser. The only network calls are the optional iCal fetch, which goes through a stateless proxy that stores and logs nothing, and the optional AI calls.
- **Graceful degradation.** Every AI feature has a built-in fallback. With no keys at all, the full product still works.

## Run locally
```bash
git clone https://github.com/TarannumAhmedNowshin/BreathingRoom.git
cd BreathingRoom
npm run setup        # installs the overview (Node 20+)
npm run dev          # overview at /, break room at /room/
npm test             # planner + calendar tests and 5 real-world day scenarios
```
**Optional AI keys:** copy `web/.env.example` to `web/.env.local`:
```
VITE_ANTHROPIC_API_KEY=   # Claude: break ideas and free-time plan (local dev; on the live site users paste their own)
VITE_GEMINI_API_KEY=      # Gemini: "Fix the day" meeting requests
```
`.env.local` is git-ignored. For the live site, `GEMINI_API_KEY` is supplied as a GitHub Actions secret at build time.

## Quality
- **Tests on every push.** Planner rules, calendar parsing (weekly rules, exceptions, cancellations, folded lines), and five scenario days: a meeting marathon, a squeezed lunch, a late shift, double-booked invites, and a deep-work day. All assert that **no break ever lands inside a meeting**.
- **CI/CD.** GitHub Actions runs the tests, builds, and deploys to Pages (`.github/workflows/pages.yml`).
- **Accessible.** Keyboard navigable, ARIA live regions, light and dark themes, phone-width layout with no horizontal scroll.

## Repository
| Path | Purpose |
|---|---|
| `web/` | Day overview: React + TypeScript + Vite |
| `web/src/room.ts` | Bridge to the break room's shared state and planner |
| `web/src/ideas.ts` · `web/src/gemini.ts` | Claude ideas and free-time plan · Gemini meeting requests |
| `breathing-room/` | Break room: no-build HTML/JS, also runs standalone |
| `breathing-room/planner.js` · `ics.js` | Pure planner and calendar reader, used by both pages |
| `breathing-room/tests/` | `npm test` |
| `calendar-proxy/` | Stateless serverless iCal fetcher (calendar servers block direct browser reads) |

## Privacy
There's no account and no database. Your calendar is read in your browser and never stored on a server. **Settings → Clear all my data** removes everything.

## What's next
Native Google and Outlook OAuth (no export step), Slack and Teams status while you're on a break, and team mode: protected shared lunch slots.

---
Built in three hours at the **Claude Code Impact Lab, Dublin** (29 Oct 2026), compression burnout brief. MIT licensed.
