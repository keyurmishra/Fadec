import { AlertCircle, ArrowRight, RotateCw, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'

import { Button } from '../../components/Button'
import { Input, Select } from '../../components/Field'
import { Badge, Card, Chip, EmptyState, Skeleton, type Tone } from '../../components/ui'
import type { LectureAvailabilityStatus, TeacherLectureSummaryDTO } from '../../contracts/teaching'
import { teacherApi } from '../../lib/teacher-api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { NotTracked, PageHeader, ProgressBar } from '../components/ui'

/*
  Lectures & Videos: every lecture in the teacher's courses in curriculum order.
  Filtering, search and sort happen on this one payload; opening a row goes to
  the lecture screen, which owns editing, resources and statistics.
*/
type Load =
  | { status: 'loading' }
  | { status: 'ready'; data: { items: TeacherLectureSummaryDTO[]; courses: { id: string; title: string }[] } }
  | { status: 'error'; error: string; code: number }

type StatusFilter = 'ALL' | 'PUBLISHED' | 'DRAFT' | 'SCHEDULED'
type Sort = 'curriculum' | 'title'

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SCHEDULED', label: 'Scheduled' },
]

const SORTS: { value: Sort; label: string }[] = [
  { value: 'curriculum', label: 'Curriculum order' },
  { value: 'title', label: 'Title A–Z' },
]

/** Why a watch column is empty, shown on hover. */
const WATCH_NOT_TRACKED = 'Students cannot play lectures in the portal yet, so no viewing is recorded.'

const MEDIA_META: Record<TeacherLectureSummaryDTO['mediaStatus'], { label: string; tone: Tone }> = {
  READY: { label: 'Ready', tone: 'lime' },
  PROCESSING: { label: 'Processing', tone: 'blue' },
  NONE: { label: 'None', tone: 'neutral' },
}

const AVAILABILITY_META: Partial<Record<LectureAvailabilityStatus, { label: string; tone: Tone }>> = {
  SCHEDULED: { label: 'Scheduled', tone: 'amber' },
  EXPIRED: { label: 'Closed', tone: 'danger' },
}

const matchesStatus = (lecture: TeacherLectureSummaryDTO, filter: StatusFilter) =>
  filter === 'ALL' ? true : filter === 'SCHEDULED' ? lecture.availabilityStatus === 'SCHEDULED' : lecture.status === filter

