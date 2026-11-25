/*
  Curriculum: modules (sections) → chapters → lectures, stored in D1.

  Ordering lives in `position`, 0-based and unique per parent. Moving a row
  swaps positions with its neighbour rather than deleting and recreating
  anything, so a lecture keeps its id across a reorder and every subject link
  that points at it survives.

  Deleting a section, chapter or lecture also removes its dependent rows
  explicitly instead of relying on cascades, so the same behaviour holds whether
  or not SQLite's foreign_keys pragma is on in the environment serving the DB.
*/
import type { PublishRequirementDTO, PublishValidationDTO } from '../contracts/catalog'
import type { TeacherLessonDTO, TeacherOutlineSection } from '../contracts/teaching'
import { execute, newId, nowIso, query, queryOne, type Db } from './sql'

type SectionRow = { id: string; course_id: string; title: string; position: number; created_at: string; updated_at: string }
type ChapterRow = { id: string; section_id: string; title: string; position: number; created_at: string; updated_at: string }
type LessonRow = {
  id: string
  section_id: string
  chapter_id: string | null
  title: string
  kind: 'VIDEO' | 'TEXT'
  position: number
  estimated_minutes: number
  status: 'DRAFT' | 'PUBLISHED'
  media_status: 'READY' | 'PROCESSING' | 'NONE'
  is_preview: number
  created_at: string
  updated_at: string
}

export type CourseCounts = { sectionCount: number; lectureCount: number; draftLectureCount: number; publishedCount: number }

const emptyCounts = (): CourseCounts => ({ sectionCount: 0, lectureCount: 0, draftLectureCount: 0, publishedCount: 0 })

const toLessonDTO = (l: LessonRow): TeacherLessonDTO => ({
  id: l.id,
  sectionId: l.section_id,
  chapterId: l.chapter_id,
  title: l.title,
  kind: l.kind,
  position: l.position,
  isPreview: !!l.is_preview,
  isLocked: false,
  estimatedMinutes: l.estimated_minutes,
  mediaAssetId: l.media_status === 'READY' ? `asset-${l.id}` : null,
  body: l.kind === 'TEXT' ? '' : null,
  resources: [],
  status: l.status,
  mediaStatus: l.media_status,
  createdAt: l.created_at,
  updatedAt: l.updated_at,
})

export async function outlineFor(db: Db, courseId: string): Promise<TeacherOutlineSection[]> {
  const [sections, chapters, lessons] = await Promise.all([
    query<SectionRow>(db, `SELECT * FROM curriculum_sections WHERE course_id = ?1 ORDER BY position, id`, courseId),
    query<ChapterRow>(db, `SELECT * FROM curriculum_chapters WHERE course_id = ?1 ORDER BY position, id`, courseId),
    query<LessonRow>(db, `SELECT * FROM lessons WHERE course_id = ?1 ORDER BY position, id`, courseId),
  ])

  return sections.map((section) => ({
    id: section.id,
    courseId: section.course_id,
    title: section.title,
    position: section.position,
    createdAt: section.created_at,
    updatedAt: section.updated_at,
    chapters: chapters
      .filter((chapter) => chapter.section_id === section.id)
      .sort((a, b) => a.position - b.position)
      .map((chapter) => ({
        id: chapter.id,
        sectionId: section.id,
        title: chapter.title,
        position: chapter.position,
        createdAt: chapter.created_at,
        updatedAt: chapter.updated_at,
        lessons: lessons
          .filter((lesson) => lesson.chapter_id === chapter.id)
          .sort((a, b) => a.position - b.position)
          .map(toLessonDTO),
      })),
  }))
}

/** Counts for many courses in two grouped queries, for the course grid and dashboard. */
export async function courseCountsMany(db: Db, courseIds: string[]): Promise<Map<string, CourseCounts>> {
  const counts = new Map<string, CourseCounts>()
  if (!courseIds.length) return counts
  const list = courseIds.map((_, i) => `?${i + 1}`).join(', ')

  const [sections, lessons] = await Promise.all([
    query<{ course_id: string; n: number }>(db, `SELECT course_id, COUNT(*) AS n FROM curriculum_sections WHERE course_id IN (${list}) GROUP BY course_id`, ...courseIds),
    query<{ course_id: string; total: number; published: number | null; draft: number | null }>(
      db,
      `SELECT course_id, COUNT(*) AS total,
              SUM(CASE WHEN status = 'PUBLISHED' THEN 1 ELSE 0 END) AS published,
              SUM(CASE WHEN status = 'DRAFT' THEN 1 ELSE 0 END) AS draft
       FROM lessons WHERE course_id IN (${list}) GROUP BY course_id`,
      ...courseIds,
    ),
  ])

  for (const id of courseIds) counts.set(id, emptyCounts())
  for (const row of sections) {
    const entry = counts.get(row.course_id) ?? emptyCounts()
    entry.sectionCount = row.n
    counts.set(row.course_id, entry)
  }
  for (const row of lessons) {
    const entry = counts.get(row.course_id) ?? emptyCounts()
    entry.lectureCount = row.total
    entry.publishedCount = row.published ?? 0
    entry.draftLectureCount = row.draft ?? 0
    counts.set(row.course_id, entry)
  }
  return counts
}

