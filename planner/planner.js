// OWNER: Person 3 (planner logic + AI)
// buildPlan(day, energy, settings) -> Plan   (shape in CONTRACT.md)
// Baseline rules work end to end now; improve them, don't break the output shape.
import { addMinutes, hhmm, minutesBetween, at } from "../shared/time.js";

const ENERGY = {
  low:  { waterEvery: 60,  lunchMin: 45, walkMin: 20, extraBreathers: true },
  ok:   { waterEvery: 90,  lunchMin: 40, walkMin: 15, extraBreathers: false },
  high: { waterEvery: 120, lunchMin: 30, walkMin: 15, extraBreathers: false },
};

export function buildPlan(day, energyLevel = "ok", settings = {}) {
  const cfg = ENERGY[energyLevel] || ENERGY.ok;
  const breaks = [];
  const warnings = [];
  const gaps = day.gaps.map((g) => ({ ...g, used: 0 }));
  let n = 0;
  const add = (kind, gap, minutes, reason, atEnd = false) => {
    const fit = Math.min(minutes, gap.minutes - gap.used);
    if (fit < 3) return null;
    let start;
    if (atEnd) { start = addMinutes(gap.start, gap.minutes - fit); gap.minutes -= fit; } // e.g. water right before a long block
    else { start = addMinutes(gap.start, gap.used); gap.used += fit; }
    const b = { id: `b${++n}`, kind, start, minutes: fit, idea: "", reason };
    breaks.push(b);
    return b;
  };

  // 1. Lunch: biggest gap overlapping 12:00–14:30
  const lunchWindow = [at(day.date, "12:00"), at(day.date, "14:30")];
  const lunchGap = gaps
    .filter((g) => g.end > lunchWindow[0] && g.start < lunchWindow[1] && g.minutes >= 15)
    .sort((a, b) => b.minutes - a.minutes)[0];
  if (lunchGap) add("lunch", lunchGap, cfg.lunchMin, lunchGap.start >= at(day.date, "13:00") ? "First real gap after a long morning" : "Your lunch window");
  else warnings.push("No gap for lunch between 12:00 and 14:30. Consider moving one meeting.");

  // 2. Before every long back-to-back block (>= 120 min): water + stand up in the gap before it
  for (const b of mergedBlocks(day)) {
    const len = minutesBetween(b.start, b.end);
    if (len >= 120) {
      warnings.push(`${Math.round(len / 60 * 10) / 10}h back-to-back from ${hhmm(b.start)} to ${hhmm(b.end)}`);
      const before = gaps.filter((g) => g.end === b.start)[0];
      if (before) add("water", before, 5, `Next break isn't until ${hhmm(b.end)}`, true);
      const after = gaps.filter((g) => g.start === b.end)[0];
      if (after && after !== lunchGap) add("move", after, 10, `Just finished ${len} minutes of meetings`);
    }
  }

  // 3. Short gaps (<= 20 min): breathing / stretch
  for (const g of gaps) if (g.minutes <= 20 && g.used === 0) add(cfg.extraBreathers ? "breathe" : "move", g, Math.min(5, g.minutes), "Short gap between meetings");

  // 4. Walk in the longest remaining free gap
  const walkGap = gaps.filter((g) => g.minutes - g.used >= cfg.walkMin).sort((a, b) => (b.minutes - b.used) - (a.minutes - a.used))[0];
  if (walkGap) add("walk", walkGap, cfg.walkMin, "Longest free stretch today");

  // 5. Water roughly every N minutes — only inside gaps, never mid-meeting
  // TODO(P3): spread water reminders through gaps at cfg.waterEvery intervals.

  // 6. Shutdown ritual in the last gap of the day
  const last = gaps[gaps.length - 1];
  if (last && last.end === day.workday.end) {
    const g = { ...last, start: addMinutes(last.end, -Math.min(15, last.minutes)), minutes: Math.min(15, last.minutes), used: 0 };
    add("shutdown", g, g.minutes, "End of workday — write tomorrow's top 3 and stop");
  }

  if (day.gaps.length === 0) warnings.push("No gaps at all today. That's the problem, not you.");

  breaks.sort((a, b) => a.start.localeCompare(b.start));
  return { date: day.date, energy: energyLevel, breaks, warnings, generatedBy: "rules" };
}

function mergedBlocks(day) {
  const out = [];
  for (const b of day.busy) {
    const last = out[out.length - 1];
    if (last && b.start <= last.end) last.end = b.end > last.end ? b.end : last.end;
    else out.push({ start: b.start, end: b.end });
  }
  return out;
}
