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

export const savedApiKey = () => {
  try { return localStorage.getItem(API_KEY_KEY) || '' } catch { return '' }
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
