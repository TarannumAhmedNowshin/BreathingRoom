// OWNER: Person 2 (integration + data)
// getDay(dateISO, settings) -> Day   (shape in CONTRACT.md)
import { at, minutesBetween, toLocalISO } from "../shared/time.js";
import { getGoogleEvents } from "./google.js";

export async function getDay(dateISO, settings) {
  let events = [];
  let source = "sample";

  if (settings.icsUrl) {
    const res = await fetch(settings.icsUrl);
    if (!res.ok) throw new Error(`Calendar fetch failed: ${res.status}`);
    events = eventsForDate(await res.text(), dateISO);
    source = "ics-url";
  } else if (settings.icsText) {
    events = eventsForDate(settings.icsText, dateISO);
    source = "ics-file";
  } else if (settings.googleConnected) {
    events = await getGoogleEvents(dateISO);
    source = "google";
  } else if (settings.useSampleData) {
    const text = await (await fetch(chrome.runtime.getURL("sample-data/overloaded-day.ics"))).text();
    // Sample file is dated 2026-10-29; shift it onto today so the demo always shows "today".
    events = eventsForDate(text, "2026-10-29").map((e) => ({
      ...e,
      start: dateISO + e.start.slice(10),
      end: dateISO + e.end.slice(10),
    }));
    source = "sample";
  }

  return buildDay(dateISO, events.map((e) => ({ ...e, source })), settings);
}

// ---------- ICS parsing ----------
// Handles: folded lines, UTC / TZID / floating times, all-day events (ignored as busy),
// DURATION, STATUS:CANCELLED, TRANSP:TRANSPARENT, RRULE (DAILY/WEEKLY/MONTHLY/YEARLY with
// INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY), EXDATE, and RECURRENCE-ID overrides.

const WINDOWS_TZ = {
  "GMT Standard Time": "Europe/London", "Greenwich Standard Time": "Atlantic/Reykjavik",
  "W. Europe Standard Time": "Europe/Berlin", "Romance Standard Time": "Europe/Paris",
  "Central Europe Standard Time": "Europe/Budapest", "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago", "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles", "India Standard Time": "Asia/Kolkata",
  "Bangladesh Standard Time": "Asia/Dhaka", "UTC": "UTC",
};

function tzOffsetMinutes(ts, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ts));
  const g = (t) => Number(parts.find((x) => x.type === t).value);
  return (Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - ts) / 60000;
}

// Wall-clock time in a named zone -> absolute Date
function zonedToDate(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = guess - tzOffsetMinutes(guess, tz) * 60000;
  const off2 = tzOffsetMinutes(t, tz);
  t = guess - off2 * 60000;
  return new Date(t);
}

function parseIcsDate(value, params = {}) {
  const m = value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = "00", z] = m;
  if (h === undefined || params.VALUE === "DATE") return { allDay: true, date: new Date(+y, +mo - 1, +d) };
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)) };
  let tz = params.TZID?.replace(/^"|"$/g, "");
  if (tz && WINDOWS_TZ[tz]) tz = WINDOWS_TZ[tz];
  if (tz) {
    try { return { date: zonedToDate(+y, +mo, +d, +h, +mi, +s, tz) }; } catch { /* unknown zone: treat as local */ }
  }
  return { date: new Date(+y, +mo - 1, +d, +h, +mi, +s) }; // floating = local time
}

function parseDuration(v) {
  const m = v.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const [, sign, w = 0, d = 0, h = 0, mi = 0, s = 0] = m;
  return (sign === "-" ? -1 : 1) * (((+w * 7 + +d) * 24 + +h) * 3600 + +mi * 60 + +s) * 1000;
}

function unescapeText(v) {
  return v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");
}

