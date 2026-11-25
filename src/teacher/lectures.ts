/*
  Lecture state: everything that hangs off one lecture rather than off the
  course tree. The curriculum module owns ordering and the module → chapter →
  lecture structure; this one owns notes, resources, availability windows,
  publish state and the watch numbers the studio reports.

  Like the other fixtures these rows live for the life of the Worker isolate, so
  edits behave like real writes (including 404s for another teacher's lecture)
  and reset when the dev server restarts.

  Watch numbers are derived, not random: they are a stable function of the
  lecture id and the course's enrolment count, so two screens asking for the
  same lecture always agree.
*/
import type {
  LectureAvailabilityStatus,
  LectureResourceDTO,
  TeacherLectureDetailDTO,
  TeacherLectureSummaryDTO,
  TeacherLectureValidationDTO,
  TeacherLessonDTO,
} from '../contracts/teaching'
import { courseForTeacher, coursesForTeacher } from './fixtures'
import { outlineFor, setLessonStatus, updateLessonRow } from './curriculum'

const seedTime = '2026-09-12T10:00:00.000Z'

type Placement = {
  courseId: string
  sectionId: string
  chapterId: string | null
  sectionTitle: string
  chapterTitle: string
  lesson: TeacherLessonDTO
}

type LectureMeta = {
  body: string | null
  resources: LectureResourceDTO[]
  availableFrom: string | null
  availableUntil: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

const meta = new Map<string, LectureMeta>()

const hash = (input: string) => {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function placementsFor(courseId: string): Placement[] {
  return outlineFor(courseId).flatMap((section) =>
    section.chapters.flatMap((chapter) =>
      chapter.lessons.map((lesson) => ({
        courseId,
        sectionId: section.id,
        chapterId: chapter.id,
        sectionTitle: section.title,
        chapterTitle: chapter.title,
        lesson,
      })),
    ),
  )
}

/** Find a lecture only among this teacher's courses. */
function locate(teacherId: string, lectureId: string): Placement | null {
  for (const course of coursesForTeacher(teacherId)) {
    const found = placementsFor(course.id).find((p) => p.lesson.id === lectureId)
    if (found) return found
  }
  return null
}

function metaFor(p: Placement): LectureMeta {
  const found = meta.get(p.lesson.id)
  if (found) return found

  const h = hash(p.lesson.id)
  const resources: LectureResourceDTO[] = []
  if (p.lesson.status === 'PUBLISHED') {
    if (h % 3 === 0) {
      resources.push({
        id: `res-${p.lesson.id}-1`,
        title: `Slides — ${p.chapterTitle}`,
        kind: 'SLIDES',
        externalUrl: null,
        sizeBytes: 900_000 + (h % 1_600_000),
        addedAt: seedTime,
      })
    }
    if (h % 4 === 0) {
      resources.push({
        id: `res-${p.lesson.id}-2`,
        title: 'Reference reading',
        kind: 'LINK',
        externalUrl: 'https://skybrary.aero/',
        sizeBytes: null,
        addedAt: seedTime,
      })
    }
  }

  const row: LectureMeta = {
    body: p.lesson.kind === 'TEXT' ? '' : null,
    resources,
    availableFrom: null,
    availableUntil: null,
    publishedAt: p.lesson.status === 'PUBLISHED' ? seedTime : null,
    createdAt: seedTime,
    updatedAt: seedTime,
  }
  meta.set(p.lesson.id, row)
  return row
}

function availabilityStatus(m: LectureMeta): LectureAvailabilityStatus {
  const now = Date.now()
  if (m.availableFrom && Date.parse(m.availableFrom) > now) return 'SCHEDULED'
  if (m.availableUntil && Date.parse(m.availableUntil) <= now) return 'EXPIRED'
  return 'IMMEDIATE'
}

/** Last seven days, oldest first, in UTC. */
function lastSevenDays() {
  const now = new Date()
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (6 - i)))
    return { date: d.toISOString().slice(0, 10), starts: 0 }
  })
}

