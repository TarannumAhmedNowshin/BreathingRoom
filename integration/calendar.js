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
    events = eventsOnDate(parseIcs(await res.text()), dateISO);
    source = "ics-url";
  } else if (settings.icsText) {
    events = eventsOnDate(parseIcs(settings.icsText), dateISO);
    source = "ics-file";
  } else if (settings.googleConnected) {
    events = await getGoogleEvents(dateISO);
    source = "google";
  } else if (settings.useSampleData) {
    const text = await (await fetch(chrome.runtime.getURL("sample-data/overloaded-day.ics"))).text();
    // Sample file is dated 2026-10-29; shift it onto today so the demo always shows "today".
    events = eventsOnDate(parseIcs(text), "2026-10-29").map((e) => ({
      ...e,
      start: dateISO + e.start.slice(10),
      end: dateISO + e.end.slice(10),
    }));
    source = "sample";
  }

  return buildDay(dateISO, events.map((e) => ({ ...e, source })), settings);
}

// ---------- ICS parsing ----------
// TODO(P2): handle RRULE (recurring meetings), EXDATE, TZID conversions, all-day events (VALUE=DATE).
export function parseIcs(text) {
  const lines = text.replace(/\r\n[ \t]/g, "").split(/\r?\n/); // unfold folded lines
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") { if (cur?.start && cur?.end) events.push(cur); cur = null; }
    else if (cur) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const name = line.slice(0, idx).split(";")[0];
      const value = line.slice(idx + 1);
      if (name === "DTSTART") cur.start = icsDate(value);
      if (name === "DTEND") cur.end = icsDate(value);
      if (name === "SUMMARY") cur.title = value.replace(/\\,/g, ",");
      if (name === "TRANSP" && value === "TRANSPARENT") cur.free = true;
    }
  }
  return events.filter((e) => !e.free);
}

function icsDate(v) {
  // 20261029T100000Z | 20261029T100000 | 20261029
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00", z] = m;
  if (z) return toLocalISO(new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)));
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

function eventsOnDate(events, dateISO) {
  return events.filter((e) => e.start.slice(0, 10) === dateISO);
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
