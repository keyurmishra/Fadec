import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { call, OTHER_TEACHER, studentCookie, teacherCookie } from './harness'

/*
  Quizzes, end to end through the Worker: authoring and its validation, the
  publish lock, the student's enrolment scope, autosave, scoring, short-answer
  marking, the server deadline and the result release rules.

  Every test builds its own quiz on the PPL course, so the seed holds no quiz
  state these tests depend on. "Now" is pinned so windows and deadlines are
  deterministic.
*/
const NOW = new Date('2026-11-25T12:00:00.000Z')

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterAll(() => vi.useRealTimers())

const PRIYA = { email: 'priya.nair@fadec.example', studentId: 'PPL-26-00001' }
const THEO = { email: 'theo.bennett@fadec.example', studentId: 'PPL-26-00002' }
const MAYA = { email: 'maya.okafor@fadec.example', studentId: 'PPL-26-00003' }
// Enrolled on CPL, not PPL: every PPL quiz must look like it does not exist.
const SOFIA = { email: 'sofia.rossi@fadec.example', studentId: 'CPL-26-00009' }

const BASE = { courseId: 'crs-ppl', title: 'Air law check', opensAt: '2026-11-20T09:00:00.000Z', closesAt: '2026-12-10T17:00:00.000Z' }

const SINGLE = { type: 'SINGLE_CHOICE', prompt: 'Which airspace class is uncontrolled?', points: 2, options: [{ text: 'Class A' }, { text: 'Class G' }, { text: 'Class C' }], correctIndexes: [1] }
const MULTIPLE = { type: 'MULTIPLE_CHOICE', prompt: 'Which documents must be carried?', points: 3, options: [{ text: 'Certificate of airworthiness' }, { text: 'Licence' }, { text: 'Logbook' }, { text: 'Menu' }], correctIndexes: [0, 1, 2] }
const TRUE_FALSE = { type: 'TRUE_FALSE', prompt: 'A NOTAM can close a runway.', points: 1, correctIndexes: [0] }
const SHORT = { type: 'SHORT_ANSWER', prompt: 'Explain the semicircular rule.', points: 4, modelAnswer: 'Odd thousands eastbound, even westbound.' }

type Question = { id: string; type: string; options: { id: string; text: string }[]; correctOptionIds: string[] }

async function createQuiz(cookie: string, overrides: Record<string, unknown> = {}) {
  const res = await call('/api/teacher/quizzes', { cookie, body: { ...BASE, ...overrides } })
  expect(res.status, JSON.stringify(res.json)).toBe(201)
  return res.json as { id: string; status: string; editable: boolean; questions: Question[] }
}

async function addQuestion(cookie: string, quizId: string, question: Record<string, unknown>) {
  const res = await call(`/api/teacher/quizzes/${quizId}/questions`, { cookie, body: question })
  expect(res.status, JSON.stringify(res.json)).toBe(201)
  return res.json as { questions: Question[] }
}

/** A published quiz with the given questions; returns the questions in order with their keys. */
async function publishedQuiz(cookie: string, questions: Record<string, unknown>[], overrides: Record<string, unknown> = {}) {
  const quiz = await createQuiz(cookie, overrides)
  let latest: Question[] = []
  for (const q of questions) latest = (await addQuestion(cookie, quiz.id, q)).questions
  const published = await call(`/api/teacher/quizzes/${quiz.id}/publish`, { cookie, method: 'POST' })
  expect(published.status, JSON.stringify(published.json)).toBe(200)
  return { id: quiz.id, questions: latest }
}

const optionId = (q: Question, text: string) => q.options.find((o) => o.text === text)!.id

