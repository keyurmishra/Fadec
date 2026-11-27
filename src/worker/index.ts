import { Hono } from 'hono'

import type { LatePolicy } from '../contracts/assessment'
import type { StudentIdentityDTO } from '../contracts/learning'
import { EVENTS, PROGRAMMES } from '../content'
import { validateApplication, validateEmailOnly, validateRsvp, validateSignIn, validateTeacherSignIn, type FieldErrors } from '../shared/validation'
import {
  assignmentDetail,
  assignmentsForTeacher,
  createAssignment,
  publishGrade,
  saveGrade,
  setAssignmentClosed,
  setAssignmentPublished,
  submissionDetail,
  submissionsForTeacher,
  updateAssignment,
  withdrawGrade,
  type AssignmentPatch,
} from '../teacher/assignments'
import { ensureDatabase } from '../teacher/db'
import { apiError, apiNotFound, badJson, implausiblePath, invalid, serverError, unavailable } from './errors'
import { assignmentsForStudent, MAX_ANSWER_LENGTH, saveAttempt, startAttempt, studentAssignment, submitAttempt } from '../teacher/student-assignments'
import { addChapter, addLesson, addSection, deleteChapter, deleteLesson, deleteSection, move, outlineFor, publishValidation } from '../teacher/curriculum'
import { courseForTeacher, coursesForTeacher, setCourseStatus } from '../teacher/courses'
import { dashboardForTeacher, TEACHERS } from '../teacher/fixtures'
import {
  addLectureResource,
  applyLecturePatch,
  lectureDetail,
  lecturesForTeacher,
  removeLectureResource,
  setLectureStatus,
  type LecturePatch,
} from '../teacher/lectures'
import {
  addSyllabusLesson,
  addTopic,
  attachExistingLecture,
  createLectureForLesson,
  createSubject,
  deleteSyllabusLesson,
  deleteTopic,
  detachLecture,
  moveSubjectItem,
  publishedSubjectDetail,
  publishedSubjects,
  setSubjectStatus,
  subjectDetail,
  subjectsForTeacher,
  updateSubject,
  updateSyllabusLesson,
  updateTopic,
  type SubjectPatch,
} from '../teacher/subjects'
import { studentById, studentForSignIn } from '../teacher/students'
import {
  addQuestion,
  attemptDetail as quizAttemptDetail,
  createQuiz,
  deleteQuestion,
  markAnswer,
  moveQuestion,
  normaliseQuestion,
  quizDetail,
  quizzesForTeacher,
  RELEASE_POLICIES,
  replaceQuestion,
  setQuizClosed,
  setQuizPublished,
  updateQuiz,
  type QuestionResult,
  type QuizPatch,
} from '../teacher/quizzes'
import { quizzesForStudent, saveQuizAnswer, startQuizAttempt, studentAttempt, studentQuiz, submitQuizAttempt } from '../teacher/student-quizzes'
import type { QuizReleasePolicy } from '../contracts/quizzes'
import { clearedStudentCookie, createStudentSession, studentCookie, STUDENT_COOKIE, verifyStudentSession } from './student-session'
import { clearedTeacherCookie, createTeacherSession, teacherCookie, TEACHER_COOKIE, verifyTeacherSession } from './teacher-session'

// The Worker in front of the static site. Every form posts here and each route
// validates its input with the same rules the browser uses. Applications,
// RSVPs and the student session are still kept in localStorage; the teaching
// studio writes its courses, curricula, lectures and subjects to D1.
type Env = {
  ASSETS: Fetcher
  DB: D1Database
  /** HMAC key for the student session cookie. Read from .dev.vars locally, from a Worker secret in production. */
  STUDENT_SESSION_SECRET?: string
  /** HMAC key for the teacher session cookie. Read from .dev.vars locally, from a Worker secret in production. */
  TEACHER_SESSION_SECRET?: string
}

const app = new Hono<{ Bindings: Env }>()

const reference = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/*
  Anything a route did not expect: a D1 failure, a bug, a malformed stored row.
  The cause goes to the Worker log with the request it belongs to; the caller
  gets the standard JSON error, never a stack trace or an HTML page.
*/
app.onError((error, c) => {
  console.error(`Unhandled error on ${c.req.method} ${new URL(c.req.url).pathname}:`, error)
  return serverError()
})

// Refuse ids no route could own, then create the tables and seed the catalogue
// on the first request this isolate serves and reuse that result afterwards.
// When storage itself is down the answer is 503, not a 500: nothing is wrong
// with the request, and a retry may succeed.
app.use('/api/*', async (c, next) => {
  if (implausiblePath(new URL(c.req.url).pathname)) return apiNotFound()
  try {
    await ensureDatabase(c.env.DB)
  } catch (error) {
    console.error('Database setup failed:', error)
    return unavailable()
  }
  await next()
})

app.get('/api/health', (c) => c.json({ ok: true }))

/** Course list for other clients: summary fields and open intakes. */
app.get('/api/programmes', (c) =>
  c.json({
    programmes: PROGRAMMES.map((p) => ({
      slug: p.slug,
      title: p.title,
      award: p.award,
      school: p.school,
      mode: p.mode,
      fee: p.fee,
      cohorts: p.cohorts.map((k) => ({ id: k.id, start: k.start, seatsLeft: Math.max(0, k.seats - k.taken) })),
    })),
  }),
)

app.get('/api/events', (c) => c.json({ events: EVENTS.map(({ id, title, type, date, time }) => ({ id, title, type, date, time })) }))

/** Application: the full draft from /apply → { ref }. */
app.post('/api/applications', async (c) => {
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const errors = validateApplication(body)
  if (Object.keys(errors).length) return invalid(errors)
  return c.json({ ok: true, ref: reference('APP') }, 201)
})

/** Event RSVP: { event, name, email } → { ref }. */
app.post('/api/rsvp', async (c) => {
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const errors = validateRsvp(body)
  if (Object.keys(errors).length) return invalid(errors)
  return c.json({ ok: true, ref: reference('RSVP') }, 201)
})

/** Student hub sign-in on this device: { email, studentId }. Replace with real auth. */
app.post('/api/signin', async (c) => {
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const errors = validateSignIn(body)
  if (Object.keys(errors).length) return invalid(errors)
  return c.json({ ok: true, email: String(body.email).trim().toLowerCase(), studentId: String(body.studentId).trim().toUpperCase() })
})

/** Newsletter: { email }. */
app.post('/api/subscribe', async (c) => {
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const errors = validateEmailOnly(body)
  if (Object.keys(errors).length) return invalid(errors)
  return c.json({ ok: true })
})

/* -------------------------- teaching studio ---------------------------- */

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

/*
  Both portals use signed session cookies (see session-cookie.ts), so a tampered
  id, an expired session and a cookie naming an account that no longer exists
  all fail here and answer 401 instead of being trusted. A deployment without
  the matching secret signs nobody in. `Secure` is added only on https so
  loopback development still works.
*/
const secureRequest = (c: { req: { url: string } }) => new URL(c.req.url).protocol === 'https:'

type SessionRequest = { env: Env; req: { header: (name: string) => string | undefined; url: string } }

async function teacherFrom(c: SessionRequest) {
  const secret = c.env.TEACHER_SESSION_SECRET
  const value = cookieValue(c.req.header('cookie') ?? null, TEACHER_COOKIE)
  if (!secret || !value) return null
  const session = await verifyTeacherSession(secret, value)
  if (!session) return null
  return TEACHERS.find((t) => t.teacherId === session.teacherId) ?? null
}

const noSession = () => apiError(401, 'Sign in to the teaching studio to continue.')
const notYours = () => apiError(404, 'That course could not be found.')

type StudentRequest = SessionRequest

async function studentFrom(c: StudentRequest): Promise<StudentIdentityDTO | null> {
  const secret = c.env.STUDENT_SESSION_SECRET
  const value = cookieValue(c.req.header('cookie') ?? null, STUDENT_COOKIE)
  if (!secret || !value) return null
  const session = await verifyStudentSession(secret, value)
  if (!session) return null
  return studentById(c.env.DB, session.studentId)
}

