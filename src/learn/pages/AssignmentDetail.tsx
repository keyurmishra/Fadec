import { ArrowLeft, Check, ClipboardCheck, Clock, FileText, RotateCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import { Button } from '../../components/Button'
import { Textarea } from '../../components/Field'
import { Badge, Card, EmptyState, Skeleton } from '../../components/ui'
import type { StudentAssignmentDetailDTO, StudentAttemptDTO } from '../../contracts/learning'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { studentApi } from '../../lib/student-api'
import { LATE_POLICY_LABEL, STUDENT_ASSIGNMENT_STATUS_META, dateTimeLabel, relativeDue } from '../meta'

/*
  One assignment as its student sees it: the brief, the window and the rules.

  Anything outside the student's enrolments answers 404 from the Worker, so this
  screen shows the same "not found" for another course's assignment as for an id
  that never existed.
*/
type Load = { status: 'loading' } | { status: 'ready'; data: StudentAssignmentDetailDTO } | { status: 'error'; error: string; code: number }

export function StudentAssignmentDetail() {
  const { assignmentId = '' } = useParams()
  const [state, setState] = useState<Load>({ status: 'loading' })
  const [reload, setReload] = useState(0)

  useDocumentTitle(`${state.status === 'ready' ? state.data.title : 'Assignment'} · Student portal`)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    studentApi.get<StudentAssignmentDetailDTO>(`/api/student/assignments/${encodeURIComponent(assignmentId)}`).then((res) => {
      if (cancelled) return
      setState(res.ok ? { status: 'ready', data: res.data } : { status: 'error', error: res.error, code: res.status })
    })
    return () => {
      cancelled = true
    }
  }, [assignmentId, reload])

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/learn/assignments"
        className="inline-flex min-h-9 w-fit items-center gap-2 text-[13px] text-muted underline decoration-line-strong underline-offset-4 hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All assignments
      </Link>

      {state.status === 'loading' && (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading assignment">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-48" />
        </div>
      )}

      {state.status === 'error' && state.code === 404 && (
        <EmptyState
          title="That assignment could not be found"
          body="It may not be published, it may belong to a course you are not enrolled in, or the link may be old."
          action={
            <Button to="/learn/assignments" variant="secondary">
              Back to assignments
            </Button>
          }
        />
      )}

      {state.status === 'error' && state.code !== 404 && (
        <div role="alert" className="flex flex-col items-start gap-3 border border-[rgb(160_48_36/0.25)] bg-danger-soft px-4 py-3 text-[14px] text-danger">
          <span>{state.error}</span>
          <Button variant="secondary" size="sm" icon={<RotateCw className="size-4" aria-hidden />} onClick={() => setReload((n) => n + 1)}>
            Try again
          </Button>
        </div>
      )}

      {state.status === 'ready' && <Brief assignment={state.data} />}
    </div>
  )
}

function Brief({ assignment }: { assignment: StudentAssignmentDetailDTO }) {
  const status = STUDENT_ASSIGNMENT_STATUS_META[assignment.status]

  const facts = [
    { label: 'Opens', value: dateTimeLabel(assignment.opensAt) },
    { label: 'Due', value: `${dateTimeLabel(assignment.dueAt)} (${relativeDue(assignment.dueAt)})` },
    { label: 'Marks', value: String(assignment.maxScore) },
    { label: 'Attempts', value: assignment.attemptsAllowed === 1 ? '1 attempt' : `${assignment.attemptsAllowed} attempts` },
    { label: 'Late work', value: LATE_POLICY_LABEL[assignment.latePolicy] },
    { label: 'Hand-in', value: assignment.allowFileUpload ? 'Text and a file' : 'Text only' },
  ]

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 border-b border-line pb-6">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-amber-ink uppercase">{assignment.courseTitle}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[30px] leading-[1.05] tracking-[-0.015em] md:text-[38px]">{assignment.title}</h1>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className="text-[13.5px] text-muted">
          Published {dateTimeLabel(assignment.publishedAt)} · Due {dateTimeLabel(assignment.dueAt)}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label} className="flex flex-col gap-1 bg-surface px-4 py-3.5">
            <dt className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">{fact.label}</dt>
            <dd className="figures text-[13.5px] leading-snug">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <Card className="p-5 md:p-6">
        <div className="flex items-center gap-2 border-b border-line pb-3">
          <FileText className="size-4 text-muted" aria-hidden />
          <h2 className="text-[15px] font-semibold">Instructions</h2>
        </div>
        <p className="pt-4 text-[15px] leading-relaxed whitespace-pre-line">{assignment.instructions}</p>
      </Card>

      <HandIn assignment={assignment} />
    </article>
  )
}

