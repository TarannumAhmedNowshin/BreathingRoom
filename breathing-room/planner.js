/*
 * Breathing Room planner
 * Turns a day of meetings into a plan with breaks placed in the real gaps.
 * Pure functions, no DOM: runs in the browser (window.Planner) and in Node (require).
 */
(function (root) {
  'use strict';

  const toMin = (t) => {
    const [h, m] = String(t).split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const toHHMM = (min) => {
    const m = Math.max(0, Math.round(min));
    return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };
  const fmtDur = (min) => {
    const m = Math.round(min);
    const h = Math.floor(m / 60), r = m % 60;
    if (!h) return r + ' min';
    return r ? `${h}h ${r}m` : `${h}h`;
  };

  const BREAKS = {
    drink: {
      title: 'Water and a stretch',
      ideas: [
        'Fill your glass and drink half of it before you sit back down.',
        'Stand up, roll your shoulders five times, then drink a glass of water.',
        'Look at something at least 6 metres away for 20 seconds, then get a drink.',
      ],
    },
    move: {
      title: 'Get up and move',
      ideas: [
        'Walk to the furthest window, or step outside. Leave your phone at your desk.',
        'Walk a lap of the building or the block. No podcast, just walk.',
        'Stretch slowly: reach overhead, fold forward, open your chest against a doorframe.',
      ],
    },
    lunch: {
      title: 'Lunch away from your screen',
      ideas: ['Eat somewhere that is not your desk. Outside or with someone, if you can.'],
    },
    shutdown: {
      title: 'Shut down for the day',
      ideas: ["Write tomorrow's top three tasks, close your tabs, and stop. The rest can wait."],
    },
  };

  // Merge meetings into busy blocks. Meetings closer than `joinGap` minutes count as back-to-back.
  function busyBlocks(events, joinGap) {
    const evs = events
      .map((e) => ({ s: toMin(e.start), e: toMin(e.end) }))
      .filter((x) => x.e > x.s)
      .sort((a, b) => a.s - b.s);
    const out = [];
    for (const x of evs) {
      const last = out[out.length - 1];
      if (last && x.s <= last.e + joinGap) last.e = Math.max(last.e, x.e);
      else out.push({ s: x.s, e: x.e });
    }
    return out;
  }

  // Free intervals inside [from, to] not covered by any block.
  function freeSlots(blocks, from, to) {
    const sorted = blocks.map((b) => ({ s: b.s, e: b.e })).sort((a, b) => a.s - b.s);
    const out = [];
    let cur = from;
    for (const b of sorted) {
      if (b.e <= cur) continue;
      if (b.s >= to) break;
      if (b.s > cur) out.push({ s: cur, e: Math.min(b.s, to) });
      cur = Math.max(cur, b.e);
    }
    if (cur < to) out.push({ s: cur, e: to });
    return out;
  }

  // Best start time for a break of `len` minutes, as close to `target` as possible, not before `minStart`.
  function placeIn(slots, len, target, minStart) {
    let best = null, bestScore = Infinity;
    for (const sl of slots) {
      const lo = Math.max(sl.s, minStart), hi = sl.e - len;
      if (hi < lo) continue;
      const pos = Math.min(Math.max(target, lo), hi);
      const score = Math.abs(pos - target) + (pos > target ? 0.01 : 0);
      if (score < bestScore) { best = pos; bestScore = score; }
    }
    return best;
  }

  /**
   * buildPlan(events, opts)
   * events: [{ title, start: 'HH:MM', end: 'HH:MM' }]
   * opts:   { dayStart: 'HH:MM', dayEnd: 'HH:MM', energy: 'low' | 'ok' | 'good' | null }
   * returns { items, breaks, warnings, stats }
   */
  function buildPlan(events, opts) {
    opts = opts || {};
    const dayS = toMin(opts.dayStart || '09:00');
    const dayE = toMin(opts.dayEnd || '17:30');
    const low = opts.energy === 'low';
    const interval = low ? 60 : 90;

    const clean = (events || [])
      .filter((e) => e && /^\d{1,2}:\d{2}$/.test(e.start) && /^\d{1,2}:\d{2}$/.test(e.end) && toMin(e.end) > toMin(e.start))
      .map((e) => ({ title: String(e.title || 'Busy').slice(0, 120), start: e.start, end: e.end }));

    const busy = busyBlocks(clean, 5);
    const breaks = [];
    const warnings = [];
    const counts = {};

    const add = (type, s, len) => {
      const def = BREAKS[type];
      const i = (counts[type] = (counts[type] || 0) + 1);
      const b = {
        id: `${type}-${toHHMM(s)}`, type, s, e: s + len, len,
        start: toHHMM(s), end: toHHMM(s + len),
        title: def.title, idea: def.ideas[(i - 1) % def.ideas.length],
      };
      breaks.push(b);
      return b;
    };
    const free = () => freeSlots(busy.concat(breaks), dayS, dayE);

    if (dayE > dayS) {
      // 1. Shutdown ritual near the end of the workday.
      if (dayE - dayS >= 60) {
        const pos = placeIn(free(), 10, dayE - 10, dayE - 45);
        if (pos != null) add('shutdown', pos, 10);
      }

      // 2. Lunch between 12:00 and 14:30.
      const winS = Math.max(toMin('12:00'), dayS), winE = Math.min(toMin('14:30'), dayE);
      if (winE - winS >= 15) {
        const want = low ? 40 : 30;
        let placed = false;
        for (const len of [want, 20]) {
          const ws = free()
            .map((x) => ({ s: Math.max(x.s, winS), e: Math.min(x.e, winE) }))
            .filter((x) => x.e - x.s >= len);
          if (ws.length) {
            add('lunch', placeIn(ws, len, toMin('12:30'), 0), len);
            if (len < want) warnings.push({ at: winS, kind: 'lunch', text: `Only a ${len}-minute gap for lunch between 12:00 and 14:30.` });
            placed = true;
            break;
          }
        }
        if (!placed) {
          warnings.push({ at: winS, kind: 'lunch', text: 'No 20-minute gap for lunch between 12:00 and 14:30. Move or shorten one meeting so you can eat.' });
        }
      }

      // 3. Water and movement breaks roughly every `interval` minutes, in real gaps only.
      let last = dayS, n = 0;
      for (let guard = 0; guard < 40; guard++) {
        const target = last + interval;
        if (target > dayE - 25) break;
        const reset = breaks.filter((b) => b.s > last && b.s <= target + 15).sort((a, b) => a.s - b.s)[0];
        if (reset) { last = reset.e; continue; }

        const slots = free();
        let type = n % 2 === 0 ? 'drink' : 'move';
        let len = type === 'drink' ? 5 : (low ? 15 : 10);
        let pos = placeIn(slots, len, target, last + 30);
        if (pos == null && len > 5) { type = 'drink'; len = 5; pos = placeIn(slots, len, target, last + 30); }
        if (pos == null) break;

        const between = breaks.filter((b) => b.s > last && b.s < pos).sort((a, b) => a.s - b.s)[0];
        if (between) { last = between.e; continue; }

        if (pos - last > interval + 45) {
          warnings.push({ at: last, to: pos, kind: 'stretch', text: `No gap for a break from ${toHHMM(last)} to ${toHHMM(pos)}: ${fmtDur(pos - last)} straight.` });
        }
        add(type, pos, len);
        last = pos + len;
        n++;
      }
    }

    // 4. Warnings about the shape of the day.
    for (const b of busy) {
      const len = Math.min(b.e, dayE) - Math.max(b.s, dayS);
      if (len >= 150) {
        // One warning per problem: this replaces any "no gap" warning for the same stretch.
        for (let i = warnings.length - 1; i >= 0; i--) {
          const w = warnings[i];
          if (w.kind === 'stretch' && b.s < w.to && b.e > w.at) warnings.splice(i, 1);
        }
        warnings.push({ at: b.s, kind: 'meetings', text: `${fmtDur(len)} of back-to-back meetings from ${toHHMM(b.s)}. Ask for one to end 5 minutes early so you get a gap.` });
      }
    }
    const dayLen = Math.max(0, dayE - dayS);
    const meetingMinutes = busy.reduce((sum, b) => sum + Math.max(0, Math.min(b.e, dayE) - Math.max(b.s, dayS)), 0);
    const breakMinutes = breaks.reduce((sum, b) => sum + b.len, 0);
    if (dayLen && meetingMinutes / dayLen >= 0.7) {
      warnings.push({ at: dayS - 1, kind: 'overload', text: `Meetings fill ${Math.round((meetingMinutes / dayLen) * 100)}% of your workday. Is there one you could decline?` });
    }

    const meetings = clean.map((e, i) => ({
      id: `m-${i}-${e.start}`, type: 'meeting', title: e.title,
      s: toMin(e.start), e: toMin(e.end), len: toMin(e.end) - toMin(e.start), start: e.start, end: e.end,
    }));

    breaks.sort((a, b) => a.s - b.s);
    return {
      items: meetings.concat(breaks).sort((a, b) => a.s - b.s || (a.type === 'meeting' ? -1 : 1)),
      breaks,
      warnings: warnings.sort((a, b) => a.at - b.at),
      stats: {
        dayMinutes: dayLen,
        meetingMinutes,
        breakMinutes,
        focusMinutes: Math.max(0, dayLen - meetingMinutes - breakMinutes),
      },
    };
  }

  const api = { buildPlan, toMin, toHHMM, fmtDur, busyBlocks, freeSlots, BREAKS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Planner = api;
})(typeof window !== 'undefined' ? window : this);