const noStudentSession = () => apiError(401, 'Sign in to the student portal to continue.')

app.post('/api/teacher/signin', async (c) => {
  const secret = c.env.TEACHER_SESSION_SECRET
  if (!secret) {
    console.error('TEACHER_SESSION_SECRET is not set: copy .dev.vars.example to .dev.vars locally, or run `wrangler secret put TEACHER_SESSION_SECRET`.')
    return c.json({ error: 'Teacher sessions are not configured on this deployment.' }, 503)
  }
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const errors = validateTeacherSignIn(body)
  if (Object.keys(errors).length) return invalid(errors)
  const email = String(body.email).trim().toLowerCase()
  const teacherId = String(body.teacherId).trim().toUpperCase()
  const teacher = TEACHERS.find((t) => t.email === email && t.teacherId === teacherId)
  // One message for both wrong-email and wrong-id: never confirm which failed.
  if (!teacher) return c.json({ error: 'Those details do not match a teacher account.' }, 401)
  const { value, expiresAt } = await createTeacherSession(secret, teacher.teacherId)
  c.header('set-cookie', teacherCookie(value, secureRequest(c)))
  return c.json({ ...teacher, demo: true, expiresAt: new Date(expiresAt).toISOString() })
})

app.post('/api/teacher/signout', (c) => {
  c.header('set-cookie', clearedTeacherCookie(secureRequest(c)))
  return c.json({ ok: true })
})

app.get('/api/teacher/me', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  return c.json(teacher)
})

/** Everything the overview screen needs, filtered to this teacher's courses. */
app.get('/api/teacher/dashboard', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const dashboard = await dashboardForTeacher(c.env.DB, teacher.teacherId)
  if (!dashboard) return c.json({ error: 'No courses are assigned to this account yet.' }, { status: 404 })
  return c.json(dashboard)
})

app.get('/api/teacher/courses', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const courses = await coursesForTeacher(c.env.DB, teacher.teacherId)
  return c.json({ items: courses, nextCursor: null, totalCount: courses.length })
})

/** A course belonging to another teacher answers exactly like a missing one. */
app.get('/api/teacher/courses/:courseId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const course = await courseForTeacher(c.env.DB, teacher.teacherId, c.req.param('courseId'))
  if (!course) return notYours()
  return c.json(course)
})

/* ------------------------ course and curriculum ------------------------ */

const titleFrom = (body: Record<string, unknown>) => {
  const v = typeof body.title === 'string' ? body.title.trim() : ''
  return v.length >= 2 && v.length <= 120 ? v : null
}

/** The payload every curriculum mutation returns, so the screen never refetches. */
async function outlinePayload(db: D1Database, teacherId: string, courseId: string) {
  const course = await courseForTeacher(db, teacherId, courseId)
  if (!course) return null
  const [sections, publish] = await Promise.all([outlineFor(db, courseId), publishValidation(db, course, courseId)])
  return { course, sections, publish }
}

const courseIdParam = (c: { req: { param: (name: string) => string } }) => c.req.param('courseId')

app.get('/api/teacher/courses/:courseId/outline', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const payload = await outlinePayload(c.env.DB, teacher.teacherId, courseIdParam(c))
  if (!payload) return notYours()
  return c.json(payload)
})

app.post('/api/teacher/courses/:courseId/sections', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const courseId = courseIdParam(c)
  if (!(await courseForTeacher(db, teacher.teacherId, courseId))) return notYours()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const title = titleFrom(body)
  if (!title) return invalid({ title: 'Give the module a title of 2–120 characters.' })
  await addSection(db, courseId, title)
  return c.json(await outlinePayload(db, teacher.teacherId, courseId), 201)
})

app.delete('/api/teacher/courses/:courseId/sections/:sectionId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const courseId = courseIdParam(c)
  if (!(await courseForTeacher(db, teacher.teacherId, courseId))) return notYours()
  if (!(await deleteSection(db, courseId, c.req.param('sectionId')))) return c.json({ error: 'That module could not be found.' }, 404)
  return c.json(await outlinePayload(db, teacher.teacherId, courseId))
})

app.post('/api/teacher/courses/:courseId/sections/:sectionId/chapters', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const courseId = courseIdParam(c)
  if (!(await courseForTeacher(db, teacher.teacherId, courseId))) return notYours()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const title = titleFrom(body)
  if (!title) return invalid({ title: 'Give the chapter a title of 2–120 characters.' })
  if (!(await addChapter(db, courseId, c.req.param('sectionId'), title))) return c.json({ error: 'That module could not be found.' }, 404)
  return c.json(await outlinePayload(db, teacher.teacherId, courseId), 201)
})

app.delete('/api/teacher/courses/:courseId/chapters/:chapterId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const courseId = courseIdParam(c)
  if (!(await courseForTeacher(db, teacher.teacherId, courseId))) return notYours()
  if (!(await deleteChapter(db, courseId, c.req.param('chapterId')))) return c.json({ error: 'That chapter could not be found.' }, 404)
  return c.json(await outlinePayload(db, teacher.teacherId, courseId))
})

app.post('/api/teacher/courses/:courseId/chapters/:chapterId/lessons', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const courseId = courseIdParam(c)
  if (!(await courseForTeacher(db, teacher.teacherId, courseId))) return notYours()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const title = titleFrom(body)
  if (!title) return invalid({ title: 'Give the lecture a title of 2–120 characters.' })
  const kind = body.kind === 'TEXT' ? 'TEXT' : 'VIDEO'
  const minutes = Number(body.estimatedMinutes)
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) return invalid({ estimatedMinutes: 'Enter a duration between 1 and 600 minutes.' })
  if (!(await addLesson(db, courseId, c.req.param('chapterId'), { title, kind, estimatedMinutes: minutes }))) return c.json({ error: 'That chapter could not be found.' }, 404)
  return c.json(await outlinePayload(db, teacher.teacherId, courseId), 201)
})

app.delete('/api/teacher/courses/:courseId/lessons/:lessonId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const courseId = courseIdParam(c)
  if (!(await courseForTeacher(db, teacher.teacherId, courseId))) return notYours()
  if (!(await deleteLesson(db, courseId, c.req.param('lessonId')))) return c.json({ error: 'That lecture could not be found.' }, 404)
  return c.json(await outlinePayload(db, teacher.teacherId, courseId))
})

app.post('/api/teacher/courses/:courseId/reorder', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const courseId = courseIdParam(c)
  if (!(await courseForTeacher(db, teacher.teacherId, courseId))) return notYours()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const kind = body.kind === 'SECTION' || body.kind === 'CHAPTER' || body.kind === 'LESSON' ? body.kind : null
  const direction = body.direction === 'UP' || body.direction === 'DOWN' ? body.direction : null
  if (kind && direction && typeof body.id === 'string' && (await move(db, courseId, kind, body.id, direction))) {
    return c.json(await outlinePayload(db, teacher.teacherId, courseId))
  }
  return c.json({ error: 'That item cannot move any further.' }, 409)
})

app.post('/api/teacher/courses/:courseId/publish', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const courseId = courseIdParam(c)
  const course = await courseForTeacher(db, teacher.teacherId, courseId)
  if (!course) return notYours()
  const publish = await publishValidation(db, course, courseId)
  if (!publish.canPublish) return c.json({ error: 'Some publish requirements are unmet.', publish }, 422)
  const updated = await setCourseStatus(db, teacher.teacherId, courseId, 'PUBLISHED')
  if (!updated) return notYours()
  const [sections, refreshed] = await Promise.all([outlineFor(db, courseId), publishValidation(db, updated, courseId)])
  return c.json({ course: updated, sections, publish: refreshed })
})

