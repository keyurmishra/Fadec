import { AlertCircle, Plus, RotateCw, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { Button } from '../../components/Button'
import { Checkbox, Input, Select, Textarea } from '../../components/Field'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Badge, Card, Chip, EmptyState, Skeleton } from '../../components/ui'
import type { LatePolicy } from '../../contracts/assessment'
import type { AssignmentStatusView, TeacherAssignmentSummaryDTO } from '../../contracts/teaching'
import { teacherApi } from '../../lib/teacher-api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { PageHeader, ProgressBar } from '../components/ui'
import {
  ASSIGNMENT_STATUS_META,
  LATE_POLICY_META,
  LATE_POLICY_OPTIONS,
  dateTimeLabel,
  defaultDueInput,
  fromDateTimeInput,
  toDateTimeInput,
} from './assessment-meta'

/*
  Assignments: every task set across the teacher's courses, with its window, how
  many students have handed in, and how much marking is outstanding.

  The New assignment dialog creates a draft. Nothing reaches a student until the
  assignment is published from its own screen, which is where the itemised
  publish checklist lives.
*/
type Load =
  | { status: 'loading' }
  | { status: 'ready'; data: { items: TeacherAssignmentSummaryDTO[]; courses: { id: string; title: string }[] } }
  | { status: 'error'; error: string; code: number }

type StatusFilter = 'ALL' | AssignmentStatusView

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'OPEN', 'SCHEDULED', 'DRAFT', 'CLOSED']

const matchesStatus = (assignment: TeacherAssignmentSummaryDTO, filter: StatusFilter) => filter === 'ALL' || assignment.status === filter

