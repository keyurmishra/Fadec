/*
  Academic subjects and their syllabus, stored in D1.

  The subject layer sits above the existing course curriculum:

    Subject → topic (unit) → lesson → course lecture(s)

  A lecture is never copied. `subject_lesson_lectures` points at a lecture that
  already lives in one of the teacher's courses, so editing notes, resources,
  availability or publish state in the lecture builder is reflected in the
  subject syllabus and on every screen at once. A UNIQUE index on `lecture_id`
  enforces the one-syllabus-lesson-per-lecture rule at the database.

  Ownership is decided by course association: a subject is visible to a teacher
  only when at least one of its courses is theirs. A subject, topic or lesson
  outside that set answers exactly like a missing one, which is the project's
  established 404 policy for cross-teacher access.
*/
import type {
  SubjectCourseDTO,
  SubjectDetailDTO,
  SubjectLectureRefDTO,
  SubjectLessonDTO,
  SubjectStatus,
  SubjectSummaryDTO,
  SubjectTopicDTO,
  SubjectValidationDTO,
  StudentSubjectDetailDTO,
  StudentSubjectLectureDTO,
  StudentSubjectSummaryDTO,
} from '../contracts/teaching'
import { ownsCourse, ownsCourses, publicCourses } from './courses'
import { addChapter, addLesson, addSection, outlineFor } from './curriculum'
import { lectureDetail } from './lectures'
import { execute, newId, nowIso, query, queryOne, type Db } from './sql'

type SubjectRow = {
  id: string
  name: string
  description: string
  status: SubjectStatus
  created_at: string
  updated_at: string
}

type TopicRow = { id: string; subject_id: string; title: string; description: string; position: number; created_at: string; updated_at: string }
type SyllabusLessonRow = { id: string; topic_id: string; title: string; description: string; position: number; created_at: string; updated_at: string }

/** One lecture delivering one syllabus lesson. No lecture fields are stored here. */
type LinkRow = { id: string; subject_lesson_id: string; course_id: string; lecture_id: string; position: number }

type SubjectTree = { topics: TopicRow[]; lessons: SyllabusLessonRow[]; links: LinkRow[] }

/* ------------------------------ ownership ------------------------------- */

/**
 * A subject is visible when at least one of its courses belongs to the caller.
 * The EXISTS keeps the check in SQL so a subject row is never trusted alone.
 */
async function subjectForTeacher(db: Db, teacherId: string, subjectId: string): Promise<SubjectRow | null> {
  return queryOne<SubjectRow>(
    db,
    `SELECT s.* FROM subjects s
     WHERE s.id = ?1 AND EXISTS (
       SELECT 1 FROM subject_courses sc
       JOIN courses c ON c.id = sc.course_id
       WHERE sc.subject_id = s.id AND c.instructor_id = ?2
     )`,
    subjectId,
    teacherId,
  )
}

async function subjectCourseIds(db: Db, subjectId: string): Promise<string[]> {
  const rows = await query<{ course_id: string }>(db, `SELECT course_id FROM subject_courses WHERE subject_id = ?1 ORDER BY position, course_id`, subjectId)
  return rows.map((row) => row.course_id)
}

async function touchSubject(db: Db, subjectId: string, at = nowIso()): Promise<void> {
  await execute(db, `UPDATE subjects SET updated_at = ?1 WHERE id = ?2`, at, subjectId)
}

/* -------------------------------- reading -------------------------------- */

async function loadTree(db: Db, subjectId: string): Promise<SubjectTree> {
  const [topics, lessons, links] = await Promise.all([
    query<TopicRow>(db, `SELECT * FROM subject_topics WHERE subject_id = ?1 ORDER BY position, id`, subjectId),
    query<SyllabusLessonRow>(
      db,
      `SELECT sl.* FROM subject_lessons sl
       JOIN subject_topics t ON t.id = sl.topic_id
       WHERE t.subject_id = ?1 ORDER BY sl.position, sl.id`,
      subjectId,
    ),
    query<LinkRow>(
      db,
      `SELECT lnk.* FROM subject_lesson_lectures lnk
       JOIN subject_lessons sl ON sl.id = lnk.subject_lesson_id
       JOIN subject_topics t ON t.id = sl.topic_id
       WHERE t.subject_id = ?1 ORDER BY lnk.position, lnk.id`,
      subjectId,
    ),
  ])
  return { topics, lessons, links }
}

