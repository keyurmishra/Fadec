import { AlertCircle, ArrowRight, Cloud, Compass, Gauge, Layers, Plus, Radio, RotateCw, Scale, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { Button } from '../../components/Button'
import { Checkbox, FormError, Input, Select, Textarea } from '../../components/Field'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Badge, Card, Chip, EmptyState, Skeleton, type Tone } from '../../components/ui'
import type { SubjectLectureRefDTO, SubjectStatus, SubjectSummaryDTO } from '../../contracts/teaching'
import { teacherApi } from '../../lib/teacher-api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { PageHeader } from '../components/ui'

/*
  Subject management: the academic layer over the training courses. One card per
  subject, with the numbers the teacher needs to see before opening the syllabus.
  Search, filters and sort all run on the list payload; every count is derived
  on the server from the linked course lectures.
*/
type Load =
  | { status: 'loading' }
  | { status: 'ready'; data: { items: SubjectSummaryDTO[]; courses: { id: string; title: string }[] } }
  | { status: 'error'; error: string; code: number }

type StatusFilter = 'ALL' | SubjectStatus
type Sort = 'updated' | 'name' | 'lectures'

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Draft' },
]

const SORTS: { value: Sort; label: string }[] = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'lectures', label: 'Most lectures' },
]

const STATUS_META: Record<SubjectStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'amber' },
  PUBLISHED: { label: 'Published', tone: 'lime' },
}

/** A subject icon tile, keyed by the five core subjects with a neutral fallback. */
const SUBJECT_ICONS = [
  { match: /meteor/i, icon: Cloud },
  { match: /general navigation/i, icon: Compass },
  { match: /radio navigation/i, icon: Radio },
  { match: /instrument navigation/i, icon: Gauge },
  { match: /regulation|law/i, icon: Scale },
]

const iconFor = (name: string) => SUBJECT_ICONS.find((s) => s.match.test(name))?.icon ?? Layers

const dateLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No lectures yet')