app.post('/api/teacher/courses/:courseId/unpublish', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const courseId = courseIdParam(c)
  const updated = await setCourseStatus(db, teacher.teacherId, courseId, 'UNPUBLISHED')
  if (!updated) return notYours()
  const [sections, publish] = await Promise.all([outlineFor(db, courseId), publishValidation(db, updated, courseId)])
  return c.json({ course: updated, sections, publish })
})

/* ------------------------------ lectures ------------------------------ */

const lectureNotFound = () => apiError(404, 'That lecture is not in one of your courses.')

/** A datetime field: null or "" clears it, a bad value is reported to the caller. */
function parseIso(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === '') return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false }
  const time = Date.parse(value)
  return Number.isNaN(time) ? { ok: false } : { ok: true, value: new Date(time).toISOString() }
}

/** Every lecture across this teacher's courses, plus the picker options. */
app.get('/api/teacher/lectures', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const [items, courses] = await Promise.all([lecturesForTeacher(c.env.DB, teacher.teacherId), coursesForTeacher(c.env.DB, teacher.teacherId)])
  return c.json({ items, courses: courses.map((course) => ({ id: course.id, title: course.title })), totalCount: items.length })
})

app.get('/api/teacher/lectures/:lectureId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const lecture = await lectureDetail(c.env.DB, teacher.teacherId, c.req.param('lectureId'))
  if (!lecture) return lectureNotFound()
  return c.json(lecture)
})

app.patch('/api/teacher/lectures/:lectureId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const lectureId = c.req.param('lectureId')
  if (!(await lectureDetail(db, teacher.teacherId, lectureId))) return lectureNotFound()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()

  const patch: LecturePatch = {}

  if (body.title !== undefined) {
    const title = titleFrom(body)
    if (!title) return invalid({ title: 'Give the lecture a title of 2–120 characters.' })
    patch.title = title
  }
  if (body.estimatedMinutes !== undefined) {
    const minutes = Number(body.estimatedMinutes)
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) return invalid({ estimatedMinutes: 'Enter a duration between 1 and 600 minutes.' })
    patch.estimatedMinutes = minutes
  }
  if (body.isPreview !== undefined) {
    if (typeof body.isPreview !== 'boolean') return invalid({ isPreview: 'Choose whether this lecture is a free preview.' })
    patch.isPreview = body.isPreview
  }
  if (body.body !== undefined) {
    if (body.body !== null && typeof body.body !== 'string') return invalid({ body: 'Lecture notes must be text.' })
    const notes = typeof body.body === 'string' ? body.body : ''
    if (notes.length > 20000) return invalid({ body: 'Lecture notes are limited to 20,000 characters.' })
    patch.body = notes
  }
  for (const field of ['availableFrom', 'availableUntil'] as const) {
    if (body[field] === undefined) continue
    const parsed = parseIso(body[field])
    if (!parsed.ok) return invalid({ [field]: 'Enter a valid date and time, or leave it empty.' })
    patch[field] = parsed.value
  }
  if (patch.availableFrom && patch.availableUntil && Date.parse(patch.availableUntil) <= Date.parse(patch.availableFrom)) {
    return invalid({ availableUntil: 'The closing date must be after the opening date.' })
  }

  const updated = await applyLecturePatch(db, teacher.teacherId, lectureId, patch)
  if (!updated) return lectureNotFound()
  return c.json(updated)
})

app.post('/api/teacher/lectures/:lectureId/publish', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const lectureId = c.req.param('lectureId')
  const lecture = await lectureDetail(db, teacher.teacherId, lectureId)
  if (!lecture) return lectureNotFound()
  if (!lecture.publish.canPublish) return c.json({ error: 'Some publish requirements are unmet.', publish: lecture.publish }, 422)
  const updated = await setLectureStatus(db, teacher.teacherId, lectureId, 'PUBLISHED')
  if (!updated) return lectureNotFound()
  return c.json(updated)
})

app.post('/api/teacher/lectures/:lectureId/unpublish', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const lectureId = c.req.param('lectureId')
  const updated = await setLectureStatus(c.env.DB, teacher.teacherId, lectureId, 'DRAFT')
  if (!updated) return lectureNotFound()
  return c.json(updated)
})

const RESOURCE_KINDS = ['PDF', 'SLIDES', 'DATASET', 'LINK', 'OTHER'] as const

app.post('/api/teacher/lectures/:lectureId/resources', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const lectureId = c.req.param('lectureId')
  if (!(await lectureDetail(db, teacher.teacherId, lectureId))) return lectureNotFound()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()

  const title = titleFrom(body)
  if (!title) return invalid({ title: 'Give the resource a title of 2–120 characters.' })
  const kind = RESOURCE_KINDS.find((k) => k === body.kind) ?? null
  if (!kind) return invalid({ kind: 'Choose a resource kind.' })
  const url = typeof body.externalUrl === 'string' ? body.externalUrl.trim() : ''
  if (!/^https?:\/\/[^\s]+$/i.test(url)) {
    // Hosted files need the media upload endpoint this build does not have yet.
    return invalid({ externalUrl: 'Paste a full http(s) link. Uploading files is not connected yet.' })
  }

  const updated = await addLectureResource(db, teacher.teacherId, lectureId, { title, kind, externalUrl: url, sizeBytes: null })
  if (!updated) return lectureNotFound()
  return c.json(updated, 201)
})

app.delete('/api/teacher/lectures/:lectureId/resources/:resourceId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const lectureId = c.req.param('lectureId')
  if (!(await lectureDetail(db, teacher.teacherId, lectureId))) return lectureNotFound()
  const updated = await removeLectureResource(db, teacher.teacherId, lectureId, c.req.param('resourceId'))
  if (!updated) return c.json({ error: 'That resource could not be found.' }, 404)
  return c.json(updated)
})

/* ------------------------------ subjects ------------------------------ */

const subjectNotFound = () => apiError(404, 'That subject is not in one of your courses.')
const topicNotFound = () => apiError(404, 'That topic could not be found.')
const syllabusLessonNotFound = () => apiError(404, 'That lesson could not be found.')

/** Optional short text: undefined when absent, null when the wrong type or too long. */
function textFrom(value: unknown, max: number): { ok: true; value: string | undefined } | { ok: false } {
  if (value === undefined) return { ok: true, value: undefined }
  if (typeof value !== 'string') return { ok: false }
  const text = value.trim()
  return text.length > max ? { ok: false } : { ok: true, value: text }
}

/** Course ids the caller may attach: shape errors are 422, someone else's course is 404. */
async function courseIdsFrom(db: D1Database, teacherId: string, value: unknown): Promise<{ ok: true; value: string[] } | { ok: false; code: 422 | 404 }> {
  if (!Array.isArray(value) || !value.length || value.some((v) => typeof v !== 'string')) return { ok: false, code: 422 }
  const ids = [...new Set(value as string[])]
  for (const id of ids) {
    if (!(await courseForTeacher(db, teacherId, id))) return { ok: false, code: 404 }
  }
  return { ok: true, value: ids }
}

app.get('/api/teacher/subjects', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const [items, courses] = await Promise.all([subjectsForTeacher(c.env.DB, teacher.teacherId), coursesForTeacher(c.env.DB, teacher.teacherId)])
  return c.json({ items, courses: courses.map((course) => ({ id: course.id, title: course.title })), totalCount: items.length })
})

app.post('/api/teacher/subjects', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const body = await readBody(c.req.raw)
  if (!body) return badJson()

  const name = titleFrom({ title: body.name })
  if (!name) return invalid({ name: 'Give the subject a name of 2–120 characters.' })
  const description = textFrom(body.description, 2000)
  if (!description.ok) return invalid({ description: 'Describe the subject in plain text, under 2,000 characters.' })
  const courseIds = await courseIdsFrom(db, teacher.teacherId, body.courseIds)
  if (!courseIds.ok) {
    return courseIds.code === 404 ? notYours() : invalid({ courseIds: 'Choose at least one of your training courses.' })
  }

  const subject = await createSubject(db, teacher.teacherId, { name, description: description.value ?? '', courseIds: courseIds.value })
  if (!subject) return notYours()
  return c.json(subject, 201)
})

