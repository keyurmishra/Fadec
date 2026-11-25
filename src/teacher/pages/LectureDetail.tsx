import { AlertCircle, ArrowLeft, Check, Link2, Plus, RotateCw, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import { Button } from '../../components/Button'
import { Checkbox, Input, Select } from '../../components/Field'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Badge, EmptyState, Skeleton, type Tone } from '../../components/ui'
import type { LectureResourceDTO, TeacherLectureDetailDTO } from '../../contracts/teaching'
import { cx } from '../../lib/cx'
import { teacherApi } from '../../lib/teacher-api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { PageHeader, Panel, ProgressBar } from '../components/ui'

/*
  One lecture, everything about it: editable details, attached resources, the
  availability window, the video's processing state and the watch numbers.

  The detail endpoint is the only source of truth. Every mutation answers with
  the fresh lecture, so the form, the checklist and the statistics cannot drift
  from what the server holds.
*/
type Load = { status: 'loading' } | { status: 'ready'; data: TeacherLectureDetailDTO } | { status: 'error'; error: string; code: number }

const MEDIA_META: Record<TeacherLectureDetailDTO['mediaStatus'], { label: string; tone: Tone }> = {
  READY: { label: 'Ready', tone: 'lime' },
  PROCESSING: { label: 'Processing', tone: 'blue' },
  NONE: { label: 'Not attached', tone: 'neutral' },
}

const RESOURCE_KINDS: { value: LectureResourceDTO['kind']; label: string }[] = [
  { value: 'LINK', label: 'Reading link' },
  { value: 'OTHER', label: 'Other link' },
]

const toInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const fromInput = (value: string) => (value ? new Date(value).toISOString() : null)

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const sizeLabel = (bytes: number | null) => (bytes === null ? null : `${(bytes / 1_000_000).toFixed(1)} MB`)