export async function courseCounts(db: Db, courseId: string): Promise<CourseCounts> {
  return (await courseCountsMany(db, [courseId])).get(courseId) ?? emptyCounts()
}

/* ------------------------------- mutations ------------------------------- */

async function resequence(db: Db, select: string, update: string, parentId: string) {
  const rows = await query<{ id: string }>(db, select, parentId)
  if (!rows.length) return
  await db.batch(rows.map((row, index) => db.prepare(update).bind(index, row.id)))
}

const resequenceSections = (db: Db, courseId: string) =>
  resequence(db, `SELECT id FROM curriculum_sections WHERE course_id = ?1 ORDER BY position, id`, `UPDATE curriculum_sections SET position = ?1 WHERE id = ?2`, courseId)

const resequenceChapters = (db: Db, sectionId: string) =>
  resequence(db, `SELECT id FROM curriculum_chapters WHERE section_id = ?1 ORDER BY position, id`, `UPDATE curriculum_chapters SET position = ?1 WHERE id = ?2`, sectionId)

const resequenceLessons = (db: Db, chapterId: string) =>
  resequence(db, `SELECT id FROM lessons WHERE chapter_id = ?1 ORDER BY position, id`, `UPDATE lessons SET position = ?1 WHERE id = ?2`, chapterId)

