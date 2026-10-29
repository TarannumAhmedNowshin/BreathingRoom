/*
 * Breathing Room calendar import
 * Reads an .ics file (Google Calendar, Outlook, Apple Calendar exports) and returns
 * the timed meetings that happen on a given day. Runs entirely in the browser.
 */
(function (root) {
  'use strict';

  const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const pad = (n) => String(n).padStart(2, '0');
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  function unfold(text) {
    return String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  }

  function parseLine(line) {
    const i = line.indexOf(':');
    if (i < 0) return null;
    const [name, ...rawParams] = line.slice(0, i).split(';');
    const params = {};
    for (const p of rawParams) {
      const j = p.indexOf('=');
      if (j > 0) params[p.slice(0, j).toUpperCase()] = p.slice(j + 1);
    }
    return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
  }

  // Times with a trailing Z are UTC; times with TZID or no zone are read as local wall-clock time.
  function parseDate(value) {
    const m = String(value).trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!m) return null;
    const [, y, mo, d, h, mi, s, z] = m;
    if (h === undefined) return { allDay: true, date: new Date(+y, +mo - 1, +d) };
    const date = z
      ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0)))
      : new Date(+y, +mo - 1, +d, +h, +mi, +(s || 0));
    return { allDay: false, date };
  }

  function parseDuration(v) {
    const m = String(v).match(/^-?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if (!m) return 0;
    return (+m[1] || 0) * 10080 + (+m[2] || 0) * 1440 + (+m[3] || 0) * 60 + (+m[4] || 0);
  }

  const unescape = (s) => String(s).replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

  // Supports DAILY and WEEKLY rules with INTERVAL, BYDAY and UNTIL (the common cases for meetings).
  function occursOn(ev, day) {
    const start = ev.start.date;
    if (sameDay(start, day)) return true;
    if (!ev.rrule) return false;
    const d0 = midnight(start), d1 = midnight(day);
    if (d1 < d0) return false;
    const r = {};
    ev.rrule.split(';').forEach((x) => { const [k, v] = x.split('='); r[k.toUpperCase()] = v; });
    if (r.UNTIL) {
      const u = parseDate(r.UNTIL);
      if (u && midnight(u.date) < d1) return false;
    }
    const interval = Math.max(1, +(r.INTERVAL || 1));
    const byday = r.BYDAY ? r.BYDAY.split(',').map((x) => x.replace(/^[+-]?\d+/, '')) : null;
    const dow = DAYS[day.getDay()];
    const daysBetween = Math.round((d1 - d0) / 86400000);
    if (r.FREQ === 'DAILY') return daysBetween % interval === 0 && (!byday || byday.includes(dow));
    if (r.FREQ === 'WEEKLY') {
      const weekStart = new Date(d0); weekStart.setDate(d0.getDate() - d0.getDay());
      const weeks = Math.floor(Math.round((d1 - weekStart) / 86400000) / 7);
      if (weeks % interval !== 0) return false;
      return byday ? byday.includes(dow) : start.getDay() === day.getDay();
    }
    return false;
  }

  /**
   * parse(text, day) -> { events: [{ title, start, end }], total, skippedAllDay }
   */
  function parse(text, day) {
    day = day || new Date();
    const raw = [];
    let cur = null;
    for (const line of unfold(text)) {
      if (line === 'BEGIN:VEVENT') { cur = { exdates: [] }; continue; }
      if (line === 'END:VEVENT') { if (cur) raw.push(cur); cur = null; continue; }
      if (!cur) continue;
      const p = parseLine(line);
      if (!p) continue;
      switch (p.name) {
        case 'SUMMARY': cur.title = unescape(p.value); break;
        case 'DTSTART': cur.start = parseDate(p.value); break;
        case 'DTEND': cur.end = parseDate(p.value); break;
        case 'DURATION': cur.duration = parseDuration(p.value); break;
        case 'RRULE': cur.rrule = p.value; break;
        case 'EXDATE': p.value.split(',').forEach((v) => { const d = parseDate(v); if (d) cur.exdates.push(d.date); }); break;
        case 'RECURRENCE-ID': cur.recurrenceId = parseDate(p.value); break;
        case 'UID': cur.uid = p.value; break;
        case 'STATUS': cur.status = p.value.toUpperCase(); break;
        case 'TRANSP': cur.transp = p.value.toUpperCase(); break;
      }
    }

    // Moved or edited single occurrences replace the repeating meeting on that day.
    const overridden = new Set(
      raw.filter((e) => e.recurrenceId && e.uid && sameDay(e.recurrenceId.date, day)).map((e) => e.uid)
    );

    const events = [];
    const seen = new Set();
    let skippedAllDay = 0;
    for (const e of raw) {
      if (!e.start || e.status === 'CANCELLED' || e.transp === 'TRANSPARENT') continue;
      if (e.start.allDay) { if (occursOn(e, day)) skippedAllDay++; continue; }
      if (!e.recurrenceId && e.uid && overridden.has(e.uid) && !sameDay(e.start.date, day)) continue;
      if (!occursOn(e, day)) continue;
      if (e.exdates.some((x) => sameDay(x, day))) continue;

      const durMin = e.end
        ? Math.round((e.end.date - e.start.date) / 60000)
        : (e.duration || 30);
      if (durMin <= 0) continue;
      const sMin = e.start.date.getHours() * 60 + e.start.date.getMinutes();
      const eMin = Math.min(sMin + durMin, 23 * 60 + 59);
      if (eMin <= sMin) continue;
      const ev = {
        title: e.title || 'Busy',
        start: pad(Math.floor(sMin / 60)) + ':' + pad(sMin % 60),
        end: pad(Math.floor(eMin / 60)) + ':' + pad(eMin % 60),
      };
      const key = ev.title + ev.start + ev.end;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(ev);
    }
    events.sort((a, b) => a.start.localeCompare(b.start));
    return { events, total: raw.length, skippedAllDay };
  }

  const api = { parse, parseDate, occursOn };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ICS = api;
})(typeof window !== 'undefined' ? window : this);
