import { AlertCircle, Plus, RotateCw, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { Button } from '../../components/Button'
import { Input, Select, Textarea } from '../../components/Field'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Badge, Card, Chip, EmptyState, Skeleton } from '../../components/ui'
import type { QuizStatusView, TeacherQuizSummaryDTO } from '../../contracts/quizzes'
import { teacherApi } from '../../lib/teacher-api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { PageHeader, ProgressBar } from '../components/ui'
import { dateTimeLabel, fromDateTimeInput, toDateTimeInput } from './assessment-meta'
import { QUIZ_STATUS_META, RELEASE_META, defaultCloseInput } from './quiz-meta'

/*
  Quizzes & Tests: every quiz across the teacher's courses, with its window,
  how many students have sat it, and how many short answers are waiting.

  New quiz creates a draft with its settings only. Questions are written on the
  quiz's own page, which is also where the publish checklist lives.
*/
type Data = { items: TeacherQuizSummaryDTO[]; courses: { id: string; title: string }[] }
type Load = { status: 'loading' } | { status: 'ready'; data: Data } | { status: 'error'; error: string; code: number }

type StatusFilter = 'ALL' | QuizStatusView
const STATUS_FILTERS: StatusFilter[] = ['ALL', 'OPEN', 'SCHEDULED', 'DRAFT', 'CLOSED']

