import { AlertCircle, ArrowLeft, Check, RotateCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import { Button } from '../../components/Button'
import { Checkbox, Input, Select, Textarea } from '../../components/Field'
import { useToast } from '../../components/Toast'
import { Badge, Card, EmptyState, Skeleton } from '../../components/ui'
import type { LatePolicy } from '../../contracts/assessment'
import type { TeacherAssignmentDetailDTO } from '../../contracts/teaching'
import { cx } from '../../lib/cx'
import { teacherApi } from '../../lib/teacher-api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { PageHeader, Panel, ProgressBar } from '../components/ui'
import {
  ASSIGNMENT_STATUS_META,
  LATE_POLICY_META,
  LATE_POLICY_OPTIONS,
  SUBMISSION_STATUS_META,
  dateTimeLabel,
  fromDateTimeInput,
  toDateTimeInput,
} from './assessment-meta'

/*
  One assignment: its window and marking rules, the publish checklist, and every
  submission handed in so far.

  The publish button is driven by the same checklist the server enforces, so a
  teacher never sees green here and a 422 on publish. Once published, the
  assignment can be closed early or unpublished; closing keeps it visible but
  stops new work.
*/
type Load = { status: 'loading' } | { status: 'ready'; data: TeacherAssignmentDetailDTO } | { status: 'error'; error: string; code: number }

export function TeacherAssignmentDetail() {
  const { assignmentId = '' } = useParams()
  const toast = useToast()
  const base = `/api/teacher/assignments/${assignmentId}`

  const [state, setState] = useState<Load>({ status: 'loading' })
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState<'details' | 'publish' | 'close' | null>(null)
  const [actionError, setActionError] = useState('')
  const [formError, setFormError] = useState('')

  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [opensAt, setOpensAt] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [maxScore, setMaxScore] = useState('')
  const [attempts, setAttempts] = useState('')
  const [latePolicy, setLatePolicy] = useState<LatePolicy>('MARK_LATE')
  const [allowFileUpload, setAllowFileUpload] = useState(false)

  const titleOf = (load: Load) => (load.status === 'ready' ? load.data.title : 'Assignment')
  useDocumentTitle(`${titleOf(state)} · Teaching studio`)

  function hydrate(data: TeacherAssignmentDetailDTO) {
    setTitle(data.title)
    setInstructions(data.instructions)
    setOpensAt(toDateTimeInput(data.opensAt))
    setDueAt(toDateTimeInput(data.dueAt))
    setMaxScore(String(data.maxScore))
    setAttempts(String(data.attemptsAllowed))
    setLatePolicy(data.latePolicy)
    setAllowFileUpload(data.allowFileUpload)
    setFormError('')
  }

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    teacherApi.get<TeacherAssignmentDetailDTO>(base).then((res) => {
      if (cancelled) return
      if (!res.ok) {
        setState({ status: 'error', error: res.error, code: res.status })
        return
      }
      setState({ status: 'ready', data: res.data })
      hydrate(res.data)
    })
    return () => {
      cancelled = true
    }
    // hydrate only calls setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, reload])

  async function send(method: 'PATCH' | 'POST', path: string, body?: unknown) {
    setActionError('')
    const res = method === 'PATCH' ? await teacherApi.patch<TeacherAssignmentDetailDTO>(path, body ?? {}) : await teacherApi.post<TeacherAssignmentDetailDTO>(path, body ?? {})
    if (!res.ok) {
      setActionError(res.error)
      return null
    }
    setState({ status: 'ready', data: res.data })
    hydrate(res.data)
    return res.data
  }

  async function saveDetails() {
    if (state.status !== 'ready') return
    if (title.trim().length < 2) {
      setFormError('Give the assignment a title of at least 2 characters.')
      return
    }
    const opens = fromDateTimeInput(opensAt)
    const due = fromDateTimeInput(dueAt)
    if (!opens || !due) {
      setFormError('Set both an opening and a due date.')
      return
    }
    if (Date.parse(due) <= Date.parse(opens)) {
      setFormError('The due date must be after the opening date.')
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

    setFormError('')
    setBusy('details')
    const data = await send('PATCH', base, {
      title: title.trim(),
      instructions: instructions.trim(),
      opensAt: opens,
      dueAt: due,
      maxScore: score,
      attemptsAllowed: tries,
      latePolicy,
      allowFileUpload,
    })
    setBusy(null)
    if (data) toast('Assignment saved')
  }

  async function setPublished(next: boolean) {
    setBusy('publish')
    const data = await send('POST', `${base}/${next ? 'publish' : 'unpublish'}`)
    setBusy(null)
    if (data) toast(next ? 'Assignment published' : 'Assignment returned to draft')
  }

  async function setClosed(next: boolean) {
    setBusy('close')
    const data = await send('POST', `${base}/${next ? 'close' : 'reopen'}`)
    setBusy(null)
    if (data) toast(next ? 'Submissions closed' : 'Submissions re-opened')
  }

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Loading assignment">
        <Skeleton className="h-24" />
        <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
        </div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="flex flex-col gap-6">
        <Link to="/teach/assignments" className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden />
          All assignments
        </Link>
        <div className="flex flex-col gap-4 border border-line bg-surface p-6">
          <h1 className="font-display text-[26px]">{state.code === 404 ? 'This assignment is not in one of your courses' : 'The assignment could not be loaded'}</h1>
          <p role="alert" className="flex items-start gap-2.5 text-[14px] text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {state.error}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<RotateCw className="size-4" aria-hidden />} onClick={() => setReload((n) => n + 1)}>
              Try again
            </Button>
            <Button to="/teach/assignments" variant="ghost">
              Back to assignments
            </Button>
          </div>
        </div>
      </section>
    )
  }

  const assignment = state.data
  const statusMeta = ASSIGNMENT_STATUS_META[assignment.status]
  const unmet = assignment.publish.requirements.filter((r) => !r.satisfied)
  const isPublished = assignment.status !== 'DRAFT'
  const duePassed = Date.parse(assignment.dueAt) < Date.now()
  const canReopen = assignment.status === 'CLOSED' && !duePassed
  const handedIn = assignment.enrolledCount ? Math.round((assignment.submissionCount / assignment.enrolledCount) * 100) : 0

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
        <Link to="/teach/assignments" className="inline-flex items-center gap-2 hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden />
          All assignments
        </Link>
        <span aria-hidden className="text-faint">
          /
        </span>
        <Link to="/teach/submissions" className="hover:text-fg">
          Marking queue
        </Link>
      </div>

      <PageHeader
        eyebrow={assignment.courseTitle}
        title={assignment.title}
        description={`${assignment.maxScore} marks · ${assignment.attemptsAllowed} ${assignment.attemptsAllowed === 1 ? 'attempt' : 'attempts'} · ${LATE_POLICY_META[assignment.latePolicy].label.toLowerCase()}`}
        actions={
          <>
            <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
            {isPublished && canReopen && (
              <Button variant="secondary" size="sm" loading={busy === 'close'} onClick={() => setClosed(false)}>
                Reopen
              </Button>
            )}
            {isPublished && assignment.status === 'OPEN' && (
              <Button variant="secondary" size="sm" loading={busy === 'close'} onClick={() => setClosed(true)}>
                Close early
              </Button>
            )}
            {isPublished ? (
              <Button variant="secondary" size="sm" loading={busy === 'publish'} onClick={() => setPublished(false)}>
                Unpublish
              </Button>
            ) : (
              <Button
                size="sm"
                loading={busy === 'publish'}
                disabled={!assignment.publish.canPublish}
                title={assignment.publish.canPublish ? undefined : 'Complete the publish checklist first'}
                onClick={() => setPublished(true)}
              >
                Publish assignment
              </Button>
            )}
          </>
        }
      />

      {actionError && (
        <div role="alert" className="flex items-start gap-2.5 border border-[rgb(160_48_36/0.25)] bg-danger-soft px-4 py-3 text-[13.5px] text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="flex-1">{actionError}</span>
          <button type="button" onClick={() => setActionError('')} className="text-[12px] underline underline-offset-4">
            Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="flex flex-col gap-6">
          <Panel title="Assignment" description="What students are asked to do, and when.">
            <div className="flex flex-col gap-4 px-5 py-4">
              <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Textarea
                label="Instructions"
                rows={6}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                hint={`${instructions.trim().length} characters. At least 20 are needed before publishing.`}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
                <Input
                  label="Due"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Maximum score"
                  inputMode="numeric"
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                />
                <Input
                  label="Attempts allowed"
                  inputMode="numeric"
                  value={attempts}
                  onChange={(e) => setAttempts(e.target.value)}
                />
              </div>
              <Select label="Late work" value={latePolicy} onChange={(e) => setLatePolicy(e.target.value as LatePolicy)} hint={LATE_POLICY_META[latePolicy].description}>
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
              <div className="flex justify-end">
                <Button size="sm" loading={busy === 'details'} onClick={saveDetails}>
                  Save assignment
                </Button>
              </div>
            </div>
          </Panel>

          <Panel
            title="Submissions"
            description={assignment.submissionCount ? `${assignment.submissionCount} handed in · ${assignment.pendingCount} still to mark` : 'Nothing handed in yet.'}
            action={
              assignment.submissionCount ? (
                <Link to="/teach/submissions" className="text-[12.5px] font-medium underline decoration-amber decoration-1 underline-offset-4">
                  Marking queue
                </Link>
              ) : undefined
            }
          >
            {assignment.submissions.length === 0 ? (
              <EmptyState
                className="border-0"
                title="No submissions yet"
                body="Students hand work in from the student portal. As they do, every attempt appears here ready to mark."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {assignment.submissions.map((s) => {
                  const meta = SUBMISSION_STATUS_META[s.status]
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <Link to={`/teach/submissions/${s.id}`} className="truncate text-[13.5px] font-medium underline decoration-transparent underline-offset-4 hover:decoration-amber">
                          {s.studentName}
                        </Link>
                        <span className="text-[11.5px] text-muted">
                          Attempt {s.attemptNumber} · {dateTimeLabel(s.submittedAt)}
                        </span>
                      </span>
                      {s.isLate && <Badge tone="amber">Late</Badge>}
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="figures w-16 text-right text-[13px]">{s.score === null ? '—' : `${s.score}/${s.maxScore}`}</span>
                      <Link to={`/teach/submissions/${s.id}`} className="text-[12.5px] font-medium underline decoration-amber decoration-1 underline-offset-4">
                        Mark
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Publish checklist" description={assignment.publish.canPublish ? 'Every requirement is met.' : `${unmet.length} requirement${unmet.length === 1 ? '' : 's'} outstanding`}>
            <ul className="flex flex-col divide-y divide-line">
              {assignment.publish.requirements.map((r) => (
                <li key={r.key} className="flex items-start gap-2.5 px-5 py-3">
                  <span
                    className={cx(
                      'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                      r.satisfied ? 'border-[rgb(47_107_79/0.4)] bg-lime-soft text-lime-ink' : 'border-line-strong text-faint',
                    )}
                    aria-hidden
                  >
                    {r.satisfied ? <Check className="size-2.5" strokeWidth={3} /> : <X className="size-2.5" />}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className={cx('text-[13px]', r.satisfied ? 'text-muted' : 'font-medium text-fg')}>
                      {r.label}
                      <span className="sr-only">{r.satisfied ? ' — met' : ' — not met'}</span>
                    </span>
                    {!r.satisfied && r.detail && <span className="text-[11.5px] text-muted">{r.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Hand-in" description="Against every enrolment on the course.">
            <div className="flex flex-col gap-3 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-muted">Submitted</span>
                <span className="figures text-[13px]">
                  {assignment.submissionCount} of {assignment.enrolledCount}
                </span>
              </div>
              <ProgressBar value={handedIn} />
              <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3">
                {[
                  { k: 'Awaiting mark', v: assignment.pendingCount },
                  { k: 'Draft marks', v: assignment.draftCount },
                  { k: 'Returned', v: assignment.gradedCount },
                  { k: 'Late', v: assignment.lateCount },
                ].map((s) => (
                  <div key={s.k} className="flex flex-col gap-0.5">
                    <dt className="text-[11.5px] text-muted">{s.k}</dt>
                    <dd className="figures text-[19px] leading-none font-semibold">{s.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Panel>

          {duePassed && assignment.status !== 'DRAFT' && (
            <Card className="px-5 py-4 text-[12.5px] leading-relaxed text-muted">
              The due date has passed, so the assignment shows as closed. Move the due date later to accept work again, or re-open it from the header.
            </Card>
          )}

          <div className="flex flex-col gap-1.5 border border-line bg-surface px-5 py-4 text-[12px] text-muted">
            <span>Created {dateTimeLabel(assignment.createdAt)}</span>
            <span>Updated {dateTimeLabel(assignment.updatedAt)}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
