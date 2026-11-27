import { describe, expect, it } from 'vitest'

import { call, cookieFrom, OTHER_TEACHER, studentCookie, TEACHER, teacherCookie } from './harness'

describe('teacher session', () => {
  it('validates the sign-in shape before looking anyone up', async () => {
    const res = await call('/api/teacher/signin', { body: { email: 'x', teacherId: 'nope' } })
    expect(res.status).toBe(422)
    expect(Object.keys(res.json.fieldErrors).sort()).toEqual(['email', 'teacherId'])
  })

  it('gives one answer for a wrong email and a wrong id', async () => {
    const wrongEmail = await call('/api/teacher/signin', { body: { ...TEACHER, email: 'someone@fadec.example' } })
    const wrongId = await call('/api/teacher/signin', { body: { ...TEACHER, teacherId: 'TCH-2011-999' } })
    expect(wrongEmail.status).toBe(401)
    expect(wrongId.status).toBe(401)
    expect(wrongEmail.json).toEqual(wrongId.json)
    expect(wrongEmail.headers.get('set-cookie')).toBeNull()
  })

  it('signs in case-insensitively and sets an HttpOnly cookie', async () => {
    const res = await call('/api/teacher/signin', { body: { email: TEACHER.email.toUpperCase(), teacherId: TEACHER.teacherId.toLowerCase() } })
    expect(res.status).toBe(200)
    expect(res.json).toEqual(expect.objectContaining({ teacherId: TEACHER.teacherId, demo: true }))
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/)

    const me = await call('/api/teacher/me', { cookie: cookieFrom(res.headers) })
    expect(me.status).toBe(200)
    expect(me.json.teacherId).toBe(TEACHER.teacherId)
  })

  it('answers 401 without a session on every studio route', async () => {
    for (const path of ['/api/teacher/me', '/api/teacher/dashboard', '/api/teacher/courses', '/api/teacher/assignments', '/api/teacher/submissions', '/api/teacher/subjects', '/api/teacher/lectures']) {
      const res = await call(path)
      expect(res.status, path).toBe(401)
    }
    expect((await call('/api/teacher/me', { cookie: 'fadec_teacher=TCH-0000-000' })).status).toBe(401)
  })

  it('refuses to sign a teacher in when no teacher secret is configured', async () => {
    const res = await call('/api/teacher/signin', { body: TEACHER, teacherSecret: null })
    expect(res.status).toBe(503)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('rejects forged, tampered and cross-portal teacher cookies', async () => {
    const cookie = await teacherCookie()
    expect(cookie).toMatch(/^fadec_teacher=v1\.TCH-2011-004\.\d+\.[0-9a-f]{64}$/)
    const [, , expiry, signature] = cookie.split('=')[1].split('.')

    // The old demo cookie was a bare teacher id: writing one must no longer work.
    const forged = [
      'fadec_teacher=TCH-2011-004',
      `fadec_teacher=v1.TCH-2015-011.${expiry}.${signature}`,
      `fadec_teacher=v1.TCH-2011-004.${Number(expiry) + 1}.${signature}`,
      'fadec_teacher=v1.TCH-2011-004.9999999999999.00',
    ]
    for (const value of forged) expect((await call('/api/teacher/me', { cookie: value })).status, value).toBe(401)

    // A student cookie relabelled as a teacher one fails, even with the same secret on both portals.
    const student = (await studentCookie()).split('=')[1]
    expect((await call('/api/teacher/me', { cookie: `fadec_teacher=${student}` })).status).toBe(401)
    expect((await call('/api/teacher/me', { cookie, teacherSecret: 'some-other-secret' })).status).toBe(401)
    expect((await call('/api/teacher/me', { cookie })).status).toBe(200)
  })

  it('clears the cookie on sign-out', async () => {
    const res = await call('/api/teacher/signout', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/)
  })
})

describe('teacher scope', () => {
  it("lists only the teacher's own courses", async () => {
    const mine = await call('/api/teacher/courses', { cookie: await teacherCookie() })
    const theirs = await call('/api/teacher/courses', { cookie: await teacherCookie(OTHER_TEACHER) })
    const mineIds = mine.json.items.map((c: { id: string }) => c.id)
    const theirIds = theirs.json.items.map((c: { id: string }) => c.id)
    expect(mine.json.totalCount).toBe(mineIds.length)
    expect(mineIds).toContain('crs-ppl')
    expect(theirIds).toEqual(['crs-mcc'])
    expect(mineIds).not.toContain('crs-mcc')
  })

  it("answers another teacher's course exactly like a missing one", async () => {
    const cookie = await teacherCookie()
    const theirs = await call('/api/teacher/courses/crs-mcc', { cookie })
    const missing = await call('/api/teacher/courses/crs-nope', { cookie })
    expect(theirs.status).toBe(404)
    expect(theirs.json).toEqual(missing.json)
    expect((await call('/api/teacher/courses/crs-ppl', { cookie })).status).toBe(200)
  })

  it('returns a dashboard for a signed-in teacher', async () => {
    const res = await call('/api/teacher/dashboard', { cookie: await teacherCookie() })
    expect(res.status).toBe(200)
    expect(res.json).toBeTypeOf('object')
  })
})

describe('curriculum', () => {
  it('adds a module and returns the updated outline', async () => {
    const cookie = await teacherCookie()
    const before = await call('/api/teacher/courses/crs-ppl/outline', { cookie })
    expect(before.status).toBe(200)

    const bad = await call('/api/teacher/courses/crs-ppl/sections', { cookie, body: { title: 'x' } })
    expect(bad.status).toBe(422)

    const res = await call('/api/teacher/courses/crs-ppl/sections', { cookie, body: { title: '  Radio telephony  ' } })
    expect(res.status).toBe(201)
    expect(res.json.sections).toHaveLength(before.json.sections.length + 1)
    expect(res.json.sections.map((s: { title: string }) => s.title)).toContain('Radio telephony')

    const after = await call('/api/teacher/courses/crs-ppl/outline', { cookie })
    expect(after.json.sections).toHaveLength(before.json.sections.length + 1)
  })

  it("will not touch another teacher's curriculum", async () => {
    const res = await call('/api/teacher/courses/crs-mcc/sections', { cookie: await teacherCookie(), body: { title: 'Sneaky module' } })
    expect(res.status).toBe(404)
  })
})

describe('assignments and grading', () => {
  const valid = { courseId: 'crs-ppl', title: 'Circuit planning', instructions: 'Plan a circuit.', opensAt: '2026-12-01T09:00:00.000Z', dueAt: '2026-12-08T17:00:00.000Z' }

  it('validates a new assignment field by field', async () => {
    const cookie = await teacherCookie()
    const cases: [Record<string, unknown>, string][] = [
      [{ ...valid, courseId: undefined }, 'courseId'],
      [{ ...valid, title: 'x' }, 'title'],
      [{ ...valid, dueAt: 'tomorrow' }, 'dueAt'],
      [{ ...valid, dueAt: valid.opensAt }, 'dueAt'],
      [{ ...valid, maxScore: 0 }, 'maxScore'],
      [{ ...valid, attemptsAllowed: 11 }, 'attemptsAllowed'],
      [{ ...valid, latePolicy: 'WHATEVER' }, 'latePolicy'],
      [{ ...valid, allowFileUpload: 'yes' }, 'allowFileUpload'],
    ]
    for (const [body, field] of cases) {
      const res = await call('/api/teacher/assignments', { cookie, body })
      expect(res.status, field).toBe(422)
      expect(Object.keys(res.json.fieldErrors), field).toEqual([field])
    }
    expect((await call('/api/teacher/assignments', { cookie, body: { ...valid, courseId: 'crs-mcc' } })).status).toBe(404)
  })

  it('creates an assignment with defaults and lists it', async () => {
    const cookie = await teacherCookie()
    const res = await call('/api/teacher/assignments', { cookie, body: valid })
    expect(res.status).toBe(201)
    expect(res.json).toEqual(expect.objectContaining({ courseId: 'crs-ppl', title: 'Circuit planning', maxScore: 100, attemptsAllowed: 1, latePolicy: 'MARK_LATE' }))

    const list = await call('/api/teacher/assignments', { cookie })
    expect(list.json.items.map((a: { id: string }) => a.id)).toContain(res.json.id)

    const detail = await call(`/api/teacher/assignments/${res.json.id}`, { cookie })
    expect(detail.status).toBe(200)
    expect((await call(`/api/teacher/assignments/${res.json.id}`, { cookie: await teacherCookie(OTHER_TEACHER) })).status).toBe(404)
  })

  it('saves, publishes and withdraws a grade', async () => {
    const cookie = await teacherCookie()
    const list = await call('/api/teacher/submissions', { cookie })
    const pending = list.json.items.find((s: { status: string }) => s.status === 'PENDING')
    expect(pending).toBeDefined()
    const path = `/api/teacher/submissions/${pending.id}`

    expect((await call(`${path}/publish`, { cookie, method: 'POST' })).status).toBe(422)
    expect((await call(path, { cookie, method: 'PATCH', body: { score: pending.maxScore + 1 } })).status).toBe(422)

    const saved = await call(path, { cookie, method: 'PATCH', body: { score: 1, feedback: 'Good start.' } })
    expect(saved.status).toBe(200)
    expect(saved.json).toEqual(expect.objectContaining({ score: 1, feedback: 'Good start.' }))

    const published = await call(`${path}/publish`, { cookie, method: 'POST' })
    expect(published.status).toBe(200)
    expect(published.json.publishedAt).toBeTruthy()
    expect((await call(`${path}/publish`, { cookie, method: 'POST' })).status).toBe(409)
    expect((await call(path, { cookie, method: 'PATCH', body: { score: 2 } })).status).toBe(409)

    const withdrawn = await call(`${path}/withdraw`, { cookie, method: 'POST', body: { reason: 'Re-marking the second question.' } })
    expect(withdrawn.status).toBe(200)
    expect(withdrawn.json.publishedAt).toBeNull()
  })
})
