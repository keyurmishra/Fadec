/*
  Assignments, submissions and marking, stored in D1.

  Two state machines live here and they are deliberately separate:

  - An assignment is DRAFT until published, then its window decides whether it
    is SCHEDULED, OPEN or CLOSED. Closing it by hand wins over the window.
  - A submission is PENDING until a mark is saved, DRAFT while that mark is held
    back, and RETURNED once published. Editing a released mark is refused: the
    teacher withdraws it (with a reason, recorded), edits, then publishes again.
    That is the audit-shaped distinction the PRD asks for, not a UI preference.

  Ownership is always the course's instructor, checked in the same query that
  reads or writes the row, so another teacher's assignment answers 404.
*/
import type { LatePolicy } from '../contracts/assessment'
import type {
  AssignmentStatusView,
  SubmissionMarkingStatus,
  TeacherAssignmentDetailDTO,
  TeacherAssignmentSummaryDTO,
  TeacherAssignmentValidationDTO,
  TeacherDeadlineDTO,
  TeacherRecentSubmissionDTO,
  TeacherSubmissionDetailDTO,
  TeacherSubmissionQueueDTO,
  TeacherSubmissionSummaryDTO,
} from '../contracts/teaching'
import { execute, newId, nowIso, query, queryOne, type Db } from './sql'

type AssignmentRow = {
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
  status: string
  published_at: string | null
  created_at: string
  updated_at: string
  enrolled_count: number
  submission_count: number
  pending_count: number
  draft_count: number
  graded_count: number
  late_count: number
}

type SubmissionRow = {
  id: string
  assignment_id: string
  assignment_title: string
  course_id: string
  course_title: string
  student_user_id: string
  student_name: string
  attempt_number: number
  submitted_at: string
  is_late: number
  answer_text: string | null
  file_name: string | null
  score: number | null
  feedback: string
  graded_at: string | null
  published_at: string | null
  updated_at: string
  max_score: number
}

const SELECT_ASSIGNMENT = `
  SELECT a.*, c.title AS course_title,
         (SELECT COUNT(*) FROM course_enrolments e WHERE e.course_id = c.id AND e.status = 'ACTIVE') AS enrolled_count,
         (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id) AS submission_count,
         (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.published_at IS NULL AND s.score IS NULL) AS pending_count,
         (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.published_at IS NULL AND s.score IS NOT NULL) AS draft_count,
         (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.published_at IS NOT NULL) AS graded_count,
         (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.is_late = 1) AS late_count
  FROM assignments a
  JOIN courses c ON c.id = a.course_id`

const SELECT_SUBMISSION = `
  SELECT s.*, a.title AS assignment_title, a.max_score AS max_score,
         a.course_id AS course_id, c.title AS course_title
  FROM assignment_submissions s
  JOIN assignments a ON a.id = s.assignment_id
  JOIN courses c ON c.id = a.course_id`

function viewStatus(row: AssignmentRow, now = Date.now()): AssignmentStatusView {
  if (!row.published_at) return 'DRAFT'
  if (row.status === 'CLOSED') return 'CLOSED'
  if (Date.parse(row.opens_at) > now) return 'SCHEDULED'
  if (Date.parse(row.due_at) < now) return 'CLOSED'
  return 'OPEN'
}

function summary(row: AssignmentRow): TeacherAssignmentSummaryDTO {
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
    submissionCount: row.submission_count,
    pendingCount: row.pending_count,
    draftCount: row.draft_count,
    gradedCount: row.graded_count,
    lateCount: row.late_count,
    enrolledCount: row.enrolled_count,
    updatedAt: row.updated_at,
  }
}