app.get('/api/teacher/subjects/:subjectId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const subject = await subjectDetail(c.env.DB, teacher.teacherId, c.req.param('subjectId'))
  if (!subject) return subjectNotFound()
  return c.json(subject)
})

app.patch('/api/teacher/subjects/:subjectId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const subjectId = c.req.param('subjectId')
  if (!(await subjectDetail(db, teacher.teacherId, subjectId))) return subjectNotFound()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()

  const patch: SubjectPatch = {}
  if (body.name !== undefined) {
    const name = titleFrom({ title: body.name })
    if (!name) return invalid({ name: 'Give the subject a name of 2–120 characters.' })
    patch.name = name
  }
  if (body.description !== undefined) {
    const description = textFrom(body.description, 2000)
    if (!description.ok) return invalid({ description: 'Describe the subject in plain text, under 2,000 characters.' })
    patch.description = description.value
  }
  if (body.courseIds !== undefined) {
    const courseIds = await courseIdsFrom(db, teacher.teacherId, body.courseIds)
    if (!courseIds.ok) {
      return courseIds.code === 404 ? notYours() : invalid({ courseIds: 'Choose at least one of your training courses.' })
    }
    patch.courseIds = courseIds.value
  }
  if (!Object.keys(patch).length) return invalid({ form: 'Change something before saving.' })

  const updated = await updateSubject(db, teacher.teacherId, subjectId, patch)
  if (!updated) return subjectNotFound()
  return c.json(updated)
})

app.post('/api/teacher/subjects/:subjectId/publish', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const subjectId = c.req.param('subjectId')
  const subject = await subjectDetail(db, teacher.teacherId, subjectId)
  if (!subject) return subjectNotFound()
  if (!subject.publish.canPublish) return c.json({ error: 'Some publish requirements are unmet.', publish: subject.publish }, 422)
  const updated = await setSubjectStatus(db, teacher.teacherId, subjectId, 'PUBLISHED')
  if (!updated) return subjectNotFound()
  return c.json(updated)
})

app.post('/api/teacher/subjects/:subjectId/unpublish', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const subjectId = c.req.param('subjectId')
  const updated = await setSubjectStatus(c.env.DB, teacher.teacherId, subjectId, 'DRAFT')
  if (!updated) return subjectNotFound()
  return c.json(updated)
})

app.post('/api/teacher/subjects/:subjectId/topics', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const subjectId = c.req.param('subjectId')
  if (!(await subjectDetail(db, teacher.teacherId, subjectId))) return subjectNotFound()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()

  const title = titleFrom(body)
  if (!title) return invalid({ title: 'Give the topic a title of 2–120 characters.' })
  const description = textFrom(body.description, 1000)
  if (!description.ok) return invalid({ description: 'Describe the topic in plain text, under 1,000 characters.' })

  const updated = await addTopic(db, teacher.teacherId, subjectId, { title, description: description.value ?? '' })
  if (!updated) return subjectNotFound()
  return c.json(updated, 201)
})

app.patch('/api/teacher/topics/:topicId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const topicId = c.req.param('topicId')
  const body = await readBody(c.req.raw)
  if (!body) return badJson()

  const patch: { title?: string; description?: string } = {}
  if (body.title !== undefined) {
    const title = titleFrom(body)
    if (!title) return invalid({ title: 'Give the topic a title of 2–120 characters.' })
    patch.title = title
  }
  if (body.description !== undefined) {
    const description = textFrom(body.description, 1000)
    if (!description.ok) return invalid({ description: 'Describe the topic in plain text, under 1,000 characters.' })
    patch.description = description.value
  }
  if (!Object.keys(patch).length) return invalid({ form: 'Change something before saving.' })

  const updated = await updateTopic(db, teacher.teacherId, topicId, patch)
  if (!updated) return topicNotFound()
  return c.json(updated)
})

app.delete('/api/teacher/topics/:topicId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const updated = await deleteTopic(c.env.DB, teacher.teacherId, c.req.param('topicId'))
  if (!updated) return topicNotFound()
  return c.json(updated)
})

app.post('/api/teacher/topics/:topicId/lessons', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const topicId = c.req.param('topicId')
  const body = await readBody(c.req.raw)
  if (!body) return badJson()

  const title = titleFrom(body)
  if (!title) return invalid({ title: 'Give the lesson a title of 2–120 characters.' })
  const description = textFrom(body.description, 1000)
  if (!description.ok) return invalid({ description: 'Describe the lesson in plain text, under 1,000 characters.' })

  const updated = await addSyllabusLesson(db, teacher.teacherId, topicId, { title, description: description.value ?? '' })
  if (!updated) return topicNotFound()
  return c.json(updated, 201)
})

app.patch('/api/teacher/subject-lessons/:lessonId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const lessonId = c.req.param('lessonId')
  const body = await readBody(c.req.raw)
  if (!body) return badJson()

  const patch: { title?: string; description?: string } = {}
  if (body.title !== undefined) {
    const title = titleFrom(body)
    if (!title) return invalid({ title: 'Give the lesson a title of 2–120 characters.' })
    patch.title = title
  }
  if (body.description !== undefined) {
    const description = textFrom(body.description, 1000)
    if (!description.ok) return invalid({ description: 'Describe the lesson in plain text, under 1,000 characters.' })
    patch.description = description.value
  }
  if (!Object.keys(patch).length) return invalid({ form: 'Change something before saving.' })

  const updated = await updateSyllabusLesson(db, teacher.teacherId, lessonId, patch)
  if (!updated) return syllabusLessonNotFound()
  return c.json(updated)
})

app.delete('/api/teacher/subject-lessons/:lessonId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const updated = await deleteSyllabusLesson(c.env.DB, teacher.teacherId, c.req.param('lessonId'))
  if (!updated) return syllabusLessonNotFound()
  return c.json(updated)
})

app.post('/api/teacher/subjects/:subjectId/reorder', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const subjectId = c.req.param('subjectId')
  if (!(await subjectDetail(db, teacher.teacherId, subjectId))) return subjectNotFound()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()

  const kind = body.kind === 'TOPIC' || body.kind === 'LESSON' ? body.kind : null
  const direction = body.direction === 'UP' || body.direction === 'DOWN' ? body.direction : null
  if (!kind || !direction || typeof body.id !== 'string') return invalid({ form: 'Choose an item and a direction.' })

  const result = await moveSubjectItem(db, teacher.teacherId, subjectId, kind, body.id, direction)
  if (!result) return subjectNotFound()
  if (!result.moved) return c.json({ error: 'That item cannot move any further.', subject: result.detail }, 409)
  return c.json(result.detail)
})

/** Attach an existing lecture ({ lectureId }) or create one in a course ({ courseId, kind, estimatedMinutes }). */
app.post('/api/teacher/subject-lessons/:lessonId/lectures', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const lessonId = c.req.param('lessonId')
  const body = await readBody(c.req.raw)
  if (!body) return badJson()

  if (body.lectureId !== undefined) {
    if (typeof body.lectureId !== 'string') return invalid({ lectureId: 'Choose a lecture.' })
    const result = await attachExistingLecture(db, teacher.teacherId, lessonId, body.lectureId)
    if (result.status === 'CONFLICT') {
      return c.json({ error: 'That lecture already delivers another syllabus lesson.' }, 409)
    }
    if (result.status !== 'OK') return syllabusLessonNotFound()
    return c.json(result.detail, 201)
  }

  if (typeof body.courseId !== 'string') return invalid({ courseId: 'Choose the course this lecture is taught in.' })
  if (!(await courseForTeacher(db, teacher.teacherId, body.courseId))) return notYours()
  const kind = body.kind === 'TEXT' ? 'TEXT' : body.kind === 'VIDEO' ? 'VIDEO' : null
  if (!kind) return invalid({ kind: 'Choose video or text.' })
  const minutes = Number(body.estimatedMinutes)
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) {
    return invalid({ estimatedMinutes: 'Enter a duration between 1 and 600 minutes.' })
  }

  const result = await createLectureForLesson(db, teacher.teacherId, lessonId, { courseId: body.courseId, kind, estimatedMinutes: minutes })
  if (result.status !== 'OK') return syllabusLessonNotFound()
  return c.json(result.detail, 201)
})

