/*
  Quizzes in the teaching studio: building them, publishing them, and reading
  and marking the attempts students hand in.

  - A quiz is DRAFT until published; then its window decides SCHEDULED, OPEN or
    CLOSED, and a manual close wins over the window, as with assignments.
  - Questions change only while the quiz is a draft. Once students can see it
    the question set is fixed, and unpublishing is refused once anyone has
    started, so a draft can never hide work already done against it.
  - Objective questions are scored on submit from the attempt's own snapshot.
    Short answers wait for a teacher; until every one is marked the attempt is
    TO_MARK and the student is not shown a score.

  Ownership is the course's instructor, checked in the query that reads the
  row, so another teacher's quiz or attempt answers 404.
*/
import type {
  QuizAttemptMarkingStatus,
  QuizOptionDTO,
  QuizQuestionAuthoringDTO,
  QuizQuestionInput,
  QuizQuestionType,
  QuizReleasePolicy,
  QuizStatusView,
  QuizValidationDTO,
  StudentQuizAnswerValue,
  TeacherQuizAnswerDTO,
  TeacherQuizAttemptDetailDTO,
  TeacherQuizAttemptSummaryDTO,
  TeacherQuizDetailDTO,
  TeacherQuizSummaryDTO,
} from '../contracts/quizzes'
import { execute, newId, nowIso, query, queryOne, type Db } from './sql'

export const QUESTION_TYPES: QuizQuestionType[] = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER']
export const RELEASE_POLICIES: QuizReleasePolicy[] = ['IMMEDIATE', 'AFTER_CLOSE']

/** The two fixed options every true/false question has. */
export const TRUE_FALSE_OPTIONS: QuizOptionDTO[] = [
  { id: 'true', text: 'True' },
  { id: 'false', text: 'False' },
]

export const MAX_SHORT_ANSWER_LENGTH = 5000

/* --------------------------------- rows ---------------------------------- */

export type QuizRow = {
  id: string
  course_id: string
  course_title: string
  title: string
  instructions: string
  opens_at: string
  closes_at: string
  duration_minutes: number
  attempts_allowed: number
  pass_percent: number
  release_policy: QuizReleasePolicy
  shuffle_questions: number
  status: string
  published_at: string | null
  created_at: string
  updated_at: string
  question_count: number
  max_score: number
}

type TeacherQuizRow = QuizRow & {
  enrolled_count: number
  attempt_count: number
  student_count: number
  to_mark_count: number
  average_percent: number | null
}

type QuestionRow = {
  id: string
  quiz_id: string
  position: number
  type: QuizQuestionType
  prompt: string
  points: number
  options_json: string
  correct_json: string
  model_answer: string
}

export type AttemptRow = {
  id: string
  quiz_id: string
  student_id: string
  student_name: string
  attempt_number: number
  status: 'IN_PROGRESS' | 'SUBMITTED'
  started_at: string
  expires_at: string
  submitted_at: string | null
  auto_submitted: number
  snapshot_json: string
  score: number | null
  max_score: number
  needs_marking: number
}

export type AnswerRow = {
  attempt_id: string
  question_id: string
  value_json: string
  awarded_points: number | null
  is_correct: number | null
  comment: string
}

/** Shared by the studio and the portal: question totals come from the live question rows. */
export const QUIZ_TOTALS = `
  (SELECT COUNT(*) FROM quiz_questions q WHERE q.quiz_id = z.id) AS question_count,
  (SELECT COALESCE(SUM(q.points), 0) FROM quiz_questions q WHERE q.quiz_id = z.id) AS max_score`

const SELECT_QUIZ = `
  SELECT z.*, c.title AS course_title, ${QUIZ_TOTALS},
         (SELECT COUNT(*) FROM course_enrolments e WHERE e.course_id = c.id AND e.status = 'ACTIVE') AS enrolled_count,
         (SELECT COUNT(*) FROM quiz_attempts t WHERE t.quiz_id = z.id AND t.status = 'SUBMITTED') AS attempt_count,
         (SELECT COUNT(DISTINCT t.student_id) FROM quiz_attempts t WHERE t.quiz_id = z.id AND t.status = 'SUBMITTED') AS student_count,
         (SELECT COUNT(*) FROM quiz_attempts t WHERE t.quiz_id = z.id AND t.status = 'SUBMITTED' AND t.needs_marking > 0) AS to_mark_count,
         (SELECT AVG(t.score * 100.0 / t.max_score) FROM quiz_attempts t
            WHERE t.quiz_id = z.id AND t.status = 'SUBMITTED' AND t.needs_marking = 0 AND t.max_score > 0) AS average_percent
  FROM quizzes z
  JOIN courses c ON c.id = z.course_id`

