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

const invalid = (fieldErrors: FieldErrors) => Response.json({ error: 'Please check the highlighted fields.', fieldErrors }, { status: 422 })
const badJson = () => Response.json({ error: 'Send a JSON object.' }, { status: 400 })

// Create the tables and seed the catalogue on the first request this isolate
// serves, then reuse that result for every later request.
app.use('/api/*', async (c, next) => {
  await ensureDatabase(c.env.DB)
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

const noSession = () => Response.json({ error: 'Sign in to the teaching studio to continue.' }, { status: 401 })
const notYours = () => Response.json({ error: 'That course could not be found.' }, { status: 404 })

type StudentRequest = SessionRequest

async function studentFrom(c: StudentRequest): Promise<StudentIdentityDTO | null> {
  const secret = c.env.STUDENT_SESSION_SECRET
  const value = cookieValue(c.req.header('cookie') ?? null, STUDENT_COOKIE)
  if (!secret || !value) return null
  const session = await verifyStudentSession(secret, value)
  if (!session) return null
  return studentById(c.env.DB, session.studentId)
}

const noStudentSession = () => Response.json({ error: 'Sign in to the student portal to continue.' }, { status: 401 })

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

const lectureNotFound = () => Response.json({ error: 'That lecture is not in one of your courses.' }, { status: 404 })

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

const subjectNotFound = () => Response.json({ error: 'That subject is not in one of your courses.' }, { status: 404 })
const topicNotFound = () => Response.json({ error: 'That topic could not be found.' }, { status: 404 })
const syllabusLessonNotFound = () => Response.json({ error: 'That lesson could not be found.' }, { status: 404 })

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

const assignmentNotFound = () => Response.json({ error: 'That assignment is not in one of your courses.' }, { status: 404 })
const submissionNotFound = () => Response.json({ error: 'That submission is not in one of your courses.' }, { status: 404 })

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
const attemptNotFound = () => Response.json({ error: 'That attempt could not be found.' }, { status: 404 })

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

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
