import { ArrowLeft, Clock, FileText, RotateCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import { Button } from '../../components/Button'
import { Badge, Card, EmptyState, Skeleton } from '../../components/ui'
import type { StudentAssignmentDetailDTO } from '../../contracts/learning'
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

      <div className="flex items-start gap-2.5 border border-line bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-muted">
        <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          Handing in is not open in this portal yet, so there is nothing to submit here. Your teacher can still see and mark work through the teaching studio.
        </p>
      </div>
    </article>
  )
}