/* -------------------------------- helpers -------------------------------- */

export function quizStatus(row: Pick<QuizRow, 'published_at' | 'status' | 'opens_at' | 'closes_at'>, now = Date.now()): QuizStatusView {
  if (!row.published_at) return 'DRAFT'
  if (row.status === 'CLOSED') return 'CLOSED'
  if (Date.parse(row.opens_at) > now) return 'SCHEDULED'
  if (Date.parse(row.closes_at) <= now) return 'CLOSED'
  return 'OPEN'
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function questionDto(row: QuestionRow): QuizQuestionAuthoringDTO {
  return {
    id: row.id,
    position: row.position,
    type: row.type,
    prompt: row.prompt,
    points: row.points,
    options: parseJson<QuizOptionDTO[]>(row.options_json, []),
    correctOptionIds: parseJson<string[]>(row.correct_json, []),
    modelAnswer: row.model_answer,
  }
}

export async function questionsFor(db: Db, quizId: string): Promise<QuizQuestionAuthoringDTO[]> {
  const rows = await query<QuestionRow>(db, `SELECT * FROM quiz_questions WHERE quiz_id = ?1 ORDER BY position, id`, quizId)
  return rows.map(questionDto)
}

export const snapshotOf = (attempt: Pick<AttemptRow, 'snapshot_json'>) => parseJson<QuizQuestionAuthoringDTO[]>(attempt.snapshot_json, [])

export const answerValue = (row: Pick<AnswerRow, 'value_json'>) => parseJson<StudentQuizAnswerValue | null>(row.value_json, null)

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id))

/**
 * Score one answer against the frozen question. Choice questions are all or
 * nothing: a multiple-choice answer earns its points only when the selection is
 * exactly the key. A written short answer returns null, which means "a teacher
 * has to decide"; a blank one is simply wrong and needs nobody.
 */
export function autoScore(question: QuizQuestionAuthoringDTO, value: StudentQuizAnswerValue | null): { points: number; correct: boolean } | null {
  if (question.type === 'SHORT_ANSWER') {
    const text = value && 'text' in value ? value.text.trim() : ''
    return text ? null : { points: 0, correct: false }
  }
  const chosen = value && 'optionIds' in value ? value.optionIds : []
  const correct = chosen.length > 0 && sameSet(chosen, question.correctOptionIds)
  return { points: correct ? question.points : 0, correct }
}

/** Points and outstanding marking for an attempt, from its snapshot and answer rows. */
export function tally(questions: QuizQuestionAuthoringDTO[], answers: AnswerRow[]): { score: number; needsMarking: number } {
  let score = 0
  let needsMarking = 0
  for (const question of questions) {
    const answer = answers.find((a) => a.question_id === question.id)
    if (answer && answer.awarded_points !== null) {
      score += answer.awarded_points
      continue
    }
    const auto = autoScore(question, answer ? answerValue(answer) : null)
    if (auto) score += auto.points
    else needsMarking += 1
  }
  return { score, needsMarking }
}

export const answersFor = (db: Db, attemptId: string) => query<AnswerRow>(db, `SELECT * FROM quiz_answers WHERE attempt_id = ?1`, attemptId)

/**
 * Close an attempt: score every objective answer onto its row, record the
 * total, and leave short answers unmarked. `auto` marks an attempt the server
 * closed at its deadline. The status guard in the UPDATE makes a double submit
 * (two tabs, or a sweep racing the student's own submit) a no-op.
 */