// Raw VEVENT objects
export function parseIcsRaw(text) {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events = [];
  let cur = null, depth = 0;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = { exdates: [] }; depth = 0; continue; }
    if (!cur) continue;
    if (line.startsWith("BEGIN:")) { depth++; continue; }       // e.g. VALARM inside VEVENT
    if (line.startsWith("END:") && line !== "END:VEVENT") { depth--; continue; }
    if (line === "END:VEVENT") { events.push(cur); cur = null; continue; }
    if (depth > 0) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const [name, ...paramParts] = line.slice(0, idx).split(";");
    const params = Object.fromEntries(paramParts.map((p) => p.split("=")).map(([k, v]) => [k.toUpperCase(), v]));
    const value = line.slice(idx + 1);
    switch (name.toUpperCase()) {
      case "UID": cur.uid = value; break;
      case "SUMMARY": cur.title = unescapeText(value); break;
      case "DTSTART": cur.dtstart = parseIcsDate(value, params); break;
      case "DTEND": cur.dtend = parseIcsDate(value, params); break;
      case "DURATION": cur.duration = parseDuration(value); break;
      case "RRULE": cur.rrule = Object.fromEntries(value.split(";").map((p) => p.split("="))); break;
      case "EXDATE": value.split(",").forEach((v) => { const d = parseIcsDate(v, params); if (d) cur.exdates.push(d.date); }); break;
      case "RECURRENCE-ID": cur.recurrenceId = parseIcsDate(value, params); break;
      case "STATUS": cur.status = value.toUpperCase(); break;
      case "TRANSP": cur.transp = value.toUpperCase(); break;
    }
  }
  return events.filter((e) => e.dtstart);
}

// Back-compat: flat list of non-recurring timed events
export function parseIcs(text) {
  return eventsForDateFromRaw(parseIcsRaw(text), null);
}

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 864e5);

function matchesRule(rule, first, day) {
  const interval = Number(rule.INTERVAL || 1);
  const byday = rule.BYDAY ? rule.BYDAY.split(",") : null;
  const diff = daysBetween(first, day);
  if (diff < 0) return false;
  switch (rule.FREQ) {
    case "DAILY":
      if (byday && !byday.some((c) => c.slice(-2) === DAY_CODES[day.getDay()])) return false;
      return diff % interval === 0;
    case "WEEKLY": {
      const codes = byday ? byday.map((c) => c.slice(-2)) : [DAY_CODES[first.getDay()]];
      if (!codes.includes(DAY_CODES[day.getDay()])) return false;
      const wkst = DAY_CODES.indexOf(rule.WKST || "MO");
      const weekStart = (d) => { const s = startOfDay(d); s.setDate(s.getDate() - ((s.getDay() - wkst + 7) % 7)); return s; };
      return Math.round(daysBetween(weekStart(first), weekStart(day)) / 7) % interval === 0;
    }
    case "MONTHLY": {
      const months = (day.getFullYear() - first.getFullYear()) * 12 + day.getMonth() - first.getMonth();
      if (months % interval !== 0) return false;
      if (rule.BYMONTHDAY) return rule.BYMONTHDAY.split(",").map(Number).includes(day.getDate());
      if (byday) {
        return byday.some((c) => {
          const m = c.match(/^([+-]?\d+)?([A-Z]{2})$/);
          if (!m || m[2] !== DAY_CODES[day.getDay()]) return false;
          if (!m[1]) return true;
          const n = Number(m[1]);
          if (n > 0) return Math.ceil(day.getDate() / 7) === n;
          const dim = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
          return Math.ceil((dim - day.getDate() + 1) / 7) === -n;
        });
      }
      return day.getDate() === first.getDate();
    }
    case "YEARLY":
      return (day.getFullYear() - first.getFullYear()) % interval === 0 && day.getMonth() === first.getMonth() && day.getDate() === first.getDate();
  }
  return false;
}

function isOccurrence(ev, day) {
  const first = ev.dtstart.date;
  const rule = ev.rrule;
  if (!matchesRule(rule, first, day)) return false;
  if (rule.UNTIL) {
    const u = parseIcsDate(rule.UNTIL);
    if (u && startOfDay(day) > startOfDay(u.date)) return false;
  }
  if (rule.COUNT) {
    let n = 0;
    for (let d = startOfDay(first); d <= day; d.setDate(d.getDate() + 1)) {
      if (matchesRule(rule, first, d)) n++;
      if (n > Number(rule.COUNT)) return false;
    }
  }
  return true;
}