export function TeacherSubjects() {
  useDocumentTitle('Subjects · Teaching studio')
  const navigate = useNavigate()
  const toast = useToast()

  const [state, setState] = useState<Load>({ status: 'loading' })
  const [reload, setReload] = useState(0)
  const [course, setCourse] = useState('ALL')
  const [status, setStatus] = useState<StatusFilter>('ALL')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('updated')

  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [courseIds, setCourseIds] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    teacherApi.get<{ items: SubjectSummaryDTO[]; courses: { id: string; title: string }[] }>('/api/teacher/subjects').then((res) => {
      if (cancelled) return
      setState(res.ok ? { status: 'ready', data: res.data } : { status: 'error', error: res.error, code: res.status })
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  const subjects = state.status === 'ready' ? state.data.items : []
  const courses = state.status === 'ready' ? state.data.courses : []

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = subjects
      .filter((s) => course === 'ALL' || s.courses.some((c) => c.id === course))
      .filter((s) => status === 'ALL' || s.status === status)
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
    return list.slice().sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'lectures') return b.lectureCount - a.lectureCount
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    })
  }, [subjects, course, status, query, sort])

  const countFor = (value: StatusFilter) => subjects.filter((s) => value === 'ALL' || s.status === value).length
  const totals = subjects.reduce(
    (n, s) => ({ topics: n.topics + s.topicCount, lectures: n.lectures + s.lectureCount, published: n.published + s.publishedLectureCount }),
    { topics: 0, lectures: 0, published: 0 },
  )

  function openCreate() {
    setCreating(true)
    setFormError('')
    setName('')
    setDescription('')
    setCourseIds(courses[0] ? [courses[0].id] : [])
  }

  async function submitCreate() {
    if (name.trim().length < 2) {
      setFormError('Give the subject a name of at least 2 characters.')
      return
    }
    if (!courseIds.length) {
      setFormError('Choose at least one training course this subject is taught in.')
      return
    }
    setBusy(true)
    const res = await teacherApi.post<SubjectSummaryDTO>('/api/teacher/subjects', {
      name: name.trim(),
      description: description.trim(),
      courseIds,
    })
    setBusy(false)
    if (!res.ok) {
      setFormError(res.error)
      return
    }
    setCreating(false)
    toast('Subject created as a draft')
    navigate(`/teach/subjects/${res.data.id}`)
  }

  return (
    <section className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Teaching studio"
        title="Subjects"
        description="The academic subjects you teach, and the syllabus behind each one. A subject sits above the training courses: PPL and CPL can both teach Meteorology without copying a single lecture."
        actions={
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={openCreate} disabled={state.status !== 'ready' || !courses.length}>
            New subject
          </Button>
        }
      />

      {state.status === 'ready' && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: 'Subjects', v: String(subjects.length) },
            { k: 'Topics', v: String(totals.topics) },
            { k: 'Lectures', v: String(totals.lectures) },
            { k: 'Published lectures', v: String(totals.published) },
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
              <Input label="Search subjects" hideLabel placeholder="Search subjects…" value={query} onChange={(e) => setQuery(e.target.value)} />
              <Search className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-faint" aria-hidden />
            </div>
            <Select label="Training course" hideLabel value={course} onChange={(e) => setCourse(e.target.value)} className="w-full sm:w-[260px]">
              <option value="ALL">All training courses</option>
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading subjects">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[280px]" />
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
          icon={<Layers className="size-6" aria-hidden />}
          title={subjects.length ? 'No subjects match those filters' : 'No subjects yet'}
          body={
            subjects.length
              ? 'Clear the search or choose another course and status.'
              : 'Create a subject, add topics and lessons, then attach lectures from your courses.'
          }
          action={
            subjects.length ? (
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
              <Button onClick={openCreate} disabled={!courses.length}>
                New subject
              </Button>
            )
          }
        />
      )}

      {state.status === 'ready' && visible.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((s) => {
            const Icon = iconFor(s.name)
            const meta = STATUS_META[s.status]
            return (
              <Card as="li" key={s.id} className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-[2px] border border-line bg-navy-soft text-navy" aria-hidden>
                    <Icon className="size-5" />
                  </span>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>

                <div className="flex flex-col gap-1.5">
                  <h2 className="font-display text-[21px] leading-tight">
                    <Link to={`/teach/subjects/${s.id}`} className="underline decoration-transparent underline-offset-4 hover:decoration-amber">
                      {s.name}
                    </Link>
                  </h2>
                  <p className="line-clamp-3 text-[13.5px] leading-relaxed text-muted">{s.description || 'No description yet.'}</p>
                </div>

                <dl className="grid grid-cols-3 gap-2 border-y border-line py-3">
                  {[
                    { k: 'Topics', v: s.topicCount },
                    { k: 'Lectures', v: s.lectureCount },
                    { k: 'Published', v: s.publishedLectureCount },
                  ].map((stat) => (
                    <div key={stat.k} className="flex flex-col gap-0.5">
                      <dt className="text-[11px] text-muted">{stat.k}</dt>
                      <dd className="figures text-[17px] leading-none font-semibold">{stat.v}</dd>
                    </div>
                  ))}
                </dl>

                <div className="flex flex-wrap gap-1.5">
                  {s.courses.length ? (
                    s.courses.map((c) => (
                      <span key={c.id} className="inline-flex h-6 items-center rounded-[2px] border border-line bg-surface-2 px-2 text-[11.5px] text-muted">
                        {c.title}
                      </span>
                    ))
                  ) : (
                    <span className="text-[12px] text-danger">Not attached to a course</span>
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                  <span className="text-[12px] text-muted">Updated {dateLabel(s.updatedAt)}</span>
                  <Button to={`/teach/subjects/${s.id}`} variant="secondary" size="sm" iconRight={<ArrowRight className="size-3.5" aria-hidden />}>
                    Open syllabus
                  </Button>
                </div>
              </Card>
            )
          })}
        </ul>
      )}

      {state.status === 'ready' && (
        <p className="text-[12px] text-muted">
          {visible.length} of {subjects.length} subjects shown. Lecture counts include drafts; published counts are what students can open.
        </p>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New subject"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={submitCreate}>
              Create subject
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Subject name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Meteorology" autoComplete="off" />
          <Textarea label="Short description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the subject covers, in one or two sentences." />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[12.5px] font-medium text-fg">Taught within</legend>
            <p className="text-[12.5px] text-muted">A subject can belong to more than one training course.</p>
            <div className="flex flex-col gap-1">
              {courses.map((c) => (
                <Checkbox
                  key={c.id}
                  label={c.title}
                  checked={courseIds.includes(c.id)}
                  onChange={(e) => setCourseIds((ids) => (e.target.checked ? [...ids, c.id] : ids.filter((id) => id !== c.id)))}
                />
              ))}
            </div>
          </fieldset>
          {formError && <FormError>{formError}</FormError>}
        </div>
      </Modal>
    </section>
  )
}

/** Shared by the detail screen: the lecture row's status badge. */
export const lectureTone = (lecture: SubjectLectureRefDTO): Tone => (lecture.status === 'PUBLISHED' ? 'lime' : 'neutral')
