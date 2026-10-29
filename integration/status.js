// OWNER: Person 2 — auto status sync when a break starts / ends.
// Slack: user token (xoxp-) with scope users.profile:write.  Discord: a channel webhook URL (bots can't set user status).
export async function setBreakStatus(settings, brk) {
  const text = `On a break — back at ${brk.endsAt}`;
  const tasks = [];
  if (settings.slackToken) {
    const expiration = Math.floor(new Date(brk.endISO).getTime() / 1000);
    tasks.push(fetch("https://slack.com/api/users.profile.set", {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.slackToken}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ profile: { status_text: text, status_emoji: ":coffee:", status_expiration: expiration } }),
    }));
  }
  if (settings.discordWebhook) {
    tasks.push(fetch(settings.discordWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `☕ ${settings.profileName || "Someone"} is ${text.toLowerCase()}` }),
    }));
  }
  const results = await Promise.allSettled(tasks);
  return results.map((r) => r.status);
}

export async function clearBreakStatus(settings) {
  if (!settings.slackToken) return;
  await fetch("https://slack.com/api/users.profile.set", {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.slackToken}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ profile: { status_text: "", status_emoji: "" } }),
  });
}
