/*
  Quizzes as a student sees and takes them.

  Scope is the student's own active enrolment on a published quiz, joined in the
  same query that reads the row, so another course's quiz or someone else's
  attempt answers 404 without confirming it exists.

  The clock is the server's. Starting an attempt fixes expires_at (start plus
  duration, cut short by the closing time); saving after it is refused, and any
  read after it hands the attempt in with whatever was saved. The countdown on
  screen is a display of that one number.

  An attempt delivers a snapshot without the key. The score and the correct
  options reach the browser only once the attempt is fully marked and the
  release rule allows it, so nothing the student may not see yet is ever sent.
*/
import type {
  QuizQuestionAuthoringDTO,
  StudentQuizAnswerValue,
  StudentQuizAttemptDTO,
  StudentQuizDetailDTO,
  StudentQuizSaveAnswerResultDTO,
  StudentQuizStatus,
  StudentQuizSummaryDTO,
} from '../contracts/quizzes'
import type { StudentIdentityDTO } from '../contracts/learning'
import { execute, newId, query, queryOne, type Db } from './sql'
import {
  answersFor,
  answerValue,
  finaliseAttempt,
  MAX_SHORT_ANSWER_LENGTH,
  QUIZ_TOTALS,
  questionsFor,
  quizStatus,
  snapshotOf,
  sweepExpired,
  type AnswerRow,
  type AttemptRow,
  type QuizRow,
} from './quizzes'

type StudentQuizRow = QuizRow & { attempts_used: number; open_count: number }

const SELECT_QUIZ = `
  SELECT z.*, c.title AS course_title, ${QUIZ_TOTALS},
         (SELECT COUNT(*) FROM quiz_attempts t WHERE t.quiz_id = z.id AND t.student_id = ?1 AND t.status = 'SUBMITTED') AS attempts_used,
         (SELECT COUNT(*) FROM quiz_attempts t WHERE t.quiz_id = z.id AND t.student_id = ?1 AND t.status = 'IN_PROGRESS') AS open_count
  FROM quizzes z
  JOIN courses c ON c.id = z.course_id
  JOIN course_enrolments e ON e.course_id = c.id AND e.student_id = ?1 AND e.status = 'ACTIVE'
  WHERE z.published_at IS NOT NULL`

/* A student never sees DRAFT: the query above has already removed it. */
const studentStatus = (row: StudentQuizRow): StudentQuizStatus => quizStatus(row) as StudentQuizStatus

function summary(row: StudentQuizRow): StudentQuizSummaryDTO {
  return {
    id: row.id,
    courseId: row.course_id,
    courseTitle: row.course_title,
    title: row.title,
    status: studentStatus(row),
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    durationMinutes: row.duration_minutes,
    attemptsAllowed: row.attempts_allowed,
    passPercent: row.pass_percent,
    releasePolicy: row.release_policy,
    questionCount: row.question_count,
    maxScore: row.max_score,
    attemptsUsed: row.attempts_used,
    hasOpenAttempt: row.open_count > 0,
  }
}

/** Open first, then upcoming, then closed; soonest closing first within each. */
export async function quizzesForStudent(db: Db, studentId: string): Promise<StudentQuizSummaryDTO[]> {
  await sweepExpired(db, { studentId })
  const rows = await query<StudentQuizRow>(db, `${SELECT_QUIZ} ORDER BY z.closes_at, z.id`, studentId)
  return rows.map(summary)
}

async function quizRow(db: Db, studentId: string, quizId: string): Promise<StudentQuizRow | null> {
  return queryOne<StudentQuizRow>(db, `${SELECT_QUIZ} AND z.id = ?2`, studentId, quizId)
}

/* -------------------------------- attempts ------------------------------- */

/** The question as delivered: the key and the marking guide are dropped here. */
const delivered = (q: QuizQuestionAuthoringDTO) => ({ id: q.id, type: q.type, prompt: q.prompt, points: q.points, options: q.options })

function attemptDto(row: AttemptRow, answers: AnswerRow[], quiz: Pick<StudentQuizRow, 'release_policy' | 'pass_percent' | 'published_at' | 'status' | 'opens_at' | 'closes_at'>): StudentQuizAttemptDTO {
  const questions = snapshotOf(row)
  const values: Record<string, StudentQuizAnswerValue> = {}
  for (const answer of answers) {
    const value = answerValue(answer)
    if (value) values[answer.question_id] = value
  }

  const submitted = row.status === 'SUBMITTED'
  const resultPending: StudentQuizAttemptDTO['resultPending'] = !submitted
    ? null
    : row.needs_marking > 0
      ? 'MARKING'
      : quiz.release_policy === 'AFTER_CLOSE' && quizStatus(quiz) !== 'CLOSED'
        ? 'AFTER_CLOSE'
        : null

  const released = submitted && resultPending === null && row.score !== null
  const score = row.score ?? 0
  const percent = row.max_score > 0 ? Math.round((score / row.max_score) * 100) : 0

  return {
    id: row.id,
    quizId: row.quiz_id,
    attemptNumber: row.attempt_number,
    status: submitted ? 'SUBMITTED' : 'IN_PROGRESS',
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    submittedAt: row.submitted_at,
    autoSubmitted: !!row.auto_submitted,
    questions: questions.map(delivered),
    answers: values,
    resultPending,
    result: released
      ? {
          score,
          maxScore: row.max_score,
          percent,
          passed: row.max_score > 0 && (score / row.max_score) * 100 >= quiz.pass_percent,
          questions: questions.map((q) => {
            const answer = answers.find((a) => a.question_id === q.id)
            return {
              questionId: q.id,
              awardedPoints: answer?.awarded_points ?? 0,
              isCorrect: answer?.is_correct === null || answer?.is_correct === undefined ? null : !!answer.is_correct,
              correctOptionIds: q.correctOptionIds,
              comment: answer?.comment ?? '',
            }
          }),
        }
      : null,
  }
}

