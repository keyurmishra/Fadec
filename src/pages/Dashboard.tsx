import { CalendarCheck, ChevronLeft, ChevronRight, FileText, GraduationCap, LogOut, Sparkles, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'

import { Button, IconButton } from '../components/Button'
import { Checkbox, FormError, Input } from '../components/Field'
import { Header } from '../components/Header'
import { Modal } from '../components/Modal'
import { Timetable } from '../components/Timetable'
import { useToast } from '../components/Toast'
import { Badge, Card, Container, EmptyState, Kicker, Skeleton, TabPanel, Tabs } from '../components/ui'
import { ASSIGNMENTS, DEMO_STUDENT, EVENTS, GRADES, HUB_TODAY, PROGRAMMES, TIMETABLE, type Grade } from '../content'
import { postJson } from '../lib/api'
import { cx } from '../lib/cx'
import { addDays, daysBetween, fmtDate, mondayOf } from '../lib/format'
import { img } from '../lib/images'
import { useStore } from '../lib/store'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { validateSignIn } from '../shared/validation'

type Tab = 'timetable' | 'grades' | 'deadlines' | 'applications'

const moduleMark = (g: Grade) => {
  const marked = g.items.filter((i) => i.mark !== null)
  if (!marked.length) return null
  const w = marked.reduce((s, i) => s + i.weight, 0)
  return { mark: Math.round(marked.reduce((s, i) => s + i.weight * (i.mark as number), 0) / w), complete: marked.length === g.items.length }
}

const classify = (m: number) => (m >= 80 ? 'Distinction' : m >= 65 ? 'Merit' : m >= 50 ? 'Pass' : 'Refer')

export function Dashboard() {
  useDocumentTitle('Student hub')
  const { student } = useStore()
  return (
    <>
      <Header />
      {student ? <Hub /> : <SignIn />}
    </>
  )
}

function SignIn() {
  const { signIn } = useStore()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [studentId, setStudentId] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e?: FormEvent, values = { email, studentId }) {
    e?.preventDefault()
    const errs = validateSignIn(values)
    setErrors(errs)
    setFormError('')
    if (Object.keys(errs).length) return
    setLoading(true)
    const res = await postJson<{ email: string; studentId: string }>('/api/signin', values)
    setLoading(false)
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {})
      setFormError(res.error)
      return
    }
    signIn(res.data)
    toast('Signed in on this device')
  }

  return (
    <section className="border-b border-line py-14 md:py-20">
      <Container className="grid max-w-[1100px] gap-10 md:grid-cols-[1.05fr_0.95fr] md:items-center">
        <div className="flex flex-col gap-4">
          <Kicker>Student hub</Kicker>
          <h1 className="font-display text-[40px] leading-[1.02] tracking-[-0.015em] md:text-[56px]">Your timetable, tests and training record</h1>
          <p className="max-w-[46ch] text-[16px] leading-relaxed text-muted">Sign in with your student email and ID. This demo keeps the session on this device only.</p>
        </div>
        <Card className="p-6 md:p-8">
          <form onSubmit={submit} noValidate className="flex flex-col gap-5">
            <h2 className="font-display text-[22px] leading-tight">Log in</h2>
            <Input label="Student email" type="email" autoComplete="email" value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Student ID" autoComplete="username" placeholder="CPL-24-01873" value={studentId} error={errors.studentId} onChange={(e) => setStudentId(e.target.value)} />
            {formError && <FormError>{formError}</FormError>}
            <Button type="submit" size="lg" loading={loading}>
              Log in
            </Button>
            <Button
              variant="secondary"
              icon={<Sparkles className="size-4" aria-hidden />}
              onClick={() => {
                setEmail(DEMO_STUDENT.email)
                setStudentId(DEMO_STUDENT.id)
                submit(undefined, { email: DEMO_STUDENT.email, studentId: DEMO_STUDENT.id })
              }}
            >
              Use the demo student
            </Button>
          </form>
        </Card>
      </Container>
    </section>
  )
}

