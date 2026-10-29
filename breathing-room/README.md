# Breathing Room

**Breaks planned around your real day.** Breathing Room reads your calendar, finds the real gaps between meetings, and puts water breaks, movement, lunch and an end-of-day shutdown into them. When a break comes round it reminds you once, quietly, and never during a meeting.

## The problem: compression burnout

AI tools and back-to-back calendars compress the working day. The gaps that used to give people a breather (walking between rooms, waiting for a build, a slow email) have disappeared. People go from 10:00 to 13:00 without standing up, eat lunch at their desk, and finish the day with no clear stop.

Most wellbeing tools add to the problem: another app to check, another stream of nudges, another streak to maintain. Breathing Room does the opposite. It takes the calendar you already have and protects time for you inside it.

## Who it's for

People whose day is driven by meetings and screens: knowledge workers, team leads, developers, teachers, and anyone who looks up at 15:00 and realises they haven't had a drink of water since 9.

It fits the **"A workload tracker"** idea from the event brief (it shows how much you're juggling and when you last took a break, from your calendar) and goes one step further: it plans the breaks for you.

## What makes it different

Break planners like Reclaim and Clockwise need you to sign in and give them access to your work calendar. Many companies block that. Breathing Room needs none of it:

- **No sign-in and no access to your calendar account.** You export a file, and it never leaves your browser.
- **It shows the pressure, not just the time.** Meetings get darker the longer you go without a rest, so a compressed day looks compressed.
- **As booked / With breaks.** One switch shows your calendar as it is, then with the breaks fitted into the real gaps. No meeting is moved.
- **Breaks go back into your real calendar.** "Add breaks to my calendar (.ics)" downloads today's breaks. Import it into Google Calendar or Outlook and they show as busy, so nobody books over them, and your calendar reminds you.

## How it gives time back

- **No setup work.** Import your calendar once in the morning and the plan is done for you.
- **One reminder per break, then silence.** If you ignore it, it goes away. It never repeats, escalates or nags.
- **Never during meetings.** Breaks are only placed in real gaps, and reminders wait if a meeting runs on.
- **Tells you where the day is broken.** "2h 45m of back-to-back meetings from 10:00. Ask for one to end 5 minutes early." Fixing one meeting gives you a gap every week.
- **A clear stop.** A shutdown slot at the end of the day: write tomorrow's top three and finish.
- **Counts the time you took back.** The "Time you've taken back today" figure only grows when you actually take a break.

## Use it

1. Open the page. You'll see an example day, shown as if it's 12:38 so it always looks like a day in progress, whatever time you open it. Your own calendar always uses the real time.
2. Click **Import calendar (.ics)** and choose an export of your calendar, or add meetings by hand under **Add a meeting**. (Try `example.ics` in this repo to test the import.)
3. Optionally tap your energy level. **Low** gives you more frequent, longer breaks.
4. Leave the tab open. When a break is due, a banner appears at the bottom with **Start break**, **In 10 minutes** or **Skip**. The browser tab title also counts down to your next break.
5. Click **As booked** to see the day squeezed, then **With breaks** to see the breaks fitted in.
6. Click **Add breaks to my calendar (.ics)** to put today's breaks into your real calendar.
7. **Start break** opens a calm full-screen break with a box-breathing guide and a timer. Click **I'm back** when you return.

To see a reminder immediately: **Settings → Preview a reminder in 5 seconds**. Previews are never recorded.

### Getting an .ics file

- **Google Calendar:** Settings → Import & export → Export. Unzip the download and pick your calendar's `.ics` file.
- **Outlook (desktop):** File → Save Calendar, choose today's date range.
- **Outlook (web):** Settings → Calendar → Shared calendars → Publish, open the ICS link and save the file.
- **Apple Calendar:** File → Export → Export…

### Settings

Work hours (default 09:00–17:30), pause reminders for an hour, an optional soft chime, optional desktop notifications, copy today's plan as JSON, and clear all your data.

## Run it

No build step, no dependencies, no server.

- **Locally:** open `index.html` in any modern browser.
- **GitHub Pages:** push this folder to a repo, then Settings → Pages → Deploy from branch → `main` / root. The site is live at `https://<user>.github.io/<repo>/`.
- **Tests:** `node tests/run.js` (needs Node 16+). Tests cover break placement, lunch, warnings, energy levels and calendar parsing.

## Privacy

Everything runs in your browser. The calendar file is read locally and never uploaded. Your plan and progress are saved in your browser's local storage and nowhere else. **Settings → Clear all my data** removes everything.

## How the planner works

`planner.js` is a pure function: `buildPlan(events, { dayStart, dayEnd, energy })`.

1. Merges meetings less than 5 minutes apart into busy blocks.
2. Places a 10-minute **shutdown** at the end of the workday.
3. Places **lunch** (30 min, or 40 on low-energy days) in the best gap between 12:00 and 14:30, falling back to 20 minutes, and warns if there's no gap at all.
4. Places **water** (5 min) and **move** (10 min, 15 on low-energy days) breaks roughly every 90 minutes (60 on low-energy days), only in free gaps.
5. Warns about meeting blocks of 2.5 hours or more, long stretches with no possible break, and days where meetings fill 70% or more of the workday.

## For the rest of the team

The page exposes a small API so a calendar integration or smarter planner can feed it directly:

```js
// Replace today's meetings; the page replans and re-renders.
window.BreathingRoom.setEvents([
  { title: 'Client calls', start: '10:00', end: '13:00' },
]);

// Read today's plan.
window.BreathingRoom.getPlan();
```

Plan format (also available from **Settings → Copy today's plan as JSON**):

```json
{
  "date": "2026-10-29",
  "energy": "low",
  "workday": { "start": "09:00", "end": "17:30" },
  "items": [
    { "start": "10:00", "end": "13:00", "type": "meeting", "title": "Client calls" },
    { "start": "13:00", "end": "13:40", "type": "lunch", "title": "Lunch away from your screen" }
  ]
}
```

`type` is one of `meeting`, `drink`, `move`, `lunch`, `shutdown`.

## Files

| File | What it does |
|---|---|
| `index.html` | Page structure |
| `styles.css` | Styles, light and dark themes |
| `app.js` | State, rendering, reminders, break mode, settings |
| `planner.js` | Plans breaks around meetings (no DOM; runs in Node too) |
| `ics.js` | Reads .ics calendar files (no DOM; runs in Node too) |
| `example.ics` | A sample calendar that works on any day |
| `tests/run.js` | Tests for the planner and calendar import |

## Limitations

- Reminders only appear while the page is open in a tab (the tab title keeps counting down in the background).
- Calendar import supports one-off meetings and daily or weekly repeating meetings, including exceptions and cancellations. Monthly rules and `COUNT` limits on repeats are not yet supported. Times with a time zone are read as local time.
- Data is per browser: your plan on your laptop doesn't appear on your phone.

## What's next

- Live Google Calendar and Outlook connection so there's no export step.
- Set Slack or Discord status to "on a break" automatically when a break starts.
- Optional movement data from a wearable to skip a "move" break when you've already been walking.
