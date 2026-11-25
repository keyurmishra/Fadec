import { AlertCircle, ArrowLeft, FileText, RotateCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import { Button } from '../../components/Button'
import { Input, Textarea } from '../../components/Field'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Badge, Skeleton } from '../../components/ui'
import type { TeacherSubmissionDetailDTO } from '../../contracts/teaching'
import { teacherApi } from '../../lib/teacher-api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { PageHeader, Panel } from '../components/ui'
import { SUBMISSION_STATUS_META, dateTimeLabel } from './assessment-meta'

/*
  One submission: the answer, the mark, the feedback and the history.

  Draft and published are separate mutations. "Save draft" keeps the mark for
  the teacher; "Save and return" releases it and notifies the student. Once
  released the fields lock, and correcting the mark means withdrawing it with a
  reason first — which is what makes the history panel meaningful rather than
  decorative.
*/
type Load = { status: 'loading' } | { status: 'ready'; data: TeacherSubmissionDetailDTO } | { status: 'error'; error: string; code: number }

const ACTION_LABEL: Record<TeacherSubmissionDetailDTO['revisions'][number]['action'], string> = {
  DRAFT_SAVED: 'Draft saved',
  PUBLISHED: 'Returned to student',
  WITHDRAWN: 'Withdrawn',
}

