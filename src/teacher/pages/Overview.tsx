import { AlertCircle, ArrowRight, CalendarDays, ClipboardList, Clock, ListChecks, RotateCw, Upload, UserCheck, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { Button } from '../../components/Button'
import { Badge, Card, EmptyState, Skeleton } from '../../components/ui'
import type { TeacherDashboardDTO } from '../../contracts/teaching'
import { useStore } from '../../lib/store'
import { teacherApi } from '../../lib/teacher-api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { KpiCard, Panel } from '../components/ui'

/*
  The overview: four counts, the week ahead, the work queue and the activity
  feed. Every number here comes from GET /api/teacher/dashboard, which filters
  to the signed-in teacher's courses — nothing is computed in the browser from
  data the teacher should not have.
*/
type Load = { status: 'loading' } | { status: 'ready'; data: TeacherDashboardDTO } | { status: 'error'; error: string; code: number }

const QUICK_ACTIONS = [
  { label: 'Upload lecture', to: '/teach/lectures', icon: Upload },
  { label: 'Create assignment', to: '/teach/assignments', icon: ClipboardList },
  { label: 'Create quiz', to: '/teach/quizzes', icon: ListChecks },
  { label: 'Schedule live class', to: '/teach/live', icon: CalendarDays },
  { label: 'View students', to: '/teach/students', icon: Users },
  { label: 'Take attendance', to: '/teach/attendance', icon: UserCheck },
] as const

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
const subLabel = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const daysTo = (iso: string) => Math.ceil((Date.parse(iso) - Date.now()) / 864e5)

function dueLabel(iso: string) {
  const d = daysTo(iso)
  if (d < 0) return { text: `${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} overdue`, tone: 'danger' as const }
  if (d === 0) return { text: 'Due today', tone: 'amber' as const }
  if (d === 1) return { text: 'Due tomorrow', tone: 'amber' as const }
  return { text: `Due in ${d} days`, tone: 'neutral' as const }
}

export function TeacherOverview() {
  useDocumentTitle('Teaching studio')
  const { session } = useStore()
  const [reload, setReload] = useState(0)
  const [state, setState] = useState<Load>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    teacherApi.get<TeacherDashboardDTO>('/api/teacher/dashboard').then((res) => {
      if (cancelled) return
      setState(res.ok ? { status: 'ready', data: res.data } : { status: 'error', error: res.error, code: res.status })
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  const fullName = session?.role === 'TEACHER' ? session.name : 'Teacher'
  const firstName = fullName.replace(/^(Capt|Dr|Prof)\.?\s+/i, '').split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-5 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-amber-ink uppercase">{greeting}</p>
          <h1 className="font-display text-[34px] leading-[1.05] tracking-[-0.015em] md:text-[44px]">{firstName}</h1>
          <p className="max-w-[62ch] text-[14.5px] leading-relaxed text-muted">
            {state.status === 'ready'
              ? `${state.data.kpis.pendingEvaluations} submissions await marking across ${state.data.kpis.assignedCourses} courses.`
              : 'Loading your teaching week.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button to="/teach/lectures" icon={<Upload className="size-4" aria-hidden />}>
            Upload lecture
          </Button>
          <Button to="/teach/assignments" variant="secondary">
            Create assignment
          </Button>
        </div>
      </div>

      {state.status === 'loading' && <Loading />}

      {state.status === 'error' && (
        <Card className="flex flex-col gap-4 p-6">
          <div role="alert" className="flex items-start gap-2.5 text-[14px] text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{state.error}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<RotateCw className="size-4" aria-hidden />} onClick={() => setReload((n) => n + 1)}>
              Try again
            </Button>
            {state.code === 401 && <Button to="/teach/signin">Sign in again</Button>}
          </div>
        </Card>
      )}

      {state.status === 'ready' && <Ready data={state.data} />}
    </section>
  )
}

function Loading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[118px]" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-72" />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-56" />
          <Skeleton className="h-64" />
        </div>
      </div>
    </div>
  )
}

function Ready({ data }: { data: TeacherDashboardDTO }) {
  const { kpis, quickCounts } = data

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Assigned courses" value={kpis.assignedCourses} sub={`${quickCounts.draftsAwaitingPublish} lectures in draft`} to="/teach/courses" />
        <KpiCard
          label="Enrolled students"
          value={kpis.enrolledStudents}
          sub={quickCounts.atRiskStudents === null ? 'At-risk tracking not available yet' : `${quickCounts.atRiskStudents} falling behind`}
          to="/teach/courses"
          tone="lime"
        />
        <KpiCard label="Published lectures" value={kpis.publishedLectures} sub="Across published courses" to="/teach/lectures" />
        <KpiCard label="Pending evaluations" value={kpis.pendingEvaluations} sub={`${quickCounts.lateSubmissions} submitted late`} to="/teach/submissions?status=PENDING" tone="amber" />
      </dl>

      <div className="flex flex-col gap-3">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Quick actions</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.label}
              to={a.to}
              className="group flex min-h-14 items-center gap-2.5 border border-line bg-surface px-3.5 text-[13px] font-medium transition-colors hover:border-line-strong hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-deep"
            >
              <a.icon className="size-4 shrink-0 text-amber-ink" aria-hidden />
              <span className="min-w-0 truncate">{a.label}</span>
              <ArrowRight className="ml-auto size-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="flex flex-col gap-6">
          <Panel title="Upcoming classes" description="The next sessions across your courses" action={<Link to="/teach/live" className="text-[12.5px] text-muted underline decoration-line-strong underline-offset-4 hover:text-fg">Calendar</Link>}>
            {data.upcomingClasses.length ? (
              <ul className="flex flex-col divide-y divide-line">
                {data.upcomingClasses.map((c) => (
                  <li key={c.id}>
                    <Link to="/teach/live" className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2">
                      <span className="flex w-12 shrink-0 flex-col items-center border-r border-line pr-3">
                        <span className="text-[10.5px] font-semibold tracking-[0.1em] text-muted uppercase">{dayLabel(c.startsAt).split(' ')[0]}</span>
                        <span className="figures text-[19px] leading-tight">{new Date(c.startsAt).getUTCDate()}</span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[14px] font-medium">{c.title}</span>
                        <span className="truncate text-[12.5px] text-muted">
                          {c.courseTitle} · {timeLabel(c.startsAt)} GMT · {c.durationMinutes} min
                        </span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-faint" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="Live classes are not built yet"
                body="Scheduling, the class calendar and attendance arrive in Phase 5. Nothing is listed here until a real session exists."
                className="border-0"
                action={
                  <Button to="/teach/live" size="sm" variant="secondary">
                    What is planned
                  </Button>
                }
              />
            )}
          </Panel>

          <Panel title="Recent submissions" description="Latest work handed in by your students" action={<Link to="/teach/submissions" className="text-[12.5px] text-muted underline decoration-line-strong underline-offset-4 hover:text-fg">Evaluation queue</Link>}>
            {data.recentSubmissions.length ? (
              <ul className="flex flex-col divide-y divide-line">
                {data.recentSubmissions.map((s) => (
                  <li key={s.submissionId} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[14px] font-medium">{s.studentName}</span>
                      <span className="truncate text-[12.5px] text-muted">
                        {s.assignmentTitle} · {s.courseTitle}
                      </span>
                    </span>
                    <span className="figures shrink-0 text-[12px] text-faint">{subLabel(s.submittedAt)}</span>
                    {s.isLate && <Badge tone="amber">Late</Badge>}
                    {s.score === null ? (
                      <Badge tone="neutral">Pending</Badge>
                    ) : (
                      <Badge tone="lime">
                        {s.score}/{s.maxScore}
                      </Badge>
                    )}
                    <Link to="/teach/submissions" className="text-[12.5px] font-medium text-fg underline decoration-amber decoration-1 underline-offset-4">
                      {s.score === null ? 'Evaluate' : 'Review'}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nothing handed in yet" body="Submissions appear here as students upload them." className="border-0" />
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Upcoming deadlines" description="Nearest assignment due dates">
            {data.upcomingDeadlines.length ? (
              <ul className="flex flex-col divide-y divide-line">
                {data.upcomingDeadlines.map((d) => {
                  const due = dueLabel(d.dueAt)
                  return (
                    <li key={d.assignmentId} className="flex flex-col gap-2 px-5 py-3.5">
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-[13.5px] font-medium">{d.title}</span>
                        <Badge tone={due.tone}>{due.text}</Badge>
                      </span>
                      <span className="text-[12px] text-muted">
                        {d.courseTitle} · {d.submitted} in, {d.notSubmitted} missing
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState title="No deadlines" body="Published assignments with a due date show here." className="border-0" />
            )}
          </Panel>

          <Panel title="Recent activity" description="Hand-ins, quiz submissions and enrolments on your courses">
            {data.activity.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {data.activity.map((a) => (
                <li key={a.id}>
                  <Link to={a.href} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-surface-2">
                    <Clock className="mt-0.5 size-3.5 shrink-0 text-faint" aria-hidden />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[13px] leading-snug">{a.text}</span>
                      <span className="figures text-[11.5px] text-faint">
                        {dayLabel(a.at)} · {timeLabel(a.at)} GMT
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            ) : (
              <EmptyState title="No activity yet" body="Hand-ins, quiz submissions and new enrolments on your courses appear here as they happen." className="border-0" />
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}