app.delete('/api/teacher/subject-lessons/:lessonId/lectures/:lectureId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const updated = await detachLecture(c.env.DB, teacher.teacherId, c.req.param('lessonId'), c.req.param('lectureId'))
  if (updated.status !== 'OK') return c.json({ error: 'That lecture is not attached to this lesson.' }, 404)
  return c.json(updated.detail)
})

/* ------------------------ assignments and marking ----------------------- */

const assignmentNotFound = () => apiError(404, 'That assignment is not in one of your courses.')
const submissionNotFound = () => apiError(404, 'That submission is not in one of your courses.')

const LATE_POLICIES: LatePolicy[] = ['BLOCK', 'ALLOW', 'MARK_LATE']

const latePolicyFrom = (value: unknown): LatePolicy | null => LATE_POLICIES.find((p) => p === value) ?? null

/** A whole number in range, or null when the value is not one. */
function wholeNumber(value: unknown, min: number, max: number): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

/** Every assignment in this teacher's courses, plus the course picker. */
app.get('/api/teacher/assignments', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const [items, courses] = await Promise.all([assignmentsForTeacher(c.env.DB, teacher.teacherId), coursesForTeacher(c.env.DB, teacher.teacherId)])
  return c.json({ items, courses: courses.map((course) => ({ id: course.id, title: course.title })), totalCount: items.length })
})

app.post('/api/teacher/assignments', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const body = await readBody(c.req.raw)
  if (!body) return badJson()

  const courseId = typeof body.courseId === 'string' ? body.courseId : ''
  if (!courseId) return invalid({ courseId: 'Choose the course this assignment belongs to.' })
  if (!(await courseForTeacher(db, teacher.teacherId, courseId))) return notYours()

  const title = titleFrom(body)
  if (!title) return invalid({ title: 'Give the assignment a title of 2–120 characters.' })

  const instructions = textFrom(body.instructions, 5000)
  if (!instructions.ok) return invalid({ instructions: 'Instructions must be plain text under 5,000 characters.' })

  const parsedOpen = parseIso(body.opensAt ?? null)
  if (!parsedOpen.ok) return invalid({ opensAt: 'Enter a valid opening date and time.' })
  const opensAt = parsedOpen.value ?? new Date().toISOString()

  const parsedDue = parseIso(body.dueAt ?? null)
  if (!parsedDue.ok || !parsedDue.value) return invalid({ dueAt: 'Enter a valid due date and time.' })
  if (Date.parse(parsedDue.value) <= Date.parse(opensAt)) return invalid({ dueAt: 'The due date must be after the opening date.' })

  const maxScore = body.maxScore === undefined ? 100 : wholeNumber(body.maxScore, 1, 1000)
  if (maxScore === null) return invalid({ maxScore: 'Enter a maximum score between 1 and 1,000.' })

  const attemptsAllowed = body.attemptsAllowed === undefined ? 1 : wholeNumber(body.attemptsAllowed, 1, 10)
  if (attemptsAllowed === null) return invalid({ attemptsAllowed: 'Allow between 1 and 10 attempts.' })

  const latePolicy = body.latePolicy === undefined ? 'MARK_LATE' : latePolicyFrom(body.latePolicy)
  if (!latePolicy) return invalid({ latePolicy: 'Choose what happens to late work.' })

  if (body.allowFileUpload !== undefined && typeof body.allowFileUpload !== 'boolean') {
    return invalid({ allowFileUpload: 'Choose whether students may attach a file.' })
  }

  const assignment = await createAssignment(db, teacher.teacherId, {
    courseId,
    title,
    instructions: instructions.value ?? '',
    opensAt,
    dueAt: parsedDue.value,
    latePolicy,
    attemptsAllowed,
    maxScore,
    allowFileUpload: body.allowFileUpload === true,
  })
  if (!assignment) return notYours()
  return c.json(assignment, 201)
})

app.get('/api/teacher/assignments/:assignmentId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const assignment = await assignmentDetail(c.env.DB, teacher.teacherId, c.req.param('assignmentId'))
  if (!assignment) return assignmentNotFound()
  return c.json(assignment)
})

app.patch('/api/teacher/assignments/:assignmentId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const assignmentId = c.req.param('assignmentId')
  const existing = await assignmentDetail(db, teacher.teacherId, assignmentId)
  if (!existing) return assignmentNotFound()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()

  const patch: AssignmentPatch = {}

  if (body.title !== undefined) {
    const title = titleFrom(body)
    if (!title) return invalid({ title: 'Give the assignment a title of 2–120 characters.' })
    patch.title = title
  }
  if (body.instructions !== undefined) {
    const instructions = textFrom(body.instructions, 5000)
    if (!instructions.ok) return invalid({ instructions: 'Instructions must be plain text under 5,000 characters.' })
    patch.instructions = instructions.value ?? ''
  }
  for (const field of ['opensAt', 'dueAt'] as const) {
    if (body[field] === undefined) continue
    const parsed = parseIso(body[field])
    if (!parsed.ok || !parsed.value) return invalid({ [field]: 'Enter a valid date and time.' })
    patch[field] = parsed.value
  }
  if (body.latePolicy !== undefined) {
    const policy = latePolicyFrom(body.latePolicy)
    if (!policy) return invalid({ latePolicy: 'Choose what happens to late work.' })
    patch.latePolicy = policy
  }
  if (body.attemptsAllowed !== undefined) {
    const attempts = wholeNumber(body.attemptsAllowed, 1, 10)
    if (attempts === null) return invalid({ attemptsAllowed: 'Allow between 1 and 10 attempts.' })
    patch.attemptsAllowed = attempts
  }
  if (body.maxScore !== undefined) {
    const score = wholeNumber(body.maxScore, 1, 1000)
    if (score === null) return invalid({ maxScore: 'Enter a maximum score between 1 and 1,000.' })
    patch.maxScore = score
  }
  if (body.allowFileUpload !== undefined) {
    if (typeof body.allowFileUpload !== 'boolean') return invalid({ allowFileUpload: 'Choose whether students may attach a file.' })
    patch.allowFileUpload = body.allowFileUpload
  }
  if (!Object.keys(patch).length) return invalid({ form: 'Change something before saving.' })

  const opens = patch.opensAt ?? existing.opensAt
  const due = patch.dueAt ?? existing.dueAt
  if (Date.parse(due) <= Date.parse(opens)) return invalid({ dueAt: 'The due date must be after the opening date.' })

  const updated = await updateAssignment(db, teacher.teacherId, assignmentId, patch)
  if (!updated) return assignmentNotFound()
  return c.json(updated)
})

app.post('/api/teacher/assignments/:assignmentId/publish', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const assignmentId = c.req.param('assignmentId')
  const assignment = await assignmentDetail(db, teacher.teacherId, assignmentId)
  if (!assignment) return assignmentNotFound()
  if (!assignment.publish.canPublish) return c.json({ error: 'Some publish requirements are unmet.', publish: assignment.publish }, 422)
  const updated = await setAssignmentPublished(db, teacher.teacherId, assignmentId, true)
  if (!updated) return assignmentNotFound()
  return c.json(updated)
})

app.post('/api/teacher/assignments/:assignmentId/unpublish', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const assignmentId = c.req.param('assignmentId')
  const updated = await setAssignmentPublished(c.env.DB, teacher.teacherId, assignmentId, false)
  if (!updated) return assignmentNotFound()
  return c.json(updated)
})

