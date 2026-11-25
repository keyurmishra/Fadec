import { AlertCircle, RotateCw, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { Button } from '../../components/Button'
import { Input, Select } from '../../components/Field'
import { Badge, Card, Chip, EmptyState, Skeleton } from '../../components/ui'
import type { SubmissionMarkingStatus, TeacherSubmissionQueueDTO, TeacherSubmissionSummaryDTO } from '../../contracts/teaching'
import { teacherApi } from '../../lib/teacher-api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { PageHeader } from '../components/ui'
import { SUBMISSION_STATUS_META, dateTimeLabel } from './assessment-meta'

/*
  The marking queue: every submission across the teacher's courses, awaiting
  work first. A row opens the marking screen, which owns the score, the feedback
  and the draft-versus-published decision.
*/
type Load = { status: 'loading' } | { status: 'ready'; data: TeacherSubmissionQueueDTO } | { status: 'error'; error: string; code: number }

type StatusFilter = 'ALL' | SubmissionMarkingStatus

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'PENDING', 'DRAFT', 'RETURNED']

const matchesStatus = (submission: TeacherSubmissionSummaryDTO, filter: StatusFilter) => filter === 'ALL' || submission.status === filter

const statusFromParam = (value: string | null): StatusFilter =>
  value && STATUS_FILTERS.includes(value as StatusFilter) ? (value as StatusFilter) : 'ALL'

export function TeacherSubmissions() {
  useDocumentTitle('Submissions & Evaluation · Teaching studio')

  const [state, setState] = useState<Load>({ status: 'loading' })
  const [reload, setReload] = useState(0)
  const [params, setParams] = useSearchParams()
  const status = statusFromParam(params.get('status'))
  const assignment = params.get('assignment') ?? 'ALL'
  const [query, setQuery] = useState('')

  /* The filters live in the URL: the overview deep-links here with
     ?status=PENDING, and a shared or reloaded link lands on the same view. */
  function setFilter(next: { status?: StatusFilter; assignment?: string }) {
    const nextStatus = next.status ?? status
    const nextAssignment = next.assignment ?? assignment
    setParams(
      (prev) => {
        const merged = new URLSearchParams(prev)
        if (nextStatus === 'ALL') merged.delete('status')
        else merged.set('status', nextStatus)
        if (nextAssignment === 'ALL') merged.delete('assignment')
        else merged.set('assignment', nextAssignment)
        return merged
      },
      { replace: true },
    )
  }

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    teacherApi.get<TeacherSubmissionQueueDTO>('/api/teacher/submissions').then((res) => {
      if (cancelled) return
      setState(res.ok ? { status: 'ready', data: res.data } : { status: 'error', error: res.error, code: res.status })
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  const items = state.status === 'ready' ? state.data.items : []
  const assignments = state.status === 'ready' ? state.data.assignments : []

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter((s) => assignment === 'ALL' || s.assignmentId === assignment)
      .filter((s) => matchesStatus(s, status))
      .filter((s) => !q || s.studentName.toLowerCase().includes(q) || s.assignmentTitle.toLowerCase().includes(q) || s.courseTitle.toLowerCase().includes(q))
  }, [items, assignment, status, query])

  const countFor = (value: StatusFilter) => items.filter((s) => matchesStatus(s, value)).length
  const awaiting = countFor('PENDING')
  const drafts = countFor('DRAFT')
  const returned = countFor('RETURNED')
  const late = items.filter((s) => s.isLate).length

  return (
    <section className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Teaching studio"
        title="Submissions & Evaluation"
        description="Mark work, write feedback and release results. A mark stays private until you return it to the student."
        actions={
          <Button to="/teach/assignments" variant="secondary">
            Assignments
          </Button>
        }
      />

      {state.status === 'ready' && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: 'Awaiting marking', v: String(awaiting) },
            { k: 'Draft marks', v: String(drafts) },
            { k: 'Returned', v: String(returned) },
            { k: 'Late', v: String(late) },
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
            <Chip key={f} active={status === f} onClick={() => setFilter({ status: f })}>
              {f === 'ALL' ? 'All' : SUBMISSION_STATUS_META[f].label}
              <span className="figures text-[11.5px] opacity-70">{countFor(f)}</span>
            </Chip>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-y border-line py-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative w-full sm:w-[260px]">
              <Input label="Search submissions" hideLabel placeholder="Search student or assignment…" value={query} onChange={(e) => setQuery(e.target.value)} />
              <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-faint" aria-hidden />
            </div>
            <Select label="Assignment" hideLabel value={assignment} onChange={(e) => setFilter({ assignment: e.target.value })} className="w-full sm:w-[280px]">
              <option value="ALL">All published assignments</option>
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </Select>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery('')
              setFilter({ status: 'PENDING', assignment: 'ALL' })
            }}
          >
            Show what needs marking
          </Button>
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading submissions">
          {[0, 1, 2, 3, 4, 5].map((i) => (
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
          title={items.length ? 'Nothing matches those filters' : 'No submissions yet'}
          body={
            items.length
              ? awaiting === 0 && status === 'PENDING'
                ? 'Everything handed in has been marked. Switch to All to see returned work.'
                : 'Clear the search or pick another status.'
              : 'Submissions appear here once students hand work in from the student portal.'
          }
          action={
            items.length ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('')
                  setFilter({ status: 'ALL', assignment: 'ALL' })
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button to="/teach/assignments">Open assignments</Button>
            )
          }
        />
      )}

      {state.status === 'ready' && visible.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-[13.5px]">
            <caption className="sr-only">Submissions across your courses</caption>
            <thead className="text-[11.5px] tracking-[0.06em] text-muted uppercase">
              <tr className="border-b border-line">
                <th scope="col" className="px-5 py-3 font-medium">Student</th>
                <th scope="col" className="px-3 py-3 font-medium">Assignment</th>
                <th scope="col" className="px-3 py-3 font-medium">Submitted</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Score</th>
                <th scope="col" className="px-3 py-3 font-medium">Status</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Mark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((s) => {
                const meta = SUBMISSION_STATUS_META[s.status]
                return (
                  <tr key={s.id} className="align-middle">
                    <th scope="row" className="px-5 py-3.5 font-normal">
                      <Link to={`/teach/submissions/${s.id}`} className="font-medium underline decoration-transparent underline-offset-4 hover:decoration-amber">
                        {s.studentName}
                      </Link>
                      <span className="block text-[11.5px] text-muted">Attempt {s.attemptNumber}</span>
                    </th>
                    <td className="px-3 py-3.5">
                      <Link to={`/teach/assignments/${s.assignmentId}`} className="underline decoration-transparent underline-offset-4 hover:decoration-amber">
                        {s.assignmentTitle}
                      </Link>
                      <span className="block max-w-[34ch] truncate text-[11.5px] text-muted">{s.courseTitle}</span>
                    </td>
                    <td className="px-3 py-3.5 text-[12.5px] text-muted">
                      {dateTimeLabel(s.submittedAt)}
                      {s.isLate && <Badge tone="amber" className="mt-1 block w-fit">Late</Badge>}
                    </td>
                    <td className="figures px-3 py-3.5 text-right">{s.score === null ? '—' : `${s.score}/${s.maxScore}`}</td>
                    <td className="px-3 py-3.5">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link to={`/teach/submissions/${s.id}`} className="text-[13px] font-medium underline decoration-amber decoration-1 underline-offset-4" aria-label={`Mark ${s.studentName}`}>
                        Mark
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
          {visible.length} of {items.length} submissions shown. A draft mark is visible only to you until it is returned.
        </p>
      )}
    </section>
  )
}
