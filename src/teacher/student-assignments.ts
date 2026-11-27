/*
  Published assignments as a student sees them, and the student's own attempts
  at handing them in.

  Scope is the student's own active enrolments, joined in the same query that
  reads the row — for attempts as well as for assignments. An assignment or an
  attempt in a course the student is not enrolled in does not come back at all,
  so the route can answer 404 without ever confirming that someone else's work
  exists.

  Drafts are excluded here rather than filtered by the caller: an unpublished
  assignment is not part of a student payload. The window is resolved on the
  server so the list, the detail and the hand-in screen cannot disagree about
  whether something is open, and lateness is decided against the due date on the
  server rather than from anything the browser sends.

  An attempt is a row in assignment_submissions with status IN_PROGRESS. It only
  becomes SUBMITTED when the student hands it in, and every teacher-facing read
  filters IN_PROGRESS out, so a half-written answer never reaches the marking
  queue.
*/
import type { LatePolicy } from '../contracts/assessment'
import type {
  StudentAssignmentDetailDTO,
  StudentAssignmentStatus,
  StudentAssignmentSummaryDTO,
  StudentAttemptDTO,
  StudentIdentityDTO,
} from '../contracts/learning'
import { execute, newId, query, queryOne, type Db } from './sql'

/** Long enough for an essay, short enough to stay one row. */
export const MAX_ANSWER_LENGTH = 20000

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
  if (!row) return null
  return { ...summary(row), instructions: row.instructions, attempts: await attemptsFor(db, studentId, assignmentId) }
}

/* -------------------------------- attempts ------------------------------- */

type AttemptRow = {
  id: string
  assignment_id: string
  attempt_number: number
  status: string
  answer_text: string | null
  created_at: string
  submitted_at: string
  is_late: number
  /** Joined so lateness and the policy are read from the assignment, not the client. */
  due_at: string
  late_policy: LatePolicy
}

/*
  An attempt is only reachable through an active enrolment on a published
  assignment, which is the same gate the brief sits behind. The attempt's own
  student is pinned to the session id here, so an id belonging to another
  student answers null.
*/
const SELECT_ATTEMPT = `
  SELECT s.id, s.assignment_id, s.attempt_number, s.status, s.answer_text,
         s.created_at, s.submitted_at, s.is_late, a.due_at, a.late_policy
  FROM assignment_submissions s
  JOIN assignments a ON a.id = s.assignment_id
  JOIN courses c ON c.id = a.course_id
  JOIN course_enrolments e ON e.course_id = c.id AND e.student_id = ?1 AND e.status = 'ACTIVE'
  WHERE s.student_user_id = ?1 AND a.published_at IS NOT NULL`

function attemptDto(row: AttemptRow): StudentAttemptDTO {
  const submitted = row.status === 'SUBMITTED'
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    attemptNumber: row.attempt_number,
    status: submitted ? 'SUBMITTED' : 'IN_PROGRESS',
    text: row.answer_text ?? '',
    startedAt: row.created_at,
    submittedAt: submitted ? row.submitted_at : null,
    isLate: !!row.is_late,
  }
}

async function attemptsFor(db: Db, studentId: string, assignmentId: string): Promise<StudentAttemptDTO[]> {
  const rows = await query<AttemptRow>(db, `${SELECT_ATTEMPT} AND s.assignment_id = ?2 ORDER BY s.attempt_number DESC`, studentId, assignmentId)
  return rows.map(attemptDto)
}

async function attemptRow(db: Db, studentId: string, attemptId: string): Promise<AttemptRow | null> {
  return queryOne<AttemptRow>(db, `${SELECT_ATTEMPT} AND s.id = ?2`, studentId, attemptId)
}

/** The draft the student is working on, if there is one. */
async function openAttempt(db: Db, studentId: string, assignmentId: string): Promise<StudentAttemptDTO | null> {
  const row = await queryOne<AttemptRow>(
    db,
    `${SELECT_ATTEMPT} AND s.assignment_id = ?2 AND s.status = 'IN_PROGRESS'`,
    studentId,
    assignmentId,
  )
  return row ? attemptDto(row) : null
}

export type StartAttemptResult =
  | { status: 'OK'; attempt: StudentAttemptDTO }
  | { status: 'NOT_FOUND' }
  | { status: 'NOT_OPEN' }
  | { status: 'EXHAUSTED' }

/**
 * Start an attempt, or hand back the one already open. Resuming wins over every
 * other check: a student who started inside the window keeps their draft even
 * if the window has closed since.
 *
 * The read-then-insert below is not atomic, so two requests can both pass the
 * draft check. The partial unique index on open attempts is what actually
 * settles that: the loser's insert is refused and it returns the winner's draft
 * rather than a second one.
 */
