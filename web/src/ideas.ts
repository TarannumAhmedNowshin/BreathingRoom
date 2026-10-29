// Break ideas written by Claude, matched to the minutes each break actually has.
// Ported from Sadman's planner/ideas.js (branch p3-planner, 357c0fc): same model, prompt rules and weather check.
// Uses the person's own Claude API key, which is kept only in this browser. Ideas are cached per day and
// shared with the break room through localStorage, so reminders show the same ideas.
import { todayKey } from './room'

export const IDEAS_KEY = 'breathing-room:ideas'
export const API_KEY_KEY = 'breathing-room:claude-key'
const MODEL = 'claude-opus-5-5'
const MAX_IDEA = 90

export interface IdeaBreak { id: string; kind: string; start: string; minutes: number }
export interface IdeaMeeting { start: string; end: string; title: string }

interface Stored { date: string; ideas: Record<string, string> }

export function storedIdeas(): Record<string, string> {
  try {
    const s = JSON.parse(localStorage.getItem(IDEAS_KEY) || 'null') as Stored | null
    return s && s.date === todayKey() ? s.ideas : {}
  } catch {
    return {}
  }
}

// Local development only: a key in web/.env.local is used when you run `npm run dev`.
// It is never included in the built site (import.meta.env.DEV is false there), so it can't leak from GitHub Pages.
const devKey = (): string => (import.meta.env.DEV ? (import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined) ?? '' : '')

export const savedApiKey = () => {
  try { return localStorage.getItem(API_KEY_KEY) || devKey() } catch { return devKey() }
}
export const saveApiKey = (k: string) => {
  try { if (k) localStorage.setItem(API_KEY_KEY, k); else localStorage.removeItem(API_KEY_KEY) } catch { /* ignore */ }
}

async function weatherInDublin(): Promise<{ tempC: number; dry: boolean } | null> {
  try {
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=53.3498&longitude=-6.2603&current=temperature_2m,precipitation')
    if (!res.ok) return null
    const c = (await res.json()).current
    return { tempC: Math.round(c.temperature_2m), dry: (c.precipitation ?? 0) < 0.1 }
  } catch {
    return null
  }
}