/**
 * Every lecture in this teacher's courses, as a subject syllabus refers to it.
 * One query per request instead of one per link keeps a five-subject page cheap.
 */
async function lectureRefMap(db: Db, teacherId: string): Promise<Map<string, SubjectLectureRefDTO>> {
  const rows = await query<{
    id: string
    course_id: string
    course_title: string
    title: string
    kind: 'VIDEO' | 'TEXT'
    status: 'DRAFT' | 'PUBLISHED'
    media_status: 'READY' | 'PROCESSING' | 'NONE'
    estimated_minutes: number
    resource_count: number
    updated_at: string
  }>(
    db,
    `SELECT l.id, l.course_id, c.title AS course_title, l.title, l.kind, l.status, l.media_status,
            l.estimated_minutes, l.updated_at,
            (SELECT COUNT(*) FROM lesson_resources r WHERE r.lesson_id = l.id) AS resource_count
     FROM lessons l
     JOIN courses c ON c.id = l.course_id
     WHERE c.instructor_id = ?1 AND l.chapter_id IS NOT NULL`,
    teacherId,
  )

  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        courseId: row.course_id,
        courseTitle: row.course_title,
        title: row.title,
        kind: row.kind,
        status: row.status,
        mediaStatus: row.media_status,
        estimatedMinutes: row.estimated_minutes,
        resourceCount: row.resource_count,
        updatedAt: row.updated_at,
      },
    ]),
  )
}

async function courseRefs(db: Db, teacherId: string, courseIds: string[]): Promise<SubjectCourseDTO[]> {
  if (!courseIds.length) return []
  const list = courseIds.map((_, i) => `?${i + 2}`).join(', ')
  const rows = await query<{ id: string; title: string; status: SubjectCourseDTO['status'] }>(
    db,
    `SELECT id, title, status FROM courses WHERE instructor_id = ?1 AND id IN (${list})`,
    teacherId,
    ...courseIds,
  )
  const byId = new Map(rows.map((row) => [row.id, row]))
  return courseIds.flatMap((id) => {
    const row = byId.get(id)
    return row ? [{ id: row.id, title: row.title, status: row.status }] : []
  })
}

function validationFor(subject: SubjectRow, topicDTOs: SubjectTopicDTO[], courses: SubjectCourseDTO[]): SubjectValidationDTO {
  const lessons = topicDTOs.flatMap((t) => t.lessons)
  const requirements: SubjectValidationDTO['requirements'] = [
    { key: 'name', label: 'Subject name', satisfied: subject.name.trim().length >= 2, detail: subject.name.trim().length >= 2 ? undefined : 'Give the subject a name.' },
    {
      key: 'description',
      label: 'Subject description',
      satisfied: subject.description.trim().length >= 30,
      detail: subject.description.trim().length >= 30 ? undefined : 'Write at least 30 characters about what the subject covers.',
    },
    {
      key: 'course',
      label: 'Taught within a training course',
      satisfied: courses.length > 0,
      detail: courses.length ? undefined : 'Associate the subject with at least one of your courses.',
    },
    {
      key: 'topic',
      label: 'At least one topic',
      satisfied: topicDTOs.length > 0,
      detail: topicDTOs.length ? undefined : 'Add a topic, then add lessons to it.',
    },
    {
      key: 'lesson',
      label: 'At least one lesson',
      satisfied: lessons.length > 0,
      detail: lessons.length ? undefined : 'Add a lesson to a topic.',
    },
  ]
  return { canPublish: requirements.every((r) => r.satisfied), requirements }
}