export async function addSection(db: Db, courseId: string, title: string): Promise<string | null> {
  const exists = await queryOne<{ id: string }>(db, `SELECT id FROM courses WHERE id = ?1`, courseId)
  if (!exists) return null
  const next = await queryOne<{ position: number }>(db, `SELECT COALESCE(MAX(position), -1) + 1 AS position FROM curriculum_sections WHERE course_id = ?1`, courseId)
  const id = newId(`sec-${courseId}`)
  const now = nowIso()
  await execute(
    db,
    `INSERT INTO curriculum_sections (id, course_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    courseId,
    title,
    next?.position ?? 0,
    now,
    now,
  )
  return id
}

export async function deleteSection(db: Db, courseId: string, sectionId: string): Promise<boolean> {
  const section = await queryOne<{ id: string }>(db, `SELECT id FROM curriculum_sections WHERE id = ?1 AND course_id = ?2`, sectionId, courseId)
  if (!section) return false

  await db.batch([
    db.prepare(`DELETE FROM lesson_resources WHERE lesson_id IN (SELECT id FROM lessons WHERE section_id = ?1)`).bind(sectionId),
    db.prepare(`DELETE FROM subject_lesson_lectures WHERE lecture_id IN (SELECT id FROM lessons WHERE section_id = ?1)`).bind(sectionId),
    db.prepare(`DELETE FROM lessons WHERE section_id = ?1`).bind(sectionId),
    db.prepare(`DELETE FROM curriculum_chapters WHERE section_id = ?1`).bind(sectionId),
    db.prepare(`DELETE FROM curriculum_sections WHERE id = ?1`).bind(sectionId),
  ])
  await resequenceSections(db, courseId)
  return true
}

export async function addChapter(db: Db, courseId: string, sectionId: string, title: string): Promise<string | null> {
  const section = await queryOne<{ id: string }>(db, `SELECT id FROM curriculum_sections WHERE id = ?1 AND course_id = ?2`, sectionId, courseId)
  if (!section) return null
  const next = await queryOne<{ position: number }>(db, `SELECT COALESCE(MAX(position), -1) + 1 AS position FROM curriculum_chapters WHERE section_id = ?1`, sectionId)
  const id = newId(`ch-${sectionId}`)
  const now = nowIso()
  await execute(
    db,
    `INSERT INTO curriculum_chapters (id, course_id, section_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    courseId,
    sectionId,
    title,
    next?.position ?? 0,
    now,
    now,
  )
  return id
}

export async function deleteChapter(db: Db, courseId: string, chapterId: string): Promise<boolean> {
  const chapter = await queryOne<{ id: string; section_id: string }>(db, `SELECT id, section_id FROM curriculum_chapters WHERE id = ?1 AND course_id = ?2`, chapterId, courseId)
  if (!chapter) return false

  await db.batch([
    db.prepare(`DELETE FROM lesson_resources WHERE lesson_id IN (SELECT id FROM lessons WHERE chapter_id = ?1)`).bind(chapterId),
    db.prepare(`DELETE FROM subject_lesson_lectures WHERE lecture_id IN (SELECT id FROM lessons WHERE chapter_id = ?1)`).bind(chapterId),
    db.prepare(`DELETE FROM lessons WHERE chapter_id = ?1`).bind(chapterId),
    db.prepare(`DELETE FROM curriculum_chapters WHERE id = ?1`).bind(chapterId),
  ])
  await resequenceChapters(db, chapter.section_id)
  return true
}

export async function addLesson(
  db: Db,
  courseId: string,
  chapterId: string,
  input: { title: string; kind: 'VIDEO' | 'TEXT'; estimatedMinutes: number },
): Promise<string | null> {
  const chapter = await queryOne<{ id: string; section_id: string }>(db, `SELECT id, section_id FROM curriculum_chapters WHERE id = ?1 AND course_id = ?2`, chapterId, courseId)
  if (!chapter) return null

  const next = await queryOne<{ position: number }>(db, `SELECT COALESCE(MAX(position), -1) + 1 AS position FROM lessons WHERE chapter_id = ?1`, chapterId)
  const id = newId(`les-${chapterId}`)
  const now = nowIso()
  await execute(
    db,
    `INSERT INTO lessons (id, course_id, section_id, chapter_id, title, kind, position, estimated_minutes, status, media_status, is_preview, body, available_from, available_until, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 'NONE', 0, NULL, NULL, NULL, NULL, ?, ?)`,
    id,
    courseId,
    chapter.section_id,
    chapterId,
    input.title,
    input.kind,
    next?.position ?? 0,
    input.estimatedMinutes,
    now,
    now,
  )
  return id
}

type LessonPatch = { title?: string; estimatedMinutes?: number; isPreview?: boolean; kind?: 'VIDEO' | 'TEXT' }

/** Update the fields a teacher edits on one lecture. Returns false when absent. */
export async function updateLessonRow(db: Db, courseId: string, lessonId: string, patch: LessonPatch): Promise<boolean> {
  const sets: string[] = []
  const params: unknown[] = []
  const push = (column: string, value: unknown) => {
    sets.push(`${column} = ?${params.length + 1}`)
    params.push(value)
  }

  if (patch.title !== undefined) push('title', patch.title)
  if (patch.estimatedMinutes !== undefined) push('estimated_minutes', patch.estimatedMinutes)
  if (patch.isPreview !== undefined) push('is_preview', patch.isPreview ? 1 : 0)
  if (patch.kind !== undefined) push('kind', patch.kind)
  if (!sets.length) return true

  push('updated_at', nowIso())
  const changed = await execute(
    db,
    `UPDATE lessons SET ${sets.join(', ')} WHERE id = ?${params.length + 1} AND course_id = ?${params.length + 2}`,
    ...params,
    lessonId,
    courseId,
  )
  return changed > 0
}

/** Publish or return a single lecture to draft. */
export async function setLessonStatus(db: Db, courseId: string, lessonId: string, status: 'DRAFT' | 'PUBLISHED'): Promise<boolean> {
  if (status === 'PUBLISHED') {
    const changed = await execute(
      db,
      `UPDATE lessons SET status = 'PUBLISHED', published_at = COALESCE(published_at, ?1), updated_at = ?1 WHERE id = ?2 AND course_id = ?3`,
      nowIso(),
      lessonId,
      courseId,
    )
    return changed > 0
  }
  const changed = await execute(
    db,
    `UPDATE lessons SET status = 'DRAFT', published_at = NULL, updated_at = ?1 WHERE id = ?2 AND course_id = ?3`,
    nowIso(),
    lessonId,
    courseId,
  )
  return changed > 0
}

export async function deleteLesson(db: Db, courseId: string, lessonId: string): Promise<boolean> {
  const row = await queryOne<{ id: string; chapter_id: string | null }>(db, `SELECT id, chapter_id FROM lessons WHERE id = ?1 AND course_id = ?2`, lessonId, courseId)
  if (!row) return false

  await db.batch([
    db.prepare(`DELETE FROM lesson_resources WHERE lesson_id = ?1`).bind(lessonId),
    db.prepare(`DELETE FROM subject_lesson_lectures WHERE lecture_id = ?1`).bind(lessonId),
    db.prepare(`DELETE FROM lessons WHERE id = ?1`).bind(lessonId),
  ])
  if (row.chapter_id) await resequenceLessons(db, row.chapter_id)
  return true
}

/** Swap a row with its neighbour inside its parent. Returns false at the ends. */
export async function move(db: Db, courseId: string, kind: 'SECTION' | 'CHAPTER' | 'LESSON', id: string, direction: 'UP' | 'DOWN'): Promise<boolean> {
  const delta = direction === 'UP' ? -1 : 1
  const swap = async (table: string, rows: Array<{ id: string; position: number }>, index: number) => {
    const other = rows[index + delta]
    if (!other) return false
    await db.batch([
      db.prepare(`UPDATE ${table} SET position = ?1 WHERE id = ?2`).bind(other.position, rows[index].id),
      db.prepare(`UPDATE ${table} SET position = ?1 WHERE id = ?2`).bind(rows[index].position, other.id),
    ])
    return true
  }

  if (kind === 'SECTION') {
    const rows = await query<{ id: string; position: number }>(db, `SELECT id, position FROM curriculum_sections WHERE course_id = ?1 ORDER BY position, id`, courseId)
    const index = rows.findIndex((row) => row.id === id)
    if (index < 0) return false
    return swap('curriculum_sections', rows, index)
  }

  if (kind === 'CHAPTER') {
    const chapter = await queryOne<{ id: string; section_id: string }>(db, `SELECT id, section_id FROM curriculum_chapters WHERE id = ?1 AND course_id = ?2`, id, courseId)
    if (!chapter) return false
    const rows = await query<{ id: string; position: number }>(db, `SELECT id, position FROM curriculum_chapters WHERE section_id = ?1 ORDER BY position, id`, chapter.section_id)
    const index = rows.findIndex((row) => row.id === id)
    if (index < 0) return false
    return swap('curriculum_chapters', rows, index)
  }

  const lesson = await queryOne<{ id: string; chapter_id: string | null }>(db, `SELECT id, chapter_id FROM lessons WHERE id = ?1 AND course_id = ?2`, id, courseId)
  if (!lesson?.chapter_id) return false
  const rows = await query<{ id: string; position: number }>(db, `SELECT id, position FROM lessons WHERE chapter_id = ?1 ORDER BY position, id`, lesson.chapter_id)
  const index = rows.findIndex((row) => row.id === id)
  if (index < 0) return false
  return swap('lessons', rows, index)
}

/* --------------------------- publish checklist --------------------------- */

export async function publishValidation(
  db: Db,
  course: { title: string; summary: string; instructor: unknown; thumbnailUrl: string | null },
  courseId: string,
): Promise<PublishValidationDTO> {
  const [outline, rows] = await Promise.all([
    outlineFor(db, courseId),
    query<{ status: string; media_status: string }>(db, `SELECT status, media_status FROM lessons WHERE course_id = ?1`, courseId),
  ])
  const publishedRows = rows.filter((row) => row.status === 'PUBLISHED')
  const mediaReady = publishedRows.every((row) => row.media_status === 'READY')

  const requirements: PublishRequirementDTO[] = [
    { key: 'title', label: 'Course title', satisfied: course.title.trim().length > 2 },
    { key: 'description', label: 'Course description', satisfied: course.summary.trim().length >= 40, detail: 'Write a summary of at least 40 characters.' },
    { key: 'instructor', label: 'Assigned instructor', satisfied: !!course.instructor },
    { key: 'thumbnail', label: 'Course thumbnail', satisfied: !!course.thumbnailUrl, detail: 'Add a thumbnail image.' },
    { key: 'section', label: 'At least one module', satisfied: outline.length > 0, detail: 'Add a module, then a chapter and a lecture.' },
    {
      key: 'accessibleLesson',
      label: 'At least one published lecture',
      satisfied: publishedRows.length > 0,
      detail: publishedRows.length ? undefined : 'Lectures added in the builder start as drafts.',
    },
    { key: 'mediaReady', label: 'Published lectures have ready media', satisfied: mediaReady, detail: mediaReady ? undefined : 'One or more published lectures wait on processing.' },
  ]

  return { canPublish: requirements.every((r) => r.satisfied), requirements }
}