/*
  Handing in, in three steps: start an attempt, keep a draft, hand it in.

  The screen holds the attempts the server returned and appends what each call
  returns, so nothing it shows is invented on the client. Whether the work is
  late, whether the window is open and whether an attempt is left are all the
  server's answers; the warning below the editor reads the same due date and
  says what the server will decide, and the refusal still comes from the Worker.
*/
function HandIn({ assignment }: { assignment: StudentAssignmentDetailDTO }) {
  const [attempts, setAttempts] = useState<StudentAttemptDTO[]>(assignment.attempts)
  const [draft, setDraft] = useState(() => assignment.attempts.find((a) => a.status === 'IN_PROGRESS')?.text ?? '')
  const [busy, setBusy] = useState<'start' | 'save' | 'submit' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const open = attempts.find((a) => a.status === 'IN_PROGRESS') ?? null
  const handedIn = attempts.filter((a) => a.status === 'SUBMITTED')
  const remaining = Math.max(0, assignment.attemptsAllowed - handedIn.length)
  const pastDue = Date.now() > Date.parse(assignment.dueAt)
  const accepts = assignment.latePolicy !== 'BLOCK'

  const replace = (attempt: StudentAttemptDTO) =>
    setAttempts((rows) => [attempt, ...rows.filter((row) => row.id !== attempt.id)])

  async function start() {
    setBusy('start')
    setError(null)
    const res = await studentApi.post<StudentAttemptDTO>(`/api/student/assignments/${encodeURIComponent(assignment.id)}/attempt`, {})
    setBusy(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    replace(res.data)
    setDraft(res.data.text)
    setNotice(`Attempt ${res.data.attemptNumber} started. Only you can see this draft until you hand it in.`)
  }

  async function save() {
    if (!open) return
    setBusy('save')
    setError(null)
    const res = await studentApi.patch<StudentAttemptDTO>(`/api/student/attempts/${encodeURIComponent(open.id)}`, { text: draft })
    setBusy(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    replace(res.data)
    setNotice('Draft saved.')
  }

  async function handIn() {
    if (!open) return
    setBusy('submit')
    setError(null)
    const res = await studentApi.post<StudentAttemptDTO>(`/api/student/attempts/${encodeURIComponent(open.id)}/submit`, { text: draft })
    setBusy(null)
    setConfirming(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    replace(res.data)
    setDraft('')
    setNotice(res.data.isLate ? 'Handed in. It is recorded as late.' : 'Handed in.')
  }

  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <ClipboardCheck className="size-4 text-muted" aria-hidden />
        <h2 className="text-[15px] font-semibold">Hand in</h2>
      </div>

      <div className="flex flex-col gap-4 pt-4">
        {open ? (
          <p className="text-[13.5px] text-muted">
            Attempt {open.attemptNumber} of {assignment.attemptsAllowed} · started {dateTimeLabel(open.startedAt)}. Your teacher does not see this attempt until you hand it in.
          </p>
        ) : assignment.status === 'SCHEDULED' ? (
          <p className="text-[13.5px] text-muted">Hand-in opens {dateTimeLabel(assignment.opensAt)}.</p>
        ) : assignment.status === 'CLOSED' ? (
          <p className="text-[13.5px] text-muted">The hand-in window has closed, so no new attempt can be started.</p>
        ) : remaining === 0 ? (
          <p className="text-[13.5px] text-muted">You have used all {assignment.attemptsAllowed === 1 ? 'of your 1 attempt' : `${assignment.attemptsAllowed} attempts`} for this assignment.</p>
        ) : (
          <p className="text-[13.5px] text-muted">
            {remaining} {remaining === 1 ? 'attempt' : 'attempts'} left.{' '}
            {assignment.allowFileUpload ? 'This brief asks for a file, and file uploads are not built here yet, so text is all you can hand in.' : 'Write your answer here.'}
          </p>
        )}

        {open && (
          <>
            <Textarea label="Your answer" value={draft} onChange={(e) => setDraft(e.target.value)} hint="Plain text. Nothing is handed in until you press the button below." />

            {pastDue && (
              <p className="flex items-start gap-2 text-[13px] text-muted">
                <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
                {accepts
                  ? 'The due date has passed. Handing this in now records it as late.'
                  : 'The due date has passed and this assignment blocks late work, so it cannot be handed in.'}
              </p>
            )}

            {confirming ? (
              <div className="flex flex-col gap-3 border border-line bg-surface-2 px-4 py-3.5">
                <p className="text-[13.5px]">Handing in is final: this attempt cannot be edited afterwards. Your teacher sees it for marking straight away.</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="violet" loading={busy === 'submit'} onClick={handIn}>
                    Yes, hand it in
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy === 'submit'}>
                    Keep editing
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" loading={busy === 'save'} onClick={save} disabled={busy === 'submit'}>
                  Save draft
                </Button>
                <Button variant="violet" onClick={() => setConfirming(true)} disabled={busy !== null || !draft.trim()}>
                  Hand in for marking
                </Button>
              </div>
            )}
          </>
        )}

        {!open && assignment.status === 'OPEN' && remaining > 0 && (
          <div>
            <Button loading={busy === 'start'} onClick={start}>
              {handedIn.length ? `Start attempt ${handedIn.length + 1}` : 'Start attempt'}
            </Button>
          </div>
        )}

        {handedIn.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold">Handed in</h3>
            <ul className="flex flex-col gap-px border border-line bg-line">
              {handedIn.map((attempt) => (
                <li key={attempt.id} className="flex flex-col gap-2.5 bg-surface px-4 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] text-muted">
                      Attempt {attempt.attemptNumber} · handed in {attempt.submittedAt ? dateTimeLabel(attempt.submittedAt) : ''}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={attempt.isLate ? 'amber' : 'lime'}>{attempt.isLate ? 'Late' : 'On time'}</Badge>
                      {attempt.grade && (
                        <Badge tone="violet">
                          {attempt.grade.score} / {assignment.maxScore}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {attempt.grade ? (
                    <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
                      <p className="text-[12.5px] text-muted">Returned {dateTimeLabel(attempt.grade.publishedAt)}</p>
                      <p className="text-[13.5px] leading-relaxed whitespace-pre-line">
                        {attempt.grade.feedback || 'No written feedback was added.'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[12.5px] text-muted">No mark has been returned for this attempt yet.</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div role="alert" className="flex flex-col items-start gap-3 border border-[rgb(160_48_36/0.25)] bg-danger-soft px-4 py-3 text-[14px] text-danger">
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <p className="flex items-center gap-2 text-[13px] text-lime-ink" role="status">
            <Check className="size-4 shrink-0" aria-hidden />
            {notice}
          </p>
        )}

        <p className="border-t border-line pt-3 text-[12.5px] leading-relaxed text-muted">
          Your teacher marks handed-in work in the teaching studio. A mark and its feedback appear above once your teacher returns them to you.
        </p>
      </div>
    </Card>
  )
}