export async function finaliseAttempt(db: Db, attempt: AttemptRow, auto: boolean, now = Date.now()): Promise<void> {
  const questions = snapshotOf(attempt)
  const answers = await answersFor(db, attempt.id)
  const at = new Date(now).toISOString()
  const submittedAt = auto ? attempt.expires_at : at

  const changed = await execute(
    db,
    `UPDATE quiz_attempts SET status = 'SUBMITTED', submitted_at = ?1, auto_submitted = ?2, updated_at = ?3 WHERE id = ?4 AND status = 'IN_PROGRESS'`,
    submittedAt,
    auto ? 1 : 0,
    at,
    attempt.id,
  )
  if (!changed) return

  const writes = questions.flatMap((question) => {
    const answer = answers.find((a) => a.question_id === question.id)
    const result = autoScore(question, answer ? answerValue(answer) : null)
    if (!result) return []
    if (answer) {
      return [
        db
          .prepare(`UPDATE quiz_answers SET awarded_points = ?1, is_correct = ?2 WHERE attempt_id = ?3 AND question_id = ?4`)
          .bind(result.points, result.correct ? 1 : 0, attempt.id, question.id),
      ]
    }
    return [
      db
        .prepare(`INSERT INTO quiz_answers (attempt_id, question_id, value_json, awarded_points, is_correct, comment, saved_at) VALUES (?1, ?2, 'null', ?3, ?4, '', ?5)`)
        .bind(attempt.id, question.id, result.points, result.correct ? 1 : 0, at),
    ]
  })
  if (writes.length) await db.batch(writes)

  const { score, needsMarking } = tally(questions, await answersFor(db, attempt.id))
  await execute(db, `UPDATE quiz_attempts SET score = ?1, needs_marking = ?2 WHERE id = ?3`, score, needsMarking, attempt.id)
}

/**
 * Hand in every open attempt whose deadline has passed. There is no scheduler,
 * so this runs lazily before any read that would show the attempt; the result
 * is the same as if a timer had fired at expires_at.
 */
export async function sweepExpired(db: Db, scope: { quizId?: string; studentId?: string }, now = Date.now()): Promise<void> {
  const at = new Date(now).toISOString()
  const filters = [`status = 'IN_PROGRESS'`, `expires_at <= ?1`]
  const params: unknown[] = [at]
  if (scope.quizId) {
    params.push(scope.quizId)
    filters.push(`quiz_id = ?${params.length}`)
  }
  if (scope.studentId) {
    params.push(scope.studentId)
    filters.push(`student_id = ?${params.length}`)
  }
  const expired = await query<AttemptRow>(db, `SELECT * FROM quiz_attempts WHERE ${filters.join(' AND ')}`, ...params)
  for (const attempt of expired) await finaliseAttempt(db, attempt, true, now)
}

/* ------------------------------- validation ------------------------------ */

export function publishValidation(row: Pick<QuizRow, 'title' | 'opens_at' | 'closes_at' | 'duration_minutes' | 'attempts_allowed' | 'pass_percent'>, questions: QuizQuestionAuthoringDTO[]): QuizValidationDTO {
  const title = row.title.trim().length >= 2
  const window = Date.parse(row.closes_at) > Date.parse(row.opens_at)
  const closesLater = Date.parse(row.closes_at) > Date.now()
  const hasQuestions = questions.length > 0
  const keyed = questions.every((q) => q.type === 'SHORT_ANSWER' || q.correctOptionIds.length > 0)
  const rules =
    Number.isInteger(row.duration_minutes) &&
    row.duration_minutes >= 1 &&
    row.duration_minutes <= 600 &&
    Number.isInteger(row.attempts_allowed) &&
    row.attempts_allowed >= 1 &&
    row.attempts_allowed <= 10 &&
    Number.isInteger(row.pass_percent) &&
    row.pass_percent >= 0 &&
    row.pass_percent <= 100

  const requirements: QuizValidationDTO['requirements'] = [
    { key: 'title', label: 'Quiz title', satisfied: title, detail: title ? undefined : 'Give the quiz a title.' },
    { key: 'window', label: 'Closes after it opens', satisfied: window, detail: window ? undefined : 'Move the closing time later than the opening time.' },
    { key: 'future', label: 'Closing time still ahead', satisfied: closesLater, detail: closesLater ? undefined : 'A quiz that has already closed cannot be taken. Move the closing time.' },
    { key: 'questions', label: 'At least one question', satisfied: hasQuestions, detail: hasQuestions ? undefined : 'Add a question below.' },
    { key: 'key', label: 'Every choice question has an answer key', satisfied: keyed, detail: keyed ? undefined : 'Mark the correct option on each choice question.' },
    { key: 'rules', label: 'Duration, attempts and pass mark set', satisfied: rules, detail: rules ? undefined : 'Duration 1–600 minutes, 1–10 attempts, pass mark 0–100%.' },
  ]
  return { canPublish: requirements.every((r) => r.satisfied), requirements }
}

