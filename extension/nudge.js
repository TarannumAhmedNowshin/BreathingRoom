// OWNER: Person 1 (extension). Gentle escalation: 0 = badge, 1 = notification, 2 = brief screen dim (opt-out in settings).
const TITLES = { lunch: "Lunch time", water: "Water break", move: "Stand up", breathe: "Breathe", walk: "Walk", shutdown: "Time to stop" };

export async function nudge(b, level, settings) {
  if (level === 0) {
    await chrome.action.setBadgeBackgroundColor({ color: "#2F6F5E" });
    await chrome.action.setBadgeText({ text: "•" });
    await chrome.action.setTitle({ title: `Margin — ${TITLES[b.kind] || "Break"}: ${b.idea}` });
  } else if (level === 1) {
    chrome.notifications.create(`margin:${b.id}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: TITLES[b.kind] || "Break",
      message: b.idea || `${b.minutes} min break`,
      buttons: [{ title: "Take it" }, { title: `Snooze 10 min` }],
      priority: 1,
    });
  } else if (level === 2 && settings.dimEnabled) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || "")) return; // can't inject into chrome:// pages
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: dimScreen, args: [TITLES[b.kind] || "Break", b.idea, settings.lowStim] }).catch(() => {});
  }
}

export async function clearNudge(b) {
  await chrome.action.setBadgeText({ text: "" });
  chrome.notifications.clear(`margin:${b.id}`);
}

// Runs inside the web page. Keep it self-contained (no imports).
// TODO(P1): polish the look; keep it dismissible and short (it auto-fades after 8s).
function dimScreen(title, idea, lowStim) {
  if (document.getElementById("margin-dim")) return;
  const el = document.createElement("div");
  el.id = "margin-dim";
  el.style.cssText = `position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;
    background:rgba(20,30,27,${lowStim ? 0.55 : 0.7});color:#F6F1E7;font:500 22px/1.4 system-ui,sans-serif;transition:opacity .6s;cursor:pointer;text-align:center;padding:24px`;
  el.innerHTML = `<div><div style="font-size:14px;letter-spacing:.12em;text-transform:uppercase;opacity:.7">Margin · ${title}</div><div style="margin-top:8px;max-width:520px">${idea || ""}</div><div style="margin-top:16px;font-size:13px;opacity:.6">Click anywhere to dismiss</div></div>`;
  el.onclick = () => el.remove();
  document.documentElement.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 700); }, 8000);
}
