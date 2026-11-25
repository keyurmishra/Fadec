import { CalendarCheck, Users } from 'lucide-react'

import type { Event } from '../content'
import { fmtDate, parseDay } from '../lib/format'
import { Button } from './Button'
import { Badge, type Tone } from './ui'

export const EVENT_TONE: Record<Event['type'], Tone> = { 'Open day': 'violet', Webinar: 'blue', 'Taster class': 'amber', 'Q&A': 'lime', Community: 'neutral' }

export function EventCard({ ev, going, onRsvp, onCancel }: { ev: Event; going: boolean; onRsvp: () => void; onCancel: () => void }) {
  const full = ev.taken >= ev.seats
  const left = Math.max(0, ev.seats - ev.taken - (going ? 1 : 0))
  const d = parseDay(ev.date)
  return (
    <article className="flex flex-col gap-5 rounded-[2px] border border-line bg-surface p-5 sm:flex-row sm:items-center">
      <div className="flex w-20 shrink-0 flex-col items-center justify-center rounded-[2px] border border-line bg-bg py-3" aria-hidden>
        <span className="text-[10.5px] font-semibold tracking-[0.14em] text-amber-ink uppercase">{d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</span>
        <span className="figures font-display text-[30px] leading-none">{d.getUTCDate()}</span>
        <span className="text-[12px] text-muted">{d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={EVENT_TONE[ev.type]}>{ev.type}</Badge>
          {going && (
            <Badge tone="lime">
              <CalendarCheck className="size-3.5" aria-hidden />
              You’re going
            </Badge>
          )}
        </div>
        <h3 className="font-display text-[21px] leading-snug">{ev.title}</h3>
        <p className="text-[14px] text-muted">
          <span className="sr-only">{fmtDate(ev.date, { weekday: 'long', day: 'numeric', month: 'long' })}, </span>
          {ev.time}, {ev.length}, with {ev.host}
        </p>
        <p className="text-[14px] leading-relaxed text-muted">{ev.body}</p>
      </div>
      <div className="flex shrink-0 flex-row items-center justify-between gap-3 sm:w-40 sm:flex-col sm:items-end">
        <span className={full && !going ? 'text-[13px] text-amber-ink' : 'inline-flex items-center gap-1.5 text-[13px] text-muted'}>
          {full && !going ? 'Fully booked' : (
            <>
              <Users className="size-3.5" aria-hidden />
              {left} places left
            </>
          )}
        </span>
        {going ? (
          <Button variant="secondary" size="sm" onClick={onCancel} aria-label={`Cancel RSVP for ${ev.title}`}>
            Cancel RSVP
          </Button>
        ) : (
          <Button variant={full ? 'secondary' : 'primary'} size="sm" onClick={onRsvp} disabled={full} aria-label={full ? `${ev.title} is full` : `RSVP for ${ev.title}`}>
            {full ? 'Full' : 'RSVP'}
          </Button>
        )}
      </div>
    </article>
  )
}