function build(subject: SubjectRow, tree: SubjectTree, courses: SubjectCourseDTO[], lectures: Map<string, SubjectLectureRefDTO>): SubjectDetailDTO {
  const topicDTOs: SubjectTopicDTO[] = tree.topics
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((topic) => ({
      id: topic.id,
      subjectId: topic.subject_id,
      title: topic.title,
      description: topic.description,
      position: topic.position,
      createdAt: topic.created_at,
      updatedAt: topic.updated_at,
      lessons: tree.lessons
        .filter((lesson) => lesson.topic_id === topic.id)
        .sort((a, b) => a.position - b.position)
        .map<SubjectLessonDTO>((lesson) => ({
          id: lesson.id,
          topicId: lesson.topic_id,
          title: lesson.title,
          description: lesson.description,
          position: lesson.position,
          createdAt: lesson.created_at,
          updatedAt: lesson.updated_at,
          lectures: tree.links
            .filter((link) => link.subject_lesson_id === lesson.id)
            .sort((a, b) => a.position - b.position)
            .flatMap((link) => {
              const ref = lectures.get(link.lecture_id)
              return ref ? [ref] : []
            }),
        })),
    }))

  const allLectures = topicDTOs.flatMap((t) => t.lessons.flatMap((l) => l.lectures))
  const published = allLectures.filter((l) => l.status === 'PUBLISHED')
  const lastLectureUpdatedAt = allLectures.reduce<string | null>((latest, l) => (!latest || l.updatedAt > latest ? l.updatedAt : latest), null)

  return {
    id: subject.id,
    name: subject.name,
    description: subject.description,
    status: subject.status,
    topicCount: topicDTOs.length,
    lessonCount: topicDTOs.reduce((n, t) => n + t.lessons.length, 0),
    lectureCount: allLectures.length,
    publishedLectureCount: published.length,
    draftLectureCount: allLectures.length - published.length,
    courses,
    lastLectureUpdatedAt,
    createdAt: subject.created_at,
    updatedAt: subject.updated_at,
    topics: topicDTOs,
    publish: validationFor(subject, topicDTOs, courses),
  }
}

const summarize = (detail: SubjectDetailDTO): SubjectSummaryDTO => ({
  id: detail.id,
  name: detail.name,
  description: detail.description,
  status: detail.status,
  topicCount: detail.topicCount,
  lessonCount: detail.lessonCount,
  lectureCount: detail.lectureCount,
  publishedLectureCount: detail.publishedLectureCount,
  draftLectureCount: detail.draftLectureCount,
  courses: detail.courses,
  lastLectureUpdatedAt: detail.lastLectureUpdatedAt,
  createdAt: detail.createdAt,
  updatedAt: detail.updatedAt,
})

async function detailFor(db: Db, teacherId: string, subject: SubjectRow, lectures: Map<string, SubjectLectureRefDTO>): Promise<SubjectDetailDTO> {
  const courseIds = await subjectCourseIds(db, subject.id)
  const [courses, tree] = await Promise.all([courseRefs(db, teacherId, courseIds), loadTree(db, subject.id)])
  return build(subject, tree, courses, lectures)
}

export async function subjectsForTeacher(db: Db, teacherId: string): Promise<SubjectSummaryDTO[]> {
  const subjects = await query<SubjectRow>(
    db,
    `SELECT s.* FROM subjects s
     WHERE EXISTS (
       SELECT 1 FROM subject_courses sc
       JOIN courses c ON c.id = sc.course_id
       WHERE sc.subject_id = s.id AND c.instructor_id = ?1
     )
     ORDER BY s.name, s.id`,
    teacherId,
  )
  if (!subjects.length) return []

  const lectures = await lectureRefMap(db, teacherId)
  return Promise.all(subjects.map(async (subject) => summarize(await detailFor(db, teacherId, subject, lectures))))
}

export async function subjectDetail(db: Db, teacherId: string, subjectId: string): Promise<SubjectDetailDTO | null> {
  const subject = await subjectForTeacher(db, teacherId, subjectId)
  if (!subject) return null
  return detailFor(db, teacherId, subject, await lectureRefMap(db, teacherId))
}

/* ------------------------------- subjects -------------------------------- */

export type SubjectPatch = { name?: string; description?: string; courseIds?: string[] }

export async function createSubject(
  db: Db,
  teacherId: string,
  input: { name: string; description: string; courseIds: string[] },
): Promise<SubjectDetailDTO | null> {
  const courseIds = [...new Set(input.courseIds)]
  if (!(await ownsCourses(db, teacherId, courseIds))) return null

  const id = newId('sub')
  const now = nowIso()
  await db.batch([
    db.prepare(`INSERT INTO subjects (id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, 'DRAFT', ?, ?)`).bind(id, input.name, input.description, now, now),
    ...courseIds.map((courseId, index) => db.prepare(`INSERT INTO subject_courses (subject_id, course_id, position) VALUES (?, ?, ?)`).bind(id, courseId, index)),
  ])
  return subjectDetail(db, teacherId, id)
}