/**
 * Check a question payload and turn it into stored columns. Option ids are
 * generated here, never taken from the client, and true/false always gets the
 * same two fixed options.
 */
export function normaliseQuestion(input: unknown): { ok: true; value: { type: QuizQuestionType; prompt: string; points: number; options: QuizOptionDTO[]; correct: string[]; modelAnswer: string } } | { ok: false; field: string; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, field: 'form', error: 'Send the question as an object.' }
  const body = input as Partial<Record<keyof QuizQuestionInput, unknown>>

  const type = QUESTION_TYPES.find((t) => t === body.type)
  if (!type) return { ok: false, field: 'type', error: 'Choose a question type.' }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (prompt.length < 3 || prompt.length > 2000) return { ok: false, field: 'prompt', error: 'Write a question of 3–2,000 characters.' }

  const points = Number(body.points)
  if (!Number.isInteger(points) || points < 1 || points > 100) return { ok: false, field: 'points', error: 'Give the question 1–100 points.' }

  const modelAnswer = typeof body.modelAnswer === 'string' ? body.modelAnswer.trim() : ''
  if (modelAnswer.length > 2000) return { ok: false, field: 'modelAnswer', error: 'Keep the marking guide under 2,000 characters.' }

  const indexes = Array.isArray(body.correctIndexes) ? body.correctIndexes.map(Number) : []

  if (type === 'SHORT_ANSWER') return { ok: true, value: { type, prompt, points, options: [], correct: [], modelAnswer } }

  if (type === 'TRUE_FALSE') {
    const index = indexes[0]
    if (indexes.length !== 1 || (index !== 0 && index !== 1)) return { ok: false, field: 'correct', error: 'Choose whether the statement is true or false.' }
    return { ok: true, value: { type, prompt, points, options: TRUE_FALSE_OPTIONS, correct: [TRUE_FALSE_OPTIONS[index].id], modelAnswer: '' } }
  }

  const raw = Array.isArray(body.options) ? body.options : []
  const texts = raw.map((o) => (o && typeof o === 'object' && typeof (o as { text?: unknown }).text === 'string' ? (o as { text: string }).text.trim() : ''))
  if (texts.length < 2 || texts.length > 8) return { ok: false, field: 'options', error: 'Give between 2 and 8 options.' }
  if (texts.some((t) => !t || t.length > 500)) return { ok: false, field: 'options', error: 'Every option needs text, under 500 characters.' }
  if (new Set(texts.map((t) => t.toLowerCase())).size !== texts.length) return { ok: false, field: 'options', error: 'Two options have the same text.' }

  const unique = [...new Set(indexes)]
  if (unique.some((i) => !Number.isInteger(i) || i < 0 || i >= texts.length)) return { ok: false, field: 'correct', error: 'Mark a correct option from the list.' }
  if (type === 'SINGLE_CHOICE' && unique.length !== 1) return { ok: false, field: 'correct', error: 'Mark exactly one correct option.' }
  if (type === 'MULTIPLE_CHOICE' && unique.length < 1) return { ok: false, field: 'correct', error: 'Mark at least one correct option.' }

  const options = texts.map((text) => ({ id: newId('opt'), text }))
  return { ok: true, value: { type, prompt, points, options, correct: unique.sort((a, b) => a - b).map((i) => options[i].id), modelAnswer: '' } }
}

/* -------------------------------- reading -------------------------------- */

function summary(row: TeacherQuizRow): TeacherQuizSummaryDTO {
  return {
    id: row.id,
    courseId: row.course_id,
    courseTitle: row.course_title,
    title: row.title,
    status: quizStatus(row),
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    durationMinutes: row.duration_minutes,
    attemptsAllowed: row.attempts_allowed,
    passPercent: row.pass_percent,
    releasePolicy: row.release_policy,
    questionCount: row.question_count,
    maxScore: row.max_score,
    attemptCount: row.attempt_count,
    studentCount: row.student_count,
    enrolledCount: row.enrolled_count,
    toMarkCount: row.to_mark_count,
    averagePercent: row.average_percent === null ? null : Math.round(row.average_percent),
    updatedAt: row.updated_at,
  }
}

