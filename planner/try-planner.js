// Dev only (runs in Node, the extension never loads it). Prints the plan for the bundled sample day
// and the dummy days in scenarios.json, using the real buildDay(), so the rules can be checked by eye.
// Usage: node planner/try-planner.js [sample|<scenario>|all] [low|ok|high]
import { readFile } from "node:fs/promises";
import { parseIcs, buildDay } from "../integration/calendar.js";
import { DEFAULT_SETTINGS } from "../shared/storage.js";
import { buildPlan } from "./planner.js";

const ICONS = { lunch: "🥪", water: "💧", move: "🧍", breathe: "🌬️", walk: "🚶", shutdown: "🌙" };
const ENERGIES = ["low", "ok", "high"];
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const scenarios = [
  {
    name: "sample",
    description: "The bundled overloaded day (sample-data/overloaded-day.ics)",
    events: parseIcs(await read("../sample-data/overloaded-day.ics")).filter((e) => e.start.startsWith("2026-10-29")),
  },
  ...JSON.parse(await read("./scenarios.json")),
];
const args = process.argv.slice(2);
const energy = args.find((a) => ENERGIES.includes(a));
const name = args.find((a) => !ENERGIES.includes(a)) ?? "sample";
const chosen = name === "all" ? scenarios : scenarios.filter((s) => s.name === name);
if (!chosen.length) {
  console.error(`Unknown scenario "${name}". Try: all, ${scenarios.map((s) => s.name).join(", ")}`);
  process.exit(1);
}

for (const scenario of chosen) {
  const settings = { ...DEFAULT_SETTINGS, ...scenario.settings };
  const day = buildDay("2026-10-29", scenario.events, settings);
  const plan = buildPlan(day, energy ?? scenario.energy ?? "ok", settings);
  const rows = [
    ...day.busy.map((b) => ({ t: b.start, line: `${b.start.slice(11, 16)}–${b.end.slice(11, 16)}  📅 ${b.title}` })),
    ...plan.breaks.map((b) => ({
      t: b.start,
      line: `${b.start.slice(11, 16)}  ${ICONS[b.kind]} ${b.kind}${b.withWater ? " + water" : ""}, ${b.minutes} min · ${b.reason}`,
    })),
  ].sort((a, b) => a.t.localeCompare(b.t));

  console.log(`\n=== ${scenario.name}: ${scenario.description} ===`);
  console.log(`workday ${settings.workdayStart}–${settings.workdayEnd}, energy ${plan.energy}\n`);
  rows.forEach((r) => console.log(r.line));
  if (plan.warnings.length) console.log(`\n${plan.warnings.map((w) => `⚠️  ${w}`).join("\n")}`);
}
