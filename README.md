# Breathing Room
**Breaks planned around your real day.**

**Live site:** https://tarannumahmednowshin.github.io/Margin/  (no install, no sign-in)

## The problem: compression burnout
AI makes each task faster, so we take on more of them. The breaks between tasks go first, then the evenings. People go from 10:00 to 13:00 without standing up, eat lunch at their desk, and finish the day with no clear stop.

Most wellbeing tools make this worse: another app to check, more nudges, another streak to keep. Breathing Room takes the calendar you already have and protects time for you inside it.

## Who it's for
People whose day is run by meetings and screens: knowledge workers, team leads, developers, teachers, students and first-jobbers. In other words, anyone who looks up at 15:00 and realises they haven't had water since 9.

It fits the event's **"A workload tracker"** idea. It shows how much you're juggling from your calendar, then goes one step further and plans the breaks for you.

## How it works
1. **See your day as booked.** Import your calendar (`.ics`). The overview shows every stretch with no rest in it, for example *"Your day has no breathing room from 10:00 to 13:00."*
2. **Switch to "With breaks".** Water, movement, lunch and an end-of-day shutdown are placed only in the real gaps between meetings, never on top of one.
3. **Start my day.** The break room reminds you **once, quietly**, when each break comes round, and waits if a meeting runs over. *Start break* opens a calm full-screen break with a box-breathing guide.
4. **Optional: break ideas by Claude.** Paste your Claude API key and Claude rewrites each break idea to fit the exact minutes you have, your energy and the Dublin weather. The break room's reminders use the same ideas. The key stays in your browser, and the built-in ideas work without it.
5. **Put the breaks in your calendar.** One click downloads them as an `.ics` file. They show as busy, so nobody books over them, and your own calendar reminds you, with no app to keep open.

## How it gives time back
- **No setup.** Import once in the morning and the plan is made for you.
- **One reminder per break, then silence.** It never repeats, escalates or nags.
- **Never during meetings.** Breaks go only into real gaps.
- **Shows where the day is broken.** For example: *"2h 45m back-to-back from 10:00. Ask for one meeting to end 5 minutes early."* Fixing one recurring meeting gives you a gap every week.
- **A clear stop.** A shutdown slot at the end of the day: write tomorrow's top three, then close the laptop.
- **Counts the time you took back.** The figure grows only when you actually take a break.

## Use it
Open the live site, or run it locally:

```bash
git clone https://github.com/TarannumAhmedNowshin/Margin.git
cd Margin
npm run setup     # installs the dashboard (Node 20+)
npm run dev       # open the URL it prints
npm test          # planner + calendar tests, plus 5 real-world day scenarios
```

The break room on its own needs no build: open `breathing-room/index.html` in any browser.

### Getting your calendar as an .ics file
- **Google Calendar:** Settings → Import & export → Export. Unzip it and pick your calendar's `.ics` file.
- **Outlook (web):** Settings → Calendar → Shared calendars → Publish. Open the ICS link and save the file.
- **Outlook (desktop):** File → Save Calendar.
- **Apple Calendar:** File → Export.

No calendar to hand? Use `breathing-room/example.ics`, which works on any day.

## Project structure
| Path | What |
|---|---|
| `web/` | Day overview (React + Vite): "As booked / With breaks", calendar import, *Start my day* |
| `web/src/ideas.ts` | Claude-written break ideas (Claude Opus 5.5, weather from Open-Meteo), cached per day |
| `web/src/room.ts` | Connects the overview to the break room. They share one calendar and plan in the browser. |
| `breathing-room/` | Break room (plain HTML/JS): reminders, energy check-in, break mode, add breaks to your calendar, settings |
| `breathing-room/planner.js` | Plans breaks around meetings (pure function, tested) |
| `breathing-room/ics.js` | Reads `.ics` files: repeating meetings, exceptions, cancellations |
| `breathing-room/tests/` | `npm test`: planner and calendar tests, plus scenario days (meeting marathon, squeezed lunch, double-booked…) |
| `calendar-proxy/` | Small serverless function that fetches a live iCal link, since calendar servers block browsers from reading them directly |
| `.github/workflows/pages.yml` | Tests, builds and deploys the live site on every push |

The build serves the break room at `/room/` beside the overview, so it's one site with shared local storage.

## Privacy
Everything runs in your browser. Your calendar file is read locally and never uploaded. There's no sign-in, no server, and no access to your calendar account. Settings → *Clear all my data* removes everything.

## What's next
- Live Google Calendar and Outlook connection, so there's no export step.
- Set Slack or Discord status to "on a break" when a break starts.

Built in three hours at the **Claude Code Impact Lab, Dublin** (29 Oct 2026), for the compression burnout brief.