const SELECT_ATTEMPT = `
  SELECT t.* FROM quiz_attempts t
  JOIN quizzes z ON z.id = t.quiz_id
  JOIN course_enrolments e ON e.course_id = z.course_id AND e.student_id = ?1 AND e.status = 'ACTIVE'
  WHERE t.student_id = ?1 AND z.published_at IS NOT NULL`

async function attemptsFor(db: Db, studentId: string, quiz: StudentQuizRow): Promise<StudentQuizAttemptDTO[]> {
  const rows = await query<AttemptRow>(db, `${SELECT_ATTEMPT} AND t.quiz_id = ?2 ORDER BY t.attempt_number DESC`, studentId, quiz.id)
  return Promise.all(rows.map(async (row) => attemptDto(row, await answersFor(db, row.id), quiz)))
}

export async function studentQuiz(db: Db, studentId: string, quizId: string): Promise<StudentQuizDetailDTO | null> {
  if (!(await quizRow(db, studentId, quizId))) return null
  await sweepExpired(db, { studentId, quizId })
  const row = await quizRow(db, studentId, quizId)
  if (!row) return null
  return { ...summary(row), instructions: row.instructions, attempts: await attemptsFor(db, studentId, row) }
}

/** An attempt the session's student owns, with its quiz, after any overdue hand-in. */
async function ownedAttempt(db: Db, studentId: string, attemptId: string, now = Date.now()) {
  const first = await queryOne<AttemptRow>(db, `${SELECT_ATTEMPT} AND t.id = ?2`, studentId, attemptId)
  if (!first) return null
  if (first.status === 'IN_PROGRESS' && Date.parse(first.expires_at) <= now) await finaliseAttempt(db, first, true, now)
  const row = (await queryOne<AttemptRow>(db, `${SELECT_ATTEMPT} AND t.id = ?2`, studentId, attemptId)) ?? first
  const quiz = await quizRow(db, studentId, row.quiz_id)
  return quiz ? { row, quiz } : null
}

export async function studentAttempt(db: Db, studentId: string, attemptId: string): Promise<StudentQuizAttemptDTO | null> {
  const owned = await ownedAttempt(db, studentId, attemptId)
  if (!owned) return null
  return attemptDto(owned.row, await answersFor(db, attemptId), owned.quiz)
}

export type StartQuizResult =
  | { status: 'OK'; attempt: StudentQuizAttemptDTO }
  | { status: 'NOT_FOUND' }
  | { status: 'NOT_OPEN' }
  | { status: 'EXHAUSTED' }
  | { status: 'EMPTY' }

function shuffled<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Start an attempt or resume the open one. Resuming wins over every other
 * check, as with assignments. The partial unique index on open attempts settles
 * a race between two tabs: the losing insert fails and gets the winner's.
 */
export async function startQuizAttempt(db: Db, student: StudentIdentityDTO, quizId: string, now = Date.now()): Promise<StartQuizResult> {
  const quiz = await studentQuiz(db, student.id, quizId)
  if (!quiz) return { status: 'NOT_FOUND' }

  const open = quiz.attempts.find((a) => a.status === 'IN_PROGRESS')
  if (open) return { status: 'OK', attempt: open }
  if (quiz.status !== 'OPEN') return { status: 'NOT_OPEN' }
  if (quiz.attemptsUsed >= quiz.attemptsAllowed) return { status: 'EXHAUSTED' }

  const row = await quizRow(db, student.id, quizId)
  if (!row) return { status: 'NOT_FOUND' }
  const live = await questionsFor(db, quizId)
  if (!live.length) return { status: 'EMPTY' }
  const questions = row.shuffle_questions ? shuffled(live) : live

  const id = newId('qat')
  const startedAt = new Date(now).toISOString()
  const expiresAt = new Date(Math.min(now + row.duration_minutes * 60_000, Date.parse(row.closes_at))).toISOString()
  try {
    await execute(
      db,
      `INSERT INTO quiz_attempts (id, quiz_id, student_id, student_name, attempt_number, status, started_at, expires_at, submitted_at, auto_submitted, snapshot_json, score, max_score, needs_marking, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?, ?, NULL, 0, ?, NULL, ?, 0, ?, ?)`,
      id,
      quizId,
      student.id,
      student.name,
      Math.max(0, ...quiz.attempts.map((a) => a.attemptNumber)) + 1,
      startedAt,
      expiresAt,
      JSON.stringify(questions),
      questions.reduce((n, q) => n + q.points, 0),
      startedAt,
      startedAt,
    )
  } catch (error) {
    const raced = await queryOne<AttemptRow>(db, `${SELECT_ATTEMPT} AND t.quiz_id = ?2 AND t.status = 'IN_PROGRESS'`, student.id, quizId)
    if (raced) return { status: 'OK', attempt: attemptDto(raced, await answersFor(db, raced.id), row) }
    throw error
  }
  const attempt = await studentAttempt(db, student.id, id)
  return attempt ? { status: 'OK', attempt } : { status: 'NOT_FOUND' }
}

