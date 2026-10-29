// OWNER: Person 4 (dashboard). All data comes from chrome.storage (written by background.js).
import { KEYS, get, set, getSettings, saveSettings } from "../shared/storage.js";
import { todayISO, hhmm, minutesBetween, toLocalISO, addMinutes } from "../shared/time.js";
import { connectGoogle } from "../integration/google.js";

const $ = (s) => document.querySelector(s);
const send = (msg) => chrome.runtime.sendMessage(msg);
const KIND = { lunch: "🥪 Lunch", water: "💧 Water", move: "🧍 Stand up", breathe: "🌬️ Breathe", walk: "🚶 Walk", shutdown: "🌙 Shutdown" };
const SCREENS = ["today", "stats", "integrations", "team", "shutdown", "settings"];

// ---------- routing ----------
async function route() {
  const profile = await get(KEYS.profile);
  const settings = await getSettings();
  document.body.classList.toggle("lowstim", !!settings.lowStim);
  if (!profile) { $("#welcome").hidden = false; $("#app").hidden = true; return; }
  $("#welcome").hidden = true; $("#app").hidden = false;
  $("#hello").textContent = `Hi, ${profile.name}`;
  const screen = SCREENS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "today";
  SCREENS.forEach((s) => ($(`#${s}`).hidden = s !== screen));
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${screen}`));
  await RENDER[screen]?.();
}
window.addEventListener("hashchange", route);
chrome.storage.onChanged.addListener(() => route());

// ---------- welcome (local profile) ----------
$("#profile-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  await set(KEYS.profile, { name: f.get("name").trim(), createdAt: new Date().toISOString() });
  await saveSettings({ workdayStart: f.get("workdayStart"), workdayEnd: f.get("workdayEnd"), useSampleData: true });
  await send({ type: "margin.refresh" });
  location.hash = "#today";
  route();
};

// ---------- today ----------
const RENDER = {
  async today() {
    const [plan, day, state] = [await get(KEYS.plan), await get(KEYS.day), await get(KEYS.nudgeState, {})];
    if (!plan || !day) { $("#today-sub").textContent = "Building your plan…"; return; }
    $("#today-title").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    $("#today-sub").textContent = `Energy: ${plan.energy} · ideas by ${plan.generatedBy === "claude" ? "Claude" : "built-in library"}`;
    $("#source-pill").textContent = plan.source === "sample" ? "Sample day (connect your calendar in Settings)" : "Your calendar";

    $("#warnings").innerHTML = "";
    (plan.warnings || []).forEach((w) => { const p = document.createElement("span"); p.className = "pill warn"; p.textContent = w; $("#warnings").append(p); });

    const breakMin = plan.breaks.reduce((s, b) => s + b.minutes, 0);
    $("#day-stats").innerHTML = [
      ["Meetings", `${Math.round(day.stats.meetingMinutes / 6) / 10}h`],
      ["Longest back-to-back", `${Math.round(day.stats.longestBackToBackMinutes / 6) / 10}h`],
      ["Gaps found", day.stats.gapCount],
      ["Break time protected", `${breakMin} min`],
    ].map(([k, v]) => `<div class="stat"><span class="muted">${k}</span><b>${v}</b></div>`).join("");

    // Timeline bars, positioned by minutes from workday start
    const total = minutesBetween(day.workday.start, day.workday.end);
    const pos = (iso) => `${(minutesBetween(day.workday.start, iso) / total) * 100}%`;
    const w = (a, m) => `${(m / total) * 100}%`;
    const tl = $("#timeline"); tl.innerHTML = "";
    const bar = (cls, start, minutes, label) => {
      const d = document.createElement("div"); d.className = `bar ${cls}`;
      d.style.left = pos(start); d.style.width = w(start, minutes); d.textContent = label; d.title = `${hhmm(start)} ${label}`;
      tl.append(d);
    };
    day.busy.forEach((b) => bar("busy", b.start, minutesBetween(b.start, b.end), b.title));
    plan.breaks.forEach((b) => bar("brk", b.start, b.minutes, KIND[b.kind] || b.kind));
    for (let h = +day.workday.start.slice(11, 13); h <= +day.workday.end.slice(11, 13); h++) {
      const t = document.createElement("span"); t.className = "tick"; t.style.left = pos(`${day.date}T${String(h).padStart(2, "0")}:00:00`); t.textContent = `${h}:00`; tl.append(t);
    }
    const now = toLocalISO(new Date());
    if (now > day.workday.start && now < day.workday.end) { const n = document.createElement("div"); n.className = "now"; n.style.left = pos(now); tl.append(n); }

    $("#break-list").innerHTML = "";
    plan.breaks.forEach((b) => {
      const li = document.createElement("li");
      li.innerHTML = `<time>${hhmm(b.start)}</time><div><strong></strong><div class="muted small"></div></div><span class="pill"></span>`;
      li.querySelector("strong").textContent = b.idea || KIND[b.kind];
      li.querySelector(".small").textContent = b.reason;
      li.querySelector(".pill").textContent = state[b.id] || `${b.minutes} min`;
      $("#break-list").append(li);
    });
  },

  // ---------- time given back (saved-time tracker) ----------
  async stats() {
    const log = await get(KEYS.log, []);
    const byDay = {};
    log.filter((l) => l.status === "taken").forEach((l) => { const d = l.at.slice(0, 10); byDay[d] = (byDay[d] || 0) + (l.minutes || 0); });
    const days = [...Array(7)].map((_, i) => { const d = new Date(Date.now() - (6 - i) * 864e5).toISOString().slice(0, 10); return [d, byDay[d] || 0]; });
    const week = days.reduce((s, [, m]) => s + m, 0);
    const taken = log.filter((l) => l.status === "taken").length;
    const skipped = log.filter((l) => l.status === "skipped").length;
    $("#give-back-stats").innerHTML = [
      ["Given back this week", `${week} min`],
      ["Breaks taken", taken],
      ["Breaks skipped", skipped],
    ].map(([k, v]) => `<div class="stat"><span class="muted">${k}</span><b>${v}</b></div>`).join("");
    const max = Math.max(30, ...days.map(([, m]) => m));
    $("#week-chart").innerHTML = days.map(([d, m]) => `<div style="height:${(m / max) * 100}%" title="${m} min"><span>${new Date(d).toLocaleDateString(undefined, { weekday: "short" })}</span></div>`).join("");
  },

  // ---------- integrations ----------
  async integrations() {
    const s = await getSettings();
    const tiles = [
      { name: "Calendar link (.ics)", desc: "Google, Outlook or iCloud secret address", on: !!(s.icsUrl || s.icsText), action: "Set up", go: "#settings" },
      { name: "Google Calendar sign-in", desc: "Direct OAuth connection", on: !!s.googleConnected, action: "Connect", fn: async () => { await saveSettings({ googleConnected: await connectGoogle() }); send({ type: "margin.refresh" }); } },
      { name: "Claude", desc: "Break ideas that fit the time you have", on: !!s.anthropicKey, action: "Add key", go: "#settings" },
      { name: "Slack status", desc: "☕ On a break — back at 13:40", on: !!s.slackToken, action: "Add token", go: "#settings" },
      { name: "Discord", desc: "Tell your team channel you're on a break", on: !!s.discordWebhook, action: "Add webhook", go: "#settings" },
      { name: "Weather", desc: `Suggests outdoor walks when it's dry in ${s.city.name}`, on: true, action: null },
    ];
    $("#tiles").innerHTML = "";
    tiles.forEach((t) => {
      const el = document.createElement("div"); el.className = "card tile";
      el.innerHTML = `<div class="row between"><strong></strong><span class="pill ${t.on ? "" : "warn"}">${t.on ? "Connected" : "Not connected"}</span></div><span class="muted small"></span>`;
      el.querySelector("strong").textContent = t.name; el.querySelector(".small").textContent = t.desc;
      if (t.action && !t.on) { const b = document.createElement("button"); b.textContent = t.action; b.onclick = () => (t.fn ? t.fn().catch((e) => alert(e.message)) : (location.hash = t.go)); el.append(b); }
      $("#tiles").append(el);
    });
  },

  // ---------- team mode ----------
  async team() {
    const plan = await get(KEYS.plan); const profile = await get(KEYS.profile);
    const lunch = plan?.breaks.find((b) => b.kind === "lunch");
    const text = lunch ? `${profile.name} is taking lunch ${hhmm(lunch.start)}–${hhmm(addMinutes(lunch.start, lunch.minutes))} today. Want to join? (planned with Margin)` : "No lunch slot found today. That's worth fixing together.";
    $("#team-lunch").textContent = text;
    $("#copy-lunch").onclick = () => navigator.clipboard.writeText(text);
    $("#post-lunch").onclick = async () => {
      const s = await getSettings();
      if (!s.discordWebhook) return (location.hash = "#settings");
      await fetch(s.discordWebhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text }) });
    };
  },

  // ---------- shutdown ritual ----------
  async shutdown() {
    $("#shutdown-form").onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const items = ["t1", "t2", "t3"].map((k) => f.get(k).trim()).filter(Boolean);
      const tomorrow = todayISO(new Date(Date.now() + 864e5));
      await set(KEYS.tomorrow, { forDate: tomorrow, items, savedAt: new Date().toISOString() });
      $("#shutdown-done").hidden = false;
    };
  },

  // ---------- settings ----------
  async settings() {
    const s = await getSettings(); const form = $("#settings-form");
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === "checkbox") el.checked = !!s[el.name]; else el.value = s[el.name] ?? "";
    }
    form.onsubmit = async (e) => {
      e.preventDefault();
      const patch = {};
      for (const el of form.elements) if (el.name) patch[el.name] = el.type === "checkbox" ? el.checked : el.value.trim();
      const file = $("#ics-file").files[0];
      if (file) patch.icsText = await file.text();
      await saveSettings(patch);
      const r = await send({ type: "margin.refresh" });
      $("#saved").textContent = r?.ok ? "Saved. Plan rebuilt." : `Saved, but the plan failed: ${r?.error}`;
      $("#saved").hidden = false;
    };
    document.querySelectorAll("[data-test]").forEach((b) => (b.onclick = () => send({ type: "margin.testNudge", level: +b.dataset.test })));
  },
};

$("#refresh").onclick = async () => { await send({ type: "margin.refresh" }); route(); };
route();