describe('quiz authoring', () => {
  it('requires a session and hides other teachers’ quizzes', async () => {
    expect((await call('/api/teacher/quizzes')).status).toBe(401)
    const cookie = await teacherCookie()
    const quiz = await createQuiz(cookie)
    const other = await teacherCookie(OTHER_TEACHER)
    const theirs = await call(`/api/teacher/quizzes/${quiz.id}`, { cookie: other })
    const missing = await call('/api/teacher/quizzes/qz-nope', { cookie: other })
    expect(theirs.status).toBe(404)
    expect(theirs.json).toEqual(missing.json)
    expect((await call(`/api/teacher/quizzes/${quiz.id}/questions`, { cookie: other, body: SINGLE })).status).toBe(404)
    expect((await call('/api/teacher/quizzes', { cookie, body: { ...BASE, courseId: 'crs-mcc' } })).status).toBe(404)
  })

  it('validates quiz settings field by field', async () => {
    const cookie = await teacherCookie()
    const cases: [Record<string, unknown>, string][] = [
      [{ ...BASE, courseId: undefined }, 'courseId'],
      [{ ...BASE, title: undefined }, 'title'],
      [{ ...BASE, title: 'x' }, 'title'],
      [{ ...BASE, closesAt: undefined }, 'closesAt'],
      [{ ...BASE, closesAt: 'next week' }, 'closesAt'],
      [{ ...BASE, closesAt: BASE.opensAt }, 'closesAt'],
      [{ ...BASE, durationMinutes: 0 }, 'durationMinutes'],
      [{ ...BASE, durationMinutes: 2.5 }, 'durationMinutes'],
      [{ ...BASE, attemptsAllowed: 11 }, 'attemptsAllowed'],
      [{ ...BASE, passPercent: 101 }, 'passPercent'],
      [{ ...BASE, releasePolicy: 'MANUAL' }, 'releasePolicy'],
      [{ ...BASE, shuffleQuestions: 'yes' }, 'shuffleQuestions'],
    ]
    for (const [body, field] of cases) {
      const res = await call('/api/teacher/quizzes', { cookie, body })
      expect(res.status, field).toBe(422)
      expect(Object.keys(res.json.fieldErrors), field).toEqual([field])
    }
    expect((await call('/api/teacher/quizzes', { cookie, rawBody: 'not json' })).status).toBe(400)
  })

  it('creates a draft with defaults and rejects an empty edit', async () => {
    const cookie = await teacherCookie()
    const quiz = await createQuiz(cookie)
    expect(quiz).toEqual(
      expect.objectContaining({ status: 'DRAFT', editable: true, durationMinutes: 30, attemptsAllowed: 1, passPercent: 50, releasePolicy: 'IMMEDIATE', questionCount: 0 }),
    )
    expect((await call(`/api/teacher/quizzes/${quiz.id}`, { cookie, method: 'PATCH', body: {} })).status).toBe(422)
    const edited = await call(`/api/teacher/quizzes/${quiz.id}`, { cookie, method: 'PATCH', body: { passPercent: 70 } })
    expect(edited.status).toBe(200)
    expect(edited.json.passPercent).toBe(70)
    const backwards = await call(`/api/teacher/quizzes/${quiz.id}`, { cookie, method: 'PATCH', body: { closesAt: '2026-11-01T00:00:00.000Z' } })
    expect(backwards.status).toBe(422)
    expect(backwards.json.fieldErrors).toHaveProperty('closesAt')
  })

  it('validates questions by type', async () => {
    const cookie = await teacherCookie()
    const quiz = await createQuiz(cookie)
    const cases: [Record<string, unknown>, string][] = [
      [{ ...SINGLE, type: 'ESSAY' }, 'type'],
      [{ ...SINGLE, prompt: 'Hi' }, 'prompt'],
      [{ ...SINGLE, points: 0 }, 'points'],
      [{ ...SINGLE, points: 101 }, 'points'],
      [{ ...SINGLE, options: [{ text: 'Only one' }] }, 'options'],
      [{ ...SINGLE, options: [{ text: 'Same' }, { text: 'same' }] }, 'options'],
      [{ ...SINGLE, options: [{ text: 'A' }, { text: '' }] }, 'options'],
      [{ ...SINGLE, correctIndexes: [0, 1] }, 'correct'],
      [{ ...SINGLE, correctIndexes: [7] }, 'correct'],
      [{ ...MULTIPLE, correctIndexes: [] }, 'correct'],
      [{ ...TRUE_FALSE, correctIndexes: [2] }, 'correct'],
      [{ ...TRUE_FALSE, correctIndexes: [] }, 'correct'],
    ]
    for (const [body, field] of cases) {
      const res = await call(`/api/teacher/quizzes/${quiz.id}/questions`, { cookie, body })
      expect(res.status, `${field} ${JSON.stringify(body)}`).toBe(422)
      expect(Object.keys(res.json.fieldErrors)).toEqual([field])
    }
  })

  it('stores each question type with server-generated option ids', async () => {
    const cookie = await teacherCookie()
    const quiz = await createQuiz(cookie)
    await addQuestion(cookie, quiz.id, { ...SINGLE, options: SINGLE.options.map((o) => ({ ...o, id: 'client-chosen' })) })
    await addQuestion(cookie, quiz.id, MULTIPLE)
    await addQuestion(cookie, quiz.id, TRUE_FALSE)
    const { questions } = await addQuestion(cookie, quiz.id, SHORT)

    expect(questions.map((q) => q.type)).toEqual(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'])
    const [single, multiple, trueFalse, short] = questions
    expect(single.options.map((o) => o.id)).not.toContain('client-chosen')
    expect(single.correctOptionIds).toEqual([optionId(single, 'Class G')])
    expect(multiple.correctOptionIds).toHaveLength(3)
    expect(trueFalse.options.map((o) => o.text)).toEqual(['True', 'False'])
    expect(short.correctOptionIds).toEqual([])

    // Reordering past the top is refused; a real move succeeds.
    expect((await call(`/api/teacher/quiz-questions/${single.id}/move`, { cookie, body: { direction: 'UP' } })).status).toBe(409)
    expect((await call(`/api/teacher/quiz-questions/${single.id}/move`, { cookie, body: { direction: 'SIDEWAYS' } })).status).toBe(422)
    const moved = await call(`/api/teacher/quiz-questions/${single.id}/move`, { cookie, body: { direction: 'DOWN' } })
    expect(moved.status).toBe(200)
    expect(moved.json.questions[1].id).toBe(single.id)
  })

  it('will not publish an empty quiz, and locks questions once published', async () => {
    const cookie = await teacherCookie()
    const quiz = await createQuiz(cookie)
    const empty = await call(`/api/teacher/quizzes/${quiz.id}/publish`, { cookie, method: 'POST' })
    expect(empty.status).toBe(422)
    const unmet = empty.json.publish.requirements.filter((r: { satisfied: boolean }) => !r.satisfied).map((r: { key: string }) => r.key)
    expect(unmet).toEqual(['questions'])

    const { questions } = await addQuestion(cookie, quiz.id, SINGLE)
    const published = await call(`/api/teacher/quizzes/${quiz.id}/publish`, { cookie, method: 'POST' })
    expect(published.status).toBe(200)
    expect(published.json).toEqual(expect.objectContaining({ status: 'OPEN', editable: false }))

    expect((await call(`/api/teacher/quizzes/${quiz.id}/questions`, { cookie, body: TRUE_FALSE })).status).toBe(409)
    expect((await call(`/api/teacher/quiz-questions/${questions[0].id}`, { cookie, method: 'PUT', body: SINGLE })).status).toBe(409)
    expect((await call(`/api/teacher/quiz-questions/${questions[0].id}`, { cookie, method: 'DELETE' })).status).toBe(409)

    // Back to draft is allowed while nobody has started it.
    const unpublished = await call(`/api/teacher/quizzes/${quiz.id}/unpublish`, { cookie, method: 'POST' })
    expect(unpublished.status).toBe(200)
    expect(unpublished.json.status).toBe('DRAFT')
  })
})

describe('quizzes in the student portal', () => {
  it('shows only published quizzes on the student’s own courses', async () => {
    const cookie = await teacherCookie()
    const draft = await createQuiz(cookie, { title: 'Draft only quiz' })
    await addQuestion(cookie, draft.id, SINGLE)
    const live = await publishedQuiz(cookie, [SINGLE], { title: 'Published quiz' })

    expect((await call('/api/student/quizzes')).status).toBe(401)

    const priya = await studentCookie(PRIYA)
    const ids = (await call('/api/student/quizzes', { cookie: priya })).json.items.map((q: { id: string }) => q.id)
    expect(ids).toContain(live.id)
    expect(ids).not.toContain(draft.id)
    expect((await call(`/api/student/quizzes/${draft.id}`, { cookie: priya })).status).toBe(404)
    expect((await call(`/api/student/quizzes/${live.id}`, { cookie: priya })).status).toBe(200)

    const sofia = await studentCookie(SOFIA)
    const foreign = await call(`/api/student/quizzes/${live.id}`, { cookie: sofia })
    const missing = await call('/api/student/quizzes/qz-nope', { cookie: sofia })
    expect(foreign.status).toBe(404)
    expect(foreign.json).toEqual(missing.json)
    expect((await call(`/api/student/quizzes/${live.id}/attempt`, { cookie: sofia, method: 'POST' })).status).toBe(404)
  })

  it('will not start a quiz before it opens', async () => {
    const cookie = await teacherCookie()
    const later = await publishedQuiz(cookie, [SINGLE], { opensAt: '2026-12-01T09:00:00.000Z' })
    const priya = await studentCookie(PRIYA)
    expect((await call(`/api/student/quizzes/${later.id}`, { cookie: priya })).json.status).toBe('SCHEDULED')
    expect((await call(`/api/student/quizzes/${later.id}/attempt`, { cookie: priya, method: 'POST' })).status).toBe(409)
  })

  it('takes an attempt, scores it, waits for marking and then releases the result', async () => {
    const teacher = await teacherCookie()
    const quiz = await publishedQuiz(teacher, [SINGLE, MULTIPLE, TRUE_FALSE, SHORT], { passPercent: 60 })
    const [single, multiple, trueFalse, short] = quiz.questions

    const priya = await studentCookie(PRIYA)
    const started = await call(`/api/student/quizzes/${quiz.id}/attempt`, { cookie: priya, method: 'POST' })
    expect(started.status).toBe(200)
    const attemptId = started.json.id
    expect(started.json).toEqual(expect.objectContaining({ status: 'IN_PROGRESS', attemptNumber: 1, result: null }))
    // The key and the marking guide never reach the student during an attempt.
    for (const q of started.json.questions) {
      expect(q).not.toHaveProperty('correctOptionIds')
      expect(q).not.toHaveProperty('modelAnswer')
    }
    expect(Date.parse(started.json.expiresAt) - NOW.getTime()).toBe(30 * 60_000)

    // Starting again resumes the same attempt.
    expect((await call(`/api/student/quizzes/${quiz.id}/attempt`, { cookie: priya, method: 'POST' })).json.id).toBe(attemptId)

    // Once a student has started, the quiz cannot go back to draft.
    expect((await call(`/api/teacher/quizzes/${quiz.id}/unpublish`, { cookie: teacher, method: 'POST' })).status).toBe(409)

    const save = (questionId: string, value: unknown, cookie = priya) =>
      call(`/api/student/quiz-attempts/${attemptId}/answers/${questionId}`, { cookie, method: 'PUT', body: { value } })

    // Invalid answers are refused against the attempt's own snapshot.
    expect((await save(single.id, { optionIds: ['opt-not-in-this-question'] })).status).toBe(422)
    expect((await save(single.id, { optionIds: single.options.slice(0, 2).map((o) => o.id) })).status).toBe(422)
    expect((await save(single.id, { text: 'Class G' })).status).toBe(422)
    expect((await save(short.id, { optionIds: [] })).status).toBe(422)
    expect((await save(short.id, { text: 'x'.repeat(5001) })).status).toBe(422)
    expect((await save('q-nope', { optionIds: [] })).status).toBe(404)
    expect((await call(`/api/student/quiz-attempts/${attemptId}/answers/${single.id}`, { cookie: priya, method: 'PUT', rawBody: '[]' })).status).toBe(400)

    // Another student cannot see, answer or hand in this attempt.
    const theo = await studentCookie(THEO)
    expect((await call(`/api/student/quiz-attempts/${attemptId}`, { cookie: theo })).status).toBe(404)
    expect((await save(single.id, { optionIds: [optionId(single, 'Class G')] }, theo)).status).toBe(404)
    expect((await call(`/api/student/quiz-attempts/${attemptId}/submit`, { cookie: theo, method: 'POST' })).status).toBe(404)

    // Right single choice (2), a partial multiple choice (0: all or nothing), right true/false (1), a written short answer.
    expect((await save(single.id, { optionIds: [optionId(single, 'Class G')] })).status).toBe(200)
    expect((await save(multiple.id, { optionIds: [optionId(multiple, 'Licence'), optionId(multiple, 'Logbook')] })).status).toBe(200)
    expect((await save(trueFalse.id, { optionIds: [optionId(trueFalse, 'True')] })).status).toBe(200)
    expect((await save(short.id, { text: 'Odd levels eastbound.' })).status).toBe(200)

    // The teacher cannot mark an attempt that is still open.
    expect((await call(`/api/teacher/quiz-attempts/${attemptId}/answers/${short.id}`, { cookie: teacher, method: 'PUT', body: { points: 1 } })).status).toBe(409)

    const submitted = await call(`/api/student/quiz-attempts/${attemptId}/submit`, { cookie: priya, method: 'POST' })
    expect(submitted.status).toBe(200)
    expect(submitted.json).toEqual(expect.objectContaining({ status: 'SUBMITTED', autoSubmitted: false, resultPending: 'MARKING', result: null }))
    expect((await call(`/api/student/quiz-attempts/${attemptId}/submit`, { cookie: priya, method: 'POST' })).status).toBe(409)
    expect((await save(single.id, { optionIds: [] })).status).toBe(409)

    // The attempt limit is enforced.
    expect((await call(`/api/student/quizzes/${quiz.id}/attempt`, { cookie: priya, method: 'POST' })).status).toBe(409)

    // The teacher sees the objective score and one answer to mark.
    const review = await call(`/api/teacher/quiz-attempts/${attemptId}`, { cookie: teacher })
    expect(review.status).toBe(200)
    const byQuestion = Object.fromEntries(review.json.answers.map((a: { question: { id: string }; awardedPoints: number | null }) => [a.question.id, a.awardedPoints]))
    expect(byQuestion).toEqual({ [single.id]: 2, [multiple.id]: 0, [trueFalse.id]: 1, [short.id]: null })
    expect((await call(`/api/teacher/quiz-attempts/${attemptId}`, { cookie: await teacherCookie(OTHER_TEACHER) })).status).toBe(404)

    const mark = (questionId: string, body: unknown) => call(`/api/teacher/quiz-attempts/${attemptId}/answers/${questionId}`, { cookie: teacher, method: 'PUT', body })
    expect((await mark(short.id, { points: 5 })).status).toBe(422)
    expect((await mark(short.id, { points: -1 })).status).toBe(422)
    expect((await mark(short.id, { points: 1.5 })).status).toBe(422)
    expect((await mark(short.id, {})).status).toBe(422)
    expect((await mark(short.id, { points: 2, comment: 42 })).status).toBe(422)
    expect((await mark(single.id, { points: 1 })).status).toBe(409)
    expect((await mark('q-nope', { points: 1 })).status).toBe(404)

    const marked = await mark(short.id, { points: 3, comment: 'Mention the westbound levels too.' })
    expect(marked.status).toBe(200)

    const result = await call(`/api/student/quiz-attempts/${attemptId}`, { cookie: priya })
    expect(result.json.resultPending).toBeNull()
    expect(result.json.result).toEqual(expect.objectContaining({ score: 6, maxScore: 10, percent: 60, passed: true }))
    const shortResult = result.json.result.questions.find((q: { questionId: string }) => q.questionId === short.id)
    expect(shortResult).toEqual(expect.objectContaining({ awardedPoints: 3, comment: 'Mention the westbound levels too.' }))
  })

  it('hands an attempt in at the server deadline with what was saved', async () => {
    const teacher = await teacherCookie()
    const quiz = await publishedQuiz(teacher, [SINGLE, TRUE_FALSE], { durationMinutes: 5 })
    const [single, trueFalse] = quiz.questions
    const maya = await studentCookie(MAYA)

    const started = await call(`/api/student/quizzes/${quiz.id}/attempt`, { cookie: maya, method: 'POST' })
    const attemptId = started.json.id
    await call(`/api/student/quiz-attempts/${attemptId}/answers/${single.id}`, { cookie: maya, method: 'PUT', body: { value: { optionIds: [optionId(single, 'Class G')] } } })

    vi.setSystemTime(NOW.getTime() + 6 * 60_000)
    try {
      const late = await call(`/api/student/quiz-attempts/${attemptId}/answers/${trueFalse.id}`, { cookie: maya, method: 'PUT', body: { value: { optionIds: [optionId(trueFalse, 'True')] } } })
      expect(late.status).toBe(409)

      const attempt = await call(`/api/student/quiz-attempts/${attemptId}`, { cookie: maya })
      expect(attempt.json).toEqual(expect.objectContaining({ status: 'SUBMITTED', autoSubmitted: true, submittedAt: started.json.expiresAt }))
      expect(attempt.json.result).toEqual(expect.objectContaining({ score: 2, maxScore: 3 }))
    } finally {
      vi.setSystemTime(NOW)
    }
  })

  it('caps the deadline at the closing time', async () => {
    const teacher = await teacherCookie()
    const closesAt = '2026-11-25T12:10:00.000Z'
    const quiz = await publishedQuiz(teacher, [SINGLE], { durationMinutes: 60, closesAt })
    const started = await call(`/api/student/quizzes/${quiz.id}/attempt`, { cookie: await studentCookie(MAYA), method: 'POST' })
    expect(started.json.expiresAt).toBe(closesAt)
  })

  it('withholds an AFTER_CLOSE result, and its answer key, until the quiz closes', async () => {
    const teacher = await teacherCookie()
    const quiz = await publishedQuiz(teacher, [SINGLE, TRUE_FALSE], { releasePolicy: 'AFTER_CLOSE', attemptsAllowed: 2 })
    const [single] = quiz.questions
    const theo = await studentCookie(THEO)

    const started = await call(`/api/student/quizzes/${quiz.id}/attempt`, { cookie: theo, method: 'POST' })
    const attemptId = started.json.id
    await call(`/api/student/quiz-attempts/${attemptId}/answers/${single.id}`, { cookie: theo, method: 'PUT', body: { value: { optionIds: [optionId(single, 'Class A')] } } })
    const submitted = await call(`/api/student/quiz-attempts/${attemptId}/submit`, { cookie: theo, method: 'POST' })
    expect(submitted.json).toEqual(expect.objectContaining({ resultPending: 'AFTER_CLOSE', result: null }))
    expect(JSON.stringify(submitted.json)).not.toContain('correctOptionIds')

    // A second attempt is allowed; the first stays withheld.
    const second = await call(`/api/student/quizzes/${quiz.id}/attempt`, { cookie: theo, method: 'POST' })
    expect(second.status).toBe(200)
    expect(second.json.attemptNumber).toBe(2)
    await call(`/api/student/quiz-attempts/${second.json.id}/submit`, { cookie: theo, method: 'POST' })

    expect((await call(`/api/teacher/quizzes/${quiz.id}/close`, { cookie: teacher, method: 'POST' })).status).toBe(200)
    const released = await call(`/api/student/quiz-attempts/${attemptId}`, { cookie: theo })
    expect(released.json.resultPending).toBeNull()
    expect(released.json.result).toEqual(expect.objectContaining({ score: 0, maxScore: 3, passed: false }))
    const key = released.json.result.questions.find((q: { questionId: string }) => q.questionId === single.id)
    expect(key.correctOptionIds).toEqual([optionId(single, 'Class G')])

    // A closed quiz takes no new attempts.
    expect((await call(`/api/student/quizzes/${quiz.id}/attempt`, { cookie: await studentCookie(PRIYA), method: 'POST' })).status).toBe(409)
  })
})
