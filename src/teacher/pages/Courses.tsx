import { AlertCircle, ArrowRight, RotateCw, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { Button } from '../../components/Button'
import { Input, Select } from '../../components/Field'
import { Badge, Card, Chip, EmptyState, Segmented, Skeleton, type Tone } from '../../components/ui'
import type { CourseStatus } from '../../contracts/catalog'
import type { TeacherCourseSummaryDTO } from '../../contracts/teaching'
import { teacherApi } from '../../lib/teacher-api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { NotTracked, PageHeader, ProgressBar } from '../components/ui'

/*
  My Courses: the grid and the table read the same payload, so switching view
  never changes which courses are in scope. Status filters live in the URL, so
  the overview's KPI links can deep-link here.
*/
type Load = { status: 'loading' } | { status: 'ready'; data: TeacherCourseSummaryDTO[] } | { status: 'error'; error: string; code: number }

const STATUS_META: Record<CourseStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'amber' },
  IN_REVIEW: { label: 'In review', tone: 'blue' },
  PUBLISHED: { label: 'Published', tone: 'lime' },
  UNPUBLISHED: { label: 'Unpublished', tone: 'amber' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
}

const FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ARCHIVED', label: 'Archived' },
] as const

const matchesFilter = (status: CourseStatus, filter: string) =>
  filter === 'ALL' ? true : filter === 'DRAFT' ? status === 'DRAFT' || status === 'UNPUBLISHED' || status === 'IN_REVIEW' : status === filter

/** Why the completion column is empty, shown on hover. */
const COMPLETION_NOT_TRACKED = 'Learner progress is not recorded yet, so course completion cannot be measured.'

type Sort = 'updated' | 'title' | 'students'

const SORTS: { value: Sort; label: string }[] = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'students', label: 'Most students' },
]

const updatedLabel = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function TeacherCourses() {
  useDocumentTitle('My Courses · Teaching studio')
  const [params, setParams] = useSearchParams()
  const filter = params.get('status') ?? 'ALL'
  const [view, setView] = useState<'grid' | 'table'>('grid')
  const [sort, setSort] = useState<Sort>('updated')
  const [query, setQuery] = useState('')
  const [reload, setReload] = useState(0)
  const [state, setState] = useState<Load>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    teacherApi.get<{ items: TeacherCourseSummaryDTO[] }>('/api/teacher/courses').then((res) => {
      if (cancelled) return
      setState(res.ok ? { status: 'ready', data: res.data.items } : { status: 'error', error: res.error, code: res.status })
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  const courses = state.status === 'ready' ? state.data : []

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = courses.filter((c) => matchesFilter(c.status, filter)).filter((c) => !q || c.title.toLowerCase().includes(q) || c.summary.toLowerCase().includes(q))
    return list.slice().sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title)
      if (sort === 'students') return b.enrolledCount - a.enrolledCount
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    })
  }, [courses, filter, query, sort])

  const countFor = (value: string) => courses.filter((c) => matchesFilter(c.status, value)).length

  return (
    <section className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Teaching studio"
        title="My Courses"
        description="The courses assigned to you. Open a course to build its curriculum and publish it."
        actions={
          <Button to="/teach/lectures" variant="secondary">
            Lectures & videos
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Chip
              key={f.value}
              active={filter === f.value}
              onClick={() => {
                const next = new URLSearchParams(params)
                if (f.value === 'ALL') next.delete('status')
                else next.set('status', f.value)
                setParams(next, { replace: true })
              }}
            >
              {f.label}
              <span className="figures text-[11.5px] opacity-70">{countFor(f.value)}</span>
            </Chip>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-y border-line py-3 md:flex-row md:items-end md:justify-between">
          <div className="relative w-full md:max-w-[320px]">
            <Input label="Search courses" hideLabel placeholder="Search courses…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-faint" aria-hidden />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="Layout"
              value={view}
              onChange={setView}
              options={[
                { value: 'grid', label: 'Grid' },
                { value: 'table', label: 'Table' },
              ]}
            />
            <Select label="Sort by" hideLabel value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-[190px]">
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading courses">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[340px]" />
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
          title={query || filter !== 'ALL' ? 'No courses match those filters' : 'No courses assigned yet'}
          body={query || filter !== 'ALL' ? 'Clear the search or pick another status.' : 'An administrator assigns courses to your account.'}
          action={
            query || filter !== 'ALL' ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('')
                  setParams(new URLSearchParams(), { replace: true })
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      )}

      {state.status === 'ready' && visible.length > 0 && view === 'grid' && (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </ul>
      )}

      {state.status === 'ready' && visible.length > 0 && view === 'table' && <CourseTable courses={visible} />}

      <p className="text-[12px] text-muted">
        {visible.length} of {courses.length} courses shown. Counts are scoped to your account.
      </p>
    </section>
  )
}

