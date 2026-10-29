# Margin: shared contract

Read this before writing code. The extension root is the **repo root**: `manifest.json` lives there and you load the whole repo with "Load unpacked". The popup, dashboard and background worker all share `chrome.storage.local`.

## Type: Day (from `integration/calendar.js → getDay(dateISO, settings)`)

```json
{
  "date": "2026-10-29",
  "timezone": "Europe/Dublin",
  "workday": { "start": "2026-10-29T09:00:00", "end": "2026-10-29T18:00:00" },
  "busy": [{ "start": "2026-10-29T10:00:00", "end": "2026-10-29T11:00:00", "title": "Standup", "source": "ics-url|ics-file|google|sample" }],
  "gaps": [{ "start": "2026-10-29T09:00:00", "end": "2026-10-29T10:00:00", "minutes": 60 }],
  "stats": { "meetingMinutes": 345, "longestBackToBackMinutes": 180, "gapCount": 4 }
}
```
Times are **local ISO strings without offset**. Gaps fall only inside the workday and are sorted.

## Type: Plan (from `planner/planner.js → buildPlan(day, energy, settings)`, then `planner/ideas.js → addIdeas()`)

```json
{
  "date": "2026-10-29",
  "energy": "low|ok|high",
  "breaks": [{ "id": "b1", "kind": "lunch|water|move|breathe|walk|shutdown", "start": "2026-10-29T13:00:00", "minutes": 40, "idea": "40 min: lunch away from the screen", "reason": "First gap after 3h back-to-back" }],
  "warnings": ["3h back-to-back from 10:00 to 13:00"],
  "generatedBy": "rules|claude",
  "source": "sample|ics-url|ics-file|google"
}
```
Every break must sit inside a gap. That's the "never mid-meeting" promise.

## chrome.storage.local keys (all in `shared/storage.js → KEYS`)

| Key | Written by | Value |
|---|---|---|
| `margin.settings` | dashboard Settings (P4) | see `DEFAULT_SETTINGS` in `shared/storage.js` |
| `margin.profile` | dashboard Welcome (P4) | `{ name, createdAt }` |
| `margin.energy` | popup check-in (P1) | `{ date, level }` |
| `margin.day` | background (P2) | `Day` |
| `margin.plan` | background (P2) | `Plan` |
| `margin.nudgeState` | background (P2) | `{ date, <breakId>: "taken|snoozed|skipped" }` |
| `margin.log` | background (P2) | `[{ breakId, kind, minutes, status, at }]` (feeds "time given back") |
| `margin.tomorrow` | dashboard Shutdown (P4) | `{ forDate, items: [..3], savedAt }` |

## Messages to the background worker

| Message | Does |
|---|---|
| `{ type: "margin.refresh" }` | rebuild day → plan → ideas → alarms |
| `{ type: "margin.breakAction", id, action: "take|snooze|skip" }` | update state, status sync, log |
| `{ type: "margin.testNudge", level: 0|1|2 }` | demo: fire badge / notification / dim now |

All replies are `{ ok, result | error }`.
