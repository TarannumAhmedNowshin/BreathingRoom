import { useEffect, useRef, useState } from 'react'
import sample from './sample-plan.json'
import {
  type BreakType,
  type DayPlan,
  formatDuration,
  parseDayPlan,
  summarise,
  toHHMM,
  toMin,
} from './plan'

const MIN_ITEM_PX = 46

const LABEL: Record<BreakType, string> = {
  lunch: 'Lunch',
  water: 'Water',
  move: 'Move',
  break: 'Break',
}

function Icon({ type }: { type: BreakType }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (type) {
    case 'lunch':
      return (
        <svg {...common}>
          <path d="M3 11h18a9 9 0 0 1-18 0Z" />
          <path d="M8 7c0-1.5 1-1.5 1-3M12 7c0-1.5 1-1.5 1-3M16 7c0-1.5 1-1.5 1-3" />
        </svg>
      )
    case 'water':
      return (
        <svg {...common}>
          <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
        </svg>
      )
    case 'move':
      return (
        <svg {...common}>
          <circle cx="13" cy="4.5" r="1.8" />
          <path d="M9 21l2.5-6 3 2.5V22M8 11l3.5-3 3 2 3 1M11.5 8l-1 7" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <path d="M5 20c0-9 6-15 15-15 0 9-6 15-15 15Z" />
          <path d="M5 20 14 11" />
        </svg>
      )
  }
}

function longDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' })
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Taller timeline on phones, where break cards wrap onto more lines.
function usePxPerMin() {
  const query = '(max-width: 640px)'
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow ? 2.8 : 1.6
}

function useNowMinutes() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now.getHours() * 60 + now.getMinutes()
}

export default function App() {
  const [day, setDay] = useState<DayPlan>(() => parseDayPlan(sample))
  const [source, setSource] = useState<string>('Sample day')
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const nowMin = useNowMinutes()
  const PX_PER_MIN = usePxPerMin()

  async function openFile(file: File) {
    try {
      const next = parseDayPlan(JSON.parse(await file.text()))
      setDay(next)
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

  // Timeline runs 08:00 to 19:00, wider if the day goes outside that.
  const allTimes = [
    ...day.busy.flatMap((b) => [toMin(b.start), toMin(b.end)]),
    ...day.plan.flatMap((p) => [toMin(p.start), toMin(p.start) + p.minutes]),
  ]
  const startMin = Math.min(8 * 60, Math.floor(Math.min(...allTimes, 8 * 60) / 60) * 60)
  const endMin = Math.max(19 * 60, Math.ceil(Math.max(...allTimes, 19 * 60) / 60) * 60)
  const y = (min: number) => (min - startMin) * PX_PER_MIN
  const hours: number[] = []
  for (let m = startMin; m <= endMin; m += 60) hours.push(m)
  const showNow = day.date === todayISO() && nowMin >= startMin && nowMin <= endMin

  return (
    <main className="page">
      <header className="intro">
        <p className="date">{longDate(day.date)}</p>
        <h1 className="headline">
          {s.meetings === 0 ? (
            <>No meetings today. {s.breaks > 0 && <>We still planned {s.breaks} breaks.</>}</>
          ) : (
            <>
              {s.meetings} {s.meetings === 1 ? 'meeting' : 'meetings'}, {formatDuration(s.meetingMinutes)} in
              total.{' '}
              {s.longest && (
                <>
                  Your longest run without a rest is{' '}
                  <span className={s.problems.length ? 'hot' : undefined}>
                    {formatDuration(s.longest.end - s.longest.start)}
                  </span>
                  .
                </>
              )}
            </>
          )}
        </h1>
        <p className="lede">
          {s.breaks > 0
            ? `${s.breaks} ${s.breaks === 1 ? 'break' : 'breaks'} fitted into the gaps, ${formatDuration(s.breakMinutes)} back for you.`
            : 'No breaks planned yet.'}{' '}
          {s.problems.length > 0 &&
            s.problems
              .map((p) => `${toHHMM(p.start)} to ${toHHMM(p.end)} has no gap at all.`)
              .join(' ')}
        </p>

        <div className="source">
          <span className="source-name">{source}</span>
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

      <section className="timeline" aria-label="Today's timeline" style={{ height: y(endMin) + 24 }}>
        {hours.map((m) => (
          <div key={m} className="hour" style={{ top: y(m) }}>
            <span>{toHHMM(m)}</span>
          </div>
        ))}

        {s.problems.map((p) => (
          <div
            key={`gap-${p.start}`}
            className="nogap"
            style={{ top: y(p.start), height: y(p.end) - y(p.start) }}
          >
            <span>{formatDuration(p.end - p.start)} with no gap</span>
          </div>
        ))}

        <ol className="lane lane-busy" aria-label="Meetings">
          {[...day.busy]
            .sort((a, b) => toMin(a.start) - toMin(b.start))
            .map((b) => (
              <li
                key={`${b.start}-${b.title}`}
                className="meeting"
                style={{
                  top: y(toMin(b.start)),
                  height: Math.max(y(toMin(b.end)) - y(toMin(b.start)) - 3, 22),
                }}
              >
                <strong>{b.title}</strong>
                <span>
                  {b.start}–{b.end}
                </span>
              </li>
            ))}
        </ol>

        <ol className="lane lane-rest" aria-label="Planned breaks">
          {[...day.plan]
            .sort((a, b) => toMin(a.start) - toMin(b.start))
            .map((p) => (
              <li
                key={`${p.start}-${p.type}`}
                className={`rest rest-${p.type}`}
                style={{ top: y(toMin(p.start)), minHeight: Math.max(p.minutes * PX_PER_MIN, MIN_ITEM_PX) }}
              >
                <Icon type={p.type} />
                <div>
                  <strong>
                    {LABEL[p.type]}, {p.minutes} min <time>{p.start}</time>
                  </strong>
                  <span>{p.idea}</span>
                </div>
              </li>
            ))}
        </ol>

        {showNow && (
          <div className="now" style={{ top: y(nowMin) }}>
            <span>Now</span>
          </div>
        )}
      </section>
    </main>
  )
}