function Hub() {
  const store = useStore()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('timetable')
  const [week, setWeek] = useState(mondayOf(HUB_TODAY))
  const [withdraw, setWithdraw] = useState<string | null>(null)
  const [loadingWeek, setLoadingWeek] = useState(false)
  const programme = PROGRAMMES.find((p) => p.slug === DEMO_STUDENT.programme)!

  const graded = GRADES.map((g) => ({ g, r: moduleMark(g) }))
  const complete = graded.filter((x) => x.r?.complete)
  const hours = complete.reduce((s, x) => s + x.g.hours, 0)
  const avg = complete.length ? Math.round(complete.reduce((s, x) => s + (x.r as { mark: number }).mark * x.g.hours, 0) / hours) : 0
  const open = ASSIGNMENTS.filter((a) => !store.done.includes(a.id))
  const today = TIMETABLE.filter((s) => s.day === (new Date(`${HUB_TODAY}T12:00:00Z`).getUTCDay() + 6) % 7)
  const myEvents = EVENTS.filter((e) => store.rsvps.some((r) => r.event === e.id))

  const changeWeek = (delta: number) => {
    setLoadingWeek(true)
    setWeek((w) => addDays(w, delta * 7))
    setTimeout(() => setLoadingWeek(false), 350)
  }

  return (
    <section className="pt-2 pb-24">
      <Container className="flex flex-col gap-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-4">
            <img src={img('cam-student-2')} alt="" className="size-16 shrink-0 rounded-full border border-line object-cover" />
            <div className="flex flex-col gap-1">
              <p className="text-[14px] text-muted">{fmtDate(HUB_TODAY, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              <h1 className="font-display text-[34px] leading-tight tracking-[-0.015em] md:text-[44px]">Hi, {DEMO_STUDENT.name.split(' ')[0]}</h1>
              <p className="text-[14px] text-muted">
                {programme.title}, {DEMO_STUDENT.cohort}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button to="/subjects" variant="secondary" size="sm">
              Subjects
            </Button>
            <Badge tone="neutral" className="font-mono">
              {store.student?.studentId}
            </Badge>
            <Button variant="secondary" size="sm" icon={<LogOut className="size-4" aria-hidden />} onClick={() => { store.signOut(); toast('Signed out') }}>
              Log out
            </Button>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { k: 'Course complete', v: `${hours} of ${programme.hours} h`, bar: hours / programme.hours, tone: 'bg-lime' },
            { k: 'Average mark', v: `${avg}%`, sub: classify(avg), tone: 'bg-navy' },
            { k: 'Due this fortnight', v: `${open.length}`, sub: open[0] ? `Next: ${fmtDate(open[0].due, { day: 'numeric', month: 'short' })}` : 'All done', tone: 'bg-amber' },
            { k: 'Briefings today', v: `${today.length}`, sub: today[0] ? `${today[0].start} ${today[0].title}` : 'Nothing scheduled', tone: 'bg-blue' },
          ].map((s) => (
            <Card key={s.k} className="flex flex-col gap-2 p-5">
              <dt className="text-[13px] text-muted">{s.k}</dt>
              <dd className="text-[30px] leading-none font-semibold tracking-[-0.03em]">{s.v}</dd>
              {s.bar !== undefined ? (
                <span className="mt-1 h-1 overflow-hidden bg-[rgb(15_33_55/0.1)]" aria-hidden>
                  <span className={cx('block h-full', s.tone)} style={{ width: `${s.bar * 100}%` }} />
                </span>
              ) : (
                <dd className="truncate text-[13px] text-muted">{s.sub}</dd>
              )}
            </Card>
          ))}
        </dl>

        <div className="flex flex-col gap-6">
          <Tabs
            label="Student hub"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'timetable', label: 'Timetable' },
              { value: 'grades', label: 'Grades' },
              { value: 'deadlines', label: 'Deadlines', count: open.length },
              { value: 'applications', label: 'Applications', count: store.applications.length + myEvents.length },
            ]}
          />

          {tab === 'timetable' && (
            <TabPanel value="timetable">
              <Card className="flex flex-col gap-5 p-4 md:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[18px] font-semibold" aria-live="polite">
                    Week of {fmtDate(week, { day: 'numeric', month: 'long' })}
                  </h2>
                  <div className="flex items-center gap-1">
                    <IconButton aria-label="Previous week" onClick={() => changeWeek(-1)}>
                      <ChevronLeft className="size-5" aria-hidden />
                    </IconButton>
                    <Button variant="ghost" size="sm" onClick={() => setWeek(mondayOf(HUB_TODAY))} disabled={week === mondayOf(HUB_TODAY)}>
                      This week
                    </Button>
                    <IconButton aria-label="Next week" onClick={() => changeWeek(1)}>
                      <ChevronRight className="size-5" aria-hidden />
                    </IconButton>
                  </div>
                </div>
                {loadingWeek ? (
                  <div className="flex flex-col gap-2" aria-label="Loading week" role="status">
                    <Skeleton className="h-9" />
                    <Skeleton className="h-[300px]" />
                  </div>
                ) : (
                  <Timetable sessions={TIMETABLE} weekStart={week} today={HUB_TODAY} />
                )}
                <p className="text-[13px] text-muted">All times GMT. Recordings appear in each subject within an hour of the briefing.</p>
              </Card>
            </TabPanel>
          )}

          {tab === 'grades' && (
            <TabPanel value="grades">
              <Card className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-[14px]">
                  <caption className="sr-only">Module marks</caption>
                  <thead className="text-[12.5px] text-muted">
                    <tr className="border-b border-line">
                      <th scope="col" className="px-5 py-4 font-medium">Module</th>
                      <th scope="col" className="px-3 py-4 font-medium">Assessments</th>
                      <th scope="col" className="px-3 py-4 text-right font-medium">Hours</th>
                      <th scope="col" className="px-5 py-4 text-right font-medium">Mark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {graded.map(({ g, r }) => (
                      <tr key={g.code}>
                        <th scope="row" className="px-5 py-4 font-normal">
                          <span className="block font-medium">{g.title}</span>                          <span className="font-mono text-[12.5px] text-faint">{g.code}</span>
                        </th>
                        <td className="px-3 py-4 text-[13px] text-muted">
                          {g.items.map((i) => (
                            <span key={i.name} className="block">
                              {i.name} ({Math.round(i.weight * 100)}%): {i.mark === null ? 'pending' : `${i.mark}`}
                            </span>
                          ))}
                        </td>
                        <td className="px-3 py-4 text-right text-muted">{g.hours}</td>
                        <td className="px-5 py-4 text-right">
                          {r ? (
                            <span className="inline-flex flex-col items-end gap-1">
                              <span className="text-[17px] font-semibold">{r.mark}%</span>
                              {!r.complete && <Badge tone="amber">In progress</Badge>}
                            </span>
                          ) : (
                            <Badge>Not marked</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-line-strong">
                      <th scope="row" colSpan={3} className="px-5 py-4 text-right font-medium text-muted">
                        Hour-weighted average, completed subjects
                      </th>
                      <td className="px-5 py-4 text-right text-[17px] font-semibold text-lime-ink">
                        {avg}% <span className="text-[13px] font-normal text-muted">({classify(avg)})</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </Card>
            </TabPanel>
          )}

          {tab === 'deadlines' && (
            <TabPanel value="deadlines">
              <Card className="flex flex-col p-2 md:p-3">
                <ul className="flex flex-col divide-y divide-line">
                  {ASSIGNMENTS.map((a) => {
                    const doneIt = store.done.includes(a.id)
                    const days = daysBetween(HUB_TODAY, a.due)
                    return (
                      <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                        <Checkbox label={<span className={cx('text-[15px]', doneIt && 'text-muted line-through')}>{a.title}</span>} checked={doneIt} onChange={() => store.toggleDone(a.id)} className="min-w-0 flex-1" />
                        <span className="hidden font-mono text-[12.5px] text-faint sm:inline">{a.code}</span>
                        <Badge tone={doneIt ? 'lime' : days <= 5 ? 'violet' : 'neutral'}>{doneIt ? 'Done' : `Due ${fmtDate(a.due, { day: 'numeric', month: 'short' })}`}</Badge>
                      </li>
                    )
                  })}
                </ul>
                {!open.length && <p className="px-3 py-4 text-[14px] text-lime-ink">Everything is handed in. Enjoy the evening.</p>}
              </Card>
            </TabPanel>
          )}

          {tab === 'applications' && (
            <TabPanel value="applications" className="flex flex-col gap-6">
              {store.applications.length ? (
                <ul className="flex flex-col gap-3">
                  {store.applications.map((a) => {
                    const p = PROGRAMMES.find((x) => x.slug === a.programme)
                    const c = p?.cohorts.find((x) => x.id === a.cohort)
                    return (
                      <Card as="li" key={a.ref} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                        <FileText className="size-6 shrink-0 text-amber-ink" aria-hidden />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="text-[16px] font-medium">{p?.title ?? a.programme}</span>
                          <span className="text-[13.5px] text-muted">
                            {c?.label}, ref <span className="font-mono">{a.ref}</span>, sent {new Date(a.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                        <Badge tone="blue" dot>
                          Under review
                        </Badge>
                        <Button variant="danger" size="sm" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setWithdraw(a.ref)}>
                          Withdraw
                        </Button>
                      </Card>
                    )
                  })}
                </ul>
              ) : (
                <EmptyState
                  icon={<GraduationCap className="size-6" aria-hidden />}
                  title="No applications yet"
                  body="Applying for a second course or a certificate? It shows up here with its status."
                  action={<Button to="/apply">Start an application</Button>}
                />
              )}
              <div className="flex flex-col gap-3">
                <h2 className="text-[18px] font-semibold">Your events</h2>
                {myEvents.length ? (
                  <ul className="flex flex-col gap-2">
                    {myEvents.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 border-b border-line py-3">
                        <CalendarCheck className="size-4 shrink-0 text-amber-ink" aria-hidden />
                        <span className="min-w-0 flex-1 text-[14.5px]">{e.title}</span>
                        <span className="text-[13px] text-muted">
                          {fmtDate(e.date, { day: 'numeric', month: 'short' })}, {e.time}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[14px] text-muted">
                    No RSVPs yet. <Link to="/events" className="inline-flex min-h-10 items-center text-fg underline decoration-amber decoration-1 underline-offset-4">See upcoming events</Link>
                  </p>
                )}
              </div>
            </TabPanel>
          )}
        </div>
      </Container>

      <Modal
        open={!!withdraw}
        onClose={() => setWithdraw(null)}
        title="Withdraw this application?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setWithdraw(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (withdraw) store.withdrawApplication(withdraw)
                setWithdraw(null)
                toast('Application withdrawn')
              }}
            >
              Withdraw
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-muted">Admissions will stop reviewing it. You can apply again later, but your place in the queue is lost.</p>
      </Modal>
    </section>
  )
}
