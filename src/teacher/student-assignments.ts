/*
  Published assignments as a student sees them.

  Scope is the student's own active enrolments, joined in the same query that
  reads the row. An assignment in a course the student is not enrolled in does
  not come back at all, so the route can answer 404 without ever confirming that
  someone else's assignment exists.

  Drafts are excluded here rather than filtered by the caller: an unpublished
  assignment is not part of a student payload. The window is resolved on the
  server so the list, the detail and any later hand-in screen cannot disagree
  about whether something is open.
*/
import type { LatePolicy } from '../contracts/assessment'
import type { StudentAssignmentDetailDTO, StudentAssignmentStatus, StudentAssignmentSummaryDTO } from '../contracts/learning'
import { query, queryOne, type Db } from './sql'

type StudentAssignmentRow = {
  id: string
  course_id: string
  course_title: string
  title: string
  instructions: string
  opens_at: string
  due_at: string
  late_policy: LatePolicy
  attempts_allowed: number
  max_score: number
  allow_file_upload: number
  /** The assignment's own CLOSED flag; the window decides the rest. */
  status: string
  /** Never null: the query filters unpublished rows out. */
  published_at: string
}

const SELECT_ASSIGNMENT = `
  SELECT a.id, a.course_id, c.title AS course_title, a.title, a.instructions,
         a.opens_at, a.due_at, a.late_policy, a.attempts_allowed, a.max_score,
         a.allow_file_upload, a.status, a.published_at
  FROM assignments a
  JOIN courses c ON c.id = a.course_id
  JOIN course_enrolments e ON e.course_id = c.id AND e.student_id = ?1 AND e.status = 'ACTIVE'
  WHERE a.published_at IS NOT NULL`

function viewStatus(row: StudentAssignmentRow, now = Date.now()): StudentAssignmentStatus {
  if (row.status === 'CLOSED') return 'CLOSED'
  if (Date.parse(row.opens_at) > now) return 'SCHEDULED'
  if (Date.parse(row.due_at) < now) return 'CLOSED'
  return 'OPEN'
}

function summary(row: StudentAssignmentRow): StudentAssignmentSummaryDTO {
  return {
    id: row.id,
    courseId: row.course_id,
    courseTitle: row.course_title,
    title: row.title,
    status: viewStatus(row),
    opensAt: row.opens_at,
    dueAt: row.due_at,
    latePolicy: row.late_policy,
    attemptsAllowed: row.attempts_allowed,
    maxScore: row.max_score,
    allowFileUpload: !!row.allow_file_upload,
    publishedAt: row.published_at,
  }
}

/** Soonest due first, so the next thing to do is at the top of the list. */
export async function assignmentsForStudent(db: Db, studentId: string): Promise<StudentAssignmentSummaryDTO[]> {
  const rows = await query<StudentAssignmentRow>(db, `${SELECT_ASSIGNMENT} ORDER BY a.due_at, a.id`, studentId)
  return rows.map(summary)
}

export async function studentAssignment(db: Db, studentId: string, assignmentId: string): Promise<StudentAssignmentDetailDTO | null> {
  const row = await queryOne<StudentAssignmentRow>(db, `${SELECT_ASSIGNMENT} AND a.id = ?2`, studentId, assignmentId)
  return row ? { ...summary(row), instructions: row.instructions } : null
}
