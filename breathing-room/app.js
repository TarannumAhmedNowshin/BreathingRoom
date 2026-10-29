/*
 * Breathing Room page logic: state, rendering, the reminder engine and break mode.
 * Depends on planner.js (window.Planner) and ics.js (window.ICS).
 */
(function () {
  'use strict';

  const P = window.Planner;
  const ICS = window.ICS;
  const $ = (s) => document.querySelector(s);
  const KEY = 'breathing-room:v1';
  const BASE_TITLE = 'Breathing Room';

  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const realNowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
  // The example day runs on its own clock, starting at 12:38 and ticking in real time,
  // so it always looks like a day in progress, whatever time someone opens the page.
  // Real calendars always use the real time.
  const EXAMPLE_CLOCK = 12 * 60 + 38;
  const openedAt = Date.now();
  const nowMin = () => (state && state.isExample ? EXAMPLE_CLOCK + (Date.now() - openedAt) / 60000 : realNowMin());
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = {
    meeting: svg('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.3"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M15 14.2c2.6-.4 4.8 1.2 5.5 4.3"/>'),
    drink: svg('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>'),
    move: svg('<circle cx="13" cy="4.5" r="1.8"/><path d="M9 21l2.5-6 3 2.5V22M8 11l3.5-3 3 2 3 1M11.5 8l-1 7"/>'),
    lunch: svg('<path d="M3 11h18a9 9 0 0 1-18 0Z"/><path d="M8 7c0-1.5 1-1.5 1-3M12 7c0-1.5 1-1.5 1-3M16 7c0-1.5 1-1.5 1-3"/>'),
    shutdown: svg('<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>'),
  };
  const TYPE_LABEL = { meeting: 'Meeting', drink: 'Water', move: 'Move', lunch: 'Lunch', shutdown: 'Shutdown' };

  const EXAMPLE = [
    { title: 'Team stand-up', start: '09:30', end: '09:45' },
    { title: 'Client workshop', start: '10:00', end: '12:15' },
    { title: '1:1 with Sam', start: '12:15', end: '12:45' },
    { title: 'Budget review', start: '14:00', end: '15:00' },
    { title: 'Sprint planning', start: '15:00', end: '16:30' },
  ];

  /* ---------- State ---------- */
  const freshDay = () => ({ date: dateKey(), energy: null, done: {}, skipped: {}, snooze: {}, notified: {} });
  const defaults = () => ({
    events: EXAMPLE.map((e) => ({ ...e })),
    eventsDate: dateKey(),
    isExample: true,
    settings: { dayStart: '09:00', dayEnd: '17:30', sound: false, notify: false },
    day: freshDay(),
    pausedUntil: 0,
  });

  function load() {
    try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable: the page still works for this visit */ }
  }

  let state = Object.assign(defaults(), load() || {});
  state.settings = Object.assign(defaults().settings, state.settings || {});
  let showNewDay = false;

  function rollover() {
    if (!state.day || state.day.date !== dateKey()) state.day = freshDay();
    if (!state.isExample && state.eventsDate !== dateKey()) {
      if (state.events.length) showNewDay = true;
      state.events = [];
      state.eventsDate = dateKey();
    }
    if (state.isExample) state.eventsDate = dateKey();
  }
  rollover();
  save();

  let plan = null;
  function replan() {
    plan = P.buildPlan(state.events, {
      dayStart: state.settings.dayStart,
      dayEnd: state.settings.dayEnd,
      energy: state.day.energy,
    });
    // Break ideas Claude wrote for today on the day overview (web/src/ideas.ts), if any.
    try {
      const o = JSON.parse(localStorage.getItem('breathing-room:ideas') || 'null');
      if (o && o.date === dateKey()) plan.breaks.forEach((b) => { if (o.ideas[b.id]) b.idea = o.ideas[b.id]; });
    } catch (e) { /* keep the built-in ideas */ }
  }

  const dayS = () => P.toMin(state.settings.dayStart);
  const dayE = () => P.toMin(state.settings.dayEnd);
  const effStart = (b) => b.s + (state.day.snooze[b.id] || 0);
  const isPaused = () => Date.now() < (state.pausedUntil || 0);
  const inMeeting = (n) => state.events.some((e) => P.toMin(e.start) <= n && n < P.toMin(e.end));

  function statusOf(b, n) {
    if (state.day.done[b.id] != null) return 'done';
    if (state.day.skipped[b.id]) return 'skipped';
    const s = effStart(b);
    if (n >= s && n < s + b.len) return 'now';
    if (n >= s + b.len) return 'missed';
    return state.day.snooze[b.id] ? 'snoozed' : 'upcoming';
  }
  function nextBreak(n) {
    return plan.breaks
      .filter((b) => ['upcoming', 'snoozed', 'now'].includes(statusOf(b, n)))
      .sort((a, b) => effStart(a) - effStart(b))[0] || null;
  }
  function fmtCountdown(mins) {
    const totalSec = Math.max(0, Math.ceil(mins * 60));
    if (totalSec >= 3600) {
      const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60);
      return `${h}h ${pad(m)}m`;
    }
    return `${pad(Math.floor(totalSec / 60))}:${pad(totalSec % 60)}`;
  }
  const announce = (text) => { const el = $('#announcer'); el.textContent = ''; setTimeout(() => { el.textContent = text; }, 30); };

  /* ---------- Rendering ---------- */
  function renderHeader() {
    $('#today-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    $('#hours-label').textContent = `${state.settings.dayStart}–${state.settings.dayEnd}`;
    $('#example-notice').hidden = !state.isExample;
    $('#example-clock').textContent = P.toHHMM(Math.floor(nowMin()));
    $('#newday-notice').hidden = !showNewDay || state.events.length > 0;
    document.querySelectorAll('[data-energy]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.energy === state.day.energy)));
  }

  function renderStrip() {
    const s = dayS(), e = dayE(), span = Math.max(1, e - s);
    const pct = (m) => ((Math.min(Math.max(m, s), e) - s) / span) * 100;
    const segs = plan.items
      .filter((i) => i.e > s && i.s < e)
      .map((i) => `<span class="seg-block t-${i.type}" style="left:${pct(i.s).toFixed(2)}%;width:${(pct(i.e) - pct(i.s)).toFixed(2)}%"></span>`)
      .join('');
    const n = nowMin();
    const now = n >= s && n <= e ? `<span class="strip-now" style="left:${pct(n).toFixed(2)}%"></span>` : '';
    $('#strip').innerHTML = segs + now;
  }

  // How long you've gone without a gap by the end of a meeting, as a 0-3 level.
  // Meetings less than 5 minutes apart count as one run.
  function pressureOf(end) {
    const ev = state.events.map((e) => [P.toMin(e.start), P.toMin(e.end)]).sort((a, b) => a[0] - b[0]);
    let runStart = null, runEnd = null;
    for (const [s, e] of ev) {
      if (runEnd != null && s - runEnd < 5) runEnd = Math.max(runEnd, e);
      else { runStart = s; runEnd = e; }
      if (e === end) break;
    }
    const run = runStart == null ? 0 : end - runStart;
    return run >= 180 ? 3 : run >= 120 ? 2 : run >= 60 ? 1 : 0;
  }

  function renderTimeline() {
    const n = nowMin();
    const items = plan.items;
    if (!items.length) {
      $('#timeline').innerHTML = '<li class="empty">Nothing planned. Check your work hours in Settings.</li>';
      return;
    }
    let html = '';
    let nowPlaced = false;
    for (const it of items) {
      const start = it.type === 'meeting' ? it.s : effStart(it);
      if (!nowPlaced && start > n && n >= dayS() - 60) {
        html += `<li class="now-line" aria-label="Now, ${P.toHHMM(n)}">Now ${P.toHHMM(n)}</li>`;
        nowPlaced = true;
      }
      let chip = '', cls = '';
      if (it.type === 'meeting') {
        if (n >= it.s && n < it.e) chip = '<span class="chip now">In progress</span>';
        else if (n >= it.e) cls = ' is-past';
      } else {
        const st = statusOf(it, n);
        const labels = { done: 'Done', skipped: 'Skipped', now: 'Now', missed: 'Missed', snoozed: `Moved to ${P.toHHMM(effStart(it))}` };
        if (labels[st] && !(state.isExample && st === 'missed')) chip = `<span class="chip ${st}">${labels[st]}</span>`;
        if (st === 'done') cls = ' is-done is-past';
        if (st === 'skipped') cls = ' is-skipped is-past';
        if (st === 'missed') cls = ' is-past';
      }
      const sub = it.type === 'meeting'
        ? `${P.fmtDur(it.len)} · until ${it.end}`
        : `${it.len} min · ${TYPE_LABEL[it.type]}`;
      const blockH = Math.round(Math.min(Math.max(it.len * 1.1, 52), 150));
      const pressure = it.type === 'meeting' ? ` p${pressureOf(it.e)}` : '';
      html += `<li class="row t-${it.type}${cls}${pressure}" style="--h:${blockH}px">
        <span class="time">${it.start}</span><span class="bar pill" aria-hidden="true">${ICON[it.type] || ''}</span>
        <div class="what"><span class="title">${esc(it.title)}</span><span class="sub">${sub}</span></div>${chip}</li>`;
    }
    if (!nowPlaced && n <= dayE() + 120) html += `<li class="now-line">Now ${P.toHHMM(n)}</li>`;
    $('#timeline').innerHTML = html;
  }

  function renderStats() {
    const st = plan.stats;
    const total = plan.breaks.length;
    const doneIds = Object.keys(state.day.done).filter((id) => plan.breaks.some((b) => b.id === id));
    const recovered = doneIds.reduce((sum, id) => sum + (state.day.done[id] || 0), 0);
    $('#stats').innerHTML = `
      <div><dt>In meetings</dt><dd>${P.fmtDur(st.meetingMinutes)}</dd></div>
      <div><dt>Free for focus</dt><dd>${P.fmtDur(st.focusMinutes)}</dd></div>
      <div><dt>Breaks planned</dt><dd>${total} <span class="small muted">· ${st.breakMinutes} min</span></dd></div>
      <div><dt>Breaks taken</dt><dd>${doneIds.length} of ${total}</dd></div>
      <div class="wide"><dt>Time you've taken back today</dt><dd>${recovered ? P.fmtDur(recovered) : '0 min'}</dd></div>`;
  }

  function renderWarnings() {
    const list = plan.warnings;
    $('#warnings-card').hidden = list.length === 0;
    $('#warnings').innerHTML = list.map((w) => {
      const at = w.at >= dayS() ? `<span class="mono">${P.toHHMM(w.at)}</span>` : '';
      return `<li>${at}${esc(w.text)}</li>`;
    }).join('');
  }

  function renderEvents() {
    const evs = [...state.events].sort((a, b) => a.start.localeCompare(b.start));
    $('#events').innerHTML = evs.length
      ? evs.map((e) => `<li><span class="mono">${e.start}–${e.end}</span><span class="ev-title">${esc(e.title)}</span>
          <button class="icon-btn" type="button" data-remove="${esc(e.start + '|' + e.end + '|' + e.title)}" aria-label="Remove ${esc(e.title)}">Remove</button></li>`).join('')
      : '<li class="muted">No meetings yet. Import a calendar or add one above.</li>';
  }

  let heroKey = '';
  function renderHero() {
    const n = nowMin();
    const hero = $('#hero');
    let key, html, cls = '', countdownTo = null;
    const b = nextBreak(n);

    if (isPaused()) {
      const until = new Date(state.pausedUntil);
      key = 'paused' + state.pausedUntil;
      html = `<p class="eyebrow">Reminders paused</p>
        <p class="countdown">${pad(until.getHours())}:${pad(until.getMinutes())}</p>
        <p class="hero-meta">Reminders come back at this time. Your plan is unchanged.</p>
        <div class="actions"><button class="btn primary" type="button" data-act="resume">Resume reminders now</button></div>`;
    } else if (n >= dayE()) {
      key = 'over';
      html = `<p class="eyebrow">Workday over</p>
        <p class="countdown">Done</p>
        <p class="hero-idea">You're past ${state.settings.dayEnd}. No more reminders today. Close the laptop; tomorrow's plan starts at ${state.settings.dayStart}.</p>`;
    } else if (!b) {
      key = 'none';
      html = `<p class="eyebrow">No more breaks planned</p>
        <p class="countdown">${state.settings.dayEnd}</p>
        <p class="hero-idea">That's your finish time. If you have a gap before then, use it to stop early.</p>`;
    } else {
      const st = statusOf(b, n);
      const def = `t-${b.type}`;
      if (st === 'now') {
        key = 'due' + b.id;
        cls = `is-due ${def}`;
        html = `<p class="eyebrow">Break time</p>
          <h2 class="hero-title"><span class="dot" aria-hidden="true"></span>${esc(b.title)}</h2>
          <p class="hero-meta">${b.len} minutes · planned for ${P.toHHMM(effStart(b))}</p>
          <p class="hero-idea">${esc(b.idea)}</p>
          <div class="actions">
            <button class="btn primary big" type="button" data-act="start" data-id="${b.id}">Start break</button>
            <button class="btn" type="button" data-act="snooze" data-id="${b.id}">In 10 minutes</button>
            <button class="btn ghost" type="button" data-act="skip" data-id="${b.id}">Skip</button>
          </div>`;
      } else {
        key = 'next' + b.id + effStart(b);
        cls = def;
        countdownTo = effStart(b);
        const beforeDay = n < dayS();
        html = `<p class="eyebrow">${beforeDay ? 'Your first break' : 'Next break in'}</p>
          <p class="countdown" id="cd"></p>
          <h2 class="hero-title"><span class="dot" aria-hidden="true"></span>${esc(b.title)}</h2>
          <p class="hero-meta">At ${P.toHHMM(effStart(b))} · ${b.len} min${inMeeting(n) ? ' · after your current meeting' : ''}</p>
          <p class="hero-idea">${esc(b.idea)}</p>
          <div class="actions">
            <button class="btn" type="button" data-act="start" data-id="${b.id}">Take it now</button>
            <button class="btn ghost" type="button" data-act="skip" data-id="${b.id}">Skip this one</button>
          </div>`;
      }
    }
    if (key !== heroKey) {
      heroKey = key;
      hero.className = 'hero ' + cls;
      hero.innerHTML = html;
    }
    const cd = $('#cd');
    if (cd && countdownTo != null) cd.textContent = fmtCountdown(countdownTo - n);

    // Tab title: visible while you work in other tabs, no permission needed.
    if (activeBreak) document.title = `On a break · ${fmtCountdown(activeBreak.len - (Date.now() - activeBreak.startedAt) / 60000)} left`;
    else if (b && statusOf(b, n) === 'now' && !isPaused()) document.title = `Break time · ${BASE_TITLE}`;
    else if (countdownTo != null) document.title = `${fmtCountdown(countdownTo - n)} to ${TYPE_LABEL[b.type].toLowerCase()} · ${BASE_TITLE}`;
    else document.title = BASE_TITLE;
  }

  /* ---------- As booked / With breaks ---------- */
  let view = 'planned';
  function longestRun() {
    const ev = state.events.map((e) => [P.toMin(e.start), P.toMin(e.end)]).sort((a, b) => a[0] - b[0]);
    let best = null, cur = null;
    for (const [s, e] of ev) {
      if (cur && s - cur[1] < 5) cur[1] = Math.max(cur[1], e);
      else { cur = [s, e]; }
      if (!best || cur[1] - cur[0] > best[1] - best[0]) best = [cur[0], cur[1]];
    }
    return best;
  }
  function renderView() {
    const card = $('#day-card');
    card.classList.toggle('view-booked', view === 'booked');
    document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.view === view)));
    const st = plan.stats, run = longestRun();
    let note;
    if (view === 'booked') {
      note = state.events.length
        ? `Your calendar as it is: ${P.fmtDur(st.meetingMinutes)} of meetings and nothing in between.` +
          (run ? ` Longest run without a break: ${P.fmtDur(run[1] - run[0])}, from ${P.toHHMM(run[0])}.` : '')
        : 'No meetings yet. Import a calendar or add one.';
    } else {
      note = plan.breaks.length
        ? `${plan.breaks.length} break${plan.breaks.length === 1 ? '' : 's'} fitted into the real gaps, ${P.fmtDur(st.breakMinutes)} of rest for you. No meeting was moved.`
        : 'There was no gap long enough for a break today.';
    }
    $('#view-note').textContent = note;
  }

  function renderAll() {
    replan();
    renderHeader();
    renderStrip();
    renderTimeline();
    renderStats();
    renderWarnings();
    renderEvents();
    renderView();
    heroKey = '';
    renderHero();
  }

  /* ---------- Reminders ---------- */
  let audioCtx = null;
  function chime() {
    if (!state.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime;
      [523.25, 659.25].forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        const at = t + i * 0.28;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.12, at + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
        o.connect(g).connect(audioCtx.destination);
        o.start(at); o.stop(at + 1.5);
      });
    } catch (e) { /* audio unavailable */ }
  }
  function desktopNotify(b) {
    if (!state.settings.notify || !('Notification' in window)) return;
    try {
      if (Notification.permission === 'granted') new Notification(b.title, { body: `${b.len} min · ${b.idea}`, tag: 'breathing-room' });
    } catch (e) { /* notifications refused in this context */ }
  }

  let bannerBreak = null;
  function showBanner(b) {
    bannerBreak = b;
    const banner = $('#banner');
    banner.className = `banner t-${b.type}`;
    $('#banner-title').textContent = `${b.title} · ${b.len} min`;
    banner.hidden = false;
    announce(`Time for a break: ${b.title}, ${b.len} minutes.`);
  }
  function hideBanner() { $('#banner').hidden = true; bannerBreak = null; }

  function fire(b, isPreview) {
    if (!isPreview) { state.day.notified[b.id] = true; save(); }
    showBanner(b);
    chime();
    desktopNotify(b);
  }

  // One reminder per break, only within its first few minutes, never in a meeting or while paused.
  function checkDue(n) {
    if (activeBreak || isPaused() || inMeeting(n) || bannerBreak) return;
    for (const b of plan.breaks) {
      if (state.day.done[b.id] != null || state.day.skipped[b.id] || state.day.notified[b.id]) continue;
      const s = effStart(b);
      if (n >= s && n < s + Math.min(b.len, 3)) { fire(b); break; }
    }
  }

  /* ---------- Break mode ---------- */
  let activeBreak = null;
  const CUES = ['Breathe in', 'Hold', 'Breathe out', 'Hold'];

  function findBreak(id) { return plan.breaks.find((b) => b.id === id) || (bannerBreak && bannerBreak.id === id ? bannerBreak : null); }

  function startBreak(b) {
    hideBanner();
    activeBreak = { ...b, startedAt: Date.now() };
    const bm = $('#break-mode');
    bm.className = `break-mode t-${b.type}`;
    $('#bm-type').textContent = b.preview ? 'Preview break · nothing is recorded' : `${TYPE_LABEL[b.type]} break`;
    $('#bm-title').textContent = b.title;
    $('#bm-idea').textContent = b.idea;
    const ring = $('#breath-ring');
    ring.classList.remove('run'); void ring.offsetWidth; ring.classList.add('run');
    bm.hidden = false;
    $('#bm-done').focus();
    tickBreak();
  }

  function endBreak() {
    if (!activeBreak) return;
    const b = activeBreak;
    activeBreak = null;
    $('#break-mode').hidden = true;
    if (!b.preview) {
      const mins = Math.max(1, Math.min(b.len, Math.round((Date.now() - b.startedAt) / 60000)));
      state.day.done[b.id] = mins;
      save();
      announce(`Welcome back. You took ${mins} minute${mins === 1 ? '' : 's'} for yourself.`);
    } else {
      announce('Preview finished. Nothing was recorded.');
    }
    renderAll();
    const first = document.querySelector('#hero button');
    if (first) first.focus();
  }

  function tickBreak() {
    if (!activeBreak) return;
    const elapsedMs = Date.now() - activeBreak.startedAt;
    const left = activeBreak.len - elapsedMs / 60000;
    $('#bm-time').textContent = left > 0 ? `${fmtCountdown(left)} left` : 'Time is up. Come back when you are ready.';
    $('#breath-cue').textContent = CUES[Math.floor(elapsedMs / 4000) % 4];
  }

  /* ---------- Actions ---------- */
  function act(kind, b) {
    if (!b) return;
    if (kind === 'start') { startBreak(b); return; }
    if (b.preview) { hideBanner(); announce('Preview dismissed.'); return; }
    if (kind === 'snooze') {
      state.day.snooze[b.id] = (state.day.snooze[b.id] || 0) + 10;
      state.day.notified[b.id] = false;
      announce(`Moved to ${P.toHHMM(effStart(b))}.`);
    }
    if (kind === 'skip') { state.day.skipped[b.id] = true; announce('Break skipped.'); }
    hideBanner();
    save();
    renderAll();
  }

  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.view) {
      if (t.dataset.view === view) return;
      view = t.dataset.view;
      const card = $('#day-card');
      card.classList.remove('just-opened');
      renderView();
      if (view === 'planned') { void card.offsetWidth; card.classList.add('just-opened'); }
      announce(view === 'booked' ? 'Showing your calendar as booked.' : 'Showing your day with breaks.');
      return;
    }
    if (t.dataset.act === 'resume') { state.pausedUntil = 0; save(); renderSettings(); renderAll(); return; }
    if (t.dataset.act) { act(t.dataset.act, findBreak(t.dataset.id)); return; }
    if (t.dataset.banner) { act(t.dataset.banner, bannerBreak); return; }
    if (t.dataset.energy) {
      state.day.energy = state.day.energy === t.dataset.energy ? null : t.dataset.energy;
      save(); renderAll();
      announce(state.day.energy === 'low' ? 'Low energy: breaks are now more frequent and longer.' : 'Energy saved.');
      return;
    }
    if (t.dataset.remove != null) {
      const [start, end, ...rest] = t.dataset.remove.split('|');
      const title = rest.join('|');
      const i = state.events.findIndex((e) => e.start === start && e.end === end && e.title === title);
      if (i >= 0) {
        state.events.splice(i, 1);
        state.isExample = false;
        save(); renderAll();
        announce(`Removed ${title}.`);
      }
    }
  });

  $('#bm-done').addEventListener('click', endBreak);
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!$('#break-mode').hidden) endBreak();
    else if (!$('#settings').hidden) toggleSettings(false);
  });

  $('#clear-example').addEventListener('click', () => {
    state.events = []; state.isExample = false; state.eventsDate = dateKey();
    save(); renderAll();
    $('#add-title').focus();
  });

  // Calendar import
  $('#ics-file').addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    const status = $('#import-status');
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const res = ICS.parse(String(reader.result), new Date());
        if (!res.total) {
          status.className = 'small status error';
          status.textContent = `${file.name} doesn't contain any calendar events. Check that it's an .ics export.`;
        } else if (!res.events.length) {
          status.className = 'small status error';
          status.textContent = `Found ${res.total} events in ${file.name}, but none with a time today. Your day is unchanged.`;
        } else {
          state.events = res.events;
          state.isExample = false;
          state.eventsDate = dateKey();
          showNewDay = false;
          save(); renderAll();
          status.className = 'small status';
          const extra = res.skippedAllDay ? ` (${res.skippedAllDay} all-day event${res.skippedAllDay > 1 ? 's' : ''} left out)` : '';
          status.textContent = `Imported ${res.events.length} meeting${res.events.length > 1 ? 's' : ''} for today from ${file.name}${extra}. Your breaks have been replanned.`;
        }
      } catch (e) {
        status.className = 'small status error';
        status.textContent = `Couldn't read ${file.name}. Try exporting it again as .ics.`;
      }
      ev.target.value = '';
    };
    reader.onerror = () => { status.className = 'small status error'; status.textContent = `Couldn't open ${file.name}.`; };
    reader.readAsText(file);
  });

  // Manual add
  $('#add-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const title = $('#add-title').value.trim();
    const start = $('#add-start').value;
    const end = $('#add-end').value;
    const status = $('#add-status');
    status.className = 'small status error';
    if (!title) { status.textContent = 'Give the meeting a name.'; $('#add-title').focus(); return; }
    if (!start || !end) { status.textContent = 'Add a start and end time.'; (start ? $('#add-end') : $('#add-start')).focus(); return; }
    if (P.toMin(end) <= P.toMin(start)) { status.textContent = 'The end time needs to be after the start time.'; $('#add-end').focus(); return; }
    state.events.push({ title, start, end });
    state.isExample = false;
    state.eventsDate = dateKey();
    save(); renderAll();
    status.className = 'small status';
    status.textContent = `Added ${title}, ${start}–${end}. Breaks replanned.`;
    ev.target.reset();
    $('#add-title').focus();
  });

  /* ---------- Settings ---------- */
  function toggleSettings(open) {
    const panel = $('#settings');
    panel.hidden = !open;
    $('#open-settings').setAttribute('aria-expanded', String(open));
    if (open) { renderSettings(); $('#day-start').focus(); } else { $('#open-settings').focus(); }
  }
  function renderSettings() {
    $('#day-start').value = state.settings.dayStart;
    $('#day-end').value = state.settings.dayEnd;
    $('#sound-toggle').checked = !!state.settings.sound;
    $('#notify-toggle').checked = !!state.settings.notify;
    $('#pause-btn').textContent = isPaused() ? 'Resume reminders now' : 'Pause reminders for 1 hour';
  }
  $('#open-settings').addEventListener('click', () => toggleSettings($('#settings').hidden));
  $('#close-settings').addEventListener('click', () => toggleSettings(false));

  function onHoursChange() {
    const s = $('#day-start').value, e = $('#day-end').value, status = $('#hours-status');
    if (!s || !e) return;
    if (P.toMin(e) - P.toMin(s) < 60) {
      status.className = 'small status error';
      status.textContent = 'Your finish time needs to be at least an hour after your start time.';
      return;
    }
    state.settings.dayStart = s; state.settings.dayEnd = e;
    status.className = 'small status';
    status.textContent = `Work hours set to ${s}–${e}. Breaks replanned.`;
    save(); renderAll();
  }
  $('#day-start').addEventListener('change', onHoursChange);
  $('#day-end').addEventListener('change', onHoursChange);

  $('#pause-btn').addEventListener('click', () => {
    state.pausedUntil = isPaused() ? 0 : Date.now() + 3600000;
    if (isPaused()) hideBanner();
    save(); renderSettings(); renderAll();
    announce(isPaused() ? 'Reminders paused for one hour.' : 'Reminders resumed.');
  });

  $('#sound-toggle').addEventListener('change', (ev) => {
    state.settings.sound = ev.target.checked; save();
    if (ev.target.checked) chime();
  });

  $('#notify-toggle').addEventListener('change', (ev) => {
    const status = $('#notify-status');
    status.className = 'small status';
    status.textContent = '';
    if (!ev.target.checked) { state.settings.notify = false; save(); return; }
    const refuse = (msg) => { ev.target.checked = false; state.settings.notify = false; save(); status.className = 'small status error'; status.textContent = msg; };
    if (!('Notification' in window)) { refuse('This browser does not support desktop notifications. The in-page reminder still works.'); return; }
    try {
      Promise.resolve(Notification.requestPermission()).then((p) => {
        if (p === 'granted') { state.settings.notify = true; save(); status.textContent = 'Desktop notifications are on.'; }
        else refuse('Notifications are blocked for this page. The in-page reminder still works.');
      }).catch(() => refuse('Notifications are blocked for this page. The in-page reminder still works.'));
    } catch (e) { refuse('Notifications are blocked for this page. The in-page reminder still works.'); }
  });

  let previewTimer = null;
  $('#preview-btn').addEventListener('click', (ev) => {
    clearTimeout(previewTimer);
    ev.target.textContent = 'Reminder coming in 5 seconds…';
    announce('A preview reminder will appear in 5 seconds.');
    previewTimer = setTimeout(() => {
      ev.target.textContent = 'Preview a reminder in 5 seconds';
      toggleSettings(false);
      fire({
        id: 'preview', preview: true, type: 'drink', len: 1, s: nowMin(),
        title: 'Preview: water and a stretch',
        idea: 'This is what a real break looks like. It lasts one minute and nothing is recorded.',
      }, true);
    }, 5000);
  });

  function planJSON() {
    return JSON.stringify({
      date: dateKey(),
      energy: state.day.energy,
      workday: { start: state.settings.dayStart, end: state.settings.dayEnd },
      items: plan.items.map((i) => ({ start: i.start, end: i.end, type: i.type, title: i.title })),
    }, null, 2);
  }
  $('#copy-plan').addEventListener('click', () => {
    const json = planJSON();
    const box = $('#plan-json');
    const status = $('#data-status');
    const fallback = () => { box.hidden = false; box.value = json; box.focus(); box.select(); status.className = 'small status'; status.textContent = 'Select the text above and copy it.'; };
    try {
      navigator.clipboard.writeText(json).then(() => { status.className = 'small status'; status.textContent = 'Plan copied to your clipboard.'; }, fallback);
    } catch (e) { fallback(); }
  });

  let resetArmed = false;
  $('#reset-btn').addEventListener('click', (ev) => {
    if (!resetArmed) {
      resetArmed = true;
      ev.target.classList.add('armed');
      ev.target.textContent = 'Click again to clear everything';
      setTimeout(() => { resetArmed = false; ev.target.classList.remove('armed'); ev.target.textContent = 'Clear all my data'; }, 4000);
      return;
    }
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    state = defaults();
    state.events = []; state.isExample = false;
    resetArmed = false;
    ev.target.classList.remove('armed');
    ev.target.textContent = 'Clear all my data';
    $('#data-status').className = 'small status';
    $('#data-status').textContent = 'All your data has been cleared.';
    save(); renderSettings(); renderAll();
  });

  /* ---------- Clock ---------- */
  let lastMinute = -1;
  function tick() {
    if (state.day.date !== dateKey()) { rollover(); save(); renderAll(); }
    const n = nowMin();
    const minute = Math.floor(n);
    if (minute !== lastMinute) {
      lastMinute = minute;
      renderStrip(); renderTimeline(); renderStats();
    }
    // A reminder that was ignored quietly goes away once its break window has passed.
    if (bannerBreak && !bannerBreak.preview && statusOf(bannerBreak, n) !== 'now') hideBanner();
    checkDue(n);
    renderHero();
    tickBreak();
  }

  /* ---------- Export breaks as a calendar file ---------- */
  function breaksIcs() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const at = (min) => `${ymd}T${pad(Math.floor(min / 60))}${pad(Math.round(min % 60))}00`;
    const text = (t) => String(t).replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Breathing Room//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const b of plan.breaks) {
      lines.push('BEGIN:VEVENT',
        `UID:${b.id}-${ymd}@breathing-room`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${at(b.s)}`,
        `DTEND:${at(b.s + b.len)}`,
        `SUMMARY:${text(b.title)}`,
        `DESCRIPTION:${text(b.idea + ' (planned by Breathing Room)')}`,
        'TRANSP:OPAQUE',
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${text(b.title)}`, 'TRIGGER:PT0M', 'END:VALARM',
        'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }
  $('#export-ics').addEventListener('click', () => {
    const status = $('#export-status');
    if (state.isExample) { status.className = 'small status error'; status.textContent = 'This is the example day. Import your calendar or add a meeting first, then add your own breaks.'; return; }
    if (!plan.breaks.length) { status.className = 'small status error'; status.textContent = 'There are no breaks to add today.'; return; }
    const blob = new Blob([breaksIcs()], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `breaks-${dateKey()}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    status.className = 'small status';
    status.textContent = `Saved ${plan.breaks.length} break${plan.breaks.length === 1 ? '' : 's'} as breaks-${dateKey()}.ics. Open it to add them to your calendar.`;
  });

  /* ---------- Public API for teammates (calendar / planner integrations) ---------- */
  window.BreathingRoom = {
    // events: [{ title, start: 'HH:MM', end: 'HH:MM' }] for today
    setEvents(events) {
      if (!Array.isArray(events)) throw new Error('setEvents expects an array of { title, start, end }');
      state.events = events.filter((e) => e && e.start && e.end).map((e) => ({ title: String(e.title || 'Busy'), start: e.start, end: e.end }));
      state.isExample = false; state.eventsDate = dateKey();
      save(); renderAll();
    },
    getPlan() { return JSON.parse(planJSON()); },
    breaksIcs() { return breaksIcs(); },
  };

  renderAll();
  renderSettings();
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
})();