export function TeacherAssignments() {
  useDocumentTitle('Assignments · Teaching studio')
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
  const [opensAt, setOpensAt] = useState(() => toDateTimeInput(new Date().toISOString()))
  const [dueAt, setDueAt] = useState(defaultDueInput)
  const [maxScore, setMaxScore] = useState('100')
  const [attempts, setAttempts] = useState('1')
  const [latePolicy, setLatePolicy] = useState<LatePolicy>('MARK_LATE')
  const [allowFileUpload, setAllowFileUpload] = useState(false)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    teacherApi.get<{ items: TeacherAssignmentSummaryDTO[]; courses: { id: string; title: string }[] }>('/api/teacher/assignments').then((res) => {
      if (cancelled) return
      setState(res.ok ? { status: 'ready', data: res.data } : { status: 'error', error: res.error, code: res.status })
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  const assignments = state.status === 'ready' ? state.data.items : []
  const courses = state.status === 'ready' ? state.data.courses : []

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return assignments
      .filter((a) => course === 'ALL' || a.courseId === course)
      .filter((a) => matchesStatus(a, status))
      .filter((a) => !q || a.title.toLowerCase().includes(q) || a.courseTitle.toLowerCase().includes(q))
  }, [assignments, course, status, query])

  const countFor = (value: StatusFilter) => assignments.filter((a) => matchesStatus(a, value)).length
  const pendingMarking = assignments.reduce((n, a) => n + a.pendingCount, 0)
  const openNow = assignments.filter((a) => a.status === 'OPEN').length

  function openCreate() {
    setCreating(true)
    setFormError('')
    setTitle('')
    setInstructions('')
    setOpensAt(toDateTimeInput(new Date().toISOString()))
    setDueAt(defaultDueInput())
    setMaxScore('100')
    setAttempts('1')
    setLatePolicy('MARK_LATE')
    setAllowFileUpload(false)
    setNewCourse(courses[0]?.id ?? '')
  }

  async function submitCreate() {
    if (!newCourse) {
      setFormError('Choose the course this assignment belongs to.')
      return
    }
    if (title.trim().length < 2) {
      setFormError('Give the assignment a title of at least 2 characters.')
      return
    }
    const due = fromDateTimeInput(dueAt)
    if (!due) {
      setFormError('Choose a due date and time.')
      return
    }
    const score = Number(maxScore)
    if (!Number.isInteger(score) || score < 1 || score > 1000) {
      setFormError('The maximum score must be a whole number between 1 and 1,000.')
      return
    }
    const tries = Number(attempts)
    if (!Number.isInteger(tries) || tries < 1 || tries > 10) {
      setFormError('Allow between 1 and 10 attempts.')
      return
    }

    setBusy(true)
    const res = await teacherApi.post<{ id: string }>('/api/teacher/assignments', {
      courseId: newCourse,
      title: title.trim(),
      instructions: instructions.trim(),
      opensAt: fromDateTimeInput(opensAt),
      dueAt: due,
      maxScore: score,
      attemptsAllowed: tries,
      latePolicy,
      allowFileUpload,
    })
    setBusy(false)
    if (!res.ok) {
      setFormError(res.error)
      return
    }
    setCreating(false)
    toast('Assignment created as a draft')
    navigate(`/teach/assignments/${res.data.id}`)
  }

  return (
    <section className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Teaching studio"
        title="Assignments"
        description="Tasks set across your courses: the window students may hand in, the late policy, and how much marking is still outstanding."
        actions={
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={openCreate} disabled={state.status !== 'ready' || !courses.length}>
            New assignment
          </Button>
        }
      />

      {state.status === 'ready' && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: 'Assignments', v: String(assignments.length) },
            { k: 'Open now', v: String(openNow) },
            { k: 'Awaiting marking', v: String(pendingMarking) },
            { k: 'Drafts', v: String(countFor('DRAFT')) },
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
              {f === 'ALL' ? 'All' : ASSIGNMENT_STATUS_META[f].label}
              <span className="figures text-[11.5px] opacity-70">{countFor(f)}</span>
            </Chip>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-y border-line py-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative w-full sm:w-[260px]">
              <Input label="Search assignments" hideLabel placeholder="Search assignments…" value={query} onChange={(e) => setQuery(e.target.value)} />
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
          <Link to="/teach/submissions" className="text-[13px] font-medium underline decoration-amber decoration-1 underline-offset-4">
            Open the marking queue
          </Link>
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading assignments">
          {[0, 1, 2, 3, 4].map((i) => (
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
          title={assignments.length ? 'No assignments match those filters' : 'No assignments yet'}
          body={assignments.length ? 'Clear the search or pick another status.' : 'Create an assignment for one of your courses, then publish it when the instructions are ready.'}
          action={
            assignments.length ? (
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
              <Button onClick={openCreate}>New assignment</Button>
            )
          }
        />
      )}

      {state.status === 'ready' && visible.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[13.5px]">
            <caption className="sr-only">Assignments across your courses</caption>
            <thead className="text-[11.5px] tracking-[0.06em] text-muted uppercase">
              <tr className="border-b border-line">
                <th scope="col" className="px-5 py-3 font-medium">Assignment</th>
                <th scope="col" className="px-3 py-3 font-medium">Window</th>
                <th scope="col" className="w-[170px] px-3 py-3 font-medium">Handed in</th>
                <th scope="col" className="px-3 py-3 font-medium">Marking</th>
                <th scope="col" className="px-3 py-3 font-medium">Late policy</th>
                <th scope="col" className="px-3 py-3 font-medium">Status</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((a) => {
                const meta = ASSIGNMENT_STATUS_META[a.status]
                const handedIn = a.enrolledCount ? Math.round((a.submissionCount / a.enrolledCount) * 100) : 0
                return (
                  <tr key={a.id} className="align-middle">
                    <th scope="row" className="px-5 py-3.5 font-normal">
                      <Link to={`/teach/assignments/${a.id}`} className="font-medium underline decoration-transparent underline-offset-4 hover:decoration-amber">
                        {a.title}
                      </Link>
                      <span className="block max-w-[46ch] truncate text-[12px] text-muted">{a.courseTitle}</span>
                    </th>
                    <td className="px-3 py-3.5 text-muted">
                      <span className="block">Due {dateTimeLabel(a.dueAt)}</span>
                      <span className="block text-[11.5px] text-faint">
                        {a.attemptsAllowed} {a.attemptsAllowed === 1 ? 'attempt' : 'attempts'} · {a.maxScore} marks
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <ProgressBar value={handedIn} label={`${a.submissionCount}/${a.enrolledCount}`} />
                    </td>
                    <td className="px-3 py-3.5">
                      {a.pendingCount > 0 ? (
                        <Badge tone="amber">{a.pendingCount} to mark</Badge>
                      ) : a.draftCount > 0 ? (
                        <Badge tone="blue">{a.draftCount} draft saved</Badge>
                      ) : a.submissionCount ? (
                        <Badge tone="lime">All returned</Badge>
                      ) : (
                        <span className="text-[12.5px] text-muted">Nothing yet</span>
                      )}
                      {a.pendingCount > 0 && a.draftCount > 0 && (
                        <span className="mt-1 block text-[11.5px] text-muted">{a.draftCount} draft saved</span>
                      )}
                      {a.lateCount > 0 && <span className="mt-1 block text-[11.5px] text-muted">{a.lateCount} late</span>}
                    </td>
                    <td className="px-3 py-3.5 text-[12.5px] text-muted">{LATE_POLICY_META[a.latePolicy].label}</td>
                    <td className="px-3 py-3.5">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        to={`/teach/assignments/${a.id}`}
                        className="text-[13px] font-medium underline decoration-amber decoration-1 underline-offset-4"
                        aria-label={`Open ${a.title}`}
                      >
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
          {visible.length} of {assignments.length} assignments shown. Opening and closing times use this device's time zone.
        </p>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New assignment"
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
          <p className="text-[13px] leading-relaxed text-muted">
            This creates a draft. Publish it from its own screen once the instructions, window and marking rules are right.
          </p>
          <Select label="Course" value={newCourse} onChange={(e) => setNewCourse(e.target.value)}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Navigation log: Bristol–Exeter" />
          <Textarea
            label="Instructions"
            rows={4}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="What should students submit, and how is it assessed?"
            hint="At least 20 characters are needed before it can be published."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            <Input label="Due" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Maximum score" inputMode="numeric" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
            <Input label="Attempts allowed" inputMode="numeric" value={attempts} onChange={(e) => setAttempts(e.target.value)} />
          </div>
          <Select label="Late work" value={latePolicy} onChange={(e) => setLatePolicy(e.target.value as LatePolicy)}>
            {LATE_POLICY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Checkbox label="Students may attach a file" checked={allowFileUpload} onChange={(e) => setAllowFileUpload(e.target.checked)} />
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
