// OWNER: Person 2 (integration). Everyone imports from here — do not invent new keys without updating CONTRACT.md.
export const KEYS = {
  settings: "margin.settings",
  profile: "margin.profile",
  energy: "margin.energy",
  day: "margin.day",
  plan: "margin.plan",
  log: "margin.log",
  tomorrow: "margin.tomorrow",
  nudgeState: "margin.nudgeState",
};

export const DEFAULT_SETTINGS = {
  icsUrl: "",            // Google Calendar "Secret address in iCal format", Outlook or iCloud ICS link
  icsText: "",           // contents of an uploaded .ics file
  useSampleData: true,   // the bundled sample day (sample-data/overloaded-day.ics), labelled as sample in the UI
  anthropicKey: "",      // user's own Claude API key
  workdayStart: "09:00",
  workdayEnd: "18:00",
  waterEveryMinutes: 90,
  slackToken: "",        // Slack user token (xoxp-...) with users.profile:write
  discordWebhook: "",    // optional: post "on a break" to a team channel
  city: { name: "Dublin", lat: 53.3498, lon: -6.2603 },
  dimEnabled: true,      // third escalation step
  lowStim: false,        // calm colours, no streaks, short tasks
  teamName: "",
};

export async function get(key, fallback = null) {
  const r = await chrome.storage.local.get(key);
  return r[key] ?? fallback;
}
export async function set(key, value) {
  await chrome.storage.local.set({ [key]: value });
}
export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await get(KEYS.settings, {})) };
}
export async function saveSettings(patch) {
  const s = await getSettings();
  await set(KEYS.settings, { ...s, ...patch });
}
export async function appendLog(entry) {
  const log = await get(KEYS.log, []);
  log.push({ ...entry, at: new Date().toISOString() });
  await set(KEYS.log, log.slice(-500));
}
export function refresh() {
  return chrome.runtime.sendMessage({ type: "margin.refresh" });
}