export async function startAttempt(
  db: Db,
  student: StudentIdentityDTO,
  assignmentId: string,
  now = Date.now(),
): Promise<StartAttemptResult> {
  const assignment = await studentAssignment(db, student.id, assignmentId)
  if (!assignment) return { status: 'NOT_FOUND' }

  const open = assignment.attempts.find((a) => a.status === 'IN_PROGRESS')
  if (open) return { status: 'OK', attempt: open }
  if (assignment.status !== 'OPEN') return { status: 'NOT_OPEN' }

  const submitted = assignment.attempts.filter((a) => a.status === 'SUBMITTED').length
  if (submitted >= assignment.attemptsAllowed) return { status: 'EXHAUSTED' }

  const id = newId('sub')
  const at = new Date(now).toISOString()
  try {
    await execute(
      db,
      `INSERT INTO assignment_submissions
         (id, assignment_id, student_user_id, student_name, attempt_number, status, submitted_at, is_late, answer_text, score, feedback, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?, 0, '', NULL, '', ?, ?)`,
      id,
      assignmentId,
      student.id,
      student.name,
      Math.max(0, ...assignment.attempts.map((a) => a.attemptNumber)) + 1,
      at,
      at,
      at,
    )
  } catch (error) {
    /* A concurrent start got there first; hand back that draft. */
    const raced = await openAttempt(db, student.id, assignmentId)
    if (raced) return { status: 'OK', attempt: raced }
    throw error
  }
  const row = await attemptRow(db, student.id, id)
  return row ? { status: 'OK', attempt: attemptDto(row) } : { status: 'NOT_FOUND' }
}

type AttemptOk = { status: 'OK'; attempt: StudentAttemptDTO }
type AttemptMiss = { status: 'NOT_FOUND' } | { status: 'ALREADY_SUBMITTED' } | { status: 'TOO_LONG' }

/** Saving a draft cannot fail on emptiness or lateness; handing in can. */
export type SaveAttemptResult = AttemptOk | AttemptMiss
export type SubmitAttemptResult = AttemptOk | AttemptMiss | { status: 'EMPTY' } | { status: 'LATE_BLOCKED' }

/** Save the draft in place. A handed-in attempt is final and cannot be edited. */
export async function saveAttempt(db: Db, studentId: string, attemptId: string, text: string): Promise<SaveAttemptResult> {
  const row = await attemptRow(db, studentId, attemptId)
  if (!row) return { status: 'NOT_FOUND' }
  if (row.status !== 'IN_PROGRESS') return { status: 'ALREADY_SUBMITTED' }
  if (text.length > MAX_ANSWER_LENGTH) return { status: 'TOO_LONG' }

  await execute(
    db,
    `UPDATE assignment_submissions SET answer_text = ?1, updated_at = ?2 WHERE id = ?3`,
    text,
    new Date().toISOString(),
    attemptId,
  )
  const updated = await attemptRow(db, studentId, attemptId)
  return updated ? { status: 'OK', attempt: attemptDto(updated) } : { status: 'NOT_FOUND' }
}

/**
 * Hand the attempt in. The submitted time and the lateness flag are written
 * here, from the server clock and the assignment's own due date and policy: the
 * browser cannot claim to be early, and a BLOCK policy refuses rather than
 * storing work the teacher would have to reject.
 */
export async function submitAttempt(db: Db, studentId: string, attemptId: string, text: string, now = Date.now()): Promise<SubmitAttemptResult> {
  const row = await attemptRow(db, studentId, attemptId)
  if (!row) return { status: 'NOT_FOUND' }
  if (row.status !== 'IN_PROGRESS') return { status: 'ALREADY_SUBMITTED' }
  if (!text.trim()) return { status: 'EMPTY' }
  if (text.length > MAX_ANSWER_LENGTH) return { status: 'TOO_LONG' }

  const late = now > Date.parse(row.due_at)
  if (late && row.late_policy === 'BLOCK') return { status: 'LATE_BLOCKED' }

  const at = new Date(now).toISOString()
  await execute(
    db,
    `UPDATE assignment_submissions
     SET answer_text = ?1, status = 'SUBMITTED', submitted_at = ?2, is_late = ?3, updated_at = ?2
     WHERE id = ?4`,
    text,
    at,
    late ? 1 : 0,
    attemptId,
  )
  const updated = await attemptRow(db, studentId, attemptId)
  return updated ? { status: 'OK', attempt: attemptDto(updated) } : { status: 'NOT_FOUND' }
}