function watchFor(p: Placement, enrolled: number) {
  const live = p.lesson.status === 'PUBLISHED' && p.lesson.mediaStatus === 'READY'
  const trend = lastSevenDays()
  if (!live || enrolled === 0) {
    return { enrolled, started: 0, completed: 0, completionPercent: 0, averageWatchMinutes: 0, averageWatchPercent: 0, trend }
  }

  const h = hash(p.lesson.id)
  const started = Math.max(1, Math.min(enrolled, Math.round(enrolled * (0.55 + (h % 40) / 100))))
  const completed = Math.min(started, Math.round(started * (0.4 + ((h >>> 7) % 45) / 100)))
  const averageWatchPercent = 45 + ((h >>> 11) % 50)

  trend.forEach((day, i) => {
    day.starts = Math.round((started / 9) * (0.6 + ((h >>> (i + 3)) % 60) / 100))
  })

  return {
    enrolled,
    started,
    completed,
    completionPercent: Math.round((completed / enrolled) * 100),
    averageWatchMinutes: Math.max(1, Math.round((p.lesson.estimatedMinutes * averageWatchPercent) / 100)),
    averageWatchPercent,
    trend,
  }
}

function validationFor(p: Placement, m: LectureMeta): TeacherLectureValidationDTO {
  const titled = p.lesson.title.trim().length >= 2
  const timed = Number.isInteger(p.lesson.estimatedMinutes) && p.lesson.estimatedMinutes >= 1 && p.lesson.estimatedMinutes <= 600
  // `detail` explains an unmet requirement, so it is only sent when it blocks.
  const requirements: TeacherLectureValidationDTO['requirements'] = [
    { key: 'title', label: 'Lecture title', satisfied: titled, detail: titled ? undefined : 'Give the lecture a title.' },
    { key: 'duration', label: 'Estimated duration', satisfied: timed, detail: timed ? undefined : 'Set a duration between 1 and 600 minutes.' },
  ]

  if (p.lesson.kind === 'VIDEO') {
    const ready = p.lesson.mediaStatus === 'READY'
    requirements.push({
      key: 'mediaReady',
      label: 'Video attached and processed',
      satisfied: ready,
      detail: ready ? undefined : 'Media upload is not connected in this build, so no video can be attached yet.',
    })
  } else {
    const written = (m.body ?? '').trim().length >= 40
    requirements.push({
      key: 'notes',
      label: 'Lecture notes written',
      satisfied: written,
      detail: written ? undefined : 'Write at least 40 characters of notes.',
    })
  }

  return { canPublish: requirements.every((r) => r.satisfied), requirements }
}

function build(teacherId: string, p: Placement): TeacherLectureDetailDTO | null {
  const course = courseForTeacher(teacherId, p.courseId)
  if (!course) return null

  const m = metaFor(p)
  const watch = watchFor(p, course.enrolledCount)
  const availability = availabilityStatus(m)

  return {
    id: p.lesson.id,
    courseId: p.courseId,
    courseTitle: course.title,
    sectionId: p.sectionId,
    sectionTitle: p.sectionTitle,
    chapterId: p.chapterId,
    chapterTitle: p.chapterTitle,
    position: p.lesson.position,
    title: p.lesson.title,
    kind: p.lesson.kind,
    estimatedMinutes: p.lesson.estimatedMinutes,
    status: p.lesson.status,
    mediaStatus: p.lesson.mediaStatus,
    isPreview: p.lesson.isPreview,
    resourceCount: m.resources.length,
    watchCompletionPercent: watch.completionPercent,
    availabilityStatus: availability,
    updatedAt: m.updatedAt,
    body: m.body,
    resources: m.resources,
    availability: { availableFrom: m.availableFrom, availableUntil: m.availableUntil, status: availability },
    watch,
    courseStatus: course.status,
    media: p.lesson.mediaStatus === 'READY' ? { assetId: `asset-${p.lesson.id}`, durationSeconds: p.lesson.estimatedMinutes * 60 } : null,
    publish: validationFor(p, m),
    createdAt: m.createdAt,
  }
}