export type SaveAnswerResult =
  | { status: 'OK'; saved: StudentQuizSaveAnswerResultDTO }
  | { status: 'NOT_FOUND' }
  | { status: 'CLOSED' }
  | { status: 'INVALID'; error: string }

/**
 * Autosave one answer. The value is checked against the attempt's own snapshot:
 * option ids must belong to the question, single-answer questions take one, and
 * a blank answer deletes the row rather than storing an empty one.
 */
export async function saveQuizAnswer(db: Db, studentId: string, attemptId: string, questionId: string, value: unknown, now = Date.now()): Promise<SaveAnswerResult> {
  const owned = await ownedAttempt(db, studentId, attemptId, now)
  if (!owned) return { status: 'NOT_FOUND' }
  if (owned.row.status !== 'IN_PROGRESS') return { status: 'CLOSED' }

  const question = snapshotOf(owned.row).find((q) => q.id === questionId)
  if (!question) return { status: 'NOT_FOUND' }

  let stored: StudentQuizAnswerValue | null
  const body = value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  if (question.type === 'SHORT_ANSWER') {
    if (!body || typeof body.text !== 'string') return { status: 'INVALID', error: 'Send the answer as text.' }
    if (body.text.length > MAX_SHORT_ANSWER_LENGTH) return { status: 'INVALID', error: `Keep the answer under ${MAX_SHORT_ANSWER_LENGTH.toLocaleString('en-GB')} characters.` }
    stored = body.text.trim() ? { text: body.text } : null
  } else {
    if (!body || !Array.isArray(body.optionIds) || body.optionIds.some((id) => typeof id !== 'string')) return { status: 'INVALID', error: 'Choose from the options given.' }
    const ids = [...new Set(body.optionIds as string[])]
    if (ids.some((id) => !question.options.some((o) => o.id === id))) return { status: 'INVALID', error: 'Choose from the options given.' }
    if (question.type !== 'MULTIPLE_CHOICE' && ids.length > 1) return { status: 'INVALID', error: 'This question takes one answer.' }
    stored = ids.length ? { optionIds: ids } : null
  }

  const at = new Date(now).toISOString()
  if (stored) {
    await execute(
      db,
      `INSERT INTO quiz_answers (attempt_id, question_id, value_json, comment, saved_at) VALUES (?1, ?2, ?3, '', ?4)
       ON CONFLICT(attempt_id, question_id) DO UPDATE SET value_json = ?3, saved_at = ?4`,
      attemptId,
      questionId,
      JSON.stringify(stored),
      at,
    )
  } else {
    await execute(db, `DELETE FROM quiz_answers WHERE attempt_id = ?1 AND question_id = ?2`, attemptId, questionId)
  }
  await execute(db, `UPDATE quiz_attempts SET updated_at = ?1 WHERE id = ?2`, at, attemptId)
  return { status: 'OK', saved: { questionId, savedAt: at } }
}

export type SubmitQuizResult = { status: 'OK'; attempt: StudentQuizAttemptDTO } | { status: 'NOT_FOUND' } | { status: 'ALREADY_SUBMITTED' }

/**
 * Hand in. A submit that arrives after the deadline is not an error: the server
 * has already handed the attempt in with what was saved, and that attempt is
 * what comes back, flagged as auto-submitted.
 */
export async function submitQuizAttempt(db: Db, studentId: string, attemptId: string, now = Date.now()): Promise<SubmitQuizResult> {
  const first = await queryOne<AttemptRow>(db, `${SELECT_ATTEMPT} AND t.id = ?2`, studentId, attemptId)
  if (!first) return { status: 'NOT_FOUND' }
  if (first.status === 'SUBMITTED') return { status: 'ALREADY_SUBMITTED' }
  await finaliseAttempt(db, first, Date.parse(first.expires_at) <= now, now)
  const attempt = await studentAttempt(db, studentId, attemptId)
  return attempt ? { status: 'OK', attempt } : { status: 'NOT_FOUND' }
}
