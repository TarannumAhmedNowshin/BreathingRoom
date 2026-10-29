// Run: node --test tests/   (Node 18+). Pure functions only, no Chrome needed.
// Times are compared in Europe/Dublin: run with TZ=Europe/Dublin (npm test does this).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eventsForDate, buildDay, busyAt } from "../integration/calendar.js";
import { buildPlan } from "../planner/planner.js";

const tricky = readFileSync(new URL("../sample-data/tricky.ics", import.meta.url), "utf8");
const sample = readFileSync(new URL("../sample-data/overloaded-day.ics", import.meta.url), "utf8");
const settings = { workdayStart: "09:00", workdayEnd: "18:00" };
const fmt = (evs) => evs.map((e) => `${e.start.slice(11, 16)}-${e.end.slice(11, 16)} ${e.title}`);

test("real-world calendar: recurrence, overrides, TZ, cancellations, all-day", () => {
  assert.deepEqual(fmt(eventsForDate(tricky, "2026-10-29")), [
    "10:00-10:15 Daily standup (moved)",        // RECURRENCE-ID override replaces 09:30
    "12:00-13:30 Client review, Q4",            // UTC -> Dublin (GMT after 25 Oct)
    "14:00-14:30 Fortnightly 1:1",              // INTERVAL=2 from 15 Oct
    "15:00-16:30 Workshop",                     // DURATION instead of DTEND
    "16:30-17:15 Last-Thursday all-hands",      // BYDAY=-1TH + Windows TZID
  ]); // cancelled, transparent, all-day and ended COUNT events are excluded
});

test("EXDATE removes one occurrence, weekends excluded", () => {
  assert.deepEqual(fmt(eventsForDate(tricky, "2026-10-30")), []);                 // Fri: standup EXDATE'd
  assert.deepEqual(fmt(eventsForDate(tricky, "2026-10-31")), []);                 // Sat
  assert.deepEqual(fmt(eventsForDate(tricky, "2026-11-02")), ["09:30-09:45 Daily standup"]);
});

test("fortnightly skips the off week, COUNT ends a series", () => {
  assert.ok(!fmt(eventsForDate(tricky, "2026-10-22")).some((e) => e.includes("Fortnightly")));
  assert.ok(fmt(eventsForDate(tricky, "2026-10-05")).some((e) => e.includes("Onboarding")));
  assert.ok(!fmt(eventsForDate(tricky, "2026-10-06")).some((e) => e.includes("Onboarding")));
});

test("summer time: UTC event shifts to IST before 25 Oct", () => {
  const ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nDTSTART:20260715T120000Z\nDTEND:20260715T130000Z\nSUMMARY:x\nEND:VEVENT\nEND:VCALENDAR";
  assert.deepEqual(fmt(eventsForDate(ics, "2026-07-15")), ["13:00-14:00 x"]);
});

test("gaps + stats from the sample overloaded day", () => {
  const day = buildDay("2026-10-29", eventsForDate(sample, "2026-10-29"), settings);
  assert.deepEqual(day.gaps.map((g) => g.minutes), [60, 90, 15, 30]);
  assert.equal(day.stats.longestBackToBackMinutes, 180);
  assert.equal(busyAt(day, "2026-10-29T11:30:00").title, "Client review");
  assert.equal(busyAt(day, "2026-10-29T13:10:00"), null);
});

test("planner never schedules a break inside a meeting", () => {
  for (const text of [sample, tricky]) {
    const day = buildDay("2026-10-29", eventsForDate(text, "2026-10-29"), settings);
    for (const energy of ["low", "ok", "high"]) {
      for (const b of buildPlan(day, energy).breaks) {
        const end = new Date(new Date(b.start).getTime() + b.minutes * 60000);
        const clash = day.busy.find((m) => new Date(m.start) < end && new Date(m.end) > new Date(b.start));
        assert.equal(clash, undefined, `${energy}: ${b.kind} at ${b.start} overlaps ${clash?.title}`);
      }
    }
  }
});

test("a day with no gaps says so", () => {
  const ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nDTSTART:20261029T090000\nDTEND:20261029T180000\nSUMMARY:Offsite\nEND:VEVENT\nEND:VCALENDAR";
  const day = buildDay("2026-10-29", eventsForDate(ics, "2026-10-29"), settings);
  const plan = buildPlan(day, "ok");
  assert.equal(plan.breaks.length, 0);
  assert.ok(plan.warnings.some((w) => /no gap/i.test(w)));
});

test("adapter produces the web dashboard's DayPlan format", async () => {
  const { toWebDayPlan } = await import("../integration/adapters.js");
  const day = buildDay("2026-10-29", eventsForDate(sample, "2026-10-29"), settings);
  const web = toWebDayPlan(day, buildPlan(day, "ok"));
  assert.equal(web.date, "2026-10-29");
  assert.deepEqual(web.busy[0], { start: "10:00", end: "11:00", title: "Standup + sprint planning" });
  for (const p of web.plan) {
    assert.match(p.start, /^\d{2}:\d{2}$/);
    assert.ok(["lunch", "water", "move", "break"].includes(p.type));
  }
});