// Timed busy events overlapping `dateISO` (or all non-recurring timed events when dateISO is null)
function eventsForDateFromRaw(raw, dateISO) {
  const target = dateISO ? new Date(`${dateISO}T00:00:00`) : null;
  const overrides = new Set(raw.filter((e) => e.recurrenceId).map((e) => `${e.uid}|${dayKey(e.recurrenceId.date)}`));
  const out = [];
  for (const ev of raw) {
    if (ev.status === "CANCELLED" || ev.transp === "TRANSPARENT" || ev.dtstart.allDay) continue;
    const durMs = ev.dtend ? ev.dtend.date - ev.dtstart.date : ev.duration || 0;
    if (durMs <= 0) continue;
    let start = ev.dtstart.date;

    if (ev.rrule && !ev.recurrenceId) {
      if (!target) continue;
      // check the target day and the previous day (for occurrences that cross midnight)
      let found = null;
      for (const day of [target, new Date(target.getTime() - 864e5)]) {
        if (!isOccurrence(ev, day)) continue;
        const occ = new Date(day.getFullYear(), day.getMonth(), day.getDate(), start.getHours(), start.getMinutes(), start.getSeconds());
        if (overrides.has(`${ev.uid}|${dayKey(occ)}`)) continue;
        if (ev.exdates.some((x) => dayKey(x) === dayKey(occ))) continue;
        found = occ; break;
      }
      if (!found) continue;
      start = found;
    }
    const end = new Date(start.getTime() + durMs);
    if (target) {
      const dayEnd = new Date(target.getTime() + 864e5);
      if (!(start < dayEnd && end > target)) continue;
    }
    out.push({ start: toLocalISO(start), end: toLocalISO(end), title: ev.title || "Busy" });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

export function eventsForDate(text, dateISO) {
  return eventsForDateFromRaw(parseIcsRaw(text), dateISO);
}

// ---------- busy blocks -> gaps ----------
export function buildDay(dateISO, events, settings) {
  const dayStart = at(dateISO, settings.workdayStart);
  const dayEnd = at(dateISO, settings.workdayEnd);

  const busy = events
    .map((e) => ({ start: e.start < dayStart ? dayStart : e.start, end: e.end > dayEnd ? dayEnd : e.end, title: e.title || "Busy", source: e.source }))
    .filter((e) => e.start < e.end)
    .sort((a, b) => a.start.localeCompare(b.start));

  // merge overlaps to compute gaps + back-to-back stretches
  const merged = [];
  for (const b of busy) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) last.end = b.end > last.end ? b.end : last.end;
    else merged.push({ start: b.start, end: b.end });
  }

  const gaps = [];
  let cursor = dayStart;
  for (const m of merged) {
    if (m.start > cursor) gaps.push({ start: cursor, end: m.start, minutes: minutesBetween(cursor, m.start) });
    if (m.end > cursor) cursor = m.end;
  }
  if (cursor < dayEnd) gaps.push({ start: cursor, end: dayEnd, minutes: minutesBetween(cursor, dayEnd) });

  const meetingMinutes = merged.reduce((s, m) => s + minutesBetween(m.start, m.end), 0);
  const longestBackToBackMinutes = merged.reduce((mx, m) => Math.max(mx, minutesBetween(m.start, m.end)), 0);

  return {
    date: dateISO,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    workday: { start: dayStart, end: dayEnd },
    busy,
    gaps,
    stats: { meetingMinutes, longestBackToBackMinutes, gapCount: gaps.length },
  };
}

// Is someone in a meeting right now? Used so we never nudge mid-meeting.
export function busyAt(day, iso) {
  return day?.busy?.find((b) => b.start <= iso && iso < b.end) || null;
}
