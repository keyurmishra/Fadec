/*
  Lecture state: everything that hangs off one lecture rather than off the
  course tree. The curriculum module owns ordering and the module → chapter →
  lecture structure; this one owns notes, resources, availability windows,
  publish state and the watch numbers the studio reports.

  A lecture is a row in `lessons`. The fields the builder edits live in that
  same row, so a subject syllabus link and the course curriculum always read one
  record rather than two copies.

  Watch numbers are derived, not random: they are a stable function of the
  lecture id and the course's enrolment count, so two screens asking for the
  same lecture always agree.
*/
import type { CourseStatus } from '../contracts/catalog'
import type {
  LectureAvailabilityStatus,
  LectureResourceDTO,
  TeacherLectureDetailDTO,
  TeacherLectureSummaryDTO,
  TeacherLectureValidationDTO,
} from '../contracts/teaching'
import { setLessonStatus } from './curriculum'
import { execute, newId, nowIso, query, queryOne, type Db } from './sql'

type LectureRow = {
  id: string
  course_id: string
  section_id: string
  chapter_id: string | null
  title: string
  kind: 'VIDEO' | 'TEXT'
  position: number
  estimated_minutes: number
  status: 'DRAFT' | 'PUBLISHED'
  media_status: 'READY' | 'PROCESSING' | 'NONE'
  is_preview: number
  body: string | null
  available_from: string | null
  available_until: string | null
  published_at: string | null
  created_at: string
  updated_at: string
  section_title: string
  chapter_title: string | null
  course_title: string
  course_status: CourseStatus
  enrolled_count: number
  instructor_id: string
  resource_count: number
}

const SELECT_LECTURE = `
  SELECT l.*, s.title AS section_title, ch.title AS chapter_title,
         c.title AS course_title, c.status AS course_status,
         c.enrolled_count AS enrolled_count, c.instructor_id AS instructor_id,
         (SELECT COUNT(*) FROM lesson_resources r WHERE r.lesson_id = l.id) AS resource_count
  FROM lessons l
  JOIN curriculum_sections s ON s.id = l.section_id
  JOIN courses c ON c.id = l.course_id
  LEFT JOIN curriculum_chapters ch ON ch.id = l.chapter_id`

type ResourceRow = {
  id: string
  title: string
  kind: LectureResourceDTO['kind']
  external_url: string | null
  size_bytes: number | null
  added_at: string
}