/** What still blocks publication. The checklist and the server agree by construction. */
export function publishValidation(row: Pick<AssignmentRow, 'title' | 'instructions' | 'opens_at' | 'due_at' | 'max_score' | 'attempts_allowed'>): TeacherAssignmentValidationDTO {
  const title = row.title.trim().length >= 2
  const instructions = row.instructions.trim().length >= 20
  const window = Date.parse(row.due_at) > Date.parse(row.opens_at)
  const score = Number.isInteger(row.max_score) && row.max_score >= 1 && row.max_score <= 1000
  const attempts = Number.isInteger(row.attempts_allowed) && row.attempts_allowed >= 1 && row.attempts_allowed <= 10

  const requirements: TeacherAssignmentValidationDTO['requirements'] = [
    { key: 'title', label: 'Assignment title', satisfied: title, detail: title ? undefined : 'Give the assignment a title.' },
    {
      key: 'instructions',
      label: 'Instructions for students',
      satisfied: instructions,
      detail: instructions ? undefined : 'Write at least 20 characters telling students what to submit.',
    },
    { key: 'window', label: 'Due date after the opening date', satisfied: window, detail: window ? undefined : 'Move the due date later than the opening date.' },
    { key: 'score', label: 'Maximum score set', satisfied: score, detail: score ? undefined : 'Set a whole-number maximum score between 1 and 1,000.' },
    { key: 'attempts', label: 'Attempts allowed between 1 and 10', satisfied: attempts, detail: attempts ? undefined : 'Set how many attempts a student gets.' },
  ]
  return { canPublish: requirements.every((r) => r.satisfied), requirements }
}

const markingStatus = (row: SubmissionRow): SubmissionMarkingStatus =>
  row.published_at ? 'RETURNED' : row.score !== null ? 'DRAFT' : 'PENDING'

function submissionSummary(row: SubmissionRow): TeacherSubmissionSummaryDTO {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    assignmentTitle: row.assignment_title,
    courseId: row.course_id,
    courseTitle: row.course_title,
    studentUserId: row.student_user_id,
    studentName: row.student_name,
    attemptNumber: row.attempt_number,
    submittedAt: row.submitted_at,
    isLate: !!row.is_late,
    status: markingStatus(row),
    score: row.score,
    maxScore: row.max_score,
    hasText: !!row.answer_text?.trim(),
    fileName: row.file_name,
    updatedAt: row.updated_at,
  }
}

/* -------------------------------- reading -------------------------------- */

export async function assignmentsForTeacher(db: Db, teacherId: string): Promise<TeacherAssignmentSummaryDTO[]> {
  const rows = await query<AssignmentRow>(db, `${SELECT_ASSIGNMENT} WHERE c.instructor_id = ?1 ORDER BY a.due_at, a.id`, teacherId)
  return rows.map(summary)
}

async function assignmentRow(db: Db, teacherId: string, assignmentId: string): Promise<AssignmentRow | null> {
  return queryOne<AssignmentRow>(db, `${SELECT_ASSIGNMENT} WHERE a.id = ?1 AND c.instructor_id = ?2`, assignmentId, teacherId)
}

async function submissionRows(db: Db, assignmentId: string): Promise<SubmissionRow[]> {
  return query<SubmissionRow>(
    db,
    `${SELECT_SUBMISSION} WHERE s.assignment_id = ?1
     ORDER BY CASE WHEN s.published_at IS NULL THEN 0 ELSE 1 END, s.submitted_at DESC`,
    assignmentId,
  )
}

export async function assignmentDetail(db: Db, teacherId: string, assignmentId: string): Promise<TeacherAssignmentDetailDTO | null> {
  const row = await assignmentRow(db, teacherId, assignmentId)
  if (!row) return null
  const submissions = await submissionRows(db, assignmentId)
  return {
    ...summary(row),
    instructions: row.instructions,
    allowFileUpload: !!row.allow_file_upload,
    createdAt: row.created_at,
    publish: publishValidation(row),
    submissions: submissions.map(submissionSummary),
  }
}