const updatedLabel = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function TeacherLectures() {
  useDocumentTitle('Lectures & Videos · Teaching studio')

  const [state, setState] = useState<Load>({ status: 'loading' })
  const [reload, setReload] = useState(0)
  const [course, setCourse] = useState('ALL')
  const [status, setStatus] = useState<StatusFilter>('ALL')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('curriculum')

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    teacherApi.get<{ items: TeacherLectureSummaryDTO[]; courses: { id: string; title: string }[] }>('/api/teacher/lectures').then((res) => {
      if (cancelled) return
      setState(res.ok ? { status: 'ready', data: res.data } : { status: 'error', error: res.error, code: res.status })
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  const lectures = state.status === 'ready' ? state.data.items : []
  const courses = state.status === 'ready' ? state.data.courses : []

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = lectures
      .filter((l) => course === 'ALL' || l.courseId === course)
      .filter((l) => matchesStatus(l, status))
      .filter((l) => !q || l.title.toLowerCase().includes(q) || l.chapterTitle.toLowerCase().includes(q) || l.courseTitle.toLowerCase().includes(q))
    return list.slice().sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title)
      return 0
    })
  }, [lectures, course, status, query, sort])

  const countFor = (value: StatusFilter) => lectures.filter((l) => matchesStatus(l, value)).length
  const published = lectures.filter((l) => l.status === 'PUBLISHED').length

  return (
    <section className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Teaching studio"
        title="Lectures & Videos"
        description="Every lecture, its video state and resources. Open one to edit it, attach resources or schedule when students can see it."
        actions={
          <Button to="/teach/courses" variant="secondary">
            Go to courses
          </Button>
        }
      />

      {state.status === 'ready' && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: 'Lectures', v: String(lectures.length) },
            { k: 'Published', v: String(published) },
            { k: 'Drafts', v: String(lectures.length - published) },
            { k: 'Resources attached', v: String(lectures.reduce((n, l) => n + l.resourceCount, 0)) },
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
            <Chip key={f.value} active={status === f.value} onClick={() => setStatus(f.value)}>
              {f.label}
              <span className="figures text-[11.5px] opacity-70">{countFor(f.value)}</span>
            </Chip>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-y border-line py-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative w-full sm:w-[260px]">
              <Input label="Search lectures" hideLabel placeholder="Search lectures…" value={query} onChange={(e) => setQuery(e.target.value)} />
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
          <Select label="Sort by" hideLabel value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-full sm:w-[190px]">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading lectures">
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
          title={lectures.length ? 'No lectures match those filters' : 'No lectures yet'}
          body={
            lectures.length
              ? 'Clear the search or pick another status.'
              : 'Add a module, a chapter and a lecture in a course curriculum and it will appear here.'
          }
          action={
            lectures.length ? (
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
              <Button to="/teach/courses">Open my courses</Button>
            )
          }
        />
      )}

      {state.status === 'ready' && visible.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[13.5px]">
            <caption className="sr-only">Lectures across your courses</caption>
            <thead className="text-[11.5px] tracking-[0.06em] text-muted uppercase">
              <tr className="border-b border-line">
                <th scope="col" className="px-5 py-3 font-medium">Lecture</th>
                <th scope="col" className="px-3 py-3 font-medium">Type</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Length</th>
                <th scope="col" className="px-3 py-3 font-medium">Status</th>
                <th scope="col" className="px-3 py-3 font-medium">Video</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Resources</th>
                <th scope="col" className="w-[170px] px-3 py-3 font-medium">Watch completion</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((l) => {
                const media = MEDIA_META[l.mediaStatus]
                const availability = AVAILABILITY_META[l.availabilityStatus]
                return (
                  <tr key={l.id} className="align-middle">
                    <th scope="row" className="px-5 py-3.5 font-normal">
                      <Link to={`/teach/lectures/${l.id}`} className="font-medium underline decoration-transparent underline-offset-4 hover:decoration-amber">
                        {l.title}
                      </Link>
                      <span className="block max-w-[52ch] truncate text-[12px] text-muted">
                        {l.courseTitle} · {l.chapterTitle}
                      </span>
                    </th>
                    <td className="px-3 py-3.5 text-muted">{l.kind === 'VIDEO' ? 'Video' : 'Text'}</td>
                    <td className="figures px-3 py-3.5 text-right text-muted">{l.estimatedMinutes} min</td>
                    <td className="px-3 py-3.5">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={l.status === 'PUBLISHED' ? 'lime' : 'neutral'}>{l.status === 'PUBLISHED' ? 'Published' : 'Draft'}</Badge>
                        {availability && <Badge tone={availability.tone}>{availability.label}</Badge>}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <Badge tone={media.tone}>{media.label}</Badge>
                    </td>
                    <td className="figures px-3 py-3.5 text-right text-muted">{l.resourceCount}</td>
                    <td className="px-3 py-3.5">
                      {l.watchCompletionPercent === null ? <NotTracked reason={WATCH_NOT_TRACKED} /> : <ProgressBar value={l.watchCompletionPercent} />}
                    </td>
                    <td className="figures px-5 py-3.5 text-right text-[12.5px] text-muted">{updatedLabel(l.updatedAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {state.status === 'ready' && (
        <p className="text-[12px] text-muted">
          {visible.length} of {lectures.length} lectures shown. Watch completion is not recorded yet: students cannot play lectures in the portal.
        </p>
      )}

      <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
        Lectures are created and ordered inside a course.
        <Link to="/teach/courses" className="inline-flex items-center gap-1 font-medium text-fg underline decoration-amber decoration-1 underline-offset-4">
          Open a curriculum
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </p>
    </section>
  )
}