app.post('/api/teacher/assignments/:assignmentId/close', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const assignmentId = c.req.param('assignmentId')
  const updated = await setAssignmentClosed(c.env.DB, teacher.teacherId, assignmentId, true)
  if (!updated) return assignmentNotFound()
  return c.json(updated)
})

app.post('/api/teacher/assignments/:assignmentId/reopen', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const assignmentId = c.req.param('assignmentId')
  const updated = await setAssignmentClosed(c.env.DB, teacher.teacherId, assignmentId, false)
  if (!updated) return assignmentNotFound()
  return c.json(updated)
})

/** The marking queue: every submission in this teacher's courses. */
app.get('/api/teacher/submissions', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  return c.json(await submissionsForTeacher(c.env.DB, teacher.teacherId))
})

app.get('/api/teacher/submissions/:submissionId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const submission = await submissionDetail(c.env.DB, teacher.teacherId, c.req.param('submissionId'))
  if (!submission) return submissionNotFound()
  return c.json(submission)
})

/** Save draft feedback and a mark. The student sees nothing until it is published. */
app.patch('/api/teacher/submissions/:submissionId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const submissionId = c.req.param('submissionId')
  const submission = await submissionDetail(db, teacher.teacherId, submissionId)
  if (!submission) return submissionNotFound()
  if (submission.publishedAt) return c.json({ error: 'Withdraw the published grade before editing it.' }, 409)
  const body = await readBody(c.req.raw)
  if (!body) return badJson()

  let score: number | null = null
  if (body.score !== undefined && body.score !== null && body.score !== '') {
    const parsed = wholeNumber(body.score, 0, submission.maxScore)
    if (parsed === null) return invalid({ score: `Enter a whole number from 0 to ${submission.maxScore}.` })
    score = parsed
  }
  if (body.feedback !== undefined && typeof body.feedback !== 'string') return invalid({ feedback: 'Feedback must be plain text.' })
  const feedback = typeof body.feedback === 'string' ? body.feedback : submission.feedback
  if (feedback.length > 5000) return invalid({ feedback: 'Feedback is limited to 5,000 characters.' })

  const updated = await saveGrade(db, teacher.teacherId, submissionId, { score, feedback })
  if (!updated) return submissionNotFound()
  return c.json(updated)
})

app.post('/api/teacher/submissions/:submissionId/publish', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const submissionId = c.req.param('submissionId')
  const submission = await submissionDetail(db, teacher.teacherId, submissionId)
  if (!submission) return submissionNotFound()
  if (submission.publishedAt) return c.json({ error: 'This grade is already published.' }, 409)
  if (submission.score === null) return invalid({ score: 'Save a score before publishing the grade.' })
  const updated = await publishGrade(db, teacher.teacherId, submissionId)
  if (!updated) return submissionNotFound()
  return c.json(updated)
})

/** Take a released mark back so it can be corrected. The reason is kept. */
app.post('/api/teacher/submissions/:submissionId/withdraw', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const submissionId = c.req.param('submissionId')
  const submission = await submissionDetail(db, teacher.teacherId, submissionId)
  if (!submission) return submissionNotFound()
  if (!submission.publishedAt) return c.json({ error: 'That grade is not published.' }, 409)
  const body = await readBody(c.req.raw)
  if (!body) return badJson()

  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 5) return invalid({ reason: 'Give a short reason for withdrawing the grade.' })
  if (reason.length > 500) return invalid({ reason: 'Keep the reason under 500 characters.' })

  const updated = await withdrawGrade(db, teacher.teacherId, submissionId, reason)
  if (!updated) return submissionNotFound()
  return c.json(updated)
})

/* -------------------------------- quizzes -------------------------------- */

const quizNotFound = () => apiError(404, 'That quiz is not in one of your courses.')
const questionNotFound = () => apiError(404, 'That question is not in one of your quizzes.')
const quizAttemptNotFound = () => apiError(404, 'That attempt is not in one of your quizzes.')
const quizLocked = () => apiError(409, 'Questions are fixed once a quiz is published. Unpublish it to edit them.')

const releasePolicyFrom = (value: unknown): QuizReleasePolicy | null => RELEASE_POLICIES.find((p) => p === value) ?? null

/** The answer every question mutation gives: the whole quiz, or the reason it was refused. */
function questionResponse(result: QuestionResult, created = false) {
  if (result.status === 'NOT_FOUND') return questionNotFound()
  if (result.status === 'LOCKED') return quizLocked()
  if (result.status === 'NO_MOVE') return apiError(409, 'That question cannot move any further.')
  return Response.json(result.quiz, { status: created ? 201 : 200 })
}

/** The settings both create and edit accept. Missing fields are left out of the patch. */
function quizFieldsFrom(body: Record<string, unknown>): { ok: true; patch: QuizPatch } | { ok: false; errors: FieldErrors } {
  const patch: QuizPatch = {}
  if (body.title !== undefined) {
    const title = titleFrom(body)
    if (!title) return { ok: false, errors: { title: 'Give the quiz a title of 2–120 characters.' } }
    patch.title = title
  }
  if (body.instructions !== undefined) {
    const instructions = textFrom(body.instructions, 5000)
    if (!instructions.ok) return { ok: false, errors: { instructions: 'Instructions must be plain text under 5,000 characters.' } }
    patch.instructions = instructions.value ?? ''
  }
  for (const field of ['opensAt', 'closesAt'] as const) {
    if (body[field] === undefined) continue
    const parsed = parseIso(body[field])
    if (!parsed.ok || !parsed.value) return { ok: false, errors: { [field]: 'Enter a valid date and time.' } }
    patch[field] = parsed.value
  }
  if (body.durationMinutes !== undefined) {
    const minutes = wholeNumber(body.durationMinutes, 1, 600)
    if (minutes === null) return { ok: false, errors: { durationMinutes: 'Set a time limit between 1 and 600 minutes.' } }
    patch.durationMinutes = minutes
  }
  if (body.attemptsAllowed !== undefined) {
    const attempts = wholeNumber(body.attemptsAllowed, 1, 10)
    if (attempts === null) return { ok: false, errors: { attemptsAllowed: 'Allow between 1 and 10 attempts.' } }
    patch.attemptsAllowed = attempts
  }
  if (body.passPercent !== undefined) {
    const pass = wholeNumber(body.passPercent, 0, 100)
    if (pass === null) return { ok: false, errors: { passPercent: 'Set a pass mark from 0 to 100%.' } }
    patch.passPercent = pass
  }
  if (body.releasePolicy !== undefined) {
    const policy = releasePolicyFrom(body.releasePolicy)
    if (!policy) return { ok: false, errors: { releasePolicy: 'Choose when students see their results.' } }
    patch.releasePolicy = policy
  }
  if (body.shuffleQuestions !== undefined) {
    if (typeof body.shuffleQuestions !== 'boolean') return { ok: false, errors: { shuffleQuestions: 'Choose whether to shuffle the questions.' } }
    patch.shuffleQuestions = body.shuffleQuestions
  }
  return { ok: true, patch }
}

/** Every quiz in this teacher's courses, plus the course picker. */
app.get('/api/teacher/quizzes', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const [items, courses] = await Promise.all([quizzesForTeacher(c.env.DB, teacher.teacherId), coursesForTeacher(c.env.DB, teacher.teacherId)])
  return c.json({ items, courses: courses.map((course) => ({ id: course.id, title: course.title })), totalCount: items.length })
})

