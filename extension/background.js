// OWNER: Person 2 (integration). This is the glue: calendar -> planner -> ideas -> storage -> alarms -> nudges.
import { KEYS, get, set, getSettings, appendLog } from "../shared/storage.js";
import { todayISO, toLocalISO, addMinutes, hhmm } from "../shared/time.js";
import { getDay, busyAt } from "../integration/calendar.js";
import { setBreakStatus, clearBreakStatus } from "../integration/status.js";
import { buildPlan } from "../planner/planner.js";
import { addIdeas } from "../planner/ideas.js";
import { nudge, clearNudge } from "./nudge.js";

const ESCALATE_EVERY_MIN = 3;   // badge -> notification -> dim
const SNOOZE_MIN = 10;

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  chrome.alarms.create("margin.refresh", { periodInMinutes: 30 });
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html#welcome") });
  await rebuild().catch((e) => console.error("[Margin] rebuild", e));
});
chrome.runtime.onStartup.addListener(() => rebuild().catch(console.error));

export async function rebuild() {
  const settings = await getSettings();
  const date = todayISO();
  const energy = await get(KEYS.energy);
  const level = energy?.date === date ? energy.level : "ok";

  const day = await getDay(date, settings);
  let plan = buildPlan(day, level, settings);
  plan = await addIdeas(plan, day, settings);
  plan.source = day.busy[0]?.source || (settings.useSampleData ? "sample" : "none");

  await set(KEYS.day, day);
  await set(KEYS.plan, plan);
  const prev = await get(KEYS.nudgeState, {});
  if (prev.date !== date) await set(KEYS.nudgeState, { date });
  await scheduleBreaks(plan);
  return plan;
}

async function scheduleBreaks(plan) {
  for (const a of await chrome.alarms.getAll()) if (a.name.startsWith("break:")) await chrome.alarms.clear(a.name);
  const now = Date.now();
  for (const b of plan.breaks) {
    const when = new Date(b.start).getTime();
    if (when > now) chrome.alarms.create(`break:${b.id}:0`, { when });
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "margin.refresh") return rebuild();
  if (alarm.name.startsWith("break:")) {
    const [, id, lvl] = alarm.name.split(":");
    return fireBreak(id, Number(lvl));
  }
  if (alarm.name.startsWith("end:")) return clearBreakStatus(await getSettings());
});

async function fireBreak(id, level) {
  const [plan, day, settings, state] = [await get(KEYS.plan), await get(KEYS.day), await getSettings(), await get(KEYS.nudgeState, {})];
  const b = plan?.breaks.find((x) => x.id === id);
  if (!b || state[id] === "taken" || state[id] === "skipped") return;

  // Meeting-aware: never nudge mid-meeting — wait until the meeting ends.
  const meeting = busyAt(day, toLocalISO(new Date()));
  if (meeting) {
    chrome.alarms.create(`break:${id}:${level}`, { when: new Date(meeting.end).getTime() + 60_000 });
    return;
  }
  await nudge(b, level, settings);
  const maxLevel = settings.dimEnabled ? 2 : 1;
  if (level < maxLevel) chrome.alarms.create(`break:${id}:${level + 1}`, { delayInMinutes: ESCALATE_EVERY_MIN });
}

export async function breakAction(id, action) {
  const plan = await get(KEYS.plan);
  const b = plan?.breaks.find((x) => x.id === id);
  if (!b) throw new Error(`No break ${id}`);
  const state = await get(KEYS.nudgeState, {});
  for (const lvl of [0, 1, 2]) await chrome.alarms.clear(`break:${id}:${lvl}`);
  await clearNudge(b);

  if (action === "snooze") {
    chrome.alarms.create(`break:${id}:0`, { delayInMinutes: SNOOZE_MIN });
    state[id] = "snoozed";
  } else if (action === "take") {
    state[id] = "taken";
    const endISO = addMinutes(toLocalISO(new Date()), b.minutes);
    await setBreakStatus({ ...(await getSettings()), profileName: (await get(KEYS.profile))?.name }, { endISO, endsAt: hhmm(endISO) }).catch(console.warn);
    chrome.alarms.create(`end:${id}`, { when: new Date(endISO).getTime() });
  } else if (action === "skip") {
    state[id] = "skipped";
  }
  await set(KEYS.nudgeState, state);
  await appendLog({ breakId: id, kind: b.kind, minutes: b.minutes, status: action === "take" ? "taken" : action === "snooze" ? "snoozed" : "skipped" });
  return state[id];
}

// Messages from popup / dashboard
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "margin.refresh": return rebuild();
      case "margin.breakAction": return breakAction(msg.id, msg.action);
      case "margin.testNudge": {           // demo helper: fire the next break now at a given level
        const plan = await get(KEYS.plan);
        const b = plan?.breaks[0];
        if (b) await nudge(b, msg.level ?? 1, await getSettings());
        return b?.id;
      }
    }
  })().then((result) => sendResponse({ ok: true, result })).catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});

// Notification buttons: [Take it, Snooze]
chrome.notifications.onButtonClicked.addListener((nid, idx) => {
  if (!nid.startsWith("margin:")) return;
  breakAction(nid.slice(7), idx === 0 ? "take" : "snooze");
});
chrome.notifications.onClicked.addListener((nid) => {
  if (nid.startsWith("margin:")) chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html#today") });
});
