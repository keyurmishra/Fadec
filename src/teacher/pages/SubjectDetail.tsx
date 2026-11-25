import { AlertCircle, ArrowDown, ArrowLeft, ArrowUp, Check, Pencil, Plus, RotateCw, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import { Button, IconButton } from '../../components/Button'
import { Checkbox, FormError, Input, Select, Textarea } from '../../components/Field'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Badge, Card, EmptyState, Skeleton } from '../../components/ui'
import type { SubjectDetailDTO, SubjectLessonDTO, SubjectStatus, SubjectTopicDTO, TeacherLectureSummaryDTO } from '../../contracts/teaching'
import { cx } from '../../lib/cx'
import { teacherApi } from '../../lib/teacher-api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { PageHeader } from '../components/ui'
import { lectureTone } from './Subjects'

/*
  Subject workspace: overview, publish checklist and the syllabus itself
  (topic → lesson → lecture). Every mutation returns the full subject payload, so
  the tree, the counts and the checklist can never drift from the server.

  A lesson's lecture is an existing course lecture. Creating one here places it
  in the course chapter named after the topic and then links it; the builder in
  /teach/lectures/:lectureId owns everything else.
*/
type Load = { status: 'loading' } | { status: 'ready'; data: SubjectDetailDTO } | { status: 'error'; error: string; code: number }

type TopicForm = { mode: 'create' } | { mode: 'edit'; topic: SubjectTopicDTO }
type LessonForm = { mode: 'create'; topic: SubjectTopicDTO } | { mode: 'edit'; topic: SubjectTopicDTO; lesson: SubjectLessonDTO }
type DeleteTarget = { kind: 'topic' | 'lesson'; id: string; label: string; detail: string }

