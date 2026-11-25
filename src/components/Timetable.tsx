import { Video } from 'lucide-react'

import type { ClassSession, SessionKind } from '../content'
import { addDays, fmtDate } from '../lib/format'
import { cx } from '../lib/cx'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const KIND_STYLE: Record<SessionKind, string> = {
  'Ground school': 'bg-surface-2 text-fg [--depth-edge:rgb(15_33_55/0.16)]',
  Briefing: 'bg-[rgb(29_63_99/0.07)] text-navy-ink [--depth-edge:rgb(29_63_99/0.2)]',
  Simulator: 'bg-amber-soft text-amber-ink [--depth-edge:rgb(176_118_28/0.28)]',
  Tutorial: 'bg-lime-soft text-lime-ink [--depth-edge:rgb(47_107_79/0.24)]',
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/*
  A week of classes. From md up it is a time grid (Mon–Sat columns, one row
  per half hour across the busiest span); below md it becomes an agenda list
  grouped by day.
*/
export function Timetable({ sessions, weekStart, today, compact = false, className }: { sessions: ClassSession[]; weekStart: string; today?: string; compact?: boolean; className?: string }) {
  const startMin = Math.floor(Math.min(...sessions.map((s) => toMin(s.start))) / 60) * 60
  const endMin = Math.ceil(Math.max(...sessions.map((s) => toMin(s.end))) / 60) * 60
  const hours: number[] = []
  for (let m = startMin; m < endMin; m += 60) hours.push(m)
  const rowH = compact ? 34 : 46
  const pxPerMin = rowH / 60

  return (
    <div className={className}>
      {/* grid */}
      <div className="hidden md:block" role="table" aria-label={`Timetable for the week of ${fmtDate(weekStart, { day: 'numeric', month: 'long' })}`}>
        <div role="rowgroup">
          <div role="row" className="grid grid-cols-[52px_repeat(6,1fr)] gap-1.5 pb-2">
            <div role="columnheader">
              <span className="sr-only">Time</span>
            </div>
            {DAYS.map((d, i) => {
              const iso = addDays(weekStart, i)
              const isToday = iso === today
              return (
                <div role="columnheader" key={d} className={cx('flex h-8 items-center justify-center gap-1.5 rounded-[2px] text-[12px]', isToday ? 'bg-fg font-medium text-[#fdfbf7]' : 'text-muted')}>
                  {d} <span className={isToday ? '' : 'text-faint'}>{fmtDate(iso, { day: 'numeric' })}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div role="rowgroup" className="relative grid grid-cols-[52px_repeat(6,1fr)] gap-1.5">
          <div role="row" className="contents">
            <div role="cell" className="relative" style={{ height: hours.length * rowH }}>
              {hours.map((h, i) => (
                <span key={h} className="absolute right-2 text-[11px] text-faint" style={{ top: i * rowH - 6 }}>
                  {String(h / 60).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            {DAYS.map((d, day) => (
              <div role="cell" key={d} className="relative rounded-[2px] bg-[rgb(15_33_55/0.025)]" style={{ height: hours.length * rowH, backgroundImage: `repeating-linear-gradient(to bottom, rgb(15 33 55 / 0.07) 0 1px, transparent 1px ${rowH}px)` }}>
                {sessions
                  .filter((s) => s.day === day)
                  .map((s) => {
                    const top = (toMin(s.start) - startMin) * pxPerMin
                    const h = (toMin(s.end) - toMin(s.start)) * pxPerMin
                    return (
                      <div key={s.id} className={cx('absolute inset-x-1 overflow-hidden rounded-[2px] border border-line px-2 py-1', KIND_STYLE[s.kind])} style={{ top: top + 1, height: h - 2 }}>
                        <p className="truncate text-[11.5px] leading-tight font-semibold">{s.title}</p>
                        {h > 34 && (
                          <p className="truncate text-[10.5px] opacity-85">
                            {s.start}–{s.end}, {s.kind}
                          </p>
                        )}
                        <span className="sr-only">
                          {DAYS[day]} {s.start} to {s.end}, {s.kind}, {s.room}, with {s.who}
                        </span>
                      </div>
                    )
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* agenda */}
      <ol className="flex flex-col gap-4 md:hidden">
        {DAYS.map((d, day) => {
          const list = sessions.filter((s) => s.day === day)
          if (!list.length) return null
          const iso = addDays(weekStart, day)
          return (
            <li key={d} className="flex flex-col gap-2">
              <h4 className={cx('text-[13px] font-medium', iso === today ? 'text-lime-ink' : 'text-muted')}>
                {fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'short' })}
                {iso === today && ', today'}
              </h4>
              <ul className="flex flex-col gap-2">
                {list.map((s) => (
                  <li key={s.id} className={cx('flex items-center gap-3 rounded-[2px] border border-line p-3', KIND_STYLE[s.kind])}>
                    <span className="w-[74px] shrink-0 text-[12.5px] font-medium">
                      {s.start}–{s.end}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[14px] font-semibold text-fg">{s.title}</span>
                      <span className="inline-flex items-center gap-1 truncate text-[12.5px]">
                        <Video className="size-3" aria-hidden />
                        {s.kind}, {s.room}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