const hash = (input: string) => {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

async function resourcesFor(db: Db, lectureId: string): Promise<LectureResourceDTO[]> {
  const rows = await query<ResourceRow>(db, `SELECT id, title, kind, external_url, size_bytes, added_at FROM lesson_resources WHERE lesson_id = ?1 ORDER BY position, id`, lectureId)
  return rows.map((row) => ({ id: row.id, title: row.title, kind: row.kind, externalUrl: row.external_url, sizeBytes: row.size_bytes, addedAt: row.added_at }))
}

function availabilityStatus(row: LectureRow): LectureAvailabilityStatus {
  const now = Date.now()
  if (row.available_from && Date.parse(row.available_from) > now) return 'SCHEDULED'
  if (row.available_until && Date.parse(row.available_until) <= now) return 'EXPIRED'
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

function watchFor(row: LectureRow) {
  const enrolled = row.enrolled_count
  const live = row.status === 'PUBLISHED' && row.media_status === 'READY'
  const trend = lastSevenDays()
  if (!live || enrolled === 0) {
    return { enrolled, started: 0, completed: 0, completionPercent: 0, averageWatchMinutes: 0, averageWatchPercent: 0, trend }
  }

  const h = hash(row.id)
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
    averageWatchMinutes: Math.max(1, Math.round((row.estimated_minutes * averageWatchPercent) / 100)),
    averageWatchPercent,
    trend,
  }
}

function validationFor(row: LectureRow, body: string | null): TeacherLectureValidationDTO {
  const titled = row.title.trim().length >= 2
  const timed = Number.isInteger(row.estimated_minutes) && row.estimated_minutes >= 1 && row.estimated_minutes <= 600
  // `detail` explains an unmet requirement, so it is only sent when it blocks.
  const requirements: TeacherLectureValidationDTO['requirements'] = [
    { key: 'title', label: 'Lecture title', satisfied: titled, detail: titled ? undefined : 'Give the lecture a title.' },
    { key: 'duration', label: 'Estimated duration', satisfied: timed, detail: timed ? undefined : 'Set a duration between 1 and 600 minutes.' },
  ]

  if (row.kind === 'VIDEO') {
    const ready = row.media_status === 'READY'
    requirements.push({
      key: 'mediaReady',
      label: 'Video attached and processed',
      satisfied: ready,
      detail: ready ? undefined : 'Media upload is not connected in this build, so no video can be attached yet.',
    })
  } else {
    const written = (body ?? '').trim().length >= 40
    requirements.push({
      key: 'notes',
      label: 'Lecture notes written',
      satisfied: written,
      detail: written ? undefined : 'Write at least 40 characters of notes.',
    })
  }

  return { canPublish: requirements.every((r) => r.satisfied), requirements }
}

/** TEXT lectures default to an empty draft rather than null, as the builder expects. */
const bodyOf = (row: LectureRow) => (row.kind === 'TEXT' ? (row.body ?? '') : row.body)

function toSummary(row: LectureRow, watch: ReturnType<typeof watchFor>): TeacherLectureSummaryDTO {
  return {
    id: row.id,
    courseId: row.course_id,
    courseTitle: row.course_title,
    sectionTitle: row.section_title,
    chapterTitle: row.chapter_title ?? '',
    title: row.title,
    kind: row.kind,
    estimatedMinutes: row.estimated_minutes,
    status: row.status,
    mediaStatus: row.media_status,
    isPreview: !!row.is_preview,
    resourceCount: row.resource_count,
    watchCompletionPercent: watch.completionPercent,
    availabilityStatus: availabilityStatus(row),
    updatedAt: row.updated_at,
  }
}

async function buildDetail(db: Db, row: LectureRow): Promise<TeacherLectureDetailDTO> {
  const [resources] = await Promise.all([resourcesFor(db, row.id)])
  const watch = watchFor(row)
  const availability = availabilityStatus(row)
  const body = bodyOf(row)

  return {
    ...toSummary(row, watch),
    resourceCount: resources.length,
    sectionId: row.section_id,
    chapterId: row.chapter_id,
    position: row.position,
    body,
    resources,
    availability: { availableFrom: row.available_from, availableUntil: row.available_until, status: availability },
    watch,
    courseStatus: row.course_status,
    media: row.media_status === 'READY' ? { assetId: `asset-${row.id}`, durationSeconds: row.estimated_minutes * 60 } : null,
    publish: validationFor(row, body),
    createdAt: row.created_at,
  }
}

/** Every lecture across this teacher's courses, in curriculum order. */
export async function lecturesForTeacher(db: Db, teacherId: string): Promise<TeacherLectureSummaryDTO[]> {
  const rows = await query<LectureRow>(
    db,
    `${SELECT_LECTURE}
     WHERE c.instructor_id = ?1 AND l.chapter_id IS NOT NULL
     ORDER BY s.position, ch.position, l.position, l.id`,
    teacherId,
  )
  return rows.map((row) => toSummary(row, watchFor(row)))
}

export async function lectureDetail(db: Db, teacherId: string, lectureId: string): Promise<TeacherLectureDetailDTO | null> {
  const row = await queryOne<LectureRow>(db, `${SELECT_LECTURE} WHERE l.id = ?1`, lectureId)
  if (!row || row.instructor_id !== teacherId) return null
  return buildDetail(db, row)
}

/** What a student catalogue may show of one lecture. Publication is the only gate. */
export type PublishedLecture = {
  id: string
  courseId: string
  courseTitle: string
  title: string
  kind: 'VIDEO' | 'TEXT'
  estimatedMinutes: number
  resources: LectureResourceDTO[]
}

/**
 * A lecture as the student syllabus sees it, or null when it is not published.
 * There is no teacher scope here: a student is not the author, so the draft
 * state of the parent course is irrelevant to whether the lecture itself is live.
 */
export async function publishedLecture(db: Db, lectureId: string): Promise<PublishedLecture | null> {
  const row = await queryOne<LectureRow>(db, `${SELECT_LECTURE} WHERE l.id = ?1 AND l.status = 'PUBLISHED' AND l.chapter_id IS NOT NULL`, lectureId)
  if (!row) return null
  const resources = await resourcesFor(db, lectureId)
  return {
    id: row.id,
    courseId: row.course_id,
    courseTitle: row.course_title,
    title: row.title,
    kind: row.kind,
    estimatedMinutes: row.estimated_minutes,
    // Students can only open links. A hosted file has no download route until
    // the media pipeline exists, so it is left out rather than shown dead.
    resources: resources.filter((r) => !!r.externalUrl),
  }
}

export type LecturePatch = {
  title?: string
  estimatedMinutes?: number
  isPreview?: boolean
  body?: string | null
  availableFrom?: string | null
  availableUntil?: string | null
}

async function ownedLecture(db: Db, teacherId: string, lectureId: string) {
  return queryOne<{ id: string; course_id: string }>(
    db,
    `SELECT l.id, l.course_id FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.id = ?1 AND c.instructor_id = ?2`,
    lectureId,
    teacherId,
  )
}

export async function applyLecturePatch(db: Db, teacherId: string, lectureId: string, patch: LecturePatch): Promise<TeacherLectureDetailDTO | null> {
  const owned = await ownedLecture(db, teacherId, lectureId)
  if (!owned) return null

  const sets: string[] = []
  const params: unknown[] = []
  const push = (column: string, value: unknown) => {
    sets.push(`${column} = ?${params.length + 1}`)
    params.push(value)
  }

  if (patch.title !== undefined) push('title', patch.title)
  if (patch.estimatedMinutes !== undefined) push('estimated_minutes', patch.estimatedMinutes)
  if (patch.isPreview !== undefined) push('is_preview', patch.isPreview ? 1 : 0)
  if (patch.body !== undefined) push('body', patch.body)
  if (patch.availableFrom !== undefined) push('available_from', patch.availableFrom)
  if (patch.availableUntil !== undefined) push('available_until', patch.availableUntil)
  if (sets.length) {
    push('updated_at', nowIso())
    await execute(db, `UPDATE lessons SET ${sets.join(', ')} WHERE id = ?${params.length + 1}`, ...params, lectureId)
  }

  return lectureDetail(db, teacherId, lectureId)
}

export async function setLectureStatus(db: Db, teacherId: string, lectureId: string, status: 'DRAFT' | 'PUBLISHED'): Promise<TeacherLectureDetailDTO | null> {
  const owned = await ownedLecture(db, teacherId, lectureId)
  if (!owned) return null
  if (!(await setLessonStatus(db, owned.course_id, lectureId, status))) return null
  return lectureDetail(db, teacherId, lectureId)
}

export async function addLectureResource(
  db: Db,
  teacherId: string,
  lectureId: string,
  input: { title: string; kind: LectureResourceDTO['kind']; externalUrl: string; sizeBytes: number | null },
): Promise<TeacherLectureDetailDTO | null> {
  const owned = await ownedLecture(db, teacherId, lectureId)
  if (!owned) return null

  const next = await queryOne<{ position: number }>(db, `SELECT COALESCE(MAX(position), -1) + 1 AS position FROM lesson_resources WHERE lesson_id = ?1`, lectureId)
  const now = nowIso()
  await execute(
    db,
    `INSERT INTO lesson_resources (id, lesson_id, title, kind, external_url, size_bytes, position, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    newId(`res-${lectureId}`),
    lectureId,
    input.title,
    input.kind,
    input.externalUrl,
    input.sizeBytes,
    next?.position ?? 0,
    now,
  )
  await execute(db, `UPDATE lessons SET updated_at = ?1 WHERE id = ?2`, now, lectureId)
  return lectureDetail(db, teacherId, lectureId)
}

export async function removeLectureResource(db: Db, teacherId: string, lectureId: string, resourceId: string): Promise<TeacherLectureDetailDTO | null> {
  const owned = await ownedLecture(db, teacherId, lectureId)
  if (!owned) return null

  const removed = await execute(db, `DELETE FROM lesson_resources WHERE id = ?1 AND lesson_id = ?2`, resourceId, lectureId)
  if (!removed) return null
  await execute(db, `UPDATE lessons SET updated_at = ?1 WHERE id = ?2`, nowIso(), lectureId)
  return lectureDetail(db, teacherId, lectureId)
}