const markingStatus = (row: AttemptRow): QuizAttemptMarkingStatus => (row.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : row.needs_marking > 0 ? 'TO_MARK' : 'MARKED')

function attemptSummary(row: AttemptRow, passPercent: number): TeacherQuizAttemptSummaryDTO {
  const status = markingStatus(row)
  const percent = row.score !== null && row.max_score > 0 ? (row.score / row.max_score) * 100 : null
  return {
    id: row.id,
    quizId: row.quiz_id,
    studentId: row.student_id,
    studentName: row.student_name,
    attemptNumber: row.attempt_number,
    status,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    autoSubmitted: !!row.auto_submitted,
    score: row.score,
    maxScore: row.max_score,
    passed: status === 'MARKED' && percent !== null ? percent >= passPercent : null,
  }
}

export async function quizzesForTeacher(db: Db, teacherId: string): Promise<TeacherQuizSummaryDTO[]> {
  const rows = await query<TeacherQuizRow>(db, `${SELECT_QUIZ} WHERE c.instructor_id = ?1 ORDER BY z.closes_at, z.id`, teacherId)
  return rows.map(summary)
}

async function quizRow(db: Db, teacherId: string, quizId: string): Promise<TeacherQuizRow | null> {
  return queryOne<TeacherQuizRow>(db, `${SELECT_QUIZ} WHERE z.id = ?1 AND c.instructor_id = ?2`, quizId, teacherId)
}

export async function quizDetail(db: Db, teacherId: string, quizId: string): Promise<TeacherQuizDetailDTO | null> {
  if (!(await quizRow(db, teacherId, quizId))) return null
  await sweepExpired(db, { quizId })
  const row = await quizRow(db, teacherId, quizId)
  if (!row) return null

  const [questions, attempts] = await Promise.all([
    questionsFor(db, quizId),
    query<AttemptRow>(
      db,
      `SELECT * FROM quiz_attempts WHERE quiz_id = ?1
       ORDER BY CASE WHEN status = 'SUBMITTED' AND needs_marking > 0 THEN 0 WHEN status = 'IN_PROGRESS' THEN 1 ELSE 2 END,
                COALESCE(submitted_at, started_at) DESC`,
      quizId,
    ),
  ])
  return {
    ...summary(row),
    instructions: row.instructions,
    shuffleQuestions: !!row.shuffle_questions,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    editable: !row.published_at,
    questions,
    publish: publishValidation(row, questions),
    attempts: attempts.map((a) => attemptSummary(a, row.pass_percent)),
  }
}

/* --------------------------------- quizzes ------------------------------- */

export type QuizFields = {
  title: string
  instructions: string
  opensAt: string
  closesAt: string
  durationMinutes: number
  attemptsAllowed: number
  passPercent: number
  releasePolicy: QuizReleasePolicy
  shuffleQuestions: boolean
}

export type QuizInput = QuizFields & { courseId: string }
export type QuizPatch = Partial<QuizFields>

export async function createQuiz(db: Db, teacherId: string, input: QuizInput): Promise<TeacherQuizDetailDTO | null> {
  const course = await queryOne<{ id: string }>(db, `SELECT id FROM courses WHERE id = ?1 AND instructor_id = ?2`, input.courseId, teacherId)
  if (!course) return null

  const id = newId('quiz')
  const now = nowIso()
  await execute(
    db,
    `INSERT INTO quizzes (id, course_id, title, instructions, opens_at, closes_at, duration_minutes, attempts_allowed, pass_percent, release_policy, shuffle_questions, status, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', NULL, ?, ?)`,
    id,
    input.courseId,
    input.title,
    input.instructions,
    input.opensAt,
    input.closesAt,
    input.durationMinutes,
    input.attemptsAllowed,
    input.passPercent,
    input.releasePolicy,
    input.shuffleQuestions ? 1 : 0,
    now,
    now,
  )
  return quizDetail(db, teacherId, id)
}