export async function updateSubject(db: Db, teacherId: string, subjectId: string, patch: SubjectPatch): Promise<SubjectDetailDTO | null> {
  const subject = await subjectForTeacher(db, teacherId, subjectId)
  if (!subject) return null

  let courseIds: string[] | null = null
  if (patch.courseIds !== undefined) {
    courseIds = [...new Set(patch.courseIds)]
    if (!(await ownsCourses(db, teacherId, courseIds))) return null
  }

  const sets: string[] = []
  const params: unknown[] = []
  const push = (column: string, value: unknown) => {
    sets.push(`${column} = ?${params.length + 1}`)
    params.push(value)
  }
  if (patch.name !== undefined) push('name', patch.name)
  if (patch.description !== undefined) push('description', patch.description)
  push('updated_at', nowIso())

  const statements = [db.prepare(`UPDATE subjects SET ${sets.join(', ')} WHERE id = ?${params.length + 1}`).bind(...params, subjectId)]
  if (courseIds) {
    statements.push(db.prepare(`DELETE FROM subject_courses WHERE subject_id = ?1`).bind(subjectId))
    courseIds.forEach((courseId, index) => {
      statements.push(db.prepare(`INSERT INTO subject_courses (subject_id, course_id, position) VALUES (?, ?, ?)`).bind(subjectId, courseId, index))
    })
  }
  await db.batch(statements)

  return subjectDetail(db, teacherId, subjectId)
}

export async function setSubjectStatus(db: Db, teacherId: string, subjectId: string, status: SubjectStatus): Promise<SubjectDetailDTO | null> {
  const subject = await subjectForTeacher(db, teacherId, subjectId)
  if (!subject) return null
  await execute(db, `UPDATE subjects SET status = ?1, updated_at = ?2 WHERE id = ?3`, status, nowIso(), subjectId)
  return subjectDetail(db, teacherId, subjectId)
}

/* --------------------------------- topics -------------------------------- */

async function topicForTeacher(db: Db, teacherId: string, topicId: string): Promise<{ topic: TopicRow; subject: SubjectRow } | null> {
  const topic = await queryOne<TopicRow>(db, `SELECT * FROM subject_topics WHERE id = ?1`, topicId)
  if (!topic) return null
  const subject = await subjectForTeacher(db, teacherId, topic.subject_id)
  return subject ? { topic, subject } : null
}