export async function submissionsForTeacher(db: Db, teacherId: string): Promise<TeacherSubmissionQueueDTO> {
  const [rows, assignments] = await Promise.all([
    query<SubmissionRow>(
      db,
      `${SELECT_SUBMISSION} WHERE c.instructor_id = ?1
       ORDER BY CASE WHEN s.published_at IS NULL THEN 0 ELSE 1 END, s.submitted_at DESC`,
      teacherId,
    ),
    query<{ id: string; title: string; course_title: string }>(
      db,
      `SELECT a.id, a.title, c.title AS course_title
       FROM assignments a JOIN courses c ON c.id = a.course_id
       WHERE c.instructor_id = ?1 AND a.published_at IS NOT NULL
       ORDER BY a.due_at DESC`,
      teacherId,
    ),
  ])
  return {
    items: rows.map(submissionSummary),
    assignments: assignments.map((a) => ({ id: a.id, title: a.title, courseTitle: a.course_title })),
  }
}

export async function submissionDetail(db: Db, teacherId: string, submissionId: string): Promise<TeacherSubmissionDetailDTO | null> {
  const row = await queryOne<SubmissionRow>(db, `${SELECT_SUBMISSION} WHERE s.id = ?1 AND c.instructor_id = ?2`, submissionId, teacherId)
  if (!row) return null

  const revisions = await query<{ at: string; action: TeacherSubmissionDetailDTO['revisions'][number]['action']; previous_score: number | null; new_score: number | null; reason: string | null }>(
    db,
    `SELECT at, action, previous_score, new_score, reason FROM submission_revisions WHERE submission_id = ?1 ORDER BY at DESC, id DESC`,
    submissionId,
  )

  return {
    ...submissionSummary(row),
    answerText: row.answer_text,
    feedback: row.feedback,
    gradedAt: row.graded_at,
    publishedAt: row.published_at,
    revisions: revisions.map((r) => ({ at: r.at, action: r.action, previousScore: r.previous_score, newScore: r.new_score, reason: r.reason })),
  }
}

/* ------------------------------- assignments ----------------------------- */

type AssignmentFields = {
  title: string
  instructions: string
  opensAt: string
  dueAt: string
  latePolicy: LatePolicy
  attemptsAllowed: number
  maxScore: number
  allowFileUpload: boolean
}

/** The course is chosen once, at creation; an assignment never moves course. */
export type AssignmentInput = AssignmentFields & { courseId: string }

export async function createAssignment(db: Db, teacherId: string, input: AssignmentInput): Promise<TeacherAssignmentDetailDTO | null> {
  const course = await queryOne<{ id: string }>(db, `SELECT id FROM courses WHERE id = ?1 AND instructor_id = ?2`, input.courseId, teacherId)
  if (!course) return null

  const id = newId('asg')
  const now = nowIso()
  await execute(
    db,
    `INSERT INTO assignments (id, course_id, title, instructions, opens_at, due_at, late_policy, attempts_allowed, max_score, allow_file_upload, status, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?)`,
    id,
    input.courseId,
    input.title,
    input.instructions,
    input.opensAt,
    input.dueAt,
    input.latePolicy,
    input.attemptsAllowed,
    input.maxScore,
    input.allowFileUpload ? 1 : 0,
    now,
    now,
  )
  return assignmentDetail(db, teacherId, id)
}

export type AssignmentPatch = Partial<AssignmentFields>

