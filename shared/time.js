// Shared time helpers. All plan/day times are LOCAL ISO strings without offset: "2026-10-29T13:00:00".
const pad = (n) => String(n).padStart(2, "0");

export function toLocalISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}
export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function at(dateISO, hhmm) {
  return `${dateISO}T${hhmm}:00`;
}
export function parse(iso) {
  return new Date(iso);
}
export function minutesBetween(a, b) {
  return Math.round((parse(b) - parse(a)) / 60000);
}
export function addMinutes(iso, m) {
  return toLocalISO(new Date(parse(iso).getTime() + m * 60000));
}
export function hhmm(iso) {
  const d = parse(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
