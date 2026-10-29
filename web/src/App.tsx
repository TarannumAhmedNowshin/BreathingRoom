import { useEffect, useRef, useState } from 'react'
import sample from './sample-plan.json'
import {
  type BreakType,
  type DayPlan,
  type Stretch,
  formatDuration,
  parseDayPlan,
  stretches,
  summarise,
  toHHMM,
  toMin,
} from './plan'
import { ROOM_URL, dayFromRoom, ideaRequest, importCalendar } from './room'
import { saveApiKey, savedApiKey, storedIdeas, writeIdeas } from './ideas'

type Mode = 'booked' | 'margin'

interface Row {
  id: string
  kind: 'meeting' | BreakType
  start: number
  end: number
  title: string
  note?: string
  pressure: number // 0 calm .. 3 no rest for 3h+
}

const LABEL: Record<BreakType, string> = {
  lunch: 'Lunch',
  water: 'Water',
  move: 'Move',
  break: 'Break',
}

function Icon({ kind }: { kind: BreakType }) {
  const p = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (kind === 'lunch')
    return (
      <svg {...p}>
        <path d="M3 11h18a9 9 0 0 1-18 0Z" />
        <path d="M8 7c0-1.5 1-1.5 1-3M12 7c0-1.5 1-1.5 1-3M16 7c0-1.5 1-1.5 1-3" />
      </svg>
    )
  if (kind === 'water')
    return (
      <svg {...p}>
        <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
      </svg>
    )
  if (kind === 'move')
    return (
      <svg {...p}>
        <circle cx="13" cy="4.5" r="1.8" />
        <path d="M9 21l2.5-6 3 2.5V22M8 11l3.5-3 3 2 3 1M11.5 8l-1 7" />
      </svg>
    )
  return (
    <svg {...p}>
      <path d="M5 20c0-9 6-15 15-15 0 9-6 15-15 15Z" />
      <path d="M5 20 14 11" />
    </svg>
  )
}

function longDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' })
}

// How long you've gone without a rest by the end of this meeting, as a 0-3 level.
function pressureFor(end: number, all: Stretch[]) {
  const s = all.find((x) => end > x.start && end <= x.end)
  const run = s ? end - s.start : 0
  return run >= 180 ? 3 : run >= 120 ? 2 : run >= 60 ? 1 : 0
}

function buildRows(day: DayPlan, withBreaks: boolean): Row[] {
  const all = stretches(withBreaks ? day : { ...day, plan: [] })
  const meetings: Row[] = day.busy.map((b) => {
    const end = toMin(b.end)
    return {
      id: `m-${b.start}-${b.title}`,
      kind: 'meeting',
      start: toMin(b.start),
      end,
      title: b.title,
      pressure: pressureFor(end, all),
    }
  })
  const rests: Row[] = day.plan.map((p) => ({
    id: `r-${p.start}-${p.type}`,
    kind: p.type,
    start: toMin(p.start),
    end: toMin(p.start) + p.minutes,
    title: LABEL[p.type],
    note: p.idea,
    pressure: 0,
  }))
  return [...meetings, ...rests].sort((a, b) => a.start - b.start || a.end - b.end)
}