export async function updateAssignment(db: Db, teacherId: string, assignmentId: string, patch: AssignmentPatch): Promise<TeacherAssignmentDetailDTO | null> {
  if (!(await assignmentRow(db, teacherId, assignmentId))) return null

  const sets: string[] = []
  const params: unknown[] = []
  const push = (column: string, value: unknown) => {
    sets.push(`${column} = ?${params.length + 1}`)
    params.push(value)
  }

  if (patch.title !== undefined) push('title', patch.title)
  if (patch.instructions !== undefined) push('instructions', patch.instructions)
  if (patch.opensAt !== undefined) push('opens_at', patch.opensAt)
  if (patch.dueAt !== undefined) push('due_at', patch.dueAt)
  if (patch.latePolicy !== undefined) push('late_policy', patch.latePolicy)
  if (patch.attemptsAllowed !== undefined) push('attempts_allowed', patch.attemptsAllowed)
  if (patch.maxScore !== undefined) push('max_score', patch.maxScore)
  if (patch.allowFileUpload !== undefined) push('allow_file_upload', patch.allowFileUpload ? 1 : 0)
  if (!sets.length) return assignmentDetail(db, teacherId, assignmentId)

  push('updated_at', nowIso())
  await execute(db, `UPDATE assignments SET ${sets.join(', ')} WHERE id = ?${params.length + 1}`, ...params, assignmentId)
  return assignmentDetail(db, teacherId, assignmentId)
}

export async function setAssignmentPublished(db: Db, teacherId: string, assignmentId: string, published: boolean): Promise<TeacherAssignmentDetailDTO | null> {
  const row = await assignmentRow(db, teacherId, assignmentId)
  if (!row) return null
  if (published && !publishValidation(row).canPublish) return null

  const now = nowIso()
  await execute(
    db,
    `UPDATE assignments SET published_at = ?1, status = 'OPEN', updated_at = ?1 WHERE id = ?2`,
    published ? now : null,
    assignmentId,
  )
  return assignmentDetail(db, teacherId, assignmentId)
}

/** Close or re-open submissions. Closing keeps the assignment published. */
export async function setAssignmentClosed(db: Db, teacherId: string, assignmentId: string, closed: boolean): Promise<TeacherAssignmentDetailDTO | null> {
  const row = await assignmentRow(db, teacherId, assignmentId)
  if (!row) return null
  await execute(db, `UPDATE assignments SET status = ?1, updated_at = ?2 WHERE id = ?3`, closed ? 'CLOSED' : 'OPEN', nowIso(), assignmentId)
  return assignmentDetail(db, teacherId, assignmentId)
}

/* -------------------------------- marking -------------------------------- */

type GradeInput = { score: number | null; feedback: string }

async function ownedSubmission(db: Db, teacherId: string, submissionId: string): Promise<SubmissionRow | null> {
  return queryOne<SubmissionRow>(db, `${SELECT_SUBMISSION} WHERE s.id = ?1 AND c.instructor_id = ?2`, submissionId, teacherId)
}

