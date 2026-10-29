// OWNER: Person 3 — break ideas matched to the time available, written by Claude.
// Uses the user's own API key from settings. Falls back to the local library if no key / offline.
import { getWeather } from "./weather.js";

const MODEL = "claude-haiku-5-5";

const LIBRARY = {
  breathe: (m) => `${m} min: box breathing — in 4, hold 4, out 4, hold 4`,
  water:   (m) => `${m} min: refill your water and stand while you drink it`,
  move:    (m) => `${m} min: stand up, roll your shoulders, look out a window`,
  lunch:   (m) => `${m} min: eat away from the screen`,
  walk:    (m, w) => w?.dry ? `${m} min: walk outside — it's dry right now (${w.tempC}°C)` : `${m} min: walk a lap of the building — it's wet out`,
  shutdown:(m) => `${m} min: write tomorrow's top 3, close the laptop`,
};

export async function addIdeas(plan, day, settings) {
  const weather = await getWeather(settings.city).catch(() => null);
  const fallback = () => {
    plan.breaks.forEach((b) => (b.idea = (LIBRARY[b.kind] || LIBRARY.move)(b.minutes, weather)));
    return plan;
  };
  if (!settings.anthropicKey) return fallback();

  const prompt = `You plan short, kind, specific breaks for someone with a packed workday (compression burnout).
Energy today: ${plan.energy}. Weather in ${settings.city?.name}: ${weather ? `${weather.tempC}°C, ${weather.dry ? "dry" : "raining"}` : "unknown"}.
Meetings: ${day.busy.map((b) => `${b.start.slice(11, 16)}-${b.end.slice(11, 16)} ${b.title}`).join("; ")}.
For each break below write ONE line, max 90 chars, starting with "<minutes> min:". It must fit exactly in the time. No guilt, no productivity tips, no screens.
Breaks: ${JSON.stringify(plan.breaks.map(({ id, kind, start, minutes }) => ({ id, kind, at: start.slice(11, 16), minutes })))}
Reply with ONLY JSON: {"<id>": "<line>", ...}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": settings.anthropicKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`Claude ${res.status}`);
    const data = await res.json();
    const text = data.content?.[0]?.text || "{}";
    const ideas = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    fallback();
    plan.breaks.forEach((b) => ideas[b.id] && (b.idea = ideas[b.id]));
    plan.generatedBy = "claude";
    return plan;
  } catch (e) {
    console.warn("[Margin] Claude ideas failed, using library", e);
    return fallback();
  }
}
