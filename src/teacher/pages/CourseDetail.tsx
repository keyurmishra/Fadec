import { AlertCircle, ArrowDown, ArrowLeft, ArrowUp, Check, Plus, RotateCw, Trash2, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'

import { Button } from '../../components/Button'
import { Input, Select } from '../../components/Field'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Badge, Card, EmptyState, Skeleton, type Tone } from '../../components/ui'
import type { CourseStatus, PublishValidationDTO } from '../../contracts/catalog'
import type { TeacherCourseSummaryDTO, TeacherOutlineSection } from '../../contracts/teaching'
import { cx } from '../../lib/cx'
import { teacherApi } from '../../lib/teacher-api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { PageHeader, ProgressBar } from '../components/ui'

/*
  Course detail and curriculum builder.

  One endpoint family drives the whole screen: every mutation returns the fresh
  outline plus the recalculated publish checklist, so the tree and the checklist
  can never disagree with the server.
*/
type OutlineResponse = { course: TeacherCourseSummaryDTO; sections: TeacherOutlineSection[]; publish: PublishValidationDTO }
type Load = { status: 'loading' } | { status: 'ready'; data: OutlineResponse } | { status: 'error'; error: string; code: number }

type Composer =
  | { kind: 'section' }
  | { kind: 'chapter'; sectionId: string; sectionTitle: string }
  | { kind: 'lesson'; chapterId: string; chapterTitle: string }

type PendingDelete = { label: string; detail: string; path: string }

const STATUS_META: Record<CourseStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'amber' },
  IN_REVIEW: { label: 'In review', tone: 'blue' },
  PUBLISHED: { label: 'Published', tone: 'lime' },
  UNPUBLISHED: { label: 'Unpublished', tone: 'amber' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
}