const blockHeight = (min: number) => Math.min(Math.max(min * 1.25, 50), 150)

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export default function App() {
  const [day, setDay] = useState<DayPlan>(() => dayFromRoom()?.day ?? parseDayPlan(sample))
  const [source, setSource] = useState(() => dayFromRoom()?.label ?? 'Sample day')
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('booked')
  const fileInput = useRef<HTMLInputElement>(null)
  const [apiKey, setApiKey] = useState(savedApiKey)
  const [claude, setClaude] = useState<{ busy: boolean; msg: string }>(() => ({
    busy: false,
    msg: Object.keys(storedIdeas()).length ? 'Today\'s break ideas were written by Claude.' : '',
  }))

  async function askClaude(e: React.FormEvent) {
    e.preventDefault()
    const req = ideaRequest()
    if (!req || !apiKey.trim()) return
    saveApiKey(apiKey.trim())
    setClaude({ busy: true, msg: 'Claude is writing ideas that fit each break…' })
    try {
      const n = await writeIdeas(apiKey.trim(), req.breaks, req.meetings, req.energy)
      const fromRoom = dayFromRoom()
      if (fromRoom) setDay(fromRoom.day)
      setClaude({ busy: false, msg: `Claude wrote ${plural(n, 'idea')}. The break room will use them too.` })
    } catch (err) {
      setClaude({ busy: false, msg: (err as Error).message })
    }
  }

  // Pick up changes made in the break room (energy, meetings added by hand) when you come back.
  useEffect(() => {
    const sync = () => {
      const fromRoom = dayFromRoom()
      if (fromRoom) {
        setDay(fromRoom.day)
        setSource(fromRoom.label)
      }
    }
    window.addEventListener('focus', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('focus', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  async function openFile(file: File) {
    try {
      const text = await file.text()
      if (/\.ics$/i.test(file.name) || text.trimStart().startsWith('BEGIN:VCALENDAR')) {
        const { day: imported, found, skippedAllDay } = importCalendar(text)
        setDay(imported)
        setSource(`${file.name}: ${plural(found, 'meeting')} today${skippedAllDay ? `, ${skippedAllDay} all-day skipped` : ''}`)
        setError(found ? null : `${file.name} has no meetings today. Showing an empty day.`)
        setMode('margin')
        return
      }
      setDay(parseDayPlan(JSON.parse(text)))
      setSource(file.name)
      setError(null)
      setMode('booked')
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? `${file.name} isn't valid JSON. Check for a missing comma or bracket.`
          : `${file.name} couldn't be read. ${(e as Error).message}`,
      )
    }
  }

  const booked = summarise({ ...day, plan: [] })
  const withMargin = summarise(day)
  const isMargin = mode === 'margin'
  const rows = buildRows(day, isMargin)

  const range = (p: Stretch) => `${toHHMM(p.start)} to ${toHHMM(p.end)}`

  let headline: string
  let sub: string
  if (!isMargin) {
    if (booked.problems.length) {
      headline = `Your day has no breathing room from ${range(booked.problems[0])}.`
      sub =
        booked.problems.length > 1
          ? `And ${plural(booked.problems.length - 1, 'more stretch')} like it. ${plural(booked.meetings, 'meeting')}, ${formatDuration(booked.meetingMinutes)} booked.`
          : `${plural(booked.meetings, 'meeting')}, ${formatDuration(booked.meetingMinutes)} booked, and nothing planned in between.`
    } else if (booked.meetings) {
      headline = `${plural(booked.meetings, 'meeting')}, ${formatDuration(booked.meetingMinutes)} booked.`
      sub = 'No stretch runs past two hours, but nothing is planned in between yet.'
    } else {
      headline = 'Nothing booked today.'
      sub = 'Import your calendar to see your real day.'
    }
  } else {
    headline = withMargin.breaks
      ? `Breathing Room found ${plural(withMargin.breaks, 'break')}, ${formatDuration(withMargin.breakMinutes)} back for you.`
      : 'There was no room for a break today.'
    sub = withMargin.problems.length
      ? `${withMargin.problems.map(range).join(' and ')} still has no gap. That one needs a meeting moved.`
      : 'Every stretch now has a rest in it.'
  }

  return (
    <main className={`page mode-${mode}`}>
      <header className="masthead">
        <span className="wordmark">Breathing Room</span>
        <span className="date">{longDate(day.date)}</span>
      </header>

      <section className="lead" aria-live="polite">
        <h1>{headline}</h1>
        <p>{sub}</p>
      </section>

      <div className="switch" role="radiogroup" aria-label="View">
        <button type="button" role="radio" aria-checked={!isMargin} onClick={() => setMode('booked')}>
          As booked
        </button>
        <button type="button" role="radio" aria-checked={isMargin} onClick={() => setMode('margin')}>
          With breaks
        </button>
        <span className="thumb" aria-hidden="true" />
      </div>

      {rows.length > 0 && (
        <ol className="day" aria-label="Today">
          {rows.map((r, i) => {
            const prev = rows.slice(0, i).reverse().find((x) => isMargin || x.kind === 'meeting')
            const gap = prev ? Math.max(r.start - prev.end, 0) : 0
            const isRest = r.kind !== 'meeting'
            const space = isMargin ? Math.min(Math.max(gap * 0.7, 10), 56) : Math.min(gap * 0.25, 14)
            const problem = !isRest && booked.problems.find((p) => p.start === r.start)
            return (
              <li
                key={r.id}
                className={`slot ${isRest ? 'is-rest' : 'is-meeting'}`}
                style={{ marginTop: i === 0 ? 0 : space }}
                aria-hidden={isRest && !isMargin}
              >
                {problem && (
                  <p className="flag">
                    {formatDuration(problem.end - problem.start)} with no breathing room
                  </p>
                )}
                <div className="slot-inner">
                  <div className="time">
                    <span>{toHHMM(r.start)}</span>
                  </div>
                  {isRest ? (
                    <div className={`block rest rest-${r.kind}`}>
                      <Icon kind={r.kind as BreakType} />
                      <div>
                        <p className="title">
                          {r.title}, {formatDuration(r.end - r.start)}
                        </p>
                        <p className="note">{r.note}</p>
                      </div>
                    </div>
                  ) : (
                    <div className={`block meeting p${r.pressure}`} style={{ minHeight: blockHeight(r.end - r.start) }}>
                      <p className="title">{r.title}</p>
                      <p className="note">
                        {toHHMM(r.start)}–{toHHMM(r.end)}
                      </p>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {isMargin && ideaRequest() && (
        <form className="claude" onSubmit={askClaude}>
          <div>
            <p className="title">Break ideas by Claude</p>
            <p className="note" aria-live="polite">
              {claude.msg || 'Optional. Claude rewrites each idea to fit the exact minutes you have, your energy and the Dublin weather. Your key stays in this browser.'}
            </p>
          </div>
          <div className="claude-row">
            <input
              type="password"
              aria-label="Claude API key"
              placeholder="Claude API key (sk-ant-…)"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button type="submit" disabled={claude.busy || !apiKey.trim()}>
              {claude.busy ? 'Writing…' : 'Write my ideas'}
            </button>
          </div>
        </form>
      )}

      <section className="cta">
        <div>
          <p className="title">Ready for today?</p>
          <p className="note">The break room reminds you once, quietly, when each break comes round, and never during a meeting.</p>
        </div>
        <a className="cta-button" href={ROOM_URL}>Start my day</a>
      </section>

      <footer className="source">
        <span>Showing: {source}</span>
        <button type="button" onClick={() => fileInput.current?.click()}>
          Import your calendar (.ics)
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".ics,text/calendar,.json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) openFile(f)
            e.target.value = ''
          }}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </footer>
    </main>
  )
}