// Asks Claude for one line per break and stores them for today. Returns how many ideas were written.
export async function writeIdeas(apiKey: string, breaks: IdeaBreak[], meetings: IdeaMeeting[], energy: string | null): Promise<number> {
  if (!breaks.length) return 0
  const weather = await weatherInDublin()
  const prompt = `You plan short, kind, specific breaks for someone with a packed workday (compression burnout).
Energy today: ${energy ?? 'not given'}. Low energy means gentle and restful; good energy can be more active.
Weather in Dublin: ${weather ? `${weather.tempC}°C, ${weather.dry ? 'dry' : 'raining'}` : 'unknown'}. Only suggest going outside if it's dry and the break is 15+ min.
Meetings: ${meetings.map((m) => `${m.start}-${m.end} ${m.title}`).join('; ') || 'none'}.
For each break below write ONE line, max ${MAX_IDEA} chars. It must fit exactly in the time. No guilt, no productivity tips, no screens.
Breaks: ${JSON.stringify(breaks.map(({ id, kind, start, minutes }) => ({ id, kind, at: start, minutes })))}
Reply with ONLY JSON: {"<id>": "<line>", ...}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 16000, output_config: { effort: 'low' }, messages: [{ role: 'user', content: prompt }] }),
  })
  if (res.status === 401) throw new Error('That API key was not accepted. Check it in the Claude Console.')
  if (!res.ok) throw new Error(`Claude couldn't write ideas right now (${res.status}). The built-in ideas still work.`)
  const data = await res.json()
  if (data.stop_reason === 'refusal') throw new Error('Claude declined this request. The built-in ideas still work.')
  // The reply may start with a thinking block, so read only the text blocks.
  const text: string = (data.content || []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('')
  const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Record<string, unknown>
  const ideas: Record<string, string> = {}
  for (const b of breaks) {
    const line = typeof parsed[b.id] === 'string' ? (parsed[b.id] as string).trim() : ''
    if (line && line.length <= MAX_IDEA) ideas[b.id] = line
  }
  try { localStorage.setItem(IDEAS_KEY, JSON.stringify({ date: todayKey(), ideas } satisfies Stored)) } catch { /* ignore */ }
  return Object.keys(ideas).length
}

// ---- Claude plans the free parts of the day, based on today's mood ----
export const DAYPLAN_KEY = 'breathing-room:dayplan'
export interface FreeBlock { start: string; end: string; title: string; why: string }
interface StoredPlan { date: string; mood: string; blocks: FreeBlock[] }

const toM = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const toT = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export function storedDayPlan(): StoredPlan | null {
  try {
    const s = JSON.parse(localStorage.getItem(DAYPLAN_KEY) || 'null') as StoredPlan | null
    return s && s.date === todayKey() ? s : null
  } catch {
    return null
  }
}

// Free gaps of 20+ minutes in the workday, after meetings and planned breaks.
export function freeGaps(meetings: IdeaMeeting[], breaks: IdeaBreak[], dayStart: string, dayEnd: string) {
  const busy = [
    ...meetings.map((m) => [toM(m.start), toM(m.end)]),
    ...breaks.map((b) => [toM(b.start), toM(b.start) + b.minutes]),
  ].sort((a, b) => a[0] - b[0])
  const gaps: [number, number][] = []
  let t = toM(dayStart)
  const end = toM(dayEnd)
  for (const [s, e] of busy) {
    if (s > t && Math.min(s, end) - t >= 20) gaps.push([t, Math.min(s, end)])
    t = Math.max(t, e)
  }
  if (end - t >= 20) gaps.push([t, end])
  return gaps
}

export async function planFreeTime(
  apiKey: string, meetings: IdeaMeeting[], breaks: IdeaBreak[], mood: string, dayStart: string, dayEnd: string,
): Promise<FreeBlock[]> {
  const gaps = freeGaps(meetings, breaks, dayStart, dayEnd)
  if (!gaps.length) {
    localStorage.setItem(DAYPLAN_KEY, JSON.stringify({ date: todayKey(), mood, blocks: [] } satisfies StoredPlan))
    return []
  }
  const prompt = `You help someone with compression burnout plan the FREE parts of today's workday.
Mood today: ${mood} (low = tired, plan gentle and lighter; ok = normal; good = can take on focused work).
Meetings (fixed): ${meetings.map((m) => `${m.start}-${m.end} ${m.title}`).join('; ') || 'none'}.
Breaks already planned (fixed): ${breaks.map((b) => `${b.start} ${b.kind} ${b.minutes}min`).join('; ') || 'none'}.
Free gaps you may fill: ${gaps.map(([a, b]) => `${toT(a)}-${toT(b)}`).join(', ')}.
Rules: put blocks ONLY inside the free gaps, never overlapping each other. Leave some time unplanned, more on a low day.
Block types: deep focus work, light admin/email, prep for the next meeting, a real rest, a walk, something personal.
Low mood: shorter focus (max 45 min), more rest. Good mood: up to 90 min focus. No guilt, no productivity pressure.
Each title max 40 chars, each "why" max 70 chars, plain words.
Reply with ONLY JSON: [{"start":"HH:MM","end":"HH:MM","title":"...","why":"..."}]`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 16000, output_config: { effort: 'low' }, messages: [{ role: 'user', content: prompt }] }),
  })
  if (res.status === 401) throw new Error('That API key was not accepted. Check it in the Claude Console.')
  if (!res.ok) throw new Error(`Claude couldn't plan your day right now (${res.status}).`)
  const data = await res.json()
  if (data.stop_reason === 'refusal') throw new Error('Claude declined this request.')
  const text: string = (data.content || []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('')
  const raw = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)) as unknown[]

  // Keep only blocks that really sit inside a free gap and don't overlap each other.
  const ok: FreeBlock[] = []
  for (const r of Array.isArray(raw) ? raw : []) {
    const b = r as Partial<FreeBlock>
    if (typeof b.start !== 'string' || typeof b.end !== 'string' || !/^\d{2}:\d{2}$/.test(b.start) || !/^\d{2}:\d{2}$/.test(b.end)) continue
    const s = toM(b.start), e = toM(b.end)
    if (e - s < 10 || !gaps.some(([a, z]) => s >= a && e <= z)) continue
    if (ok.some((o) => s < toM(o.end) && e > toM(o.start))) continue
    ok.push({ start: b.start, end: b.end, title: String(b.title || 'Free time').slice(0, 40), why: String(b.why || '').slice(0, 70) })
    if (ok.length >= 10) break
  }
  ok.sort((a, b) => toM(a.start) - toM(b.start))
  localStorage.setItem(DAYPLAN_KEY, JSON.stringify({ date: todayKey(), mood, blocks: ok } satisfies StoredPlan))
  return ok
}