export function TeacherQuizzes() {
  useDocumentTitle('Quizzes & Tests · Teaching studio')
  const navigate = useNavigate()
  const toast = useToast()

  const [state, setState] = useState<Load>({ status: 'loading' })
  const [reload, setReload] = useState(0)
  const [course, setCourse] = useState('ALL')
  const [status, setStatus] = useState<StatusFilter>('ALL')
  const [query, setQuery] = useState('')

  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [newCourse, setNewCourse] = useState('')
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [opensAt, setOpensAt] = useState('')
  const [closesAt, setClosesAt] = useState('')
  const [duration, setDuration] = useState('30')

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    teacherApi.get<Data>('/api/teacher/quizzes').then((res) => {
      if (cancelled) return
      setState(res.ok ? { status: 'ready', data: res.data } : { status: 'error', error: res.error, code: res.status })
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  const quizzes = state.status === 'ready' ? state.data.items : []
  const courses = state.status === 'ready' ? state.data.courses : []

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return quizzes
      .filter((z) => course === 'ALL' || z.courseId === course)
      .filter((z) => status === 'ALL' || z.status === status)
      .filter((z) => !q || z.title.toLowerCase().includes(q) || z.courseTitle.toLowerCase().includes(q))
  }, [quizzes, course, status, query])

  const countFor = (value: StatusFilter) => quizzes.filter((z) => value === 'ALL' || z.status === value).length
  const toMark = quizzes.reduce((n, z) => n + z.toMarkCount, 0)
  const attempts = quizzes.reduce((n, z) => n + z.attemptCount, 0)

  function openCreate() {
    setCreating(true)
    setFormError('')
    setTitle('')
    setInstructions('')
    setOpensAt(toDateTimeInput(new Date().toISOString()))
    setClosesAt(defaultCloseInput())
    setDuration('30')
    setNewCourse(courses[0]?.id ?? '')
  }

  async function submitCreate() {
    if (!newCourse) return setFormError('Choose the course this quiz belongs to.')
    if (title.trim().length < 2) return setFormError('Give the quiz a title of at least 2 characters.')
    const opens = fromDateTimeInput(opensAt)
    const closes = fromDateTimeInput(closesAt)
    if (!closes) return setFormError('Choose when the quiz closes.')
    if (opens && Date.parse(closes) <= Date.parse(opens)) return setFormError('The quiz must close after it opens.')
    const minutes = Number(duration)
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) return setFormError('Set a time limit between 1 and 600 minutes.')

    setBusy(true)
    const res = await teacherApi.post<{ id: string }>('/api/teacher/quizzes', {
      courseId: newCourse,
      title: title.trim(),
      instructions: instructions.trim(),
      opensAt: opens,
      closesAt: closes,
      durationMinutes: minutes,
    })
    setBusy(false)
    if (!res.ok) return setFormError(res.error)
    setCreating(false)
    toast('Quiz created as a draft. Add its questions next.')
    navigate(`/teach/quizzes/${res.data.id}`)
  }

  return (
    <section className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Teaching studio"
        title="Quizzes & Tests"
        description="Timed quizzes across your courses. Choice questions are scored the moment a student hands in; short answers wait here for you to mark."
        actions={
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={openCreate} disabled={state.status !== 'ready' || !courses.length}>
            New quiz
          </Button>
        }
      />

      {state.status === 'ready' && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: 'Quizzes', v: String(quizzes.length) },
            { k: 'Open now', v: String(countFor('OPEN')) },
            { k: 'Attempts handed in', v: String(attempts) },
            { k: 'Waiting to mark', v: String(toMark) },
          ].map((s) => (
            <div key={s.k} className="flex flex-col gap-1 border border-line bg-surface px-4 py-3">
              <dt className="text-[11.5px] text-muted">{s.k}</dt>
              <dd className="figures text-[22px] leading-none font-semibold">{s.v}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => (
            <Chip key={f} active={status === f} onClick={() => setStatus(f)}>
              {f === 'ALL' ? 'All' : QUIZ_STATUS_META[f].label}
              <span className="figures text-[11.5px] opacity-70">{countFor(f)}</span>
            </Chip>
          ))}
        </div>
        <div className="flex flex-col gap-3 border-y border-line py-3 sm:flex-row">
          <div className="relative w-full sm:w-[260px]">
            <Input label="Search quizzes" hideLabel placeholder="Search quizzes…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-faint" aria-hidden />
          </div>
          <Select label="Course" hideLabel value={course} onChange={(e) => setCourse(e.target.value)} className="w-full sm:w-[240px]">
            <option value="ALL">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading quizzes">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <Card className="flex flex-col gap-4 p-6">
          <p role="alert" className="flex items-start gap-2.5 text-[14px] text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {state.error}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<RotateCw className="size-4" aria-hidden />} onClick={() => setReload((n) => n + 1)}>
              Try again
            </Button>
            {state.code === 401 && <Button to="/teach/signin">Sign in again</Button>}
          </div>
        </Card>
      )}

      {state.status === 'ready' && !visible.length && (
        <EmptyState
          title={quizzes.length ? 'No quizzes match those filters' : 'No quizzes yet'}
          body={quizzes.length ? 'Clear the search or pick another status.' : 'Create a quiz for one of your courses, write its questions, then publish it.'}
          action={
            quizzes.length ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('')
                  setCourse('ALL')
                  setStatus('ALL')
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button onClick={openCreate}>New quiz</Button>
            )
          }
        />
      )}

      {state.status === 'ready' && visible.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-[13.5px]">
            <caption className="sr-only">Quizzes across your courses</caption>
            <thead className="text-[11.5px] tracking-[0.06em] text-muted uppercase">
              <tr className="border-b border-line">
                <th scope="col" className="px-5 py-3 font-medium">Quiz</th>
                <th scope="col" className="px-3 py-3 font-medium">Window</th>
                <th scope="col" className="w-[160px] px-3 py-3 font-medium">Students sat</th>
                <th scope="col" className="px-3 py-3 font-medium">Results</th>
                <th scope="col" className="px-3 py-3 font-medium">Status</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((z) => {
                const meta = QUIZ_STATUS_META[z.status]
                const sat = z.enrolledCount ? Math.round((z.studentCount / z.enrolledCount) * 100) : 0
                return (
                  <tr key={z.id} className="align-middle">
                    <th scope="row" className="px-5 py-3.5 font-normal">
                      <Link to={`/teach/quizzes/${z.id}`} className="font-medium underline decoration-transparent underline-offset-4 hover:decoration-amber">
                        {z.title}
                      </Link>
                      <span className="block max-w-[46ch] truncate text-[12px] text-muted">
                        {z.courseTitle} · {z.questionCount} {z.questionCount === 1 ? 'question' : 'questions'} · {z.maxScore} marks
                      </span>
                    </th>
                    <td className="px-3 py-3.5 text-muted">
                      <span className="block">Closes {dateTimeLabel(z.closesAt)}</span>
                      <span className="block text-[11.5px] text-faint">
                        {z.durationMinutes} min · {z.attemptsAllowed} {z.attemptsAllowed === 1 ? 'attempt' : 'attempts'} · pass {z.passPercent}%
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <ProgressBar value={sat} label={`${z.studentCount}/${z.enrolledCount}`} />
                    </td>
                    <td className="px-3 py-3.5">
                      {z.toMarkCount > 0 ? (
                        <Badge tone="amber">{z.toMarkCount} to mark</Badge>
                      ) : z.averagePercent !== null ? (
                        <span className="figures text-[13px]">Average {z.averagePercent}%</span>
                      ) : (
                        <span className="text-[12.5px] text-muted">Nothing yet</span>
                      )}
                      <span className="mt-1 block text-[11.5px] text-muted">{RELEASE_META[z.releasePolicy].label}</span>
                    </td>
                    <td className="px-3 py-3.5">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link to={`/teach/quizzes/${z.id}`} className="text-[13px] font-medium underline decoration-amber decoration-1 underline-offset-4" aria-label={`Open ${z.title}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {state.status === 'ready' && (
        <p className="text-[12px] text-muted">
          {visible.length} of {quizzes.length} quizzes shown. Times use this device's time zone.
        </p>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New quiz"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitCreate} loading={busy}>
              Create draft
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-muted">This creates a draft. You add the questions and publish it from the quiz's own page.</p>
          <Select label="Course" value={newCourse} onChange={(e) => setNewCourse(e.target.value)}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Air law mock 7" />
          <Textarea label="Instructions" optional rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Shown before a student starts." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            <Input label="Closes" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
          </div>
          <Input label="Time limit (minutes)" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} hint="Each attempt also ends at the closing time, whichever comes first." />
          {formError && (
            <p role="alert" className="flex items-center gap-1.5 text-[13px] text-danger">
              <AlertCircle className="size-3.5 shrink-0" aria-hidden />
              {formError}
            </p>
          )}
        </div>
      </Modal>
    </section>
  )
}
