import { useRef, useState } from 'react'
import sample from './sample-plan.json'
import {
  type BreakType,
  type DayPlan,
  type Stretch,
  formatDuration,
  parseDayPlan,
  summarise,
  toHHMM,
  toMin,
} from './plan'

type Kind = BreakType | 'meeting'

interface Item {
  kind: Kind
  start: number
  end: number
  title: string
  note?: string
}

const LABEL: Record<BreakType, string> = {
  lunch: 'Lunch',
  water: 'Water',
  move: 'Move',
  break: 'Break',
}

function Icon({ kind }: { kind: Kind }) {
  const p = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (kind) {
    case 'meeting':
      return (
        <svg {...p}>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.3" />
          <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M15 14.2c2.6-.4 4.8 1.2 5.5 4.3" />
        </svg>
      )
    case 'lunch':
      return (
        <svg {...p}>
          <path d="M3 11h18a9 9 0 0 1-18 0Z" />
          <path d="M8 7c0-1.5 1-1.5 1-3M12 7c0-1.5 1-1.5 1-3M16 7c0-1.5 1-1.5 1-3" />
        </svg>
      )
    case 'water':
      return (
        <svg {...p}>
          <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
        </svg>
      )
    case 'move':
      return (
        <svg {...p}>
          <circle cx="13" cy="4.5" r="1.8" />
          <path d="M9 21l2.5-6 3 2.5V22M8 11l3.5-3 3 2 3 1M11.5 8l-1 7" />
        </svg>
      )
    default:
      return (
        <svg {...p}>
          <path d="M5 20c0-9 6-15 15-15 0 9-6 15-15 15Z" />
          <path d="M5 20 14 11" />
        </svg>
      )
  }
}

function dateParts(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return { day: iso, month: '', year: '', weekday: '' }
  return {
    weekday: d.toLocaleDateString('en-IE', { weekday: 'long' }),
    day: String(d.getDate()),
    month: d.toLocaleDateString('en-IE', { month: 'long' }),
    year: String(d.getFullYear()),
  }
}

function buildItems(day: DayPlan): Item[] {
  const meetings: Item[] = day.busy.map((b) => ({
    kind: 'meeting',
    start: toMin(b.start),
    end: toMin(b.end),
    title: b.title,
  }))
  const rests: Item[] = day.plan.map((p) => ({
    kind: p.type,
    start: toMin(p.start),
    end: toMin(p.start) + p.minutes,
    title: LABEL[p.type],
    note: p.idea,
  }))
  return [...meetings, ...rests].sort((a, b) => a.start - b.start || a.end - b.end)
}

// Capsule height grows with the length of the block, within limits.
const capsuleHeight = (min: number) => Math.min(Math.max(min * 1.6, 56), 168)
// Connector height grows with the free time before the next block.
const connectorHeight = (gap: number) => Math.min(Math.max(gap * 0.6, 14), 64)

export default function App() {
  const [day, setDay] = useState<DayPlan>(() => parseDayPlan(sample))
  const [source, setSource] = useState('Sample day')
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function openFile(file: File) {
    try {
      setDay(parseDayPlan(JSON.parse(await file.text())))
      setSource(file.name)
      setError(null)
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? `${file.name} isn't valid JSON. Check for a missing comma or bracket.`
          : `${file.name} couldn't be read. ${(e as Error).message}`,
      )
    }
  }

  const s = summarise(day)
  const items = buildItems(day)
  const d = dateParts(day.date)
  const problemAt = (start: number): Stretch | undefined => s.problems.find((p) => p.start === start)

  return (
    <main className="page">
      <header className="top">
        <p className="weekday">{d.weekday}</p>
        <h1 className="date">
          {d.day} {d.month} <span className="year">{d.year}</span>
        </h1>

        <div className="chips" aria-label="Today in numbers">
          <div className="chip chip-meeting">
            <strong>{s.meetings}</strong> meetings
            <span>{formatDuration(s.meetingMinutes)}</span>
          </div>
          <div className="chip chip-rest">
            <strong>{s.breaks}</strong> breaks
            <span>{formatDuration(s.breakMinutes)} back</span>
          </div>
          {s.longest && (
            <div className={`chip ${s.problems.length ? 'chip-alert' : 'chip-calm'}`}>
              <strong>{formatDuration(s.longest.end - s.longest.start)}</strong> longest run
              <span>without a rest</span>
            </div>
          )}
        </div>

        <div className="source">
          <span>{source}</span>
          <button type="button" onClick={() => fileInput.current?.click()}>
            Open a plan file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) openFile(f)
              e.target.value = ''
            }}
          />
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </header>

      {items.length === 0 ? (
        <p className="empty">Nothing on today. Open a plan file to see a day.</p>
      ) : (
        <ol className="timeline" aria-label="Today's timeline">
          {items.map((it, i) => {
            const prev = items[i - 1]
            const gap = prev ? it.start - prev.end : 0
            const problem = it.kind === 'meeting' ? problemAt(it.start) : undefined
            return (
              <li key={`${it.kind}-${it.start}-${it.title}`} className="row-wrap">
                {prev && (
                  <div className="connector" style={{ height: connectorHeight(gap) }} aria-hidden="true">
                    {gap >= 15 && <span>{formatDuration(gap)} free</span>}
                  </div>
                )}
                {problem && (
                  <div className="warning">
                    {formatDuration(problem.end - problem.start)} with no gap, {toHHMM(problem.start)} to{' '}
                    {toHHMM(problem.end)}
                  </div>
                )}
                <div className={`row kind-${it.kind}`}>
                  <div className="capsule" style={{ height: capsuleHeight(it.end - it.start) }}>
                    <Icon kind={it.kind} />
                  </div>
                  <div className="text">
                    <p className="when">
                      {toHHMM(it.start)}–{toHHMM(it.end)} ({formatDuration(it.end - it.start)})
                    </p>
                    <p className="title">{it.title}</p>
                    {it.note && <p className="note">{it.note}</p>}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </main>
  )
}
