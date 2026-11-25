import { CalendarX } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'

import { Button } from '../components/Button'
import { EventCard } from '../components/EventCard'
import { FormError, Input } from '../components/Field'
import { Header } from '../components/Header'
import { Modal } from '../components/Modal'
import { PageIntro } from '../components/PageIntro'
import { useToast } from '../components/Toast'
import { Chip, Container, EmptyState, Reveal } from '../components/ui'
import { EVENTS, EVENT_TYPES, type Event, type EventType } from '../content'
import { postJson } from '../lib/api'
import { fmtDate } from '../lib/format'
import { useStore } from '../lib/store'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { validateRsvp } from '../shared/validation'

export function Events() {
  useDocumentTitle('Events')
  const [params, setParams] = useSearchParams()
  const { rsvps, cancelRsvp } = useStore()
  const toast = useToast()
  const type = params.get('type') as EventType | null
  const mine = params.get('mine') === '1'
  const [target, setTarget] = useState<Event | null>(null)

  const set = (key: string, value: string | null) => {
    // Read the live URL, not the render-time params, so quick successive changes never drop one.
    setParams(
      () => {
        const next = new URLSearchParams(window.location.search)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  const list = useMemo(() => EVENTS.filter((e) => (!type || e.type === type) && (!mine || rsvps.some((r) => r.event === e.id))), [type, mine, rsvps])
  const byMonth = useMemo(() => {
    const m = new Map<string, Event[]>()
    for (const e of list) {
      const k = fmtDate(e.date, { month: 'long', year: 'numeric' })
      m.set(k, [...(m.get(k) ?? []), e])
    }
    return [...m.entries()]
  }, [list])

  return (
    <>
      <Header />
      <PageIntro kicker="Briefings" title="Open days, tasters and Q&As" body="Every event is live online and free. Sit in on a real ground-school briefing, meet the captains who teach it, and ask anything." meta="All times GMT" />
      <section className="pb-24">
        <Container className="flex flex-col gap-8">
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1" role="group" aria-label="Event type">
            <Chip active={!type && !mine} onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              All events
            </Chip>
            {EVENT_TYPES.map((t) => (
              <Chip key={t} active={type === t} onClick={() => set('type', type === t ? null : t)}>
                {t}
              </Chip>
            ))}
            <span className="mx-1 w-px shrink-0 self-stretch bg-line" aria-hidden />
            <Chip active={mine} onClick={() => set('mine', mine ? null : '1')}>
              My RSVPs ({rsvps.length})
            </Chip>
          </div>

          <p className="sr-only" role="status" aria-live="polite">
            {list.length} events
          </p>

          {byMonth.length ? (
            byMonth.map(([month, evs]) => (
              <section key={month} className="flex flex-col gap-3" aria-label={month}>
                <h2 className="flex items-center gap-3 border-b border-line pb-2 font-display text-[26px] leading-none tracking-[-0.01em]">
                  {month}
                  <span className="figures font-sans text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">
                    {evs.length} {evs.length === 1 ? 'event' : 'events'}
                  </span>
                </h2>
                <ul className="flex flex-col gap-3">
                  {evs.map((ev) => (
                    <Reveal as="li" key={ev.id}>
                      <EventCard
                        ev={ev}
                        going={rsvps.some((r) => r.event === ev.id)}
                        onRsvp={() => setTarget(ev)}
                        onCancel={() => {
                          cancelRsvp(ev.id)
                          toast(`RSVP cancelled: ${ev.title}`)
                        }}
                      />
                    </Reveal>
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <EmptyState
              icon={<CalendarX className="size-6" aria-hidden />}
              title={mine ? 'You have no RSVPs yet' : 'Nothing of that type is scheduled'}
              body={mine ? 'Pick an open day or taster class and save your place.' : 'New events are added every few weeks. Try another type.'}
              action={
                <Button variant="secondary" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                  Show all events
                </Button>
              }
            />
          )}
        </Container>
      </section>
      <RsvpModal ev={target} onClose={() => setTarget(null)} />
    </>
  )
}

function RsvpModal({ ev, onClose }: { ev: Event | null; onClose: () => void }) {
  const { addRsvp, rsvps, student } = useStore()
  const toast = useToast()
  const last = rsvps[rsvps.length - 1]
  const [name, setName] = useState(last?.name ?? '')
  const [email, setEmail] = useState(last?.email ?? student?.email ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!ev) return
    const body = { event: ev.id, name, email }
    const errs = validateRsvp(body)
    setErrors(errs)
    setFormError('')
    if (Object.keys(errs).length) return
    setLoading(true)
    const res = await postJson<{ ref: string }>('/api/rsvp', body)
    setLoading(false)
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {})
      setFormError(res.error)
      return
    }
    addRsvp({ ref: res.data.ref, event: ev.id, name: name.trim(), email: email.trim() })
    toast(`You’re going: ${ev.title}`)
    onClose()
  }

  return (
    <Modal open={!!ev} onClose={onClose} title={ev ? `RSVP: ${ev.title}` : 'RSVP'}>
      {ev && (
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <p className="text-[14.5px] text-muted">
            {fmtDate(ev.date, { weekday: 'long', day: 'numeric', month: 'long' })}, {ev.time}, {ev.length}. We email the joining link the day before.
          </p>
          <Input label="Your name" autoComplete="name" value={name} error={errors.name} onChange={(e) => setName(e.target.value)} data-autofocus />
          <Input label="Email" type="email" autoComplete="email" value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
          {(formError || errors.event) && <FormError>{errors.event ?? formError}</FormError>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Save my place
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