export async function updateQuiz(db: Db, teacherId: string, quizId: string, patch: QuizPatch): Promise<TeacherQuizDetailDTO | null> {
  if (!(await quizRow(db, teacherId, quizId))) return null

  const sets: string[] = []
  const params: unknown[] = []
  const push = (column: string, value: unknown) => {
    params.push(value)
    sets.push(`${column} = ?${params.length}`)
  }
  if (patch.title !== undefined) push('title', patch.title)
  if (patch.instructions !== undefined) push('instructions', patch.instructions)
  if (patch.opensAt !== undefined) push('opens_at', patch.opensAt)
  if (patch.closesAt !== undefined) push('closes_at', patch.closesAt)
  if (patch.durationMinutes !== undefined) push('duration_minutes', patch.durationMinutes)
  if (patch.attemptsAllowed !== undefined) push('attempts_allowed', patch.attemptsAllowed)
  if (patch.passPercent !== undefined) push('pass_percent', patch.passPercent)
  if (patch.releasePolicy !== undefined) push('release_policy', patch.releasePolicy)
  if (patch.shuffleQuestions !== undefined) push('shuffle_questions', patch.shuffleQuestions ? 1 : 0)
  if (!sets.length) return quizDetail(db, teacherId, quizId)

  push('updated_at', nowIso())
  params.push(quizId)
  await execute(db, `UPDATE quizzes SET ${sets.join(', ')} WHERE id = ?${params.length}`, ...params)
  return quizDetail(db, teacherId, quizId)
}

export type PublishResult = { status: 'OK'; quiz: TeacherQuizDetailDTO } | { status: 'NOT_FOUND' } | { status: 'INVALID'; quiz: TeacherQuizDetailDTO } | { status: 'HAS_ATTEMPTS' }

export async function setQuizPublished(db: Db, teacherId: string, quizId: string, published: boolean): Promise<PublishResult> {
  const quiz = await quizDetail(db, teacherId, quizId)
  if (!quiz) return { status: 'NOT_FOUND' }
  if (published && !quiz.publish.canPublish) return { status: 'INVALID', quiz }
  if (!published) {
    const started = await queryOne<{ n: number }>(db, `SELECT COUNT(*) AS n FROM quiz_attempts WHERE quiz_id = ?1`, quizId)
    if ((started?.n ?? 0) > 0) return { status: 'HAS_ATTEMPTS' }
  }
  const now = nowIso()
  await execute(db, `UPDATE quizzes SET published_at = ?1, status = 'OPEN', updated_at = ?2 WHERE id = ?3`, published ? now : null, now, quizId)
  const updated = await quizDetail(db, teacherId, quizId)
  return updated ? { status: 'OK', quiz: updated } : { status: 'NOT_FOUND' }
}

/** Close early or re-open. Closing stops new attempts; open ones still run to their deadline. */
export async function setQuizClosed(db: Db, teacherId: string, quizId: string, closed: boolean): Promise<TeacherQuizDetailDTO | null> {
  if (!(await quizRow(db, teacherId, quizId))) return null
  await execute(db, `UPDATE quizzes SET status = ?1, updated_at = ?2 WHERE id = ?3`, closed ? 'CLOSED' : 'OPEN', nowIso(), quizId)
  return quizDetail(db, teacherId, quizId)
}

/* -------------------------------- questions ------------------------------ */

export type QuestionResult = { status: 'OK'; quiz: TeacherQuizDetailDTO } | { status: 'NOT_FOUND' } | { status: 'LOCKED' } | { status: 'NO_MOVE' }

type NormalisedQuestion = Extract<ReturnType<typeof normaliseQuestion>, { ok: true }>['value']

async function draftQuiz(db: Db, teacherId: string, quizId: string): Promise<'OK' | 'NOT_FOUND' | 'LOCKED'> {
  const row = await quizRow(db, teacherId, quizId)
  if (!row) return 'NOT_FOUND'
  return row.published_at ? 'LOCKED' : 'OK'
}

/** The quiz a question belongs to, if that quiz is this teacher's. */
async function quizForQuestion(db: Db, teacherId: string, questionId: string): Promise<string | null> {
  const row = await queryOne<{ quiz_id: string }>(
    db,
    `SELECT q.quiz_id FROM quiz_questions q JOIN quizzes z ON z.id = q.quiz_id JOIN courses c ON c.id = z.course_id
     WHERE q.id = ?1 AND c.instructor_id = ?2`,
    questionId,
    teacherId,
  )
  return row?.quiz_id ?? null
}