export function TeacherSubmissionDetail() {
  const { submissionId = '' } = useParams()
  const toast = useToast()
  const base = `/api/teacher/submissions/${submissionId}`

  const [state, setState] = useState<Load>({ status: 'loading' })
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState<'draft' | 'publish' | 'withdraw' | null>(null)
  const [actionError, setActionError] = useState('')
  const [formError, setFormError] = useState('')

  const [score, setScore] = useState('')
  const [feedback, setFeedback] = useState('')

  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')

  const titleOf = (load: Load) => (load.status === 'ready' ? load.data.studentName : 'Submission')
  useDocumentTitle(`${titleOf(state)} · Teaching studio`)

  function hydrate(data: TeacherSubmissionDetailDTO) {
    setScore(data.score === null ? '' : String(data.score))
    setFeedback(data.feedback)
    setFormError('')
  }

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    teacherApi.get<TeacherSubmissionDetailDTO>(base).then((res) => {
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
    const res = method === 'PATCH' ? await teacherApi.patch<TeacherSubmissionDetailDTO>(path, body ?? {}) : await teacherApi.post<TeacherSubmissionDetailDTO>(path, body ?? {})
    if (!res.ok) {
      setActionError(res.error)
      return null
    }
    setState({ status: 'ready', data: res.data })
    hydrate(res.data)
    return res.data
  }

  function parsedScore(maxScore: number): { ok: true; value: number | null } | { ok: false } {
    if (score.trim() === '') return { ok: true, value: null }
    const n = Number(score)
    if (!Number.isInteger(n) || n < 0 || n > maxScore) return { ok: false }
    return { ok: true, value: n }
  }

  async function saveDraft() {
    if (state.status !== 'ready') return
    const parsed = parsedScore(state.data.maxScore)
    if (!parsed.ok) {
      setFormError(`Enter a whole number from 0 to ${state.data.maxScore}, or leave the mark empty.`)
      return
    }
    setFormError('')
    setBusy('draft')
    const data = await send('PATCH', base, { score: parsed.value, feedback })
    setBusy(null)
    if (data) toast('Draft mark saved — not yet visible to the student')
  }

  async function saveAndReturn() {
    if (state.status !== 'ready') return
    const parsed = parsedScore(state.data.maxScore)
    if (!parsed.ok || parsed.value === null) {
      setFormError(`Save a whole-number mark from 0 to ${state.data.maxScore} before returning it.`)
      return
    }
    setFormError('')
    setBusy('publish')
    const saved = await send('PATCH', base, { score: parsed.value, feedback })
    if (!saved) {
      setBusy(null)
      return
    }
    const published = await send('POST', `${base}/publish`)
    setBusy(null)
    if (published) toast('Grade returned to the student')
  }

  async function withdraw() {
    if (reason.trim().length < 5) {
      setReasonError('Give a short reason for withdrawing the grade.')
      return
    }
    setReasonError('')
    setBusy('withdraw')
    const data = await send('POST', `${base}/withdraw`, { reason: reason.trim() })
    setBusy(null)
    if (!data) return
    setWithdrawOpen(false)
    setReason('')
    toast('Grade withdrawn — edit it, then return it again')
  }

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Loading submission">
        <Skeleton className="h-24" />
        <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
          <Skeleton className="h-96" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="flex flex-col gap-6">
        <Link to="/teach/submissions" className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden />
          Marking queue
        </Link>
        <div className="flex flex-col gap-4 border border-line bg-surface p-6">
          <h1 className="font-display text-[26px]">{state.code === 404 ? 'This submission is not in one of your courses' : 'The submission could not be loaded'}</h1>
          <p role="alert" className="flex items-start gap-2.5 text-[14px] text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {state.error}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<RotateCw className="size-4" aria-hidden />} onClick={() => setReload((n) => n + 1)}>
              Try again
            </Button>
            <Button to="/teach/submissions" variant="ghost">
              Back to the queue
            </Button>
          </div>
        </div>
      </section>
    )
  }

  const submission = state.data
  const meta = SUBMISSION_STATUS_META[submission.status]
  const returned = submission.status === 'RETURNED'

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
        <Link to="/teach/submissions" className="inline-flex items-center gap-2 hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden />
          Marking queue
        </Link>
        <span aria-hidden className="text-faint">
          /
        </span>
        <Link to={`/teach/assignments/${submission.assignmentId}`} className="hover:text-fg">
          {submission.assignmentTitle}
        </Link>
      </div>

      <PageHeader
        eyebrow={`${submission.courseTitle} · ${submission.assignmentTitle}`}
        title={submission.studentName}
        description={`Attempt ${submission.attemptNumber} · handed in ${dateTimeLabel(submission.submittedAt)}${submission.isLate ? ' · late' : ''}`}
        actions={
          <>
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {returned ? (
              <Button variant="secondary" size="sm" onClick={() => setWithdrawOpen(true)}>
                Withdraw grade
              </Button>
            ) : (
              <>
                <Button variant="secondary" size="sm" loading={busy === 'draft'} onClick={saveDraft}>
                  Save draft
                </Button>
                <Button size="sm" loading={busy === 'publish'} onClick={saveAndReturn}>
                  Save and return
                </Button>
              </>
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
          <Panel title="Answer" description="What the student handed in.">
            {submission.answerText ? (
              <div className="px-5 py-4">
                <p className="max-w-[80ch] text-[14px] leading-relaxed whitespace-pre-wrap text-fg">{submission.answerText}</p>
              </div>
            ) : (
              <div className="px-5 py-4 text-[13.5px] text-muted">No written answer was submitted.</div>
            )}
            {submission.fileName && (
              <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center border border-line bg-surface-2 text-muted" aria-hidden>
                  <FileText className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13.5px] font-medium">{submission.fileName}</span>
                  <span className="text-[11.5px] text-muted">Attached file · file storage is not connected in this build, so the name is the record</span>
                </span>
              </div>
            )}
          </Panel>

          <Panel title="Marking" description={returned ? 'Returned to the student. Withdraw it to make a correction.' : 'Only you can see this until you return it.'}>
            <div className="flex flex-col gap-4 px-5 py-4">
              <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                <Input
                  label={`Score (out of ${submission.maxScore})`}
                  inputMode="numeric"
                  value={score}
                  disabled={returned}
                  onChange={(e) => setScore(e.target.value)}
                />
                <div className="flex flex-col justify-end gap-1 pb-3 text-[12.5px] text-muted">
                  <span>
                    {submission.score === null ? 'No mark saved yet.' : `Saved mark: ${submission.score} of ${submission.maxScore}.`}
                  </span>
                  {submission.gradedAt && <span>Last marked {dateTimeLabel(submission.gradedAt)}</span>}
                </div>
              </div>

              <Textarea
                label="Feedback"
                rows={7}
                value={feedback}
                disabled={returned}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="What was strong, what to fix, and what to do next time."
                hint={`${feedback.length} characters. Shared with the student when the grade is returned.`}
              />

              {formError && (
                <p role="alert" className="flex items-center gap-1.5 text-[13px] text-danger">
                  <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                  {formError}
                </p>
              )}

              <p className="border-t border-line pt-3 text-[12.5px] text-muted">
                {returned
                  ? `Returned ${submission.publishedAt ? dateTimeLabel(submission.publishedAt) : ''}. Withdraw the grade to correct it.`
                  : submission.status === 'DRAFT'
                    ? 'Saved as a draft — the student cannot see it yet. Return it when it is ready.'
                    : 'No mark saved yet. Save a draft, or save and return it in one step.'}
              </p>
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Submission" description="The record behind this mark.">
            <dl className="flex flex-col divide-y divide-line text-[13px]">
              {[
                { k: 'Assignment', v: submission.assignmentTitle },
                { k: 'Course', v: submission.courseTitle },
                { k: 'Student ID', v: submission.studentUserId },
                { k: 'Attempt', v: `${submission.attemptNumber}` },
                { k: 'Handed in', v: dateTimeLabel(submission.submittedAt) },
                { k: 'Late', v: submission.isLate ? 'Yes' : 'No' },
                { k: 'Maximum score', v: `${submission.maxScore}` },
              ].map((row) => (
                <div key={row.k} className="flex items-start justify-between gap-3 px-5 py-2.5">
                  <dt className="text-muted">{row.k}</dt>
                  <dd className="max-w-[60%] text-right">{row.v}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title="Grade history" description="Every save, return and withdrawal.">
            {submission.revisions.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-muted">No changes yet. Saving a draft mark starts the history.</p>
            ) : (
              <ol className="flex flex-col divide-y divide-line">
                {submission.revisions.map((rev, i) => (
                  <li key={`${rev.at}-${i}`} className="flex flex-col gap-0.5 px-5 py-3">
                    <span className="flex items-center justify-between gap-2 text-[13px] font-medium">
                      {ACTION_LABEL[rev.action]}
                      <span className="figures text-[12px] text-muted">{rev.newScore === null ? '—' : `${rev.newScore}/${submission.maxScore}`}</span>
                    </span>
                    <span className="text-[11.5px] text-muted">{dateTimeLabel(rev.at)}</span>
                    {rev.reason && <span className="text-[11.5px] text-muted">Reason: {rev.reason}</span>}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>

      <Modal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        title="Withdraw this grade?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setWithdrawOpen(false)} disabled={busy === 'withdraw'}>
              Keep it returned
            </Button>
            <Button variant="danger" onClick={withdraw} loading={busy === 'withdraw'}>
              Withdraw grade
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13.5px] leading-relaxed text-muted">
            The student loses access to this result until you return it again. The reason is kept in the grade history.
          </p>
          <Textarea label="Reason" rows={3} value={reason} error={reasonError || undefined} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Marking error on question 3" />
        </div>
      </Modal>
    </section>
  )
}
