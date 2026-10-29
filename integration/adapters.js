// OWNER: Person 2. Converts Margin's Day + Plan (CONTRACT.md) into the web dashboard's DayPlan (web/src/plan.ts).
const KIND_TO_TYPE = { lunch: "lunch", water: "water", move: "move", walk: "move", breathe: "break", shutdown: "break" };
const hm = (iso) => iso.slice(11, 16);

export function toWebDayPlan(day, plan) {
  return {
    date: day.date,
    busy: day.busy.map((b) => ({ start: hm(b.start), end: hm(b.end), title: b.title })),
    plan: plan.breaks.map((b) => ({ start: hm(b.start), minutes: b.minutes, type: KIND_TO_TYPE[b.kind] || "break", idea: b.idea || b.kind })),
  };
}
