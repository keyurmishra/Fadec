import { Hono } from 'hono'

import { EVENTS, PROGRAMMES } from '../content'
import { validateApplication, validateEmailOnly, validateRsvp, validateSignIn, validateTeacherSignIn, type FieldErrors } from '../shared/validation'
import { addChapter, addLesson, addSection, deleteChapter, deleteLesson, deleteSection, move, outlineFor, publishValidation } from '../teacher/curriculum'
import { courseForTeacher, coursesForTeacher, dashboardForTeacher, setCourseStatus, TEACHERS } from '../teacher/fixtures'
import {
  addLectureResource,
  applyLecturePatch,
  lectureDetail,
  lecturesForTeacher,
  removeLectureResource,
  setLectureStatus,
  type LecturePatch,
} from '../teacher/lectures'

// The Worker in front of the static site. Every form posts here and each
// route validates its input with the same rules the browser uses. Nothing is
// stored server-side yet: the browser keeps applications, RSVPs and the
// student session in localStorage. Connect these routes to your admissions
// system, email provider or a D1 table to keep them.
type Env = {
  ASSETS: Fetcher
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

/*
  DEMO SESSION ONLY. The cookie holds the teacher id and is not signed, so it
  proves nothing against a hostile client; it exists so the studio exercises
  real 401 / 404 paths instead of trusting localStorage. Replace it with the
  signed session cookie from contracts/auth.ts before any real deployment.
*/
const TEACHER_COOKIE = 'fadec_teacher'

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

const teacherFrom = (c: { req: { header: (name: string) => string | undefined } }) => {
  const id = cookieValue(c.req.header('cookie') ?? null, TEACHER_COOKIE)
  return id ? (TEACHERS.find((t) => t.teacherId === id) ?? null) : null
}

const noSession = () => Response.json({ error: 'Sign in to the teaching studio to continue.' }, { status: 401 })
const notYours = () => Response.json({ error: 'That course could not be found.' }, { status: 404 })

app.post('/api/teacher/signin', async (c) => {
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const errors = validateTeacherSignIn(body)
  if (Object.keys(errors).length) return invalid(errors)
  const email = String(body.email).trim().toLowerCase()
  const teacherId = String(body.teacherId).trim().toUpperCase()
  const teacher = TEACHERS.find((t) => t.email === email && t.teacherId === teacherId)
  // One message for both wrong-email and wrong-id: never confirm which failed.
  if (!teacher) return c.json({ error: 'Those details do not match a teacher account.' }, 401)
  c.header('set-cookie', `${TEACHER_COOKIE}=${encodeURIComponent(teacher.teacherId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`)
  return c.json({ ...teacher, demo: true, expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() })
})

app.post('/api/teacher/signout', (c) => {
  c.header('set-cookie', `${TEACHER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
  return c.json({ ok: true })
})

app.get('/api/teacher/me', (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  return c.json(teacher)
})

/** Everything the overview screen needs, filtered to this teacher's courses. */
app.get('/api/teacher/dashboard', (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const dashboard = dashboardForTeacher(teacher.teacherId)
  if (!dashboard) return c.json({ error: 'No courses are assigned to this account yet.' }, { status: 404 })
  return c.json(dashboard)
})

app.get('/api/teacher/courses', (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const courses = coursesForTeacher(teacher.teacherId)
  return c.json({ items: courses, nextCursor: null, totalCount: courses.length })
})

/** A course belonging to another teacher answers exactly like a missing one. */
app.get('/api/teacher/courses/:courseId', (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const course = courseForTeacher(teacher.teacherId, c.req.param('courseId'))
  if (!course) return notYours()
  return c.json(course)
})

/* ------------------------ course and curriculum ------------------------ */

const titleFrom = (body: Record<string, unknown>) => {
  const v = typeof body.title === 'string' ? body.title.trim() : ''
  return v.length >= 2 && v.length <= 120 ? v : null
}

/** The payload every curriculum mutation returns, so the screen never refetches. */
function outlinePayload(teacherId: string, courseId: string) {
  const course = courseForTeacher(teacherId, courseId)
  if (!course) return null
  return { course, sections: outlineFor(courseId), publish: publishValidation(course, courseId) }
}

const courseIdParam = (c: { req: { param: (name: string) => string } }) => c.req.param('courseId')

app.get('/api/teacher/courses/:courseId/outline', (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const payload = outlinePayload(teacher.teacherId, courseIdParam(c))
  if (!payload) return notYours()
  return c.json(payload)
})

app.post('/api/teacher/courses/:courseId/sections', async (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const courseId = courseIdParam(c)
  if (!courseForTeacher(teacher.teacherId, courseId)) return notYours()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const title = titleFrom(body)
  if (!title) return invalid({ title: 'Give the module a title of 2–120 characters.' })
  addSection(courseId, title)
  return c.json(outlinePayload(teacher.teacherId, courseId), 201)
})

app.delete('/api/teacher/courses/:courseId/sections/:sectionId', (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const courseId = courseIdParam(c)
  if (!courseForTeacher(teacher.teacherId, courseId)) return notYours()
  if (!deleteSection(courseId, c.req.param('sectionId'))) return c.json({ error: 'That module could not be found.' }, 404)
  return c.json(outlinePayload(teacher.teacherId, courseId))
})

app.post('/api/teacher/courses/:courseId/sections/:sectionId/chapters', async (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const courseId = courseIdParam(c)
  if (!courseForTeacher(teacher.teacherId, courseId)) return notYours()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const title = titleFrom(body)
  if (!title) return invalid({ title: 'Give the chapter a title of 2–120 characters.' })
  if (!addChapter(courseId, c.req.param('sectionId'), title)) return c.json({ error: 'That module could not be found.' }, 404)
  return c.json(outlinePayload(teacher.teacherId, courseId), 201)
})

app.delete('/api/teacher/courses/:courseId/chapters/:chapterId', (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const courseId = courseIdParam(c)
  if (!courseForTeacher(teacher.teacherId, courseId)) return notYours()
  if (!deleteChapter(courseId, c.req.param('chapterId'))) return c.json({ error: 'That chapter could not be found.' }, 404)
  return c.json(outlinePayload(teacher.teacherId, courseId))
})

app.post('/api/teacher/courses/:courseId/chapters/:chapterId/lessons', async (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const courseId = courseIdParam(c)
  if (!courseForTeacher(teacher.teacherId, courseId)) return notYours()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const title = titleFrom(body)
  if (!title) return invalid({ title: 'Give the lecture a title of 2–120 characters.' })
  const kind = body.kind === 'TEXT' ? 'TEXT' : 'VIDEO'
  const minutes = Number(body.estimatedMinutes)
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) return invalid({ estimatedMinutes: 'Enter a duration between 1 and 600 minutes.' })
  if (!addLesson(courseId, c.req.param('chapterId'), { title, kind, estimatedMinutes: minutes })) return c.json({ error: 'That chapter could not be found.' }, 404)
  return c.json(outlinePayload(teacher.teacherId, courseId), 201)
})

app.delete('/api/teacher/courses/:courseId/lessons/:lessonId', (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const courseId = courseIdParam(c)
  if (!courseForTeacher(teacher.teacherId, courseId)) return notYours()
  if (!deleteLesson(courseId, c.req.param('lessonId'))) return c.json({ error: 'That lecture could not be found.' }, 404)
  return c.json(outlinePayload(teacher.teacherId, courseId))
})

app.post('/api/teacher/courses/:courseId/reorder', async (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const courseId = courseIdParam(c)
  if (!courseForTeacher(teacher.teacherId, courseId)) return notYours()
  const body = await readBody(c.req.raw)
  if (!body) return badJson()
  const kind = body.kind === 'SECTION' || body.kind === 'CHAPTER' || body.kind === 'LESSON' ? body.kind : null
  const direction = body.direction === 'UP' || body.direction === 'DOWN' ? body.direction : null
  if (kind && direction && typeof body.id === 'string' && move(courseId, kind, body.id, direction)) {
    return c.json(outlinePayload(teacher.teacherId, courseId))
  }
  return c.json({ error: 'That item cannot move any further.' }, 409)
})

app.post('/api/teacher/courses/:courseId/publish', (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const courseId = courseIdParam(c)
  const course = courseForTeacher(teacher.teacherId, courseId)
  if (!course) return notYours()
  const publish = publishValidation(course, courseId)
  if (!publish.canPublish) return c.json({ error: 'Some publish requirements are unmet.', publish }, 422)
  const updated = setCourseStatus(teacher.teacherId, courseId, 'PUBLISHED')
  if (!updated) return notYours()
  return c.json({ course: updated, sections: outlineFor(courseId), publish: publishValidation(updated, courseId) })
})

app.post('/api/teacher/courses/:courseId/unpublish', (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const courseId = courseIdParam(c)
  const updated = setCourseStatus(teacher.teacherId, courseId, 'UNPUBLISHED')
  if (!updated) return notYours()
  return c.json({ course: updated, sections: outlineFor(courseId), publish: publishValidation(updated, courseId) })
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
app.get('/api/teacher/lectures', (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const items = lecturesForTeacher(teacher.teacherId)
  const courses = coursesForTeacher(teacher.teacherId).map((course) => ({ id: course.id, title: course.title }))
  return c.json({ items, courses, totalCount: items.length })
})

app.get('/api/teacher/lectures/:lectureId', (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const lecture = lectureDetail(teacher.teacherId, c.req.param('lectureId'))
  if (!lecture) return lectureNotFound()
  return c.json(lecture)
})

app.patch('/api/teacher/lectures/:lectureId', async (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const lectureId = c.req.param('lectureId')
  if (!lectureDetail(teacher.teacherId, lectureId)) return lectureNotFound()
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

  const updated = applyLecturePatch(teacher.teacherId, lectureId, patch)
  if (!updated) return lectureNotFound()
  return c.json(updated)
})

app.post('/api/teacher/lectures/:lectureId/publish', (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const lectureId = c.req.param('lectureId')
  const lecture = lectureDetail(teacher.teacherId, lectureId)
  if (!lecture) return lectureNotFound()
  if (!lecture.publish.canPublish) return c.json({ error: 'Some publish requirements are unmet.', publish: lecture.publish }, 422)
  const updated = setLectureStatus(teacher.teacherId, lectureId, 'PUBLISHED')
  if (!updated) return lectureNotFound()
  return c.json(updated)
})

app.post('/api/teacher/lectures/:lectureId/unpublish', (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const lectureId = c.req.param('lectureId')
  const updated = setLectureStatus(teacher.teacherId, lectureId, 'DRAFT')
  if (!updated) return lectureNotFound()
  return c.json(updated)
})

const RESOURCE_KINDS = ['PDF', 'SLIDES', 'DATASET', 'LINK', 'OTHER'] as const

app.post('/api/teacher/lectures/:lectureId/resources', async (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const lectureId = c.req.param('lectureId')
  if (!lectureDetail(teacher.teacherId, lectureId)) return lectureNotFound()
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

  const updated = addLectureResource(teacher.teacherId, lectureId, { title, kind, externalUrl: url, sizeBytes: null })
  if (!updated) return lectureNotFound()
  return c.json(updated, 201)
})

app.delete('/api/teacher/lectures/:lectureId/resources/:resourceId', (c) => {
  const teacher = teacherFrom(c)
  if (!teacher) return noSession()
  const lectureId = c.req.param('lectureId')
  if (!lectureDetail(teacher.teacherId, lectureId)) return lectureNotFound()
  const updated = removeLectureResource(teacher.teacherId, lectureId, c.req.param('resourceId'))
  if (!updated) return c.json({ error: 'That resource could not be found.' }, 404)
  return c.json(updated)
})

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