async function touch(db: Db, quizId: string) {
  await execute(db, `UPDATE quizzes SET updated_at = ?1 WHERE id = ?2`, nowIso(), quizId)
}

async function withQuiz(db: Db, teacherId: string, quizId: string): Promise<QuestionResult> {
  const quiz = await quizDetail(db, teacherId, quizId)
  return quiz ? { status: 'OK', quiz } : { status: 'NOT_FOUND' }
}

export async function addQuestion(db: Db, teacherId: string, quizId: string, question: NormalisedQuestion): Promise<QuestionResult> {
  const state = await draftQuiz(db, teacherId, quizId)
  if (state !== 'OK') return { status: state }
  const last = await queryOne<{ p: number | null }>(db, `SELECT MAX(position) AS p FROM quiz_questions WHERE quiz_id = ?1`, quizId)
  const now = nowIso()
  await execute(
    db,
    `INSERT INTO quiz_questions (id, quiz_id, position, type, prompt, points, options_json, correct_json, model_answer, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId('qq'),
    quizId,
    (last?.p ?? 0) + 1,
    question.type,
    question.prompt,
    question.points,
    JSON.stringify(question.options),
    JSON.stringify(question.correct),
    question.modelAnswer,
    now,
    now,
  )
  await touch(db, quizId)
  return withQuiz(db, teacherId, quizId)
}

export async function replaceQuestion(db: Db, teacherId: string, questionId: string, question: NormalisedQuestion): Promise<QuestionResult> {
  const quizId = await quizForQuestion(db, teacherId, questionId)
  if (!quizId) return { status: 'NOT_FOUND' }
  const state = await draftQuiz(db, teacherId, quizId)
  if (state !== 'OK') return { status: state }
  await execute(
    db,
    `UPDATE quiz_questions SET type = ?1, prompt = ?2, points = ?3, options_json = ?4, correct_json = ?5, model_answer = ?6, updated_at = ?7 WHERE id = ?8`,
    question.type,
    question.prompt,
    question.points,
    JSON.stringify(question.options),
    JSON.stringify(question.correct),
    question.modelAnswer,
    nowIso(),
    questionId,
  )
  await touch(db, quizId)
  return withQuiz(db, teacherId, quizId)
}

export async function deleteQuestion(db: Db, teacherId: string, questionId: string): Promise<QuestionResult> {
  const quizId = await quizForQuestion(db, teacherId, questionId)
  if (!quizId) return { status: 'NOT_FOUND' }
  const state = await draftQuiz(db, teacherId, quizId)
  if (state !== 'OK') return { status: state }
  await execute(db, `DELETE FROM quiz_questions WHERE id = ?1`, questionId)
  await touch(db, quizId)
  return withQuiz(db, teacherId, quizId)
}

export async function moveQuestion(db: Db, teacherId: string, questionId: string, direction: 'UP' | 'DOWN'): Promise<QuestionResult> {
  const quizId = await quizForQuestion(db, teacherId, questionId)
  if (!quizId) return { status: 'NOT_FOUND' }
  const state = await draftQuiz(db, teacherId, quizId)
  if (state !== 'OK') return { status: state }

  const rows = await query<{ id: string; position: number }>(db, `SELECT id, position FROM quiz_questions WHERE quiz_id = ?1 ORDER BY position, id`, quizId)
  const index = rows.findIndex((r) => r.id === questionId)
  const other = rows[direction === 'UP' ? index - 1 : index + 1]
  if (index < 0 || !other) return { status: 'NO_MOVE' }

  /* Renumber the whole list so a gap or a duplicate position from an older delete cannot stall a move. */
  const order = rows.map((r) => r.id)
  // Both indexes are fixed before the swap. Looking the second one up inside the
  // destructuring assignment found the slot just overwritten, so a move down
  // wrote the question back where it was and nothing moved.
  const otherIndex = direction === 'UP' ? index - 1 : index + 1
  ;[order[index], order[otherIndex]] = [order[otherIndex], order[index]]
  await db.batch(order.map((id, i) => db.prepare(`UPDATE quiz_questions SET position = ?1 WHERE id = ?2`).bind(i + 1, id)))
  await touch(db, quizId)
  return withQuiz(db, teacherId, quizId)
}

/* --------------------------------- marking ------------------------------- */

async function ownedAttempt(db: Db, teacherId: string, attemptId: string) {
  return queryOne<AttemptRow & { quiz_title: string; course_title: string; pass_percent: number }>(
    db,
    `SELECT t.*, z.title AS quiz_title, c.title AS course_title, z.pass_percent
     FROM quiz_attempts t JOIN quizzes z ON z.id = t.quiz_id JOIN courses c ON c.id = z.course_id
     WHERE t.id = ?1 AND c.instructor_id = ?2`,
    attemptId,
    teacherId,
  )
}

export async function attemptDetail(db: Db, teacherId: string, attemptId: string): Promise<TeacherQuizAttemptDetailDTO | null> {
  const first = await ownedAttempt(db, teacherId, attemptId)
  if (!first) return null
  if (first.status === 'IN_PROGRESS') await sweepExpired(db, { quizId: first.quiz_id })
  const row = (await ownedAttempt(db, teacherId, attemptId)) ?? first

  const answers = await answersFor(db, attemptId)
  const submitted = row.status === 'SUBMITTED'
  return {
    ...attemptSummary(row, row.pass_percent),
    quizTitle: row.quiz_title,
    courseTitle: row.course_title,
    passPercent: row.pass_percent,
    answers: snapshotOf(row).map((question): TeacherQuizAnswerDTO => {
      const answer = answers.find((a) => a.question_id === question.id)
      const value = answer ? answerValue(answer) : null
      return {
        question,
        selectedOptionIds: value && 'optionIds' in value ? value.optionIds : null,
        text: value && 'text' in value ? value.text : null,
        awardedPoints: submitted ? (answer?.awarded_points ?? null) : null,
        isCorrect: submitted && answer?.is_correct !== null && answer?.is_correct !== undefined ? !!answer.is_correct : null,
        comment: answer?.comment ?? '',
      }
    }),
  }
}

export type MarkResult = { status: 'OK'; attempt: TeacherQuizAttemptDetailDTO } | { status: 'NOT_FOUND' } | { status: 'NOT_SUBMITTED' } | { status: 'NOT_SHORT_ANSWER' } | { status: 'OUT_OF_RANGE'; max: number }

/**
 * Mark one short answer, or change a mark already given. Only short answers
 * take a manual mark: objective scores come from the key, so overriding one
 * here would make the key and the result disagree.
 */
export async function markAnswer(db: Db, teacherId: string, attemptId: string, questionId: string, points: number, comment: string): Promise<MarkResult> {
  const row = await ownedAttempt(db, teacherId, attemptId)
  if (!row) return { status: 'NOT_FOUND' }
  if (row.status !== 'SUBMITTED') return { status: 'NOT_SUBMITTED' }
  const question = snapshotOf(row).find((q) => q.id === questionId)
  if (!question) return { status: 'NOT_FOUND' }
  if (question.type !== 'SHORT_ANSWER') return { status: 'NOT_SHORT_ANSWER' }
  if (!Number.isInteger(points) || points < 0 || points > question.points) return { status: 'OUT_OF_RANGE', max: question.points }

  const now = nowIso()
  await execute(
    db,
    `INSERT INTO quiz_answers (attempt_id, question_id, value_json, awarded_points, is_correct, comment, saved_at, marked_by, marked_at)
     VALUES (?1, ?2, 'null', ?3, ?4, ?5, ?6, ?7, ?6)
     ON CONFLICT(attempt_id, question_id) DO UPDATE SET awarded_points = ?3, is_correct = ?4, comment = ?5, marked_by = ?7, marked_at = ?6`,
    attemptId,
    questionId,
    points,
    points === question.points ? 1 : 0,
    comment,
    now,
    teacherId,
  )
  const { score, needsMarking } = tally(snapshotOf(row), await answersFor(db, attemptId))
  await execute(db, `UPDATE quiz_attempts SET score = ?1, needs_marking = ?2, updated_at = ?3 WHERE id = ?4`, score, needsMarking, now, attemptId)

  const attempt = await attemptDetail(db, teacherId, attemptId)
  return attempt ? { status: 'OK', attempt } : { status: 'NOT_FOUND' }
}
