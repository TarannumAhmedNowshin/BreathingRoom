// OWNER: Person 3 (planner logic + AI)
// buildPlan(day, energy, settings) -> Plan   (shape in CONTRACT.md)
// Every break is carved out of day.gaps, so nothing ever lands mid-meeting.
// Inside this file times are minutes since midnight; breaks go out as local ISO strings.
import { at, hhmm } from "../shared/time.js";

// Low energy: more, shorter breaks and a longer lunch. High energy: fewer breaks.
const ENERGY = {
  low:  { lunch: 45, walk: 15, recover: 10, micro: 5, microKind: "breathe", maxStretch: 75,  longRun: 45, waterFactor: 0.75 },
  ok:   { lunch: 40, walk: 15, recover: 10, micro: 5, microKind: "move",    maxStretch: 120, longRun: 60, waterFactor: 1 },
  high: { lunch: 30, walk: 15, recover: 5,  micro: 5, microKind: "move",    maxStretch: 150, longRun: 90, waterFactor: 1.33 },
};

const LUNCH_FROM = toMin("11:30");
const LUNCH_TO = toMin("14:30");
const LUNCH_IDEAL = toMin("12:30");
const MIN_LUNCH = 15;
const MIN_FIT = 3;          // smallest break worth nudging for
const BACK_TO_BACK = 5;     // meetings closer together than this count as one block
const LONG_BLOCK = 120;     // blocks this long get a warning and water before them
const WATER_LEN = 5;
const WATER_REACH = 45;     // how far a water nudge may move to dodge a meeting
const WATER_COVERED = 30;   // a break this close to a water time takes the water nudge
const REST_KINDS = new Set(["lunch", "move", "breathe", "walk", "shutdown"]);

export function buildPlan(day, energyLevel = "ok", settings = {}) {
  const level = ENERGY[energyLevel] ? energyLevel : "ok";
  const cfg = ENERGY[level];
  const waterEvery = Math.round((settings.waterEveryMinutes || 90) * cfg.waterFactor);
  const dayStart = toMin(hhmm(day.workday.start));
  const dayEnd = toMin(hhmm(day.workday.end));
  const meetings = day.busy.map((b) => ({ s: toMin(hhmm(b.start)), e: toMin(hhmm(b.end)), title: b.title }));
  const blocks = backToBackBlocks(meetings);

  let free = day.gaps.map((g) => [toMin(hhmm(g.start)), toMin(hhmm(g.end))]).filter(([s, e]) => e - s >= MIN_FIT);
  const freeTotal = free.reduce((sum, [s, e]) => sum + e - s, 0);
  const items = [];
  const warnings = [];
  const place = (kind, s, minutes, reason) => {
    const item = { kind, s, e: s + minutes, reason };
    items.push(item);
    free = carve(free, s, s + minutes);
    return item;
  };

  // 1. Shutdown ritual at the end of the workday, if the day ends in a gap.
  const last = free[free.length - 1];
  if (last && last[1] === dayEnd && last[1] - last[0] >= 10) {
    const len = Math.min(15, last[1] - last[0]);
    place("shutdown", dayEnd - len, len, "End of workday: write tomorrow's top 3 and stop");
  }

  // 2. Lunch: the biggest free stretch between 11:30 and 14:30, as close to 12:30 as it fits.
  const lunchSpot = free
    .map(([s, e]) => [Math.max(s, LUNCH_FROM), Math.min(e, LUNCH_TO)])
    .filter(([s, e]) => e - s >= MIN_LUNCH)
    .sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
  if (lunchSpot) {
    const len = Math.min(cfg.lunch, lunchSpot[1] - lunchSpot[0]);
    const s = clamp(LUNCH_IDEAL, lunchSpot[0], lunchSpot[1] - len);
    const before = blocks.find((b) => b.e <= s && s - b.e <= 10 && b.e - b.s >= LONG_BLOCK);
    const reason = len < cfg.lunch ? `Only ${len} min free over lunch today`
      : before ? `First gap after ${duration(before.e - before.s)} back-to-back`
      : "Your lunch window";
    place("lunch", s, len, reason);
  } else {
    const clash = meetings.find((m) => m.s <= LUNCH_IDEAL && LUNCH_IDEAL < m.e) || meetings.find((m) => m.e > LUNCH_FROM && m.s < LUNCH_TO);
    warnings.push(clash
      ? `No gap for lunch between 11:30 and 14:30. Could "${clash.title}" (${fmt(clash.s)}–${fmt(clash.e)}) move or end 15 min early?`
      : "No gap for lunch between 11:30 and 14:30. Consider moving one meeting.");
  }

  // 3. Long meeting blocks: water in the gap before, a stand-up break straight after.
  for (const b of blocks) {
    const len = b.e - b.s;
    if (len >= LONG_BLOCK) {
      warnings.push(`${duration(len)} back-to-back from ${fmt(b.s)} to ${fmt(b.e)}`);
      const gapBefore = free.find(([, fe]) => fe === b.s);
      if (gapBefore && gapBefore[1] - gapBefore[0] >= MIN_FIT) {
        const fit = Math.min(WATER_LEN, gapBefore[1] - gapBefore[0]);
        place("water", b.s - fit, fit, `Next break isn't until ${fmt(b.e)}`);
      }
    }
    if (len < cfg.longRun) continue;
    const gapAfter = free.find(([fs, fe]) => fs >= b.e && fs - b.e <= 10 && fe - fs >= MIN_FIT);
    if (gapAfter) place("move", gapAfter[0], Math.min(cfg.recover, gapAfter[1] - gapAfter[0]), `Just finished ${len} minutes of meetings`);
  }

  // 4. Walk in the middle of the longest free stretch left.
  const longest = [...free].sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
  if (longest && longest[1] - longest[0] >= cfg.walk) {
    place("walk", longest[0] + Math.floor((longest[1] - longest[0] - cfg.walk) / 10) * 5, cfg.walk, "Longest free stretch today");
  }

  // 5. Short breaks wherever too long passes without any break (a water break counts).
  let cursor = dayStart;
  for (;;) {
    const next = items.filter((i) => i.s >= cursor).sort((a, b) => a.s - b.s)[0];
    const limit = next ? next.s : dayEnd;
    if (limit - cursor > cfg.maxStretch) {
      const target = cursor + cfg.maxStretch;
      const s = latestFit(free, cursor + 30, target, cfg.micro) ?? earliestFit(free, target, limit, cfg.micro);
      if (s !== null) {
        place(cfg.microKind, s, cfg.micro, `No break since ${fmt(cursor)}`);
        cursor = s + cfg.micro;
        continue;
      }
    }
    if (!next) break;
    cursor = next.e;
  }

  // 6. Water every N minutes, inside gaps only. A break or walk close by takes the water nudge instead.
  const restNear = (s, e, slack) => items.find((i) => REST_KINDS.has(i.kind) && i.s - slack <= e && s <= i.e + slack);
  for (let t = dayStart + waterEvery; t < dayEnd - 15; t += waterEvery) {
    if (items.some((i) => i.kind === "water" && Math.abs(i.s - t) < waterEvery / 2)) continue;
    const s = nearestFit(free, t, WATER_LEN, WATER_REACH);
    const rest = restNear(t, t, WATER_COVERED) ?? (s !== null ? restNear(s, s + WATER_LEN, 10) : undefined);
    if (rest) {
      if (rest.kind !== "lunch" && rest.kind !== "shutdown") rest.withWater = true;
    } else if (s !== null) {
      place("water", s, WATER_LEN, `Water every ${waterEvery} min, in a gap`);
    }
  }

  // 7. Days that are the problem: almost no free time, or a heavy day on low energy.
  if (freeTotal < 30 && meetings.length) {
    const worst = [...meetings].sort((a, b) => b.e - b.s - (a.e - a.s))[0];
    warnings.push(freeTotal === 0
      ? `No gaps at all today. That's the problem, not you. Ending "${worst.title}" 15 min early would give you a break.`
      : `Only ${freeTotal} min free all day. That's the problem, not you. Ending "${worst.title}" 15 min early would give you a break.`);
  }
  if (level === "low" && day.stats?.meetingMinutes >= 300) {
    warnings.push(`Low energy and ${duration(day.stats.meetingMinutes)} of meetings today. Protect lunch and keep the rest light.`);
  }

  const breaks = items
    .sort((a, b) => a.s - b.s)
    .map((i, n) => ({
      id: `b${n + 1}`,
      kind: i.kind,
      start: at(day.date, fmt(i.s)),
      minutes: i.e - i.s,
      idea: "",
      reason: i.reason,
      ...(i.withWater && { withWater: true }),
    }));
  return { date: day.date, energy: level, breaks, warnings, generatedBy: "rules" };
}

