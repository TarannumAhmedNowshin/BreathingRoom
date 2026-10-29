# Margin
*Puts the space back in your day.*

AI makes each task faster, so we take on more of them. The breaks between tasks go first, then the evenings. That's **compression burnout**.

**Margin** is a Chrome extension for people whose calendars are back-to-back: knowledge workers, students, and first-jobbers. It reads your real calendar, finds the gaps, and protects them as breaks: lunch, water, a walk, a breather. **It never nudges you mid-meeting.** When your day has no gaps at all, it says so: the calendar is the problem, not you.

> Built at the Claude Code Impact Lab, Dublin, 29 Oct 2026. Brief: compression burnout. Idea: *workload tracker*.

## Install (2 minutes)

1. Download this repo: **Code → Download ZIP**, then unzip it (or `git clone https://github.com/TarannumAhmedNowshin/Margin`).
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `Margin` folder.
3. A welcome page opens. Enter your name and workday, and you'll see a plan for a sample overloaded day.

## Connect your real calendar

Open the dashboard → **Settings → Calendar link**:

- **Google Calendar:** Settings → your calendar → *Integrate calendar* → copy **Secret address in iCal format**.
- **Outlook:** Settings → Calendar → Shared calendars → Publish → copy the ICS link.
- **Any calendar:** export an `.ics` file and upload it.

## Try it without installing

The break room also runs as a plain website: open `app/index.html`, or the live site at **https://tarannumahmednowshin.github.io/Margin/app/**. Import an `.ics` file, or use the example day.

## Optional

- **Claude API key** (Settings → Claude): break ideas written to fit the exact minutes you have. Without a key, Margin uses its built-in ideas.
- **Slack user token / Discord webhook:** sets "☕ On a break, back at 13:40" when you take a break.
- **Low-stimulation mode:** calm colours, no streaks, larger buttons.

## How it gives time back

- Breaks go **only into real gaps** in your calendar. If a meeting is running, the nudge waits.
- Escalation is gentle (badge → one notification → an optional 8-second screen dim) and can be turned off.
- Every break you take is logged under **Time back**, so you can see where the minutes went.

## Tests

```bash
npm test
```
This needs Node 18+ and nothing else. The tests cover recurring meetings, moved and cancelled instances, time zones, summer time, and that no break is ever planned inside a meeting.

## How it works

See [PLAN.md](PLAN.md) for features and architecture, and [CONTRACT.md](CONTRACT.md) for data shapes. Everything runs locally in your browser: no server, and your keys never leave your machine.

## Team

_P4: add names._