function toSummary(d: TeacherLectureDetailDTO): TeacherLectureSummaryDTO {
  return {
    id: d.id,
    courseId: d.courseId,
    courseTitle: d.courseTitle,
    sectionTitle: d.sectionTitle,
    chapterTitle: d.chapterTitle,
    title: d.title,
    kind: d.kind,
    estimatedMinutes: d.estimatedMinutes,
    status: d.status,
    mediaStatus: d.mediaStatus,
    isPreview: d.isPreview,
    resourceCount: d.resourceCount,
    watchCompletionPercent: d.watchCompletionPercent,
    availabilityStatus: d.availabilityStatus,
    updatedAt: d.updatedAt,
  }
}

/** Every lecture across this teacher's courses, in curriculum order. */
export function lecturesForTeacher(teacherId: string): TeacherLectureSummaryDTO[] {
  return coursesForTeacher(teacherId).flatMap((course) =>
    placementsFor(course.id).flatMap((p) => {
      const detail = build(teacherId, p)
      return detail ? [toSummary(detail)] : []
    }),
  )
}

export function lectureDetail(teacherId: string, lectureId: string): TeacherLectureDetailDTO | null {
  const p = locate(teacherId, lectureId)
  return p ? build(teacherId, p) : null
}

export type LecturePatch = {
  title?: string
  estimatedMinutes?: number
  isPreview?: boolean
  body?: string | null
  availableFrom?: string | null
  availableUntil?: string | null
}

export function applyLecturePatch(teacherId: string, lectureId: string, patch: LecturePatch): TeacherLectureDetailDTO | null {
  const p = locate(teacherId, lectureId)
  if (!p) return null

  const m = metaFor(p)
  const rowPatch: Parameters<typeof updateLessonRow>[2] = {}
  if (patch.title !== undefined) rowPatch.title = patch.title
  if (patch.estimatedMinutes !== undefined) rowPatch.estimatedMinutes = patch.estimatedMinutes
  if (patch.isPreview !== undefined) rowPatch.isPreview = patch.isPreview
  if (Object.keys(rowPatch).length) updateLessonRow(p.courseId, lectureId, rowPatch)

  if (patch.body !== undefined) m.body = patch.body
  if (patch.availableFrom !== undefined) m.availableFrom = patch.availableFrom
  if (patch.availableUntil !== undefined) m.availableUntil = patch.availableUntil
  m.updatedAt = new Date().toISOString()

  return lectureDetail(teacherId, lectureId)
}

export function setLectureStatus(teacherId: string, lectureId: string, status: 'DRAFT' | 'PUBLISHED'): TeacherLectureDetailDTO | null {
  const p = locate(teacherId, lectureId)
  if (!p) return null
  if (!setLessonStatus(p.courseId, lectureId, status)) return null

  const m = metaFor(p)
  m.publishedAt = status === 'PUBLISHED' ? new Date().toISOString() : null
  m.updatedAt = m.publishedAt ?? new Date().toISOString()
  return lectureDetail(teacherId, lectureId)
}

export function addLectureResource(
  teacherId: string,
  lectureId: string,
  input: { title: string; kind: LectureResourceDTO['kind']; externalUrl: string; sizeBytes: number | null },
): TeacherLectureDetailDTO | null {
  const p = locate(teacherId, lectureId)
  if (!p) return null

  const m = metaFor(p)
  m.resources.push({
    id: `res-${lectureId}-${Date.now().toString(36)}`,
    title: input.title,
    kind: input.kind,
    externalUrl: input.externalUrl,
    sizeBytes: input.sizeBytes,
    addedAt: new Date().toISOString(),
  })
  m.updatedAt = new Date().toISOString()
  return lectureDetail(teacherId, lectureId)
}

export function removeLectureResource(teacherId: string, lectureId: string, resourceId: string): TeacherLectureDetailDTO | null {
  const p = locate(teacherId, lectureId)
  if (!p) return null

  const m = metaFor(p)
  const index = m.resources.findIndex((r) => r.id === resourceId)
  if (index < 0) return null
  m.resources.splice(index, 1)
  m.updatedAt = new Date().toISOString()
  return lectureDetail(teacherId, lectureId)
}