async function recordRevision(
  db: Db,
  submissionId: string,
  actorId: string,
  action: 'DRAFT_SAVED' | 'PUBLISHED' | 'WITHDRAWN',
  previousScore: number | null,
  newScore: number | null,
  reason: string | null,
) {
  await execute(
    db,
    `INSERT INTO submission_revisions (id, submission_id, actor_id, at, action, previous_score, new_score, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    newId('rev'),
    submissionId,
    actorId,
    nowIso(),
    action,
    previousScore,
    newScore,
    reason,
  )
}

/** Save a draft mark. A released mark must be withdrawn before it can change. */
export async function saveGrade(db: Db, teacherId: string, submissionId: string, input: GradeInput): Promise<TeacherSubmissionDetailDTO | null> {
  const row = await ownedSubmission(db, teacherId, submissionId)
  if (!row) return null
  if (row.published_at) return null

  const now = nowIso()
  await execute(
    db,
    `UPDATE assignment_submissions
     SET score = ?1, feedback = ?2, graded_by = ?3, graded_at = ?4, updated_at = ?4
     WHERE id = ?5`,
    input.score,
    input.feedback,
    teacherId,
    now,
    submissionId,
  )
  if (input.score !== row.score) {
    await recordRevision(db, submissionId, teacherId, 'DRAFT_SAVED', row.score, input.score, null)
  }
  return submissionDetail(db, teacherId, submissionId)
}

/** Release the saved mark to the student. Requires a score. */
export async function publishGrade(db: Db, teacherId: string, submissionId: string): Promise<TeacherSubmissionDetailDTO | null> {
  const row = await ownedSubmission(db, teacherId, submissionId)
  if (!row || row.score === null || row.published_at) return null

  const now = nowIso()
  await execute(db, `UPDATE assignment_submissions SET published_at = ?1, updated_at = ?1 WHERE id = ?2`, now, submissionId)
  await recordRevision(db, submissionId, teacherId, 'PUBLISHED', row.score, row.score, null)
  return submissionDetail(db, teacherId, submissionId)
}

/** Take a released mark back so it can be corrected. The reason is required and kept. */
export async function withdrawGrade(db: Db, teacherId: string, submissionId: string, reason: string): Promise<TeacherSubmissionDetailDTO | null> {
  const row = await ownedSubmission(db, teacherId, submissionId)
  if (!row || !row.published_at) return null

  const now = nowIso()
  await execute(db, `UPDATE assignment_submissions SET published_at = NULL, updated_at = ?1 WHERE id = ?2`, now, submissionId)
  await recordRevision(db, submissionId, teacherId, 'WITHDRAWN', row.score, row.score, reason)
  return submissionDetail(db, teacherId, submissionId)
}

/* ------------------------------- dashboard ------------------------------- */

export type AssessmentDigest = {
  upcomingDeadlines: TeacherDeadlineDTO[]
  recentSubmissions: TeacherRecentSubmissionDTO[]
  pendingEvaluations: number
  latePending: number
}

/** The assignment half of the overview, read from the same rows the queue shows. */
export async function assessmentDigest(db: Db, teacherId: string): Promise<AssessmentDigest> {
  const now = nowIso()

  const [deadlines, recent, counts] = await Promise.all([
    query<{ id: string; title: string; course_id: string; course_title: string; due_at: string; enrolled_count: number; submitted: number }>(
      db,
      `SELECT a.id, a.title, a.course_id, c.title AS course_title, a.due_at,
              (SELECT COUNT(*) FROM course_enrolments e WHERE e.course_id = c.id AND e.status = 'ACTIVE') AS enrolled_count,
              (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id) AS submitted
       FROM assignments a JOIN courses c ON c.id = a.course_id
       WHERE c.instructor_id = ?1 AND a.published_at IS NOT NULL AND a.status = 'OPEN' AND a.due_at >= ?2
       ORDER BY a.due_at LIMIT 3`,
      teacherId,
      now,
    ),
    query<SubmissionRow>(db, `${SELECT_SUBMISSION} WHERE c.instructor_id = ?1 ORDER BY s.submitted_at DESC LIMIT 5`, teacherId),
    queryOne<{ pending: number; late: number }>(
      db,
      `SELECT COUNT(*) AS pending, SUM(CASE WHEN s.is_late = 1 THEN 1 ELSE 0 END) AS late
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       JOIN courses c ON c.id = a.course_id
       WHERE c.instructor_id = ?1 AND s.published_at IS NULL AND s.score IS NULL`,
      teacherId,
    ),
  ])

  return {
    upcomingDeadlines: deadlines.map((row) => ({
      assignmentId: row.id,
      title: row.title,
      courseId: row.course_id,
      courseTitle: row.course_title,
      dueAt: row.due_at,
      submitted: row.submitted,
      notSubmitted: Math.max(0, row.enrolled_count - row.submitted),
    })),
    recentSubmissions: recent.map((row) => ({
      submissionId: row.id,
      assignmentId: row.assignment_id,
      assignmentTitle: row.assignment_title,
      courseTitle: row.course_title,
      studentUserId: row.student_user_id,
      studentName: row.student_name,
      submittedAt: row.submitted_at,
      isLate: !!row.is_late,
      score: row.score,
      maxScore: row.max_score,
    })),
    pendingEvaluations: counts?.pending ?? 0,
    latePending: counts?.late ?? 0,
  }
}
