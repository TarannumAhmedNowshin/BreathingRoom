// OWNER: Person 1 (extension popup). Reads margin.plan / margin.day from storage; talks to background via messages.
import { KEYS, get, set, getSettings } from "../shared/storage.js";
import { todayISO, hhmm, toLocalISO } from "../shared/time.js";

const $ = (s) => document.querySelector(s);
const send = (msg) => chrome.runtime.sendMessage(msg);
const KIND = { lunch: "🥪 Lunch", water: "💧 Water", move: "🧍 Stand up", breathe: "🌬️ Breathe", walk: "🚶 Walk", shutdown: "🌙 Shutdown" };

async function render() {
  const [settings, plan, day, state, energy, tomorrow, log] = await Promise.all([
    getSettings(), get(KEYS.plan), get(KEYS.day), get(KEYS.nudgeState, {}), get(KEYS.energy), get(KEYS.tomorrow), get(KEYS.log, []),
  ]);
  document.body.classList.toggle("lowstim", !!settings.lowStim);

  $("#source").textContent = plan?.source === "sample" ? "sample day" : plan?.source ? "your calendar" : "";
  $("#checkin").hidden = energy?.date === todayISO();

  if (!plan) { $("#next-when").textContent = "No plan yet — open the dashboard to connect a calendar."; return; }

  // Next break
  const now = toLocalISO(new Date());
  const next = plan.breaks.find((b) => !["taken", "skipped"].includes(state[b.id]) && toLocalISO(new Date(new Date(b.start).getTime() + b.minutes * 60000)) > now);
  if (next) {
    $("#next-when").textContent = next.start <= now ? "Now" : `At ${hhmm(next.start)} · ${next.minutes} min`;
    $("#next-title").textContent = KIND[next.kind] || next.kind;
    $("#next-idea").textContent = next.idea;
    $("#next-actions").hidden = false;
    $("#next-actions").dataset.id = next.id;
  } else {
    $("#next-when").textContent = "That's all for today";
    $("#next-title").textContent = "You're done. Close the laptop.";
    $("#next-idea").textContent = "";
    $("#next-actions").hidden = true;
  }

  // Warnings ("no gap all day" is the problem, not you)
  $("#warnings").innerHTML = "";
  for (const w of plan.warnings || []) {
    const p = document.createElement("span"); p.className = "pill warn"; p.textContent = w; $("#warnings").append(p);
  }

  // Timeline: meetings + breaks merged
  const items = [
    ...(day?.busy || []).map((b) => ({ t: b.start, cls: "busy", label: b.title, meta: `${hhmm(b.start)}–${hhmm(b.end)}` })),
    ...plan.breaks.map((b) => ({ t: b.start, cls: `break ${state[b.id] === "taken" ? "done" : ""}`, label: KIND[b.kind] || b.kind, meta: `${b.minutes}m` })),
  ].sort((a, b) => a.t.localeCompare(b.t));
  $("#timeline").innerHTML = "";
  for (const it of items) {
    const li = document.createElement("li"); li.className = it.cls;
    li.innerHTML = `<time>${hhmm(it.t)}</time><span></span><span class="muted small"></span>`;
    li.children[1].textContent = it.label; li.children[2].textContent = it.meta;
    $("#timeline").append(li);
  }

  // Shutdown ritual output from yesterday
  if (tomorrow?.items?.length && tomorrow.forDate === todayISO()) {
    $("#tomorrow").hidden = false;
    $("#tomorrow-list").innerHTML = tomorrow.items.map((t) => `<li></li>`).join("");
    [...$("#tomorrow-list").children].forEach((li, i) => (li.textContent = tomorrow.items[i]));
  }

  // Time given back today
  const taken = log.filter((l) => l.status === "taken" && l.at.startsWith(new Date().toISOString().slice(0, 10)));
  const mins = taken.reduce((s, l) => s + (l.minutes || 0), 0);
  $("#given-back").textContent = mins ? `${mins} min given back today` : "";
}

document.addEventListener("click", async (e) => {
  const lvl = e.target.closest("[data-level]")?.dataset.level;
  if (lvl) { await set(KEYS.energy, { date: todayISO(), level: lvl }); await send({ type: "margin.refresh" }); return render(); }
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (action) { await send({ type: "margin.breakAction", id: $("#next-actions").dataset.id, action }); return render(); }
});
$("#open-dashboard").onclick = () => chrome.runtime.openOptionsPage();
$("#refresh").onclick = async () => { $("#next-when").textContent = "Refreshing…"; await send({ type: "margin.refresh" }); render(); };
chrome.storage.onChanged.addListener(render);
render();