export function TeacherCourseDetail() {
  const { courseId = '' } = useParams()
  const toast = useToast()
  const base = `/api/teacher/courses/${courseId}`

  const [state, setState] = useState<Load>({ status: 'loading' })
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const [composer, setComposer] = useState<Composer | null>(null)
  const [title, setTitle] = useState('')
  const [minutes, setMinutes] = useState('45')
  const [lessonKind, setLessonKind] = useState<'VIDEO' | 'TEXT'>('VIDEO')
  const [formError, setFormError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [pendingUnpublish, setPendingUnpublish] = useState(false)

  useDocumentTitle(`${state.status === 'ready' ? state.data.course.title : 'Course'} · Teaching studio`)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    teacherApi.get<OutlineResponse>(`${base}/outline`).then((res) => {
      if (cancelled) return
      setState(res.ok ? { status: 'ready', data: res.data } : { status: 'error', error: res.error, code: res.status })
    })
    return () => {
      cancelled = true
    }
  }, [base, reload])

  async function call(path: string, method: 'POST' | 'DELETE', body?: unknown) {
    setBusy(true)
    setActionError('')
    const res = method === 'POST' ? await teacherApi.post<OutlineResponse>(path, body ?? {}) : await teacherApi.del<OutlineResponse>(path)
    setBusy(false)
    if (!res.ok) {
      setActionError(res.error)
      return null
    }
    setState({ status: 'ready', data: res.data })
    return res.data
  }

  function openComposer(next: Composer) {
    setComposer(next)
    setTitle('')
    setMinutes('45')
    setLessonKind('VIDEO')
    setFormError('')
  }

  async function submitComposer() {
    if (!composer) return
    const clean = title.trim()
    if (clean.length < 2) {
      setFormError('Enter a title of at least 2 characters.')
      return
    }

    let path = `${base}/sections`
    let body: unknown = { title: clean }
    if (composer.kind === 'chapter') path = `${base}/sections/${composer.sectionId}/chapters`
    if (composer.kind === 'lesson') {
      const mins = Number(minutes)
      if (!Number.isInteger(mins) || mins < 1 || mins > 600) {
        setFormError('Duration must be a whole number of minutes between 1 and 600.')
        return
      }
      path = `${base}/chapters/${composer.chapterId}/lessons`
      body = { title: clean, kind: lessonKind, estimatedMinutes: mins }
    }

    const data = await call(path, 'POST', body)
    if (!data) return
    setComposer(null)
    toast(composer.kind === 'section' ? 'Module added' : composer.kind === 'chapter' ? 'Chapter added' : 'Lecture added as a draft')
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const data = await call(pendingDelete.path, 'DELETE')
    if (!data) return
    setPendingDelete(null)
    toast('Deleted')
  }

  async function moveItem(kind: 'SECTION' | 'CHAPTER' | 'LESSON', id: string, direction: 'UP' | 'DOWN') {
    await call(`${base}/reorder`, 'POST', { kind, id, direction })
  }

  async function setPublished(next: boolean) {
    const data = await call(`${base}/${next ? 'publish' : 'unpublish'}`, 'POST')
    if (!data) return null
    toast(next ? 'Course published' : 'Course unpublished')
    return data
  }

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Loading course">
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
        <Link to="/teach/courses" className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden />
          All courses
        </Link>
        <Card className="flex flex-col gap-4 p-6">
          <h1 className="font-display text-[26px]">{state.code === 404 ? 'This course is not assigned to you' : 'The course could not be loaded'}</h1>
          <p role="alert" className="flex items-start gap-2.5 text-[14px] text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {state.error}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<RotateCw className="size-4" aria-hidden />} onClick={() => setReload((n) => n + 1)}>
              Try again
            </Button>
            <Button to="/teach/courses" variant="ghost">
              Back to my courses
            </Button>
          </div>
        </Card>
      </section>
    )
  }

  const { course, sections, publish } = state.data
  const meta = STATUS_META[course.status]
  const isPublished = course.status === 'PUBLISHED'
  const unmet = publish.requirements.filter((r) => !r.satisfied)

  return (
    <section className="flex flex-col gap-6">
      <Link to="/teach/courses" className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden />
        All courses
      </Link>

      <PageHeader
        eyebrow={course.category}
        title={course.title}
        description={course.summary}
        actions={
          <>
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {isPublished ? (
              <Button variant="secondary" disabled={busy} onClick={() => setPendingUnpublish(true)}>
                Unpublish
              </Button>
            ) : (
              <Button loading={busy} disabled={!publish.canPublish} onClick={() => setPublished(true)} title={publish.canPublish ? undefined : 'Complete the publish checklist first'}>
                Publish course
              </Button>
            )}
          </>
        }
      />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { k: 'Students', v: String(course.enrolledCount) },
          { k: 'Lectures', v: String(course.lectureCount) },
          { k: 'Draft lectures', v: String(course.draftLectureCount) },
          { k: 'Tasks', v: String(course.assignmentCount) },
        ].map((s) => (
          <div key={s.k} className="flex flex-col gap-1 border border-line bg-surface px-4 py-3">
            <dt className="text-[11.5px] text-muted">{s.k}</dt>
            <dd className="figures text-[22px] leading-none font-semibold">{s.v}</dd>
          </div>
        ))}
      </dl>

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
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <div className="flex flex-col">
              <h2 className="text-[16px] font-semibold">Curriculum</h2>
              <p className="text-[12.5px] text-muted">Module → chapter → lecture. Order changes save straight away.</p>
            </div>
            <Button size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => openComposer({ kind: 'section' })}>
              Add module
            </Button>
          </div>

          {sections.length === 0 ? (
            <EmptyState
              title="No modules yet"
              body="A course needs at least one module, one chapter and one published lecture before it can go live."
              action={<Button onClick={() => openComposer({ kind: 'section' })}>Add the first module</Button>}
            />
          ) : (
            <ol className="flex flex-col gap-3">
              {sections.map((section, si) => (
                <li key={section.id} className="border border-line bg-surface">
                  <header className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-3 py-2.5">
                    <span className="figures w-6 shrink-0 text-[11px] text-faint">{String(si + 1).padStart(2, '0')}</span>
                    <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold">{section.title}</h3>
                    <span className="text-[11.5px] whitespace-nowrap text-muted">
                      {section.chapters.length} chapters · {section.chapters.reduce((n, c) => n + c.lessons.length, 0)} lectures
                    </span>
                    <MoveButtons
                      label={`module ${section.title}`}
                      canUp={si > 0}
                      canDown={si < sections.length - 1}
                      disabled={busy}
                      onMove={(d) => moveItem('SECTION', section.id, d)}
                    />
                    <RowButton
                      label={`Delete module ${section.title}`}
                      tone="danger"
                      disabled={busy}
                      onClick={() =>
                        setPendingDelete({
                          label: section.title,
                          detail: `Its ${section.chapters.length} chapters and every lecture inside them will be removed.`,
                          path: `${base}/sections/${section.id}`,
                        })
                      }
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </RowButton>
                  </header>

                  <ul>
                    {section.chapters.map((chapter, ci) => (
                      <li key={chapter.id} className="border-b border-line last:border-0">
                        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                          <span className="figures w-8 shrink-0 text-[11px] text-faint">
                            {si + 1}.{ci + 1}
                          </span>
                          <h4 className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{chapter.title}</h4>
                          <span className="text-[11.5px] whitespace-nowrap text-muted">{chapter.lessons.length} lectures</span>
                          <MoveButtons
                            label={`chapter ${chapter.title}`}
                            canUp={ci > 0}
                            canDown={ci < section.chapters.length - 1}
                            disabled={busy}
                            onMove={(d) => moveItem('CHAPTER', chapter.id, d)}
                          />
                          <RowButton
                            label={`Delete chapter ${chapter.title}`}
                            tone="danger"
                            disabled={busy}
                            onClick={() =>
                              setPendingDelete({
                                label: chapter.title,
                                detail: `Its ${chapter.lessons.length} lectures will be removed.`,
                                path: `${base}/chapters/${chapter.id}`,
                              })
                            }
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </RowButton>
                        </div>

                        {chapter.lessons.length > 0 && (
                          <ul className="border-t border-line">
                            {chapter.lessons.map((lesson, li) => (
                              <li key={lesson.id} className="flex flex-wrap items-center gap-2 border-b border-line bg-bg/40 px-3 py-2 pl-6 last:border-0">
                                <span className="figures w-6 shrink-0 text-[11px] text-faint">{li + 1}</span>
                                <Link
                                  to={`/teach/lectures/${lesson.id}`}
                                  className="min-w-0 flex-1 truncate text-[13px] underline decoration-transparent underline-offset-4 hover:decoration-amber"
                                >
                                  {lesson.title}
                                </Link>
                                <Badge tone={lesson.status === 'PUBLISHED' ? 'lime' : 'neutral'}>{lesson.status === 'PUBLISHED' ? 'Published' : 'Draft'}</Badge>
                                <span className="figures text-[11.5px] whitespace-nowrap text-muted">
                                  {lesson.kind === 'VIDEO' ? 'Video' : 'Text'} · {lesson.estimatedMinutes} min
                                </span>
                                <MoveButtons
                                  label={`lecture ${lesson.title}`}
                                  canUp={li > 0}
                                  canDown={li < chapter.lessons.length - 1}
                                  disabled={busy}
                                  onMove={(d) => moveItem('LESSON', lesson.id, d)}
                                />
                                <RowButton
                                  label={`Delete lecture ${lesson.title}`}
                                  tone="danger"
                                  disabled={busy}
                                  onClick={() =>
                                    setPendingDelete({ label: lesson.title, detail: 'The lecture and its resources will be removed.', path: `${base}/lessons/${lesson.id}` })
                                  }
                                >
                                  <Trash2 className="size-3.5" aria-hidden />
                                </RowButton>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="px-3 py-2 pl-6">
                          <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" aria-hidden />} onClick={() => openComposer({ kind: 'lesson', chapterId: chapter.id, chapterTitle: chapter.title })}>
                            Add lecture
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="border-t border-line px-3 py-2">
                    <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" aria-hidden />} onClick={() => openComposer({ kind: 'chapter', sectionId: section.id, sectionTitle: section.title })}>
                      Add chapter to “{section.title}”
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col">
            <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-[15px] font-semibold">Publish checklist</h2>
                <p className="text-[12.5px] text-muted">{publish.canPublish ? 'Every requirement is met.' : `${unmet.length} requirement${unmet.length === 1 ? '' : 's'} outstanding`}</p>
              </div>
              <Badge tone={publish.canPublish ? 'lime' : 'amber'}>{publish.canPublish ? 'Ready' : 'Blocked'}</Badge>
            </header>
            <ul className="flex flex-col divide-y divide-line">
              {publish.requirements.map((r) => (
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
            {!isPublished && (
              <div className="border-t border-line px-5 py-3">
                <Button size="sm" className="w-full" loading={busy} disabled={!publish.canPublish} onClick={() => setPublished(true)}>
                  {publish.canPublish ? 'Publish course' : 'Complete the checklist to publish'}
                </Button>
              </div>
            )}
          </Card>

          <Card className="flex flex-col gap-4 p-5">
            <h2 className="text-[15px] font-semibold">Course</h2>
            {course.thumbnailUrl && <img src={course.thumbnailUrl} alt="" className="aspect-[16/9] w-full border border-line object-cover" />}
            <dl className="flex flex-col gap-2 text-[12.5px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Status</dt>
                <dd>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Level</dt>
                <dd className="capitalize">{course.level.toLowerCase()}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Completion</dt>
                <dd className="flex items-center gap-2">
                  <ProgressBar value={course.completionPercent} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Modules</dt>
                <dd className="figures">{sections.length}</dd>
              </div>
            </dl>
            <Link to="/teach/students" className="text-[12.5px] text-muted underline decoration-line-strong underline-offset-4 hover:text-fg">
              View enrolled students
            </Link>
          </Card>
        </div>
      </div>

      <Modal
        open={!!composer}
        onClose={() => setComposer(null)}
        title={composer?.kind === 'section' ? 'Add a module' : composer?.kind === 'chapter' ? `Add a chapter` : 'Add a lecture'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setComposer(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitComposer} loading={busy}>
              {composer?.kind === 'lesson' ? 'Add lecture' : 'Add'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {composer?.kind === 'chapter' && <p className="text-[13px] text-muted">Inside module “{composer.sectionTitle}”.</p>}
          {composer?.kind === 'lesson' && <p className="text-[13px] text-muted">Inside chapter “{composer.chapterTitle}”. New lectures start as drafts.</p>}
          <Input label="Title" value={title} autoFocus error={formError} onChange={(e) => setTitle(e.target.value)} />
          {composer?.kind === 'lesson' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Type" value={lessonKind} onChange={(e) => setLessonKind(e.target.value as 'VIDEO' | 'TEXT')}>
                <option value="VIDEO">Video lecture</option>
                <option value="TEXT">Text lecture</option>
              </Select>
              <Input label="Duration (minutes)" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={pendingUnpublish}
        onClose={() => setPendingUnpublish(false)}
        title={`Unpublish “${course.title}”?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingUnpublish(false)} disabled={busy}>
              Keep it live
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                const data = await setPublished(false)
                if (data) setPendingUnpublish(false)
              }}
            >
              Unpublish
            </Button>
          </>
        }
      >
        <p className="text-[14px] leading-relaxed text-muted">
          Students lose access to {course.lectureCount} lectures and every task in this course as soon as you unpublish. Enrolments, progress and marks stay exactly as they are and
          you can publish again at any time.
        </p>
      </Modal>

      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={`Delete “${pendingDelete?.label ?? ''}”?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)} disabled={busy}>
              Keep it
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={busy}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-muted">{pendingDelete?.detail} This cannot be undone.</p>
      </Modal>
    </section>
  )
}

function MoveButtons({ label, canUp, canDown, disabled, onMove }: { label: string; canUp: boolean; canDown: boolean; disabled: boolean; onMove: (d: 'UP' | 'DOWN') => void }) {
  return (
    <span className="flex items-center gap-0.5">
      <RowButton label={`Move ${label} up`} disabled={disabled || !canUp} onClick={() => onMove('UP')}>
        <ArrowUp className="size-3.5" aria-hidden />
      </RowButton>
      <RowButton label={`Move ${label} down`} disabled={disabled || !canDown} onClick={() => onMove('DOWN')}>
        <ArrowDown className="size-3.5" aria-hidden />
      </RowButton>
    </span>
  )
}

function RowButton({ label, children, onClick, disabled, tone = 'neutral' }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean; tone?: 'neutral' | 'danger' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-[2px] border border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-deep disabled:opacity-25',
        tone === 'danger' ? 'text-muted hover:border-line hover:bg-danger-soft hover:text-danger' : 'text-muted hover:border-line hover:bg-surface-2 hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}
