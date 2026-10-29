// Connects this dashboard to the break room (../breathing-room).
// Both run on the same site, so they share one localStorage state: whatever calendar you
// import here is what the break room reminds you about, and vice versa.
import type { BreakType, DayPlan } from './plan'

interface RoomEvent { title: string; start: string; end: string }
interface RoomBreak { type: 'drink' | 'move' | 'lunch' | 'shutdown'; start: string; len: number; idea: string; title: string }
interface RoomState {
  events: RoomEvent[]
  eventsDate: string
  isExample: boolean
  settings: { dayStart: string; dayEnd: string }
  day: { date: string; energy: 'low' | 'ok' | 'good' | null }
}
interface PlannerApi {
  buildPlan(events: RoomEvent[], opts: { dayStart: string; dayEnd: string; energy: string | null }): { breaks: RoomBreak[] }
}
interface IcsApi {
  parse(text: string, day: Date): { events: RoomEvent[]; total: number; skippedAllDay: number }
}
declare global {
  interface Window { Planner?: PlannerApi; ICS?: IcsApi }
}

export const ROOM_KEY = 'breathing-room:v1'
export const ROOM_URL = './room/'

const TYPE: Record<RoomBreak['type'], BreakType> = { drink: 'water', move: 'move', lunch: 'lunch', shutdown: 'break' }

export function todayKey(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const roomAvailable = () => !!(window.Planner && window.ICS)

function readState(): RoomState | null {
  try {
    const raw = localStorage.getItem(ROOM_KEY)
    return raw ? (JSON.parse(raw) as RoomState) : null
  } catch {
    return null
  }
}

function writeState(patch: Partial<RoomState>) {
  const cur = readState() ?? ({} as RoomState)
  try {
    localStorage.setItem(ROOM_KEY, JSON.stringify({ ...cur, ...patch }))
  } catch {
    /* storage unavailable: the dashboard still works for this visit */
  }
}

// Today's day as the dashboard's DayPlan, planned by the break room's planner.
// Returns null when the break room hasn't been used yet (the dashboard then shows its sample).
export function dayFromRoom(): { day: DayPlan; label: string } | null {
  const s = readState()
  if (!s || !window.Planner || s.isExample || s.eventsDate !== todayKey() || !s.events?.length) return null
  return { day: planDay(s.events, s), label: 'Your calendar' }
}

function planDay(events: RoomEvent[], s: RoomState | null): DayPlan {
  const settings = s?.settings ?? { dayStart: '09:00', dayEnd: '17:30' }
  const energy = s?.day?.date === todayKey() ? s.day.energy : null
  const { breaks } = window.Planner!.buildPlan(events, { dayStart: settings.dayStart, dayEnd: settings.dayEnd, energy })
  return {
    date: todayKey(),
    busy: [...events].sort((a, b) => a.start.localeCompare(b.start)).map((e) => ({ start: e.start, end: e.end, title: e.title })),
    plan: breaks
      .map((b) => ({ start: b.start, minutes: b.len, type: TYPE[b.type] ?? 'break', idea: b.idea }))
      .sort((a, b) => a.start.localeCompare(b.start)),
  }
}

// Import an .ics file: today's meetings become the shared day for the dashboard and the break room.
export function importCalendar(text: string): { day: DayPlan; found: number; skippedAllDay: number } {
  if (!window.ICS || !window.Planner) throw new Error('The calendar reader did not load. Reload the page.')
  const { events, skippedAllDay } = window.ICS.parse(text, new Date())
  writeState({ events, eventsDate: todayKey(), isExample: false })
  return { day: planDay(events, readState()), found: events.length, skippedAllDay }
}

// Live calendar link (Google, Outlook, Apple or any iCal link). The browser can't read another
// site's calendar directly, so a small helper fetches it and passes it straight back (stores nothing).
// The helper lives in ../calendar-proxy and is deployed on Vercel.
export const CALENDAR_HELPER = 'https://calendar-proxy-iota.vercel.app/api/ics'
const LINK_KEY = 'breathing-room:calendar-link'

export function savedCalendarLink(): string {
  try { return localStorage.getItem(LINK_KEY) || '' } catch { return '' }
}
export function forgetCalendarLink() {
  try { localStorage.removeItem(LINK_KEY) } catch { /* ignore */ }
}

export async function connectCalendarLink(link: string) {
  const res = await fetch(`${CALENDAR_HELPER}?url=${encodeURIComponent(link.trim())}`, { cache: 'no-store' })
  const text = await res.text()
  if (!res.ok) throw new Error(text || `The calendar couldn't be read (${res.status}).`)
  const result = importCalendar(text)
  try { localStorage.setItem(LINK_KEY, link.trim()) } catch { /* ignore */ }
  return result
}
