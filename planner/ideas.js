// OWNER: Person 3 — break ideas matched to the time available, written by Claude.
// Uses the user's own API key from settings. Falls back to the local library if no key / offline.
// Ideas are cached per day: if the stored plan has the same breaks, its Claude ideas are reused.
import { getWeather } from "./weather.js";
import { KEYS, get } from "../shared/storage.js";

const MODEL = "claude-opus-5-5";
const MAX_IDEA = 90;

const LIBRARY = {
  breathe: (m) => `${m} min: box breathing — in 4, hold 4, out 4, hold 4`,
  water:   (m) => `${m} min: refill your water and stand while you drink it`,
  move:    (m) => `${m} min: stand up, roll your shoulders, look out a window`,
  lunch:   (m) => `${m} min: eat away from the screen`,
  walk:    (m, w) => w?.dry ? `${m} min: walk outside — it's dry right now (${w.tempC}°C)` : `${m} min: walk a lap of the building — it's wet out`,
  shutdown:(m) => `${m} min: write tomorrow's top 3, close the laptop`,
};

const libraryIdea = (b, weather) => {
  const idea = (LIBRARY[b.kind] || LIBRARY.move)(b.minutes, weather);
  return b.withWater ? `${idea}, then refill your water` : idea;
};

const signature = (plan) => `${plan.date}|${plan.energy}|${plan.breaks.map((b) => `${b.kind}@${b.start}+${b.minutes}${b.withWater ? "w" : ""}`).join(",")}`;

export async function addIdeas(plan, day, settings) {
  const weather = await getWeather(settings.city).catch(() => null);
  const fallback = () => {
    plan.breaks.forEach((b) => (b.idea = libraryIdea(b, weather)));
    return plan;
  };
  if (!settings.anthropicKey) return fallback();

  const cached = globalThis.chrome?.storage ? await get(KEYS.plan).catch(() => null) : null;
  if (cached?.generatedBy === "claude" && signature(cached) === signature(plan)) {
    plan.breaks.forEach((b, i) => (b.idea = cached.breaks[i].idea));
    plan.generatedBy = "claude";
    return plan;
  }

  const prompt = `You plan short, kind, specific breaks for someone with a packed workday (compression burnout).
Energy today: ${plan.energy}. Low energy means gentle and restful; high energy can be more active.
Weather in ${settings.city?.name}: ${weather ? `${weather.tempC}°C, ${weather.dry ? "dry" : "raining"}` : "unknown"}. Only suggest going outside if it's dry and the break is 15+ min.
Meetings: ${day.busy.map((b) => `${b.start.slice(11, 16)}-${b.end.slice(11, 16)} ${b.title}`).join("; ")}.
For each break below write ONE line, max ${MAX_IDEA} chars, starting with "<minutes> min:". It must fit exactly in the time. No guilt, no productivity tips, no screens.
If a break has "withWater": true, the line should also include drinking water.
Breaks: ${JSON.stringify(plan.breaks.map(({ id, kind, start, minutes, reason, withWater }) => ({ id, kind, at: start.slice(11, 16), minutes, reason, withWater })))}
Reply with ONLY JSON: {"<id>": "<line>", ...}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": settings.anthropicKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        fallbacks: "default",
        output_config: { effort: "low" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.stop_reason === "refusal") throw new Error("Claude declined the request");
    // The reply starts with a thinking block, so read only the text blocks.
    const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    const ideas = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    fallback();
    plan.breaks.forEach((b) => {
      const idea = typeof ideas[b.id] === "string" ? ideas[b.id].trim() : "";
      if (idea && idea.length <= MAX_IDEA) b.idea = idea;
    });
    plan.generatedBy = "claude";
    return plan;
  } catch (e) {
    console.warn("[Margin] Claude ideas failed, using library", e);
    return fallback();
  }
}