function backToBackBlocks(meetings) {
  const blocks = [];
  for (const m of [...meetings].sort((a, b) => a.s - b.s)) {
    const last = blocks[blocks.length - 1];
    if (last && m.s - last.e < BACK_TO_BACK) last.e = Math.max(last.e, m.e);
    else blocks.push({ s: m.s, e: m.e });
  }
  return blocks;
}

function carve(free, s, e) {
  return free.flatMap(([fs, fe]) => (e <= fs || s >= fe ? [[fs, fe]] : [[fs, s], [e, fe]].filter(([a, b]) => b > a)));
}

// Start time closest to target where len minutes fit, or null if none within reach.
function nearestFit(free, target, len, reach) {
  let best = null;
  for (const [fs, fe] of free) {
    if (fe - fs < len) continue;
    const t = clamp(target, fs, fe - len);
    if (best === null || Math.abs(t - target) < Math.abs(best - target)) best = t;
  }
  return best !== null && Math.abs(best - target) <= reach ? best : null;
}

// Latest start in [from, to] where len minutes fit.
function latestFit(free, from, to, len) {
  let best = null;
  for (const [fs, fe] of free) {
    const lo = Math.max(fs, from);
    const hi = Math.min(to, fe - len);
    if (lo <= hi && (best === null || hi > best)) best = hi;
  }
  return best;
}

// Earliest start in [from, to] where len minutes fit.
function earliestFit(free, from, to, len) {
  let best = null;
  for (const [fs, fe] of free) {
    const lo = Math.max(fs, from);
    if (lo <= Math.min(to, fe - len) && (best === null || lo < best)) best = lo;
  }
  return best;
}

function clamp(x, lo, hi) {
  return Math.min(Math.max(x, lo), hi);
}

function toMin(hm) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function fmt(min) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function duration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h}h ${m}min` : h ? `${h}h` : `${m} min`;
}