export function TeacherLectureDetail() {
  const { lectureId = '' } = useParams()
  const toast = useToast()
  const base = `/api/teacher/lectures/${lectureId}`

  const [state, setState] = useState<Load>({ status: 'loading' })
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState<'details' | 'availability' | 'publish' | 'resource' | null>(null)
  const [actionError, setActionError] = useState('')

  const [title, setTitle] = useState('')
  const [minutes, setMinutes] = useState('')
  const [notes, setNotes] = useState('')
  const [detailError, setDetailError] = useState('')

  const [from, setFrom] = useState('')
  const [until, setUntil] = useState('')
  const [isPreview, setIsPreview] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')

  const [resourceOpen, setResourceOpen] = useState(false)
  const [resTitle, setResTitle] = useState('')
  const [resKind, setResKind] = useState<LectureResourceDTO['kind']>('LINK')
  const [resUrl, setResUrl] = useState('')
  const [resError, setResError] = useState('')
  const [pendingResource, setPendingResource] = useState<LectureResourceDTO | null>(null)

  const titleOf = (load: Load) => (load.status === 'ready' ? load.data.title : 'Lecture')
  useDocumentTitle(`${titleOf(state)} · Teaching studio`)

  function hydrate(data: TeacherLectureDetailDTO) {
    setTitle(data.title)
    setMinutes(String(data.estimatedMinutes))
    setNotes(data.body ?? '')
    setFrom(toInput(data.availability.availableFrom))
    setUntil(toInput(data.availability.availableUntil))
    setIsPreview(data.isPreview)
    setDetailError('')
    setAvailabilityError('')
  }

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    teacherApi.get<TeacherLectureDetailDTO>(base).then((res) => {
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
    // hydrate only uses setters, so the request lifecycle is the only dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, reload])

  async function send(method: 'PATCH' | 'POST' | 'DELETE', path: string, body?: unknown) {
    setActionError('')
    const res =
      method === 'PATCH'
        ? await teacherApi.patch<TeacherLectureDetailDTO>(path, body ?? {})
        : method === 'POST'
          ? await teacherApi.post<TeacherLectureDetailDTO>(path, body ?? {})
          : await teacherApi.del<TeacherLectureDetailDTO>(path)
    if (!res.ok) {
      setActionError(res.error)
      return null
    }
    setState({ status: 'ready', data: res.data })
    hydrate(res.data)
    return res.data
  }

  async function saveDetails() {
    if (state.status !== 'ready') return
    const clean = title.trim()
    if (clean.length < 2) {
      setDetailError('Enter a title of at least 2 characters.')
      return
    }
    const mins = Number(minutes)
    if (!Number.isInteger(mins) || mins < 1 || mins > 600) {
      setDetailError('Duration must be a whole number of minutes between 1 and 600.')
      return
    }
    setDetailError('')
    setBusy('details')
    const data = await send('PATCH', base, {
      title: clean,
      estimatedMinutes: mins,
      ...(state.data.kind === 'TEXT' ? { body: notes } : {}),
    })
    setBusy(null)
    if (data) toast('Lecture saved')
  }

  async function saveAvailability() {
    const fromIso = fromInput(from)
    const untilIso = fromInput(until)
    if (fromIso && untilIso && Date.parse(untilIso) <= Date.parse(fromIso)) {
      setAvailabilityError('The closing date must be after the opening date.')
      return
    }
    setAvailabilityError('')
    setBusy('availability')
    const data = await send('PATCH', base, { availableFrom: fromIso, availableUntil: untilIso, isPreview })
    setBusy(null)
    if (data) toast('Availability saved')
  }

  async function setPublished(next: boolean) {
    setBusy('publish')
    const data = await send('POST', `${base}/${next ? 'publish' : 'unpublish'}`)
    setBusy(null)
    if (data) toast(next ? 'Lecture published' : 'Lecture unpublished')
  }

  function openResource() {
    setResourceOpen(true)
    setResTitle('')
    setResKind('LINK')
    setResUrl('')
    setResError('')
  }

  async function submitResource() {
    const clean = resTitle.trim()
    if (clean.length < 2) {
      setResError('Enter a title of at least 2 characters.')
      return
    }
    let url = resUrl.trim()
    if (!url) {
      setResError('Paste the https link students should open.')
      return
    }
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    setResError('')
    setBusy('resource')
    const data = await send('POST', `${base}/resources`, { title: clean, kind: resKind, externalUrl: url, sizeBytes: null })
    setBusy(null)
    if (!data) return
    setResourceOpen(false)
    toast('Resource added')
  }

  async function removeResource() {
    if (!pendingResource) return
    setBusy('resource')
    const data = await send('DELETE', `${base}/resources/${pendingResource.id}`)
    setBusy(null)
    if (!data) return
    setPendingResource(null)
    toast('Resource removed')
  }

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Loading lecture">
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
        <Link to="/teach/lectures" className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden />
          All lectures
        </Link>
        <div className="flex flex-col gap-4 border border-line bg-surface p-6">
          <h1 className="font-display text-[26px]">{state.code === 404 ? 'This lecture is not in one of your courses' : 'The lecture could not be loaded'}</h1>
          <p role="alert" className="flex items-start gap-2.5 text-[14px] text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {state.error}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<RotateCw className="size-4" aria-hidden />} onClick={() => setReload((n) => n + 1)}>
              Try again
            </Button>
            <Button to="/teach/lectures" variant="ghost">
              Back to lectures
            </Button>
          </div>
        </div>
      </section>
    )
  }

  const lecture = state.data
  const media = MEDIA_META[lecture.mediaStatus]
  const unmet = lecture.publish.requirements.filter((r) => !r.satisfied)
  const isPublished = lecture.status === 'PUBLISHED'
  const availabilityTone: Tone = lecture.availability.status === 'SCHEDULED' ? 'amber' : lecture.availability.status === 'EXPIRED' ? 'danger' : 'lime'
  const availabilityLabel =
    lecture.availability.status === 'SCHEDULED' ? 'Scheduled' : lecture.availability.status === 'EXPIRED' ? 'Closed to students' : 'Available now'
  const peakStarts = Math.max(1, ...lecture.watch.trend.map((d) => d.starts))

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
        <Link to="/teach/lectures" className="inline-flex items-center gap-2 hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden />
          All lectures
        </Link>
        <span aria-hidden className="text-faint">
          /
        </span>
        <Link to={`/teach/courses/${lecture.courseId}/curriculum`} className="hover:text-fg">
          {lecture.courseTitle} curriculum
        </Link>
      </div>

      <PageHeader
        eyebrow={`${lecture.courseTitle} · ${lecture.chapterTitle}`}
        title={lecture.title}
        description={`${lecture.kind === 'VIDEO' ? 'Video lecture' : 'Text lecture'} · ${lecture.estimatedMinutes} min · ${lecture.sectionTitle} → ${lecture.chapterTitle}`}
        actions={
          <>
            <Badge tone={isPublished ? 'lime' : 'neutral'}>{isPublished ? 'Published' : 'Draft'}</Badge>
            {isPublished ? (
              <Button variant="secondary" loading={busy === 'publish'} onClick={() => setPublished(false)}>
                Unpublish
              </Button>
            ) : (
              <Button
                loading={busy === 'publish'}
                disabled={!lecture.publish.canPublish}
                title={lecture.publish.canPublish ? undefined : 'Complete the publish checklist first'}
                onClick={() => setPublished(true)}
              >
                Publish lecture
              </Button>
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
          <Panel title="Lecture details" description="Title, length and the notes students read.">
            <div className="flex flex-col gap-4 px-5 py-4">
              <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={detailError.startsWith('Enter a title') ? detailError : undefined} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Duration (minutes)" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                <div className="flex flex-col gap-2">
                  <span className="text-[12.5px] font-medium text-fg">Type</span>
                  <span className="flex h-12 items-center border border-line-strong bg-surface-2 px-3.5 text-[14.5px] text-muted">
                    {lecture.kind === 'VIDEO' ? 'Video lecture' : 'Text lecture'}
                  </span>
                </div>
              </div>

              {lecture.kind === 'TEXT' && (
                <div className="flex flex-col gap-2">
                  <label htmlFor="lecture-notes" className="text-[12.5px] font-medium text-fg">
                    Lecture notes
                  </label>
                  <textarea
                    id="lecture-notes"
                    rows={10}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="min-h-40 w-full resize-y rounded-[3px] border border-line-strong bg-surface px-3.5 py-3 text-[14.5px] leading-relaxed text-fg focus:border-amber-deep focus:shadow-[0_0_0_3px_rgb(176_118_28/0.18)] focus:outline-none"
                  />
                  <p className="text-[12.5px] text-muted">{notes.trim().length} characters. At least 40 are needed before this lecture can be published.</p>
                </div>
              )}

              {detailError && !detailError.startsWith('Enter a title') && (
                <p role="alert" className="flex items-center gap-1.5 text-[13px] text-danger">
                  <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                  {detailError}
                </p>
              )}

              <div className="flex justify-end">
                <Button size="sm" loading={busy === 'details'} onClick={saveDetails}>
                  Save details
                </Button>
              </div>
            </div>
          </Panel>

          <Panel
            title="Resources"
            description="Files and links students open alongside this lecture."
            action={
              <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" aria-hidden />} onClick={openResource}>
                Add resource
              </Button>
            }
          >
            {lecture.resources.length === 0 ? (
              <EmptyState
                className="border-0"
                title="No resources yet"
                body="Add a reading link or reference for this lecture. Hosted files arrive with the media pipeline."
                action={
                  <Button size="sm" variant="secondary" onClick={openResource}>
                    Add a link
                  </Button>
                }
              />
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {lecture.resources.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <span className="flex size-8 shrink-0 items-center justify-center border border-line bg-surface-2 text-muted" aria-hidden>
                      <Link2 className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {r.externalUrl ? (
                        <a
                          href={r.externalUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="truncate text-[13.5px] font-medium underline decoration-transparent underline-offset-4 hover:decoration-amber"
                        >
                          {r.title}
                        </a>
                      ) : (
                        <span className="truncate text-[13.5px] font-medium">{r.title}</span>
                      )}
                      <span className="truncate text-[11.5px] text-muted">
                        {r.kind}
                        {r.externalUrl ? ` · ${new URL(r.externalUrl).host}` : ''}
                        {sizeLabel(r.sizeBytes) ? ` · ${sizeLabel(r.sizeBytes)}` : ''}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove resource ${r.title}`}
                      title="Remove resource"
                      onClick={() => setPendingResource(r)}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-[2px] text-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-deep"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Availability" description="When students may open this lecture.">
            <div className="flex flex-col gap-4 px-5 py-4">
              <Checkbox label="Free preview — plays before a student enrols" checked={isPreview} onChange={(e) => setIsPreview(e.target.checked)} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Opens" type="datetime-local" value={from} hint="Empty means immediately." onChange={(e) => setFrom(e.target.value)} />
                <Input
                  label="Closes"
                  type="datetime-local"
                  value={until}
                  error={availabilityError || undefined}
                  hint="Empty means no end date."
                  onChange={(e) => setUntil(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                <span className="flex items-center gap-2 text-[12.5px] text-muted">
                  Current state
                  <Badge tone={availabilityTone}>{availabilityLabel}</Badge>
                </span>
                <Button size="sm" loading={busy === 'availability'} onClick={saveAvailability}>
                  Save availability
                </Button>
              </div>
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Video" description="The media attached to this lecture.">
            <div className="flex flex-col gap-3 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-muted">Processing state</span>
                <Badge tone={media.tone}>{media.label}</Badge>
              </div>
              {lecture.kind === 'VIDEO' ? (
                <>
                  <dl className="flex flex-col gap-2 text-[12.5px]">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted">Asset</dt>
                      <dd className="figures truncate">{lecture.media ? lecture.media.assetId : '—'}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted">Runtime</dt>
                      <dd className="figures">{lecture.media?.durationSeconds ? `${Math.round(lecture.media.durationSeconds / 60)} min` : '—'}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted">Free preview</dt>
                      <dd>{lecture.isPreview ? 'Yes' : 'No'}</dd>
                    </div>
                  </dl>
                  {lecture.mediaStatus !== 'READY' && (
                    <div className="flex flex-col gap-2 border border-dashed border-line-strong bg-bg/60 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">
                      <p className="font-medium text-fg">Video upload is not connected in this build</p>
                      <p>
                        Attaching a file needs <code className="bg-surface-2 px-1 py-0.5 font-mono text-[11.5px] text-fg">POST /api/teacher/media/uploads</code> to return a
                        signed direct-to-R2 (or Cloudflare Stream) session, a <code className="bg-surface-2 px-1 py-0.5 font-mono text-[11.5px] text-fg">media_assets</code> row
                        that moves PROCESSING → READY, and a short-lived <code className="bg-surface-2 px-1 py-0.5 font-mono text-[11.5px] text-fg">PlaybackGrantDTO</code> for
                        playback.
                      </p>
                      <p>Until that endpoint exists this lecture stays unpublishable.</p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[13px] leading-relaxed text-muted">This is a text lecture: students read the notes above, so no video is required.</p>
              )}
            </div>
          </Panel>

          <Panel title="Watch statistics" description="How far students get once the lecture is live.">
            <dl className="grid grid-cols-2 divide-x divide-y divide-line border-b border-line">
              {[
                { k: 'Enrolled', v: String(lecture.watch.enrolled) },
                { k: 'Started', v: String(lecture.watch.started) },
                { k: 'Completed', v: String(lecture.watch.completed) },
                { k: 'Average watch', v: `${lecture.watch.averageWatchMinutes} min` },
              ].map((s) => (
                <div key={s.k} className="flex flex-col gap-1 px-5 py-3">
                  <dt className="text-[11.5px] text-muted">{s.k}</dt>
                  <dd className="figures text-[21px] leading-none font-semibold">{s.v}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-col gap-1.5 px-5 py-3">
              <span className="flex items-center justify-between text-[12px] text-muted">
                <span>Completion</span>
                <span className="figures">{lecture.watch.completionPercent}%</span>
              </span>
              <ProgressBar value={lecture.watch.completionPercent} label=" " />
              <span className="text-[11.5px] text-muted">Average student watches {lecture.watch.averageWatchPercent}% of the runtime.</span>
            </div>

            <div className="flex flex-col gap-2 border-t border-line px-5 py-4">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">Starts, last 7 days</p>
              <div className="flex h-20 items-end gap-1.5" aria-hidden>
                {lecture.watch.trend.map((d) => (
                  <span
                    key={d.date}
                    className={cx('block flex-1', d.starts ? 'bg-navy' : 'bg-[rgb(15_33_55/0.12)]')}
                    style={{ height: `${d.starts ? Math.max(4, (d.starts / peakStarts) * 100) : 3}%` }}
                  />
                ))}
              </div>
              <div className="flex gap-1.5">
                {lecture.watch.trend.map((d) => (
                  <span key={d.date} className="flex-1 text-center text-[10.5px] text-faint">
                    {new Date(`${d.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}
                  </span>
                ))}
              </div>
              <ul className="sr-only">
                {lecture.watch.trend.map((d) => (
                  <li key={d.date}>
                    {d.date}: {d.starts} starts
                  </li>
                ))}
              </ul>
              {!lecture.watch.started && <p className="text-[11.5px] text-muted">No viewing data yet. Numbers begin once a published video lecture is watched.</p>}
            </div>
          </Panel>

          <Panel title="Publish checklist" description={lecture.publish.canPublish ? 'Every requirement is met.' : `${unmet.length} requirement${unmet.length === 1 ? '' : 's'} outstanding`}>
            <ul className="flex flex-col divide-y divide-line">
              {lecture.publish.requirements.map((r) => (
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
            <div className="border-t border-line px-5 py-3">
              {isPublished ? (
                <Button size="sm" variant="secondary" className="w-full" loading={busy === 'publish'} onClick={() => setPublished(false)}>
                  Unpublish lecture
                </Button>
              ) : (
                <Button size="sm" className="w-full" loading={busy === 'publish'} disabled={!lecture.publish.canPublish} onClick={() => setPublished(true)}>
                  {lecture.publish.canPublish ? 'Publish lecture' : 'Complete the checklist to publish'}
                </Button>
              )}
            </div>
          </Panel>

          <div className="flex flex-col gap-1.5 border border-line bg-surface px-5 py-4 text-[12px] text-muted">
            <span>Updated {dateLabel(lecture.updatedAt)}</span>
            <span>
              {lecture.courseStatus === 'PUBLISHED' ? 'Course is live' : `Course is ${lecture.courseStatus.toLowerCase().replace('_', ' ')}`} · lecture #{lecture.position + 1} in its chapter
            </span>
          </div>
        </div>
      </div>

      <Modal
        open={resourceOpen}
        onClose={() => setResourceOpen(false)}
        title="Add a resource"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResourceOpen(false)} disabled={busy === 'resource'}>
              Cancel
            </Button>
            <Button onClick={submitResource} loading={busy === 'resource'}>
              Add resource
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-muted">
            Links work today. Hosted PDFs and slides need the media upload endpoint, so this form takes a URL.
          </p>
          <Input label="Title" value={resTitle} autoFocus error={resError.startsWith('Enter a title') ? resError : undefined} onChange={(e) => setResTitle(e.target.value)} />
          <Select label="Kind" value={resKind} onChange={(e) => setResKind(e.target.value as LectureResourceDTO['kind'])}>
            {RESOURCE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
          <Input
            label="URL"
            inputMode="url"
            placeholder="https://"
            value={resUrl}
            error={resError.startsWith('Paste') ? resError : undefined}
            onChange={(e) => setResUrl(e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={!!pendingResource}
        onClose={() => setPendingResource(null)}
        title={`Remove “${pendingResource?.title ?? ''}”?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingResource(null)} disabled={busy === 'resource'}>
              Keep it
            </Button>
            <Button variant="danger" onClick={removeResource} loading={busy === 'resource'}>
              Remove
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-muted">Students lose this download. This cannot be undone.</p>
      </Modal>
    </section>
  )
}
