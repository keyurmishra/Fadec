import { ArrowRight, ClipboardList, RotateCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { Button } from '../../components/Button'
import { Badge, Card, EmptyState, Skeleton } from '../../components/ui'
import type { StudentAssignmentStatus, StudentAssignmentSummaryDTO } from '../../contracts/learning'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { studentApi } from '../../lib/student-api'
import { LATE_POLICY_LABEL, STUDENT_ASSIGNMENT_STATUS_META, dateTimeLabel, relativeDue } from '../meta'

/*
  Every assignment published for the courses this student is enrolled in.

  The list is grouped by the state of its window rather than filtered: what is
  open now comes first, what is coming next after it, and closed work stays
  readable at the bottom. The list stays a brief; handing in happens on the
  assignment's own page.
*/
type Load = { status: 'loading' } | { status: 'ready'; items: StudentAssignmentSummaryDTO[] } | { status: 'error'; error: string; code: number }

const GROUPS: Array<{ status: StudentAssignmentStatus; title: string; note: string }> = [
  { status: 'OPEN', title: 'Open now', note: 'Published and inside its window.' },
  { status: 'SCHEDULED', title: 'Opening soon', note: 'Published, but the window has not opened yet.' },
  { status: 'CLOSED', title: 'Closed', note: 'The window has ended or the teacher closed it.' },
]

export function StudentAssignments() {
  useDocumentTitle('Assignments · Student portal')
  const [state, setState] = useState<Load>({ status: 'loading' })
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    studentApi.get<{ items: StudentAssignmentSummaryDTO[] }>('/api/student/assignments').then((res) => {
      if (cancelled) return
      setState(res.ok ? { status: 'ready', items: res.data.items } : { status: 'error', error: res.error, code: res.status })
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  const items = state.status === 'ready' ? state.items : []

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
        <div className="flex max-w-[62ch] flex-col gap-2">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-amber-ink uppercase">Assignments</p>
          <h1 className="font-display text-[32px] leading-[1.05] tracking-[-0.015em] md:text-[40px]">What you have been set</h1>
          <p className="text-[14.5px] leading-relaxed text-muted">
            Everything published for your enrolled courses. Open one to write your answer, hand it in and see the mark once your teacher has returned it; file uploads are not part of this portal yet.
          </p>
        </div>
        {state.status === 'error' && (
          <Button variant="secondary" icon={<RotateCw className="size-4" aria-hidden />} onClick={() => setReload((n) => n + 1)}>
            Try again
          </Button>
        )}
      </div>

      {state.status === 'loading' && (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading assignments">
          <Skeleton className="h-6 w-40" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <div role="alert" className="flex items-start gap-2.5 border border-[rgb(160_48_36/0.25)] bg-danger-soft px-4 py-3 text-[14px] text-danger">
          {state.error}
        </div>
      )}

      {state.status === 'ready' && items.length === 0 && (
        <EmptyState
          icon={<ClipboardList className="size-5" aria-hidden />}
          title="No assignments yet"
          body="Nothing has been published for the courses you are enrolled in. New work appears here as soon as your teacher publishes it."
        />
      )}

      {state.status === 'ready' &&
        GROUPS.map((group) => {
          const rows = items.filter((item) => item.status === group.status)
          if (!rows.length) return null
          return (
            <section key={group.status} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[15px] font-semibold tracking-[-0.005em]">
                  {group.title}
                  <span className="figures ml-2 text-[12.5px] font-normal text-muted">{rows.length}</span>
                </h2>
                <p className="text-[12.5px] text-muted">{group.note}</p>
              </div>
              <ul className="flex flex-col gap-3">
                {rows.map((item) => (
                  <AssignmentRow key={item.id} assignment={item} />
                ))}
              </ul>
            </section>
          )
        })}
    </div>
  )
}

function AssignmentRow({ assignment }: { assignment: StudentAssignmentSummaryDTO }) {
  const status = STUDENT_ASSIGNMENT_STATUS_META[assignment.status]
  return (
    <Card as="li">
      <Link
        to={`/learn/assignments/${assignment.id}`}
        className="group flex flex-col gap-4 p-5 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-deep md:flex-row md:items-center md:justify-between"
      >
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">{assignment.courseTitle}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-semibold tracking-[-0.005em]">{assignment.title}</h3>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="text-[13px] text-muted">
            Due {dateTimeLabel(assignment.dueAt)} · {relativeDue(assignment.dueAt)} · {assignment.maxScore} marks ·{' '}
            {assignment.attemptsAllowed === 1 ? '1 attempt' : `${assignment.attemptsAllowed} attempts`} · {LATE_POLICY_LABEL[assignment.latePolicy]}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-fg">
          Open
          <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
        </span>
      </Link>
    </Card>
  )
}