app.post('/api/teacher/quizzes', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const body = await readBody(c.req.raw)
  if (!body) return badJson()

  const courseId = typeof body.courseId === 'string' ? body.courseId : ''
  if (!courseId) return invalid({ courseId: 'Choose the course this quiz belongs to.' })
  if (!(await courseForTeacher(db, teacher.teacherId, courseId))) return notYours()
  if (body.title === undefined) return invalid({ title: 'Give the quiz a title of 2–120 characters.' })
  if (body.closesAt === undefined || body.closesAt === null || body.closesAt === '') return invalid({ closesAt: 'Enter a valid closing date and time.' })

  const fields = quizFieldsFrom({ ...body, opensAt: body.opensAt || new Date().toISOString() })
  if (!fields.ok) return invalid(fields.errors)
  const p = fields.patch
  if (Date.parse(p.closesAt!) <= Date.parse(p.opensAt!)) return invalid({ closesAt: 'The quiz must close after it opens.' })

  const quiz = await createQuiz(db, teacher.teacherId, {
    courseId,
    title: p.title!,
    instructions: p.instructions ?? '',
    opensAt: p.opensAt!,
    closesAt: p.closesAt!,
    durationMinutes: p.durationMinutes ?? 30,
    attemptsAllowed: p.attemptsAllowed ?? 1,
    passPercent: p.passPercent ?? 50,
    releasePolicy: p.releasePolicy ?? 'IMMEDIATE',
    shuffleQuestions: p.shuffleQuestions ?? false,
  })
  if (!quiz) return notYours()
  return c.json(quiz, 201)
})

app.get('/api/teacher/quizzes/:quizId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const quiz = await quizDetail(c.env.DB, teacher.teacherId, c.req.param('quizId'))
  if (!quiz) return quizNotFound()
  return c.json(quiz)
})

app.patch('/api/teacher/quizzes/:quizId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const quizId = c.req.param('quizId')
  const existing = await quizDetail(db, teacher.teacherId, quizId)
  if (!existing) return quizNotFound()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()

  const fields = quizFieldsFrom(body)
  if (!fields.ok) return invalid(fields.errors)
  if (!Object.keys(fields.patch).length) return invalid({ form: 'Change something before saving.' })
  const opens = fields.patch.opensAt ?? existing.opensAt
  const closes = fields.patch.closesAt ?? existing.closesAt
  if (Date.parse(closes) <= Date.parse(opens)) return invalid({ closesAt: 'The quiz must close after it opens.' })

  const updated = await updateQuiz(db, teacher.teacherId, quizId, fields.patch)
  if (!updated) return quizNotFound()
  return c.json(updated)
})

app.post('/api/teacher/quizzes/:quizId/publish', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const result = await setQuizPublished(c.env.DB, teacher.teacherId, c.req.param('quizId'), true)
  if (result.status === 'NOT_FOUND') return quizNotFound()
  if (result.status === 'INVALID') return c.json({ error: 'Some publish requirements are unmet.', publish: result.quiz.publish }, 422)
  if (result.status === 'HAS_ATTEMPTS') return quizNotFound()
  return c.json(result.quiz)
})

app.post('/api/teacher/quizzes/:quizId/unpublish', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const result = await setQuizPublished(c.env.DB, teacher.teacherId, c.req.param('quizId'), false)
  if (result.status === 'NOT_FOUND') return quizNotFound()
  if (result.status === 'HAS_ATTEMPTS') return c.json({ error: 'Students have already started this quiz, so it cannot go back to draft. Close it instead.' }, 409)
  if (result.status === 'INVALID') return quizNotFound()
  return c.json(result.quiz)
})

app.post('/api/teacher/quizzes/:quizId/close', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const updated = await setQuizClosed(c.env.DB, teacher.teacherId, c.req.param('quizId'), true)
  if (!updated) return quizNotFound()
  return c.json(updated)
})

app.post('/api/teacher/quizzes/:quizId/reopen', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const updated = await setQuizClosed(c.env.DB, teacher.teacherId, c.req.param('quizId'), false)
  if (!updated) return quizNotFound()
  return c.json(updated)
})

app.post('/api/teacher/quizzes/:quizId/questions', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const db = c.env.DB
  const quizId = c.req.param('quizId')
  if (!(await quizDetail(db, teacher.teacherId, quizId))) return quizNotFound()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const question = normaliseQuestion(body)
  if (!question.ok) return invalid({ [question.field]: question.error })
  return questionResponse(await addQuestion(db, teacher.teacherId, quizId, question.value), true)
})

app.put('/api/teacher/quiz-questions/:questionId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const question = normaliseQuestion(body)
  if (!question.ok) return invalid({ [question.field]: question.error })
  return questionResponse(await replaceQuestion(c.env.DB, teacher.teacherId, c.req.param('questionId'), question.value))
})

app.delete('/api/teacher/quiz-questions/:questionId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  return questionResponse(await deleteQuestion(c.env.DB, teacher.teacherId, c.req.param('questionId')))
})

app.post('/api/teacher/quiz-questions/:questionId/move', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const direction = body.direction === 'UP' || body.direction === 'DOWN' ? body.direction : null
  if (!direction) return invalid({ direction: 'Choose up or down.' })
  return questionResponse(await moveQuestion(c.env.DB, teacher.teacherId, c.req.param('questionId'), direction))
})

app.get('/api/teacher/quiz-attempts/:attemptId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const attempt = await quizAttemptDetail(c.env.DB, teacher.teacherId, c.req.param('attemptId'))
  if (!attempt) return quizAttemptNotFound()
  return c.json(attempt)
})

/** Mark one short answer: { points, comment }. Changing a mark already given is allowed. */
app.put('/api/teacher/quiz-attempts/:attemptId/answers/:questionId', async (c) => {
  const teacher = await teacherFrom(c)
  if (!teacher) return noSession()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const points = Number(body.points)
  if (body.points === undefined || body.points === null || body.points === '' || !Number.isInteger(points)) return invalid({ points: 'Enter the points as a whole number.' })
  if (body.comment !== undefined && typeof body.comment !== 'string') return invalid({ comment: 'The comment must be plain text.' })
  const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
  if (comment.length > 2000) return invalid({ comment: 'Keep the comment under 2,000 characters.' })

  const result = await markAnswer(c.env.DB, teacher.teacherId, c.req.param('attemptId'), c.req.param('questionId'), points, comment)
  if (result.status === 'NOT_FOUND') return quizAttemptNotFound()
  if (result.status === 'NOT_SUBMITTED') return c.json({ error: 'That attempt is still in progress.' }, 409)
  if (result.status === 'NOT_SHORT_ANSWER') return c.json({ error: 'Only short answers are marked by hand. Choice questions are scored from the key.' }, 409)
  if (result.status === 'OUT_OF_RANGE') return invalid({ points: `Award between 0 and ${result.max} points.` })
  return c.json(result.attempt)
})

/* ---------------------------- student portal ---------------------------- */

/*
  Identity only, for now: signing in and out, and who the caller is. Every later
  student route takes its account from this session, so a student id never comes
  from the client. Unauthenticated calls answer 401 like the studio; a resource
  outside the student's own enrolments will answer 404 rather than 403, which is
  the ownership rule the studio uses too.
*/
app.post('/api/student/signin', async (c) => {
  const secret = c.env.STUDENT_SESSION_SECRET
  if (!secret) return c.json({ error: 'Student sessions are not configured on this deployment.' }, 503)

  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const errors = validateSignIn(body)
  if (Object.keys(errors).length) return invalid(errors)

  const student = await studentForSignIn(c.env.DB, String(body.email).trim().toLowerCase(), String(body.studentId).trim().toUpperCase())
  // One message for both a wrong email and a wrong number: never confirm which failed.
  if (!student) return c.json({ error: 'Those details do not match a student account.' }, 401)

  const { value, expiresAt } = await createStudentSession(secret, student.id)
  c.header('cache-control', 'no-store')
  c.header('set-cookie', studentCookie(value, secureRequest(c)))
  return c.json({ ...student, demo: true, expiresAt: new Date(expiresAt).toISOString() })
})

app.post('/api/student/signout', (c) => {
  c.header('cache-control', 'no-store')
  c.header('set-cookie', clearedStudentCookie(secureRequest(c)))
  return c.json({ ok: true })
})

app.get('/api/student/me', async (c) => {
  const student = await studentFrom(c)
  if (!student) return noStudentSession()
  c.header('cache-control', 'no-store')
  return c.json(student)
})

