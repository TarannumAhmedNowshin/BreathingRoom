// Shared data format (agreed with the team, do not change).
export type BreakType = 'lunch' | 'water' | 'move' | 'break'

export interface BusyBlock {
  start: string // "HH:MM"
  end: string
  title: string
}

export interface PlanItem {
  start: string
  minutes: number
  type: BreakType
  idea: string
}

export interface DayPlan {
  date: string // "YYYY-MM-DD"
  busy: BusyBlock[]
  plan: PlanItem[]
}

// A gap shorter than this between two meetings doesn't count as a rest.
export const MIN_REST = 10
// A stretch this long with no rest is flagged as a problem.
export const LONG_STRETCH = 120

export function toMin(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) throw new Error(`"${hhmm}" is not a time. Use HH:MM, like 09:30.`)
  return Number(m[1]) * 60 + Number(m[2])
}

export function toHHMM(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export interface Stretch {
  start: number
  end: number
  titles: string[]
}

// Joins meetings into continuous stretches. Two meetings belong to the same
// stretch when the gap between them is under MIN_REST minutes and no planned
// break sits in that gap.
export function stretches(day: DayPlan): Stretch[] {
  const blocks = day.busy
    .map((b) => ({ start: toMin(b.start), end: toMin(b.end), title: b.title }))
    .sort((a, b) => a.start - b.start)
  const breaks = day.plan.map((p) => toMin(p.start))
  const out: Stretch[] = []
  for (const b of blocks) {
    const last = out[out.length - 1]
    const gapHasBreak = last ? breaks.some((t) => t >= last.end && t < b.start) : false
    if (last && b.start - last.end < MIN_REST && !gapHasBreak) {
      last.end = Math.max(last.end, b.end)
      last.titles.push(b.title)
    } else {
      out.push({ start: b.start, end: b.end, titles: [b.title] })
    }
  }
  return out
}

export interface Summary {
  meetings: number
  meetingMinutes: number
  breaks: number
  breakMinutes: number
  longest: Stretch | null
  problems: Stretch[]
}

export function summarise(day: DayPlan): Summary {
  const s = stretches(day)
  const longest = s.reduce<Stretch | null>(
    (best, cur) => (!best || cur.end - cur.start > best.end - best.start ? cur : best),
    null,
  )
  return {
    meetings: day.busy.length,
    meetingMinutes: day.busy.reduce((t, b) => t + (toMin(b.end) - toMin(b.start)), 0),
    breaks: day.plan.length,
    breakMinutes: day.plan.reduce((t, p) => t + p.minutes, 0),
    longest,
    problems: s.filter((x) => x.end - x.start >= LONG_STRETCH),
  }
}

// Checks a file someone loaded and explains what's wrong in plain words.
export function parseDayPlan(raw: unknown): DayPlan {
  const d = raw as DayPlan
  if (!d || typeof d !== 'object') throw new Error('The file is not a day plan.')
  if (!Array.isArray(d.busy)) throw new Error('The file has no "busy" list.')
  if (!Array.isArray(d.plan)) throw new Error('The file has no "plan" list.')
  const types: BreakType[] = ['lunch', 'water', 'move', 'break']
  d.busy.forEach((b) => {
    if (toMin(b.end) <= toMin(b.start)) throw new Error(`"${b.title}" ends before it starts.`)
  })
  d.plan.forEach((p) => {
    toMin(p.start)
    if (!types.includes(p.type)) throw new Error(`"${p.type}" is not a break type. Use lunch, water, move or break.`)
    if (!(p.minutes > 0)) throw new Error(`The break at ${p.start} needs a length in minutes.`)
  })
  return d
}