export async function addTopic(db: Db, teacherId: string, subjectId: string, input: { title: string; description: string }): Promise<SubjectDetailDTO | null> {
  const subject = await subjectForTeacher(db, teacherId, subjectId)
  if (!subject) return null

  const next = await queryOne<{ position: number }>(db, `SELECT COALESCE(MAX(position), -1) + 1 AS position FROM subject_topics WHERE subject_id = ?1`, subjectId)
  const now = nowIso()
  await execute(
    db,
    `INSERT INTO subject_topics (id, subject_id, title, description, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    newId(`top-${subjectId}`),
    subjectId,
    input.title,
    input.description,
    next?.position ?? 0,
    now,
    now,
  )
  await touchSubject(db, subjectId, now)
  return subjectDetail(db, teacherId, subjectId)
}

export async function updateTopic(db: Db, teacherId: string, topicId: string, patch: { title?: string; description?: string }): Promise<SubjectDetailDTO | null> {
  const found = await topicForTeacher(db, teacherId, topicId)
  if (!found) return null

  const sets: string[] = []
  const params: unknown[] = []
  if (patch.title !== undefined) {
    sets.push(`title = ?${params.length + 1}`)
    params.push(patch.title)
  }
  if (patch.description !== undefined) {
    sets.push(`description = ?${params.length + 1}`)
    params.push(patch.description)
  }
  const now = nowIso()
  sets.push(`updated_at = ?${params.length + 1}`)
  params.push(now)

  await execute(db, `UPDATE subject_topics SET ${sets.join(', ')} WHERE id = ?${params.length + 1}`, ...params, topicId)
  await touchSubject(db, found.subject.id, now)
  return subjectDetail(db, teacherId, found.subject.id)
}

export async function deleteTopic(db: Db, teacherId: string, topicId: string): Promise<SubjectDetailDTO | null> {
  const found = await topicForTeacher(db, teacherId, topicId)
  if (!found) return null

  await db.batch([
    db.prepare(`DELETE FROM subject_lesson_lectures WHERE subject_lesson_id IN (SELECT id FROM subject_lessons WHERE topic_id = ?1)`).bind(topicId),
    db.prepare(`DELETE FROM subject_lessons WHERE topic_id = ?1`).bind(topicId),
    db.prepare(`DELETE FROM subject_topics WHERE id = ?1`).bind(topicId),
  ])
  await resequenceTopics(db, found.subject.id)
  await touchSubject(db, found.subject.id)
  return subjectDetail(db, teacherId, found.subject.id)
}

/* -------------------------------- lessons -------------------------------- */

export async function addSyllabusLesson(
  db: Db,
  teacherId: string,
  topicId: string,
  input: { title: string; description: string },
): Promise<SubjectDetailDTO | null> {
  const found = await topicForTeacher(db, teacherId, topicId)
  if (!found) return null

  const next = await queryOne<{ position: number }>(db, `SELECT COALESCE(MAX(position), -1) + 1 AS position FROM subject_lessons WHERE topic_id = ?1`, topicId)
  const now = nowIso()
  await execute(
    db,
    `INSERT INTO subject_lessons (id, topic_id, title, description, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    newId(`sls-${topicId}`),
    topicId,
    input.title,
    input.description,
    next?.position ?? 0,
    now,
    now,
  )
  await touchSubject(db, found.subject.id, now)
  return subjectDetail(db, teacherId, found.subject.id)
}

async function syllabusLessonForTeacher(
  db: Db,
  teacherId: string,
  lessonId: string,
): Promise<{ lesson: SyllabusLessonRow; topic: TopicRow; subject: SubjectRow } | null> {
  const lesson = await queryOne<SyllabusLessonRow>(db, `SELECT * FROM subject_lessons WHERE id = ?1`, lessonId)
  if (!lesson) return null
  const found = await topicForTeacher(db, teacherId, lesson.topic_id)
  return found ? { lesson, topic: found.topic, subject: found.subject } : null
}

export async function updateSyllabusLesson(
  db: Db,
  teacherId: string,
  lessonId: string,
  patch: { title?: string; description?: string },
): Promise<SubjectDetailDTO | null> {
  const found = await syllabusLessonForTeacher(db, teacherId, lessonId)
  if (!found) return null

  const sets: string[] = []
  const params: unknown[] = []
  if (patch.title !== undefined) {
    sets.push(`title = ?${params.length + 1}`)
    params.push(patch.title)
  }
  if (patch.description !== undefined) {
    sets.push(`description = ?${params.length + 1}`)
    params.push(patch.description)
  }
  const now = nowIso()
  sets.push(`updated_at = ?${params.length + 1}`)
  params.push(now)

  await execute(db, `UPDATE subject_lessons SET ${sets.join(', ')} WHERE id = ?${params.length + 1}`, ...params, lessonId)
  await touchSubject(db, found.subject.id, now)
  return subjectDetail(db, teacherId, found.subject.id)
}

export async function deleteSyllabusLesson(db: Db, teacherId: string, lessonId: string): Promise<SubjectDetailDTO | null> {
  const found = await syllabusLessonForTeacher(db, teacherId, lessonId)
  if (!found) return null

  await db.batch([
    db.prepare(`DELETE FROM subject_lesson_lectures WHERE subject_lesson_id = ?1`).bind(lessonId),
    db.prepare(`DELETE FROM subject_lessons WHERE id = ?1`).bind(lessonId),
  ])
  await resequenceSyllabusLessons(db, found.topic.id)
  await touchSubject(db, found.subject.id)
  return subjectDetail(db, teacherId, found.subject.id)
}

/* -------------------------------- ordering ------------------------------- */

async function resequenceTopics(db: Db, subjectId: string) {
  const rows = await query<{ id: string }>(db, `SELECT id FROM subject_topics WHERE subject_id = ?1 ORDER BY position, id`, subjectId)
  if (rows.length) await db.batch(rows.map((row, index) => db.prepare(`UPDATE subject_topics SET position = ?1 WHERE id = ?2`).bind(index, row.id)))
}

async function resequenceSyllabusLessons(db: Db, topicId: string) {
  const rows = await query<{ id: string }>(db, `SELECT id FROM subject_lessons WHERE topic_id = ?1 ORDER BY position, id`, topicId)
  if (rows.length) await db.batch(rows.map((row, index) => db.prepare(`UPDATE subject_lessons SET position = ?1 WHERE id = ?2`).bind(index, row.id)))
}

async function resequenceLinks(db: Db, lessonId: string) {
  const rows = await query<{ id: string }>(db, `SELECT id FROM subject_lesson_lectures WHERE subject_lesson_id = ?1 ORDER BY position, id`, lessonId)
  if (rows.length) await db.batch(rows.map((row, index) => db.prepare(`UPDATE subject_lesson_lectures SET position = ?1 WHERE id = ?2`).bind(index, row.id)))
}

/** Swap two rows' positions. Both statements go out in one batch. */
async function swap(db: Db, table: string, rows: Array<{ id: string; position: number }>, index: number, delta: number): Promise<boolean> {
  const other = rows[index + delta]
  if (!other) return false
  await db.batch([
    db.prepare(`UPDATE ${table} SET position = ?1 WHERE id = ?2`).bind(other.position, rows[index].id),
    db.prepare(`UPDATE ${table} SET position = ?1 WHERE id = ?2`).bind(rows[index].position, other.id),
  ])
  return true
}

export type SubjectMoveResult = { moved: boolean; detail: SubjectDetailDTO }

export async function moveSubjectItem(
  db: Db,
  teacherId: string,
  subjectId: string,
  kind: 'TOPIC' | 'LESSON',
  id: string,
  direction: 'UP' | 'DOWN',
): Promise<SubjectMoveResult | null> {
  const subject = await subjectForTeacher(db, teacherId, subjectId)
  if (!subject) return null
  const delta = direction === 'UP' ? -1 : 1

  if (kind === 'TOPIC') {
    const rows = await query<{ id: string; position: number }>(db, `SELECT id, position FROM subject_topics WHERE subject_id = ?1 ORDER BY position, id`, subjectId)
    const index = rows.findIndex((row) => row.id === id)
    const moved = index >= 0 && (await swap(db, 'subject_topics', rows, index, delta))
    if (moved) await touchSubject(db, subjectId)
    return { moved, detail: (await subjectDetail(db, teacherId, subjectId))! }
  }

  const lesson = await queryOne<{ id: string; topic_id: string }>(
    db,
    `SELECT sl.id, sl.topic_id FROM subject_lessons sl
     JOIN subject_topics t ON t.id = sl.topic_id
     WHERE sl.id = ?1 AND t.subject_id = ?2`,
    id,
    subjectId,
  )
  if (!lesson) return { moved: false, detail: (await subjectDetail(db, teacherId, subjectId))! }

  const rows = await query<{ id: string; position: number }>(db, `SELECT id, position FROM subject_lessons WHERE topic_id = ?1 ORDER BY position, id`, lesson.topic_id)
  const index = rows.findIndex((row) => row.id === id)
  const moved = index >= 0 && (await swap(db, 'subject_lessons', rows, index, delta))
  if (moved) await touchSubject(db, subjectId)
  return { moved, detail: (await subjectDetail(db, teacherId, subjectId))! }
}

/* ------------------------------ lectures ------------------------------- */

export type LectureAttachResult =
  | { status: 'OK'; detail: SubjectDetailDTO }
  | { status: 'NOT_FOUND' }
  | { status: 'CONFLICT' }

/**
 * Link an existing lecture to a syllabus lesson. A lecture can deliver only one
 * syllabus lesson: attaching it twice would let two subjects edit one row. The
 * UNIQUE index on `lecture_id` is the real guarantee; the read is only there to
 * answer 409 without relying on an error message.
 */
export async function attachExistingLecture(db: Db, teacherId: string, lessonId: string, lectureId: string): Promise<LectureAttachResult> {
  const found = await syllabusLessonForTeacher(db, teacherId, lessonId)
  if (!found) return { status: 'NOT_FOUND' }
  const lecture = await lectureDetail(db, teacherId, lectureId)
  if (!lecture) return { status: 'NOT_FOUND' }

  const taken = await queryOne<{ id: string }>(db, `SELECT id FROM subject_lesson_lectures WHERE lecture_id = ?1`, lectureId)
  if (taken) return { status: 'CONFLICT' }

  const next = await queryOne<{ position: number }>(db, `SELECT COALESCE(MAX(position), -1) + 1 AS position FROM subject_lesson_lectures WHERE subject_lesson_id = ?1`, lessonId)
  try {
    await execute(
      db,
      `INSERT INTO subject_lesson_lectures (id, subject_lesson_id, course_id, lecture_id, position) VALUES (?, ?, ?, ?, ?)`,
      newId('lnk'),
      lessonId,
      lecture.courseId,
      lectureId,
      next?.position ?? 0,
    )
  } catch {
    return { status: 'CONFLICT' }
  }

  await touchSubject(db, found.subject.id)
  const detail = await subjectDetail(db, teacherId, found.subject.id)
  return detail ? { status: 'OK', detail } : { status: 'NOT_FOUND' }
}

/**
 * The chapter a new lecture is placed in: a chapter named after the topic
 * inside a section named after the subject, created on first use. The course
 * builder sees exactly the same placement, which is the point — a subject
 * lecture is a course lecture, not a parallel record.
 */
async function ensureChapter(db: Db, courseId: string, subjectName: string, topicTitle: string): Promise<string | null> {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
  const outline = await outlineFor(db, courseId)

  const section = outline.find((s) => same(s.title, subjectName))
  if (!section) {
    const sectionId = await addSection(db, courseId, subjectName)
    return sectionId ? addChapter(db, courseId, sectionId, topicTitle) : null
  }

  const chapter = section.chapters.find((c) => same(c.title, topicTitle))
  if (chapter) return chapter.id
  return addChapter(db, courseId, section.id, topicTitle)
}

export type LectureCreateResult =
  | { status: 'OK'; detail: SubjectDetailDTO; lectureId: string }
  | { status: 'NOT_FOUND' }

export async function createLectureForLesson(
  db: Db,
  teacherId: string,
  lessonId: string,
  input: { courseId: string; kind: 'VIDEO' | 'TEXT'; estimatedMinutes: number },
): Promise<LectureCreateResult> {
  const found = await syllabusLessonForTeacher(db, teacherId, lessonId)
  if (!found) return { status: 'NOT_FOUND' }
  if (!(await ownsCourse(db, teacherId, input.courseId))) return { status: 'NOT_FOUND' }

  const chapterId = await ensureChapter(db, input.courseId, found.subject.name, found.topic.title)
  if (!chapterId) return { status: 'NOT_FOUND' }

  const lectureId = await addLesson(db, input.courseId, chapterId, {
    title: found.lesson.title,
    kind: input.kind,
    estimatedMinutes: input.estimatedMinutes,
  })
  if (!lectureId) return { status: 'NOT_FOUND' }

  const next = await queryOne<{ position: number }>(db, `SELECT COALESCE(MAX(position), -1) + 1 AS position FROM subject_lesson_lectures WHERE subject_lesson_id = ?1`, lessonId)
  await execute(
    db,
    `INSERT INTO subject_lesson_lectures (id, subject_lesson_id, course_id, lecture_id, position) VALUES (?, ?, ?, ?, ?)`,
    newId('lnk'),
    lessonId,
    input.courseId,
    lectureId,
    next?.position ?? 0,
  )
  await touchSubject(db, found.subject.id)

  const detail = await subjectDetail(db, teacherId, found.subject.id)
  return detail ? { status: 'OK', detail, lectureId } : { status: 'NOT_FOUND' }
}

/** Unlink a lecture. The lecture itself stays in the course curriculum. */
export async function detachLecture(db: Db, teacherId: string, lessonId: string, lectureId: string): Promise<LectureAttachResult> {
  const found = await syllabusLessonForTeacher(db, teacherId, lessonId)
  if (!found) return { status: 'NOT_FOUND' }

  const removed = await execute(db, `DELETE FROM subject_lesson_lectures WHERE subject_lesson_id = ?1 AND lecture_id = ?2`, lessonId, lectureId)
  if (!removed) return { status: 'NOT_FOUND' }

  await resequenceLinks(db, lessonId)
  await touchSubject(db, found.subject.id)
  const detail = await subjectDetail(db, teacherId, found.subject.id)
  return detail ? { status: 'OK', detail } : { status: 'NOT_FOUND' }
}

/* --------------------------- student catalogue --------------------------- */

/** Published lectures for a set of ids, with only the resources a student can open. */
async function publishedLectures(db: Db, ids: string[]): Promise<Map<string, StudentSubjectLectureDTO>> {
  const map = new Map<string, StudentSubjectLectureDTO>()
  if (!ids.length) return map
  const list = ids.map((_, i) => `?${i + 1}`).join(', ')

  const [lectures, resources] = await Promise.all([
    query<{ id: string; course_id: string; course_title: string; title: string; kind: 'VIDEO' | 'TEXT'; estimated_minutes: number }>(
      db,
      `SELECT l.id, l.course_id, c.title AS course_title, l.title, l.kind, l.estimated_minutes
       FROM lessons l JOIN courses c ON c.id = l.course_id
       WHERE l.status = 'PUBLISHED' AND l.chapter_id IS NOT NULL AND l.id IN (${list})`,
      ...ids,
    ),
    query<{ id: string; lesson_id: string; title: string; kind: StudentSubjectLectureDTO['resources'][number]['kind']; external_url: string; size_bytes: number | null; added_at: string }>(
      db,
      `SELECT id, lesson_id, title, kind, external_url, size_bytes, added_at
       FROM lesson_resources
       WHERE external_url IS NOT NULL AND lesson_id IN (${list})
       ORDER BY position, id`,
      ...ids,
    ),
  ])

  for (const lecture of lectures) {
    map.set(lecture.id, {
      id: lecture.id,
      courseId: lecture.course_id,
      courseTitle: lecture.course_title,
      title: lecture.title,
      kind: lecture.kind,
      estimatedMinutes: lecture.estimated_minutes,
      resources: resources
        .filter((row) => row.lesson_id === lecture.id)
        .map((row) => ({ id: row.id, title: row.title, kind: row.kind, externalUrl: row.external_url, sizeBytes: row.size_bytes, addedAt: row.added_at })),
    })
  }
  return map
}

/**
 * Published subjects only, and inside them only lessons that have at least one
 * published lecture. Draft topics, lessons and lectures never reach this shape.
 */
export async function publishedSubjectDetail(db: Db, subjectId: string): Promise<StudentSubjectDetailDTO | null> {
  const subject = await queryOne<SubjectRow>(db, `SELECT * FROM subjects WHERE id = ?1 AND status = 'PUBLISHED'`, subjectId)
  if (!subject) return null

  const courseIds = await subjectCourseIds(db, subject.id)
  const publishedCourses = await publicCourses(db, courseIds)
  const courses = courseIds.flatMap((id) => {
    const course = publishedCourses.get(id)
    return course && course.status === 'PUBLISHED' ? [{ id: course.id, title: course.title }] : []
  })

  const tree = await loadTree(db, subject.id)
  const lectures = await publishedLectures(db, tree.links.map((link) => link.lecture_id))

  const topicDTOs = tree.topics
    .slice()
    .sort((a, b) => a.position - b.position)
    .flatMap((topic) => {
      const lessons = tree.lessons
        .filter((lesson) => lesson.topic_id === topic.id)
        .sort((a, b) => a.position - b.position)
        .flatMap((lesson) => {
          const attached = tree.links
            .filter((link) => link.subject_lesson_id === lesson.id)
            .sort((a, b) => a.position - b.position)
            .flatMap((link) => {
              const lecture = lectures.get(link.lecture_id)
              return lecture ? [lecture] : []
            })
          return attached.length ? [{ id: lesson.id, title: lesson.title, description: lesson.description, lectures: attached }] : []
        })
      if (!lessons.length) return []
      return [{ id: topic.id, title: topic.title, description: topic.description, lessons }]
    })

  return {
    id: subject.id,
    name: subject.name,
    description: subject.description,
    topicCount: topicDTOs.length,
    lessonCount: topicDTOs.reduce((n, t) => n + t.lessons.length, 0),
    lectureCount: topicDTOs.reduce((n, t) => n + t.lessons.reduce((m, l) => m + l.lectures.length, 0), 0),
    courses,
    topics: topicDTOs,
  }
}

export async function publishedSubjects(db: Db): Promise<StudentSubjectSummaryDTO[]> {
  const subjects = await query<SubjectRow>(db, `SELECT * FROM subjects WHERE status = 'PUBLISHED' ORDER BY name, id`)
  const details = await Promise.all(subjects.map((subject) => publishedSubjectDetail(db, subject.id)))
  return details.flatMap((detail) =>
    detail
      ? [
          {
            id: detail.id,
            name: detail.name,
            description: detail.description,
            topicCount: detail.topicCount,
            lessonCount: detail.lessonCount,
            lectureCount: detail.lectureCount,
            courses: detail.courses,
          },
        ]
      : [],
  )
}