/*
  The student's own assignments, and one of them. The enrolment join is inside
  the query, so an assignment on a course the student is not enrolled in is
  indistinguishable from one that does not exist: both are 404, never 403.
*/
app.get('/api/student/assignments', async (c) => {
  const student = await studentFrom(c)
  if (!student) return noStudentSession()
  c.header('cache-control', 'no-store')
  return c.json({ items: await assignmentsForStudent(c.env.DB, student.id) })
})

app.get('/api/student/assignments/:assignmentId', async (c) => {
  const student = await studentFrom(c)
  if (!student) return noStudentSession()
  const assignment = await studentAssignment(c.env.DB, student.id, c.req.param('assignmentId'))
  if (!assignment) return c.json({ error: 'That assignment could not be found.' }, 404)
  c.header('cache-control', 'no-store')
  return c.json(assignment)
})

/*
  Handing in. Starting is idempotent by design: the same call resumes the open
  attempt, so a reload or a second tab cannot create a second draft. Lateness,
  the attempt count and whether the window is open are all decided inside the
  store from rows it reads itself, not from the request body.
*/
const attemptNotFound = () => apiError(404, 'That attempt could not be found.')

/** The answer body, or null when the field is not text at all. */
const answerText = (value: unknown): string | null => (typeof value === 'string' ? value : null)

const answerTooLong = () => invalid({ text: `Keep your answer under ${MAX_ANSWER_LENGTH.toLocaleString('en-GB')} characters.` })

app.post('/api/student/assignments/:assignmentId/attempt', async (c) => {
  const student = await studentFrom(c)
  if (!student) return noStudentSession()
  const result = await startAttempt(c.env.DB, student, c.req.param('assignmentId'))
  c.header('cache-control', 'no-store')
  if (result.status === 'NOT_FOUND') return c.json({ error: 'That assignment could not be found.' }, 404)
  if (result.status === 'NOT_OPEN') return c.json({ error: 'This assignment is not open for hand-in right now.' }, 409)
  if (result.status === 'EXHAUSTED') return c.json({ error: 'You have used every attempt for this assignment.' }, 409)
  return c.json(result.attempt)
})

/** Save the draft. Nothing reaches the teacher until the attempt is handed in. */
app.patch('/api/student/attempts/:attemptId', async (c) => {
  const student = await studentFrom(c)
  if (!student) return noStudentSession()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const text = answerText(body.text)
  if (text === null) return invalid({ text: 'Send your answer as plain text.' })

  const result = await saveAttempt(c.env.DB, student.id, c.req.param('attemptId'), text)
  c.header('cache-control', 'no-store')
  if (result.status === 'NOT_FOUND') return attemptNotFound()
  if (result.status === 'ALREADY_SUBMITTED') return c.json({ error: 'That attempt has already been handed in.' }, 409)
  if (result.status === 'TOO_LONG') return answerTooLong()
  return c.json(result.attempt)
})

/**
 * Hand the attempt in. The text is stored with the submission in the same
 * update, so a student who types and submits in one go does not have to save
 * the draft first.
*/
app.post('/api/student/attempts/:attemptId/submit', async (c) => {
  const student = await studentFrom(c)
  if (!student) return noStudentSession()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const text = answerText(body.text)
  if (text === null) return invalid({ text: 'Send your answer as plain text.' })

  const result = await submitAttempt(c.env.DB, student.id, c.req.param('attemptId'), text)
  c.header('cache-control', 'no-store')
  if (result.status === 'NOT_FOUND') return attemptNotFound()
  if (result.status === 'ALREADY_SUBMITTED') return c.json({ error: 'That attempt has already been handed in.' }, 409)
  if (result.status === 'LATE_BLOCKED') return c.json({ error: 'This assignment does not accept work after its due date.' }, 409)
  if (result.status === 'EMPTY') return invalid({ text: 'Write your answer before handing in.' })
  if (result.status === 'TOO_LONG') return answerTooLong()
  return c.json(result.attempt)
})

/*
  Quizzes. The same enrolment gate as assignments, inside the store's query.
  Starting resumes an open attempt; saving is one answer at a time; the deadline
  is the server's, and a late submit returns the attempt the server already
  handed in rather than an error.
*/
const studentQuizNotFound = () => apiError(404, 'That quiz could not be found.')

app.get('/api/student/quizzes', async (c) => {
  const student = await studentFrom(c)
  if (!student) return noStudentSession()
  c.header('cache-control', 'no-store')
  return c.json({ items: await quizzesForStudent(c.env.DB, student.id) })
})

app.get('/api/student/quizzes/:quizId', async (c) => {
  const student = await studentFrom(c)
  if (!student) return noStudentSession()
  const quiz = await studentQuiz(c.env.DB, student.id, c.req.param('quizId'))
  c.header('cache-control', 'no-store')
  if (!quiz) return studentQuizNotFound()
  return c.json(quiz)
})

app.post('/api/student/quizzes/:quizId/attempt', async (c) => {
  const student = await studentFrom(c)
  if (!student) return noStudentSession()
  const result = await startQuizAttempt(c.env.DB, student, c.req.param('quizId'))
  c.header('cache-control', 'no-store')
  if (result.status === 'NOT_FOUND') return studentQuizNotFound()
  if (result.status === 'NOT_OPEN') return c.json({ error: 'This quiz is not open right now.' }, 409)
  if (result.status === 'EXHAUSTED') return c.json({ error: 'You have used every attempt for this quiz.' }, 409)
  if (result.status === 'EMPTY') return c.json({ error: 'This quiz has no questions yet.' }, 409)
  return c.json(result.attempt)
})

app.get('/api/student/quiz-attempts/:attemptId', async (c) => {
  const student = await studentFrom(c)
  if (!student) return noStudentSession()
  const attempt = await studentAttempt(c.env.DB, student.id, c.req.param('attemptId'))
  c.header('cache-control', 'no-store')
  if (!attempt) return attemptNotFound()
  return c.json(attempt)
})

/** Autosave one answer: { value: { optionIds } | { text } }. */
app.put('/api/student/quiz-attempts/:attemptId/answers/:questionId', async (c) => {
  const student = await studentFrom(c)
  if (!student) return noStudentSession()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const result = await saveQuizAnswer(c.env.DB, student.id, c.req.param('attemptId'), c.req.param('questionId'), body.value)
  c.header('cache-control', 'no-store')
  if (result.status === 'NOT_FOUND') return attemptNotFound()
  if (result.status === 'CLOSED') return c.json({ error: 'Time is up: this attempt has been handed in.' }, 409)
  if (result.status === 'INVALID') return invalid({ value: result.error })
  return c.json(result.saved)
})

app.post('/api/student/quiz-attempts/:attemptId/submit', async (c) => {
  const student = await studentFrom(c)
  if (!student) return noStudentSession()
  const result = await submitQuizAttempt(c.env.DB, student.id, c.req.param('attemptId'))
  c.header('cache-control', 'no-store')
  if (result.status === 'NOT_FOUND') return attemptNotFound()
  if (result.status === 'ALREADY_SUBMITTED') return c.json({ error: 'That attempt has already been handed in.' }, 409)
  return c.json(result.attempt)
})

/* -------------------------- student catalogue --------------------------- */

/* Public for now: only published subjects, lessons with a published lecture and
   published lectures themselves are included. Enrolment scoping needs the
   student session that does not exist yet, so it is not pretended here. */
app.get('/api/subjects', async (c) => {
  const items = await publishedSubjects(c.env.DB)
  return c.json({ items, totalCount: items.length })
})

app.get('/api/subjects/:subjectId', async (c) => {
  const subject = await publishedSubjectDetail(c.env.DB, c.req.param('subjectId'))
  if (!subject) return c.json({ error: 'That subject is not published.' }, 404)
  return c.json(subject)
})

app.all('/api/*', () => apiNotFound())

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