const STATUS_META: Record<SubjectStatus, { label: string; tone: 'amber' | 'lime' }> = {
  DRAFT: { label: 'Draft', tone: 'amber' },
  PUBLISHED: { label: 'Published', tone: 'lime' },
}

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function TeacherSubjectDetail() {
  const { subjectId = '' } = useParams()
  const toast = useToast()
  const base = `/api/teacher/subjects/${subjectId}`

  const [state, setState] = useState<Load>({ status: 'loading' })
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const [editingSubject, setEditingSubject] = useState(false)
  const [subjectName, setSubjectName] = useState('')
  const [subjectDescription, setSubjectDescription] = useState('')
  const [subjectCourseIds, setSubjectCourseIds] = useState<string[]>([])

  const [topicForm, setTopicForm] = useState<TopicForm | null>(null)
  const [topicTitle, setTopicTitle] = useState('')
  const [topicDescription, setTopicDescription] = useState('')

  const [lessonForm, setLessonForm] = useState<LessonForm | null>(null)
  const [lessonTitle, setLessonTitle] = useState('')
  const [lessonDescription, setLessonDescription] = useState('')

  const [lectureLesson, setLectureLesson] = useState<SubjectLessonDTO | null>(null)
  const [lectureMode, setLectureMode] = useState<'new' | 'existing'>('new')
  const [lectureCourseId, setLectureCourseId] = useState('')
  const [lectureKind, setLectureKind] = useState<'VIDEO' | 'TEXT'>('VIDEO')
  const [lectureMinutes, setLectureMinutes] = useState('30')
  const [lectureId, setLectureId] = useState('')
  const [picker, setPicker] = useState<TeacherLectureSummaryDTO[] | null>(null)

  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null)
  const [formError, setFormError] = useState('')

  useDocumentTitle(`${state.status === 'ready' ? state.data.name : 'Subject'} · Teaching studio`)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    teacherApi.get<SubjectDetailDTO>(base).then((res) => {
      if (cancelled) return
      setState(res.ok ? { status: 'ready', data: res.data } : { status: 'error', error: res.error, code: res.status })
    })
    return () => {
      cancelled = true
    }
  }, [base, reload])

  async function call(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<SubjectDetailDTO | null> {
    setBusy(true)
    setActionError('')
    const res =
      method === 'POST'
        ? await teacherApi.post<SubjectDetailDTO>(path, body ?? {})
        : method === 'PATCH'
          ? await teacherApi.patch<SubjectDetailDTO>(path, body ?? {})
          : await teacherApi.del<SubjectDetailDTO>(path)
    setBusy(false)
    if (!res.ok) {
      setActionError(res.error)
      return null
    }
    setState({ status: 'ready', data: res.data })
    return res.data
  }

  const detail = state.status === 'ready' ? state.data : null
  const allLectureIds = detail ? detail.topics.flatMap((t) => t.lessons.flatMap((l) => l.lectures.map((x) => x.id))) : []

  function openSubjectEditor() {
    if (!detail) return
    setEditingSubject(true)
    setSubjectName(detail.name)
    setSubjectDescription(detail.description)
    setSubjectCourseIds(detail.courses.map((c) => c.id))
    setFormError('')
  }

  async function saveSubject() {
    if (subjectName.trim().length < 2) {
      setFormError('Give the subject a name of at least 2 characters.')
      return
    }
    if (!subjectCourseIds.length) {
      setFormError('Keep at least one training course attached.')
      return
    }
    setBusy(true)
    const res = await teacherApi.patch<SubjectDetailDTO>(base, {
      name: subjectName.trim(),
      description: subjectDescription.trim(),
      courseIds: subjectCourseIds,
    })
    setBusy(false)
    if (!res.ok) {
      setFormError(res.error)
      return
    }
    setState({ status: 'ready', data: res.data })
    setEditingSubject(false)
    toast('Subject details saved')
  }

  function openTopicForm(next: TopicForm) {
    setTopicForm(next)
    setTopicTitle(next.mode === 'edit' ? next.topic.title : '')
    setTopicDescription(next.mode === 'edit' ? next.topic.description : '')
    setFormError('')
  }

  async function saveTopic() {
    if (!topicForm) return
    if (topicTitle.trim().length < 2) {
      setFormError('Give the topic a title of at least 2 characters.')
      return
    }
    setBusy(true)
    const body = { title: topicTitle.trim(), description: topicDescription.trim() }
    const res =
      topicForm.mode === 'create'
        ? await teacherApi.post<SubjectDetailDTO>(`${base}/topics`, body)
        : await teacherApi.patch<SubjectDetailDTO>(`/api/teacher/topics/${topicForm.topic.id}`, body)
    setBusy(false)
    if (!res.ok) {
      setFormError(res.error)
      return
    }
    setState({ status: 'ready', data: res.data })
    setTopicForm(null)
    toast(topicForm.mode === 'create' ? 'Topic added' : 'Topic saved')
  }

  function openLessonForm(next: LessonForm) {
    setLessonForm(next)
    setLessonTitle(next.mode === 'edit' ? next.lesson.title : '')
    setLessonDescription(next.mode === 'edit' ? next.lesson.description : '')
    setFormError('')
  }

  async function saveLesson() {
    if (!lessonForm) return
    if (lessonTitle.trim().length < 2) {
      setFormError('Give the lesson a title of at least 2 characters.')
      return
    }
    setBusy(true)
    const body = { title: lessonTitle.trim(), description: lessonDescription.trim() }
    const res =
      lessonForm.mode === 'create'
        ? await teacherApi.post<SubjectDetailDTO>(`/api/teacher/topics/${lessonForm.topic.id}/lessons`, body)
        : await teacherApi.patch<SubjectDetailDTO>(`/api/teacher/subject-lessons/${lessonForm.lesson.id}`, body)
    setBusy(false)
    if (!res.ok) {
      setFormError(res.error)
      return
    }
    setState({ status: 'ready', data: res.data })
    setLessonForm(null)
    toast(lessonForm.mode === 'create' ? 'Lesson added' : 'Lesson saved')
  }

  async function openLectureForm(lesson: SubjectLessonDTO) {
    if (!detail) return
    setLectureLesson(lesson)
    setLectureMode('new')
    setLectureCourseId(detail.courses[0]?.id ?? '')
    setLectureKind('VIDEO')
    setLectureMinutes('30')
    setLectureId('')
    setFormError('')
    if (!picker) {
      const res = await teacherApi.get<{ items: TeacherLectureSummaryDTO[] }>('/api/teacher/lectures')
      if (res.ok) setPicker(res.data.items)
    }
  }

  async function attachLecture() {
    if (!lectureLesson) return
    setBusy(true)
    const body =
      lectureMode === 'existing'
        ? { lectureId }
        : { courseId: lectureCourseId, kind: lectureKind, estimatedMinutes: Number(lectureMinutes) }
    if (lectureMode === 'existing' && !lectureId) {
      setBusy(false)
      setFormError('Choose a lecture to attach.')
      return
    }
    if (lectureMode === 'new' && !lectureCourseId) {
      setBusy(false)
      setFormError('Choose the course this lecture is taught in.')
      return
    }
    const res = await teacherApi.post<SubjectDetailDTO>(`/api/teacher/subject-lessons/${lectureLesson.id}/lectures`, body)
    setBusy(false)
    if (!res.ok) {
      setFormError(res.error)
      return
    }
    setState({ status: 'ready', data: res.data })
    setLectureLesson(null)
    toast(lectureMode === 'existing' ? 'Lecture attached' : 'Lecture created as a draft')
  }

  async function unlinkLecture(lessonId: string, id: string) {
    const updated = await call(`/api/teacher/subject-lessons/${lessonId}/lectures/${id}`, 'DELETE')
    if (updated) toast('Lecture detached from this lesson')
  }

  async function move(kind: 'TOPIC' | 'LESSON', id: string, direction: 'UP' | 'DOWN') {
    await call(`${base}/reorder`, 'POST', { kind, id, direction })
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const path = pendingDelete.kind === 'topic' ? `/api/teacher/topics/${pendingDelete.id}` : `/api/teacher/subject-lessons/${pendingDelete.id}`
    const updated = await call(path, 'DELETE')
    if (!updated) return
    setPendingDelete(null)
    toast(pendingDelete.kind === 'topic' ? 'Topic deleted' : 'Lesson deleted')
  }

  async function setPublished(next: boolean) {
    setBusy(true)
    setActionError('')
    const res = await teacherApi.post<SubjectDetailDTO>(`${base}/${next ? 'publish' : 'unpublish'}`, {})
    setBusy(false)
    if (!res.ok) {
      setActionError(res.error)
      return
    }
    setState({ status: 'ready', data: res.data })
    toast(next ? 'Subject published' : 'Subject returned to draft')
  }

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Loading subject">
        <Skeleton className="h-24" />
        <Skeleton className="h-20" />
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
        <Link to="/teach/subjects" className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden />
          All subjects
        </Link>
        <Card className="flex flex-col gap-4 p-6">
          <h1 className="font-display text-[26px]">{state.code === 404 ? 'This subject is not in your courses' : 'The subject could not be loaded'}</h1>
          <p role="alert" className="flex items-start gap-2.5 text-[14px] text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {state.error}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<RotateCw className="size-4" aria-hidden />} onClick={() => setReload((n) => n + 1)}>
              Try again
            </Button>
            <Button to="/teach/subjects" variant="ghost">
              Back to subjects
            </Button>
          </div>
        </Card>
      </section>
    )
  }

  const subject = state.data
  const meta = STATUS_META[subject.status]
  const linkedLectureCount = subject.lectureCount
  const sampleNote = subject.topics.some((t) => /sample/i.test(`${t.title} ${t.description}`))

  return (
    <section className="flex flex-col gap-6">
      <Link to="/teach/subjects" className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden />
        All subjects
      </Link>

      <PageHeader
        eyebrow={subject.courses.length ? subject.courses.map((c) => c.title).join(' · ') : 'Not attached to a course'}
        title={subject.name}
        description={subject.description || 'No description yet. Add one so students know what this subject covers.'}
        actions={
          <>
            <Badge tone={meta.tone}>{meta.label}</Badge>
            <Button variant="secondary" icon={<Pencil className="size-4" aria-hidden />} onClick={openSubjectEditor}>
              Edit details
            </Button>
            {subject.status === 'PUBLISHED' ? (
              <Button variant="secondary" loading={busy} onClick={() => setPublished(false)}>
                Unpublish
              </Button>
            ) : (
              <Button
                loading={busy}
                disabled={!subject.publish.canPublish}
                onClick={() => setPublished(true)}
                title={subject.publish.canPublish ? undefined : 'Complete the publish checklist first'}
              >
                Publish subject
              </Button>
            )}
          </>
        }
      />

      {actionError && (
        <p role="alert" className="flex items-start gap-2.5 border border-[rgb(160_48_36/0.25)] bg-danger-soft px-4 py-3 text-[13.5px] text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {actionError}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { k: 'Topics', v: String(subject.topicCount) },
          { k: 'Lessons', v: String(subject.lessonCount) },
          { k: 'Lectures', v: String(linkedLectureCount) },
          { k: 'Published', v: String(subject.publishedLectureCount) },
          { k: 'Drafts', v: String(subject.draftLectureCount) },
        ].map((s) => (
          <div key={s.k} className="flex flex-col gap-1 border border-line bg-surface px-4 py-3">
            <dt className="text-[11.5px] text-muted">{s.k}</dt>
            <dd className="figures text-[22px] leading-none font-semibold">{s.v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr] xl:items-start">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-[24px] leading-tight">Syllabus</h2>
              <p className="text-[13px] text-muted">Topic → lesson → lecture. Reorder with the arrow buttons.</p>
            </div>
            <Button size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => openTopicForm({ mode: 'create' })}>
              Add topic
            </Button>
          </div>

          {sampleNote && (
            <p className="border-l-2 border-amber bg-amber-soft px-4 py-3 text-[12.5px] leading-relaxed text-amber-ink">
              Sample syllabus structure for testing. Topics and lessons are editable, reuse lecture titles from your courses, and are not an official aviation
              syllabus or examination standard.
            </p>
          )}

          {!subject.topics.length ? (
            <EmptyState
              title="No topics yet"
              body="Start with a topic, then add lessons. Attach a lecture to a lesson to publish it to students."
              action={
                <Button size="sm" onClick={() => openTopicForm({ mode: 'create' })}>
                  Add the first topic
                </Button>
              }
            />
          ) : (
            <ol className="flex flex-col gap-3">
              {subject.topics.map((topic, ti) => (
                <li key={topic.id}>
                  <Card className="flex flex-col">
                    <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Topic {ti + 1}</span>
                        <h3 className="text-[16px] leading-snug font-semibold">{topic.title}</h3>
                        {topic.description && <p className="max-w-[60ch] text-[13px] leading-relaxed text-muted">{topic.description}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <IconButton aria-label={`Move ${topic.title} up`} disabled={ti === 0 || busy} onClick={() => move('TOPIC', topic.id, 'UP')} className="size-8">
                          <ArrowUp className="size-4" aria-hidden />
                        </IconButton>
                        <IconButton
                          aria-label={`Move ${topic.title} down`}
                          disabled={ti === subject.topics.length - 1 || busy}
                          onClick={() => move('TOPIC', topic.id, 'DOWN')}
                          className="size-8"
                        >
                          <ArrowDown className="size-4" aria-hidden />
                        </IconButton>
                        <Button size="sm" variant="ghost" onClick={() => openTopicForm({ mode: 'edit', topic })}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openLessonForm({ mode: 'create', topic })}>
                          Add lesson
                        </Button>
                        <IconButton
                          aria-label={`Delete ${topic.title}`}
                          disabled={busy}
                          onClick={() =>
                            setPendingDelete({
                              kind: 'topic',
                              id: topic.id,
                              label: topic.title,
                              detail: `Its ${topic.lessons.length} lesson${topic.lessons.length === 1 ? '' : 's'} and their lecture links are removed. The lectures stay in their courses.`,
                            })
                          }
                          className="size-8 text-danger"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </IconButton>
                      </div>
                    </div>

                    {!topic.lessons.length ? (
                      <p className="px-4 py-5 text-[13px] text-muted">
                        No lessons in this topic yet.{' '}
                        <button type="button" className="font-medium text-fg underline decoration-amber decoration-1 underline-offset-4" onClick={() => openLessonForm({ mode: 'create', topic })}>
                          Add a lesson
                        </button>
                        .
                      </p>
                    ) : (
                      <ul className="divide-y divide-line">
                        {topic.lessons.map((lesson, li) => (
                          <li key={lesson.id} className="flex flex-col gap-3 px-4 py-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="flex min-w-0 flex-col gap-0.5">
                                <h4 className="text-[14.5px] leading-snug font-medium">{lesson.title}</h4>
                                {lesson.description && <p className="text-[12.5px] text-muted">{lesson.description}</p>}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <IconButton aria-label={`Move ${lesson.title} up`} disabled={li === 0 || busy} onClick={() => move('LESSON', lesson.id, 'UP')} className="size-8">
                                  <ArrowUp className="size-4" aria-hidden />
                                </IconButton>
                                <IconButton
                                  aria-label={`Move ${lesson.title} down`}
                                  disabled={li === topic.lessons.length - 1 || busy}
                                  onClick={() => move('LESSON', lesson.id, 'DOWN')}
                                  className="size-8"
                                >
                                  <ArrowDown className="size-4" aria-hidden />
                                </IconButton>
                                <Button size="sm" variant="ghost" onClick={() => openLessonForm({ mode: 'edit', topic, lesson })}>
                                  Edit
                                </Button>
                                <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" aria-hidden />} onClick={() => openLectureForm(lesson)}>
                                  Add lecture
                                </Button>
                                <IconButton
                                  aria-label={`Delete ${lesson.title}`}
                                  disabled={busy}
                                  onClick={() =>
                                    setPendingDelete({
                                      kind: 'lesson',
                                      id: lesson.id,
                                      label: lesson.title,
                                      detail: 'Its lecture links are removed. The lectures stay in their courses.',
                                    })
                                  }
                                  className="size-8 text-danger"
                                >
                                  <Trash2 className="size-4" aria-hidden />
                                </IconButton>
                              </div>
                            </div>

                            {!lesson.lectures.length ? (
                              <p className="border border-dashed border-line-strong px-3 py-2.5 text-[12.5px] text-muted">
                                No lecture attached. Add one to turn this lesson into something students can open.
                              </p>
                            ) : (
                              <ul className="flex flex-col gap-2">
                                {lesson.lectures.map((lecture) => (
                                  <li key={lecture.id} className={cx('flex flex-wrap items-center gap-x-3 gap-y-2 border border-line bg-surface-2 px-3 py-2.5')}>
                                    <Badge tone={lectureTone(lecture)}>{lecture.status === 'PUBLISHED' ? 'Published' : 'Draft'}</Badge>
                                    <Link
                                      to={`/teach/lectures/${lecture.id}`}
                                      className="text-[13.5px] font-medium underline decoration-transparent underline-offset-4 hover:decoration-amber"
                                    >
                                      {lecture.title}
                                    </Link>
                                    <span className="text-[12px] text-muted">
                                      {lecture.courseTitle} · {lecture.kind === 'VIDEO' ? 'Video' : 'Text'} · {lecture.estimatedMinutes} min
                                      {lecture.resourceCount ? ` · ${lecture.resourceCount} resource${lecture.resourceCount === 1 ? '' : 's'}` : ''}
                                    </span>
                                    <span className="ml-auto flex items-center gap-1">
                                      <Button to={`/teach/lectures/${lecture.id}`} size="sm" variant="ghost">
                                        Open builder
                                      </Button>
                                      <IconButton
                                        aria-label={`Detach ${lecture.title} from ${lesson.title}`}
                                        disabled={busy}
                                        onClick={() => unlinkLecture(lesson.id, lecture.id)}
                                        className="size-8"
                                      >
                                        <X className="size-4" aria-hidden />
                                      </IconButton>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold">Publish checklist</h2>
              <Badge tone={subject.publish.canPublish ? 'lime' : 'amber'}>{subject.publish.canPublish ? 'Ready' : 'Blocked'}</Badge>
            </div>
            <ul className="flex flex-col gap-2.5">
              {subject.publish.requirements.map((r) => (
                <li key={r.key} className="flex items-start gap-2.5 text-[13.5px]">
                  {r.satisfied ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-lime-ink" aria-hidden />
                  ) : (
                    <X className="mt-0.5 size-4 shrink-0 text-amber-ink" aria-hidden />
                  )}
                  <span className={r.satisfied ? 'text-muted' : 'text-fg'}>
                    {r.label}
                    <span className="sr-only">{r.satisfied ? ' — done' : ' — needed'}</span>
                    {!r.satisfied && r.detail && <span className="block text-[12.5px] text-muted">{r.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t border-line pt-3 text-[12px] leading-relaxed text-muted">
              Publishing a subject adds it to the student catalogue. Each lecture is published from its own builder and keeps its own checklist.
            </p>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-[15px] font-semibold">Training courses</h2>
            <ul className="flex flex-col gap-2">
              {subject.courses.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-[13.5px]">
                  <span className="min-w-0 truncate">{c.title}</span>
                  <Badge tone={c.status === 'PUBLISHED' ? 'lime' : 'neutral'}>{c.status === 'PUBLISHED' ? 'Live' : 'Draft'}</Badge>
                </li>
              ))}
            </ul>
            <p className="text-[12px] leading-relaxed text-muted">
              One subject, several courses. Lectures are linked, never copied, so an edit in the builder reaches every course that teaches this subject.
            </p>
            <Button variant="ghost" size="sm" to="/teach/subjects" className="justify-start px-0">
              Manage subject details
            </Button>
          </Card>

          <Card className="flex flex-col gap-2 p-5">
            <h2 className="text-[15px] font-semibold">About</h2>
            <dl className="grid grid-cols-2 gap-2 text-[12.5px]">
              <dt className="text-muted">Subject id</dt>
              <dd className="truncate text-right font-mono text-[11.5px]">{subject.id}</dd>
              <dt className="text-muted">Created</dt>
              <dd className="text-right">{dateLabel(subject.createdAt)}</dd>
              <dt className="text-muted">Updated</dt>
              <dd className="text-right">{dateLabel(subject.updatedAt)}</dd>
              <dt className="text-muted">Newest lecture</dt>
              <dd className="text-right">{subject.lastLectureUpdatedAt ? dateLabel(subject.lastLectureUpdatedAt) : 'None'}</dd>
            </dl>
          </Card>
        </aside>
      </div>

      {/* Subject details */}
      <Modal
        open={editingSubject}
        onClose={() => setEditingSubject(false)}
        title="Subject details"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingSubject(false)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={saveSubject}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Subject name" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} />
          <Textarea label="Description" rows={5} value={subjectDescription} onChange={(e) => setSubjectDescription(e.target.value)} />
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-[12.5px] font-medium text-fg">Taught within</legend>
            {subject.courses.map((c) => (
              <Checkbox
                key={c.id}
                label={c.title}
                checked={subjectCourseIds.includes(c.id)}
                onChange={(e) => setSubjectCourseIds((ids) => (e.target.checked ? [...ids, c.id] : ids.filter((id) => id !== c.id)))}
              />
            ))}
            <p className="text-[12px] text-muted">Courses are the ones assigned to you; a subject can belong to several.</p>
          </fieldset>
          {formError && <FormError>{formError}</FormError>}
        </div>
      </Modal>

      {/* Topic form */}
      <Modal
        open={!!topicForm}
        onClose={() => setTopicForm(null)}
        title={topicForm?.mode === 'edit' ? 'Edit topic' : 'Add topic'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTopicForm(null)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={saveTopic}>
              {topicForm?.mode === 'edit' ? 'Save topic' : 'Add topic'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Topic title" value={topicTitle} onChange={(e) => setTopicTitle(e.target.value)} placeholder="Atmosphere and pressure" />
          <Textarea
            label="Short description"
            optional
            rows={4}
            value={topicDescription}
            onChange={(e) => setTopicDescription(e.target.value)}
            placeholder="What this unit covers."
          />
          {formError && <FormError>{formError}</FormError>}
        </div>
      </Modal>

      {/* Lesson form */}
      <Modal
        open={!!lessonForm}
        onClose={() => setLessonForm(null)}
        title={lessonForm?.mode === 'edit' ? 'Edit lesson' : 'Add lesson'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLessonForm(null)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={saveLesson}>
              {lessonForm?.mode === 'edit' ? 'Save lesson' : 'Add lesson'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {lessonForm && <p className="text-[12.5px] text-muted">Topic: {lessonForm.topic.title}</p>}
          <Input label="Lesson title" value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} placeholder="The atmosphere and pressure" />
          <Textarea
            label="Short description"
            optional
            rows={4}
            value={lessonDescription}
            onChange={(e) => setLessonDescription(e.target.value)}
            placeholder="What students should take away from this lesson."
          />
          {formError && <FormError>{formError}</FormError>}
        </div>
      </Modal>

      {/* Lecture attach/create */}
      <Modal
        open={!!lectureLesson}
        onClose={() => setLectureLesson(null)}
        title={lectureMode === 'existing' ? 'Attach an existing lecture' : 'Create a lecture'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLectureLesson(null)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={attachLecture}>
              {lectureMode === 'existing' ? 'Attach lecture' : 'Create lecture'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {lectureLesson && (
            <p className="text-[12.5px] text-muted">
              Lesson: <span className="text-fg">{lectureLesson.title}</span>
            </p>
          )}

          <div className="flex gap-1" role="radiogroup" aria-label="Lecture source">
            {[
              { value: 'new' as const, label: 'Create new' },
              { value: 'existing' as const, label: 'Attach existing' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={lectureMode === option.value}
                onClick={() => {
                  setLectureMode(option.value)
                  setFormError('')
                }}
                className={cx(
                  'h-9 rounded-[3px] border px-3.5 text-[13px] font-medium transition-colors',
                  lectureMode === option.value ? 'border-fg bg-fg text-[#fdfbf7]' : 'border-line-strong bg-surface text-fg hover:border-fg',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {lectureMode === 'new' ? (
            <>
              <Select label="Training course" value={lectureCourseId} onChange={(e) => setLectureCourseId(e.target.value)}>
                {subject.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </Select>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Lecture type" value={lectureKind} onChange={(e) => setLectureKind(e.target.value as 'VIDEO' | 'TEXT')}>
                  <option value="VIDEO">Video</option>
                  <option value="TEXT">Text</option>
                </Select>
                <Input label="Duration (minutes)" type="number" min={1} max={600} value={lectureMinutes} onChange={(e) => setLectureMinutes(e.target.value)} />
              </div>
              <p className="border-l-2 border-amber bg-amber-soft px-3 py-2.5 text-[12px] leading-relaxed text-amber-ink">
                The lecture is placed in the course chapter named after this topic, created if it does not exist yet, and starts as a draft. Video upload is not
                connected in this build, so video lectures stay drafts until a READY media asset exists.
              </p>
            </>
          ) : (
            <>
              <Select label="Lecture" value={lectureId} onChange={(e) => setLectureId(e.target.value)}>
                <option value="">Choose a lecture…</option>
                {(picker ?? [])
                  .filter((l) => !allLectureIds.includes(l.id))
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title} — {l.courseTitle} ({l.status === 'PUBLISHED' ? 'published' : 'draft'})
                    </option>
                  ))}
              </Select>
              {picker === null && <p className="text-[12.5px] text-muted">Loading your lectures…</p>}
              {picker !== null && picker.filter((l) => !allLectureIds.includes(l.id)).length === 0 && (
                <p className="text-[12.5px] text-muted">Every lecture in your courses is already attached somewhere in this subject.</p>
              )}
            </>
          )}

          {formError && <FormError>{formError}</FormError>}
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={pendingDelete?.kind === 'topic' ? 'Delete this topic?' : 'Delete this lesson?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Keep it
            </Button>
            <Button variant="danger" loading={busy} onClick={confirmDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-muted">
          <span className="font-medium text-fg">{pendingDelete?.label}</span> will be removed from the syllabus. {pendingDelete?.detail}
        </p>
      </Modal>
    </section>
  )
}
