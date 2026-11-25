/*
  Training courses, read from D1.

  A course belongs to exactly one teacher (`instructor_id`), which is the only
  ownership rule the studio needs: a course the caller does not own is reported
  as missing, never as forbidden. Counts are derived from the curriculum tables
  in the same request so a course card cannot disagree with the builder.
*/
import type { CourseStatus } from '../contracts/catalog'
import type { TeacherCourseSummaryDTO } from '../contracts/teaching'
import { courseCountsMany } from './curriculum'
import { execute, nowIso, query, queryOne, type Db } from './sql'

export type CourseRow = {
  id: string
  slug: string
  title: string
  summary: string
  category: string
  level: string
  status: CourseStatus
  instructor_id: string
  thumbnail_url: string | null
  enrolled_count: number
  assignment_count: number
  completion_percent: number
  position: number
  created_at: string
  updated_at: string
  published_at: string | null
  instructor_name: string
  instructor_headline: string
  instructor_avatar: string | null
}

const SELECT_COURSE = `
  SELECT c.*, t.name AS instructor_name, t.headline AS instructor_headline, t.avatar_url AS instructor_avatar
  FROM courses c
  JOIN teachers t ON t.id = c.instructor_id`

const summary = (row: CourseRow, counts: { sectionCount: number; lectureCount: number; draftLectureCount: number } | undefined): TeacherCourseSummaryDTO => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  summary: row.summary,
  category: row.category,
  level: row.level,
  status: row.status,
  thumbnailUrl: row.thumbnail_url,
  instructor: {
    id: `prof-${row.instructor_id}`,
    userId: row.instructor_id,
    displayName: row.instructor_name,
    headline: row.instructor_headline,
    avatarUrl: row.instructor_avatar,
  },
  sectionCount: counts?.sectionCount ?? 0,
  lectureCount: counts?.lectureCount ?? 0,
  assignmentCount: row.assignment_count,
  enrolledCount: row.enrolled_count,
  completionPercent: row.completion_percent,
  draftLectureCount: counts?.draftLectureCount ?? 0,
  price: null,
  publishedAt: row.published_at,
  updatedAt: row.updated_at,
})

async function withCounts(db: Db, rows: CourseRow[]): Promise<TeacherCourseSummaryDTO[]> {
  const counts = await courseCountsMany(db, rows.map((row) => row.id))
  return rows.map((row) => summary(row, counts.get(row.id)))
}

export async function coursesForTeacher(db: Db, teacherId: string): Promise<TeacherCourseSummaryDTO[]> {
  const rows = await query<CourseRow>(db, `${SELECT_COURSE} WHERE c.instructor_id = ?1 ORDER BY c.position, c.id`, teacherId)
  return withCounts(db, rows)
}

/** A course the teacher does not own is indistinguishable from a missing one. */
export async function courseForTeacher(db: Db, teacherId: string, courseId: string): Promise<TeacherCourseSummaryDTO | null> {
  const row = await queryOne<CourseRow>(db, `${SELECT_COURSE} WHERE c.id = ?1 AND c.instructor_id = ?2`, courseId, teacherId)
  return row ? (await withCounts(db, [row]))[0] : null
}

/** Cheap ownership check for handlers that only need to gate the write. */
export async function ownsCourse(db: Db, teacherId: string, courseId: string): Promise<boolean> {
  return !!(await queryOne<{ id: string }>(db, `SELECT id FROM courses WHERE id = ?1 AND instructor_id = ?2`, courseId, teacherId))
}

/** True only when every id is a course this teacher owns. Empty lists are false. */
export async function ownsCourses(db: Db, teacherId: string, courseIds: string[]): Promise<boolean> {
  if (!courseIds.length) return false
  const list = courseIds.map((_, i) => `?${i + 2}`).join(', ')
  const row = await queryOne<{ n: number }>(db, `SELECT COUNT(*) AS n FROM courses WHERE instructor_id = ?1 AND id IN (${list})`, teacherId, ...courseIds)
  return (row?.n ?? 0) === courseIds.length
}

/** Status changes the teacher is allowed to make from the studio. */
export async function setCourseStatus(db: Db, teacherId: string, courseId: string, status: CourseStatus): Promise<TeacherCourseSummaryDTO | null> {
  const now = nowIso()
  const owned = await ownsCourse(db, teacherId, courseId)
  if (!owned) return null
  if (status === 'PUBLISHED') {
    await execute(
      db,
      `UPDATE courses SET status = ?1, published_at = COALESCE(published_at, ?2), updated_at = ?2 WHERE id = ?3`,
      status,
      now,
      courseId,
    )
  } else {
    await execute(db, `UPDATE courses SET status = ?1, updated_at = ?2 WHERE id = ?3`, status, now, courseId)
  }
  return courseForTeacher(db, teacherId, courseId)
}

/** A course's title and status without a teacher scope, for the student catalogue. */
export type PublicCourse = { id: string; title: string; status: CourseStatus }

export async function publicCourses(db: Db, courseIds: string[]): Promise<Map<string, PublicCourse>> {
  if (!courseIds.length) return new Map()
  const placeholdersForIds = courseIds.map((_, i) => `?${i + 1}`).join(', ')
  const rows = await query<PublicCourse>(db, `SELECT id, title, status FROM courses WHERE id IN (${placeholdersForIds})`, ...courseIds)
  return new Map(rows.map((row) => [row.id, row]))
}