function CourseCard({ course }: { course: TeacherCourseSummaryDTO }) {
  const meta = STATUS_META[course.status]
  return (
    <Card as="li" className="flex flex-col">
      <div className="relative aspect-[16/9] overflow-hidden border-b border-line bg-surface-2">
        {course.thumbnailUrl ? (
          <img src={course.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <span className="flex size-full items-center justify-center text-[12px] text-muted">No thumbnail yet</span>
        )}
        <Badge tone={meta.tone} className="absolute top-2 left-2">
          {meta.label}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-col gap-1">
          <p className="text-[10.5px] font-semibold tracking-[0.14em] text-muted uppercase">
            {course.category} · {course.level.toLowerCase()}
          </p>
          <h2 className="font-display text-[21px] leading-[1.15]">
            <Link to={`/teach/courses/${course.id}/curriculum`} className="underline decoration-transparent underline-offset-4 hover:decoration-amber">
              {course.title}
            </Link>
          </h2>
        </div>
        <p className="line-clamp-2 text-[13px] leading-relaxed text-muted">{course.summary}</p>

        <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-line pt-3 text-[12.5px]">
          <div className="flex flex-col">
            <dt className="text-[10.5px] tracking-[0.1em] text-faint uppercase">Students</dt>
            <dd className="figures font-medium">{course.enrolledCount}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-[10.5px] tracking-[0.1em] text-faint uppercase">Lectures</dt>
            <dd className="figures font-medium">
              {course.lectureCount}
              {course.draftLectureCount > 0 && <span className="text-muted"> ({course.draftLectureCount} draft)</span>}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-[10.5px] tracking-[0.1em] text-faint uppercase">Tasks</dt>
            <dd className="figures font-medium">{course.assignmentCount}</dd>
          </div>
        </dl>

        <div className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between text-[11.5px] text-muted">
            <span>Completion</span>
            {course.completionPercent === null ? <NotTracked reason={COMPLETION_NOT_TRACKED} /> : <span>{course.completionPercent}%</span>}
          </span>
          {course.completionPercent !== null && <ProgressBar value={course.completionPercent} label=" " />}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <Link to={`/teach/courses/${course.id}/curriculum`} className="inline-flex items-center gap-1 text-[12.5px] font-medium">
            Open curriculum
            <ArrowRight className="size-3.5 text-amber-ink" aria-hidden />
          </Link>
          <Link to="/teach/students" className="text-[12.5px] text-muted underline decoration-line-strong underline-offset-4 hover:text-fg">
            Students
          </Link>
        </div>
      </div>
    </Card>
  )
}

function CourseTable({ courses }: { courses: TeacherCourseSummaryDTO[] }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-[13.5px]">
        <caption className="sr-only">Your courses</caption>
        <thead className="text-[11.5px] tracking-[0.06em] text-muted uppercase">
          <tr className="border-b border-line">
            <th scope="col" className="px-5 py-3 font-medium">Course</th>
            <th scope="col" className="px-3 py-3 font-medium">Status</th>
            <th scope="col" className="px-3 py-3 text-right font-medium">Students</th>
            <th scope="col" className="px-3 py-3 text-right font-medium">Lectures</th>
            <th scope="col" className="px-3 py-3 text-right font-medium">Tasks</th>
            <th scope="col" className="px-3 py-3 font-medium">Completion</th>
            <th scope="col" className="px-5 py-3 text-right font-medium">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {courses.map((c) => {
            const meta = STATUS_META[c.status]
            return (
              <tr key={c.id} className="align-top">
                <th scope="row" className="px-5 py-3.5 font-normal">
                  <Link to={`/teach/courses/${c.id}/curriculum`} className="font-medium underline decoration-transparent underline-offset-4 hover:decoration-amber">
                    {c.title}
                  </Link>
                  <span className="block max-w-[42ch] truncate text-[12px] text-muted">{c.summary}</span>
                </th>
                <td className="px-3 py-3.5">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </td>
                <td className="figures px-3 py-3.5 text-right">{c.enrolledCount}</td>
                <td className="figures px-3 py-3.5 text-right">
                  {c.lectureCount}
                  {c.draftLectureCount > 0 && <span className="text-muted"> / {c.draftLectureCount} draft</span>}
                </td>
                <td className="figures px-3 py-3.5 text-right">{c.assignmentCount}</td>
                <td className="w-[150px] px-3 py-3.5">
                  {c.completionPercent === null ? <NotTracked reason={COMPLETION_NOT_TRACKED} /> : <ProgressBar value={c.completionPercent} />}
                </td>
                <td className="figures px-5 py-3.5 text-right text-[12.5px] text-muted">{updatedLabel(c.updatedAt)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
