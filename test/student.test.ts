import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { call, cookieFrom, STUDENT, studentCookie, teacherCookie } from './harness'

// The seeded assignments have fixed dates, so pin "now" inside their windows:
// a-02 (PPL) is open from 20 Nov to 2 Dec, a-03 (PPL) opens on 2 Dec.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-25T12:00:00.000Z'))
})
afterAll(() => vi.useRealTimers())

describe('student session', () => {
  it('refuses to sign anyone in when no session secret is configured', async () => {
    const res = await call('/api/student/signin', { body: STUDENT, secret: null })
    expect(res.status).toBe(503)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('gives one answer for a wrong email and a wrong student number', async () => {
    const wrongEmail = await call('/api/student/signin', { body: { ...STUDENT, email: 'someone@fadec.example' } })
    const wrongNo = await call('/api/student/signin', { body: { ...STUDENT, studentId: 'PPL-26-99999' } })
    expect(wrongEmail.status).toBe(401)
    expect(wrongNo.status).toBe(401)
    expect(wrongEmail.json).toEqual(wrongNo.json)
  })

  it('signs in with a signed, HttpOnly cookie and knows who is calling', async () => {
    const res = await call('/api/student/signin', { body: STUDENT })
    expect(res.status).toBe(200)
    expect(res.json).toEqual(expect.objectContaining({ id: 'u-001', email: STUDENT.email, demo: true }))
    const header = res.headers.get('set-cookie') ?? ''
    expect(header).toMatch(/^fadec_student=v1\.u-001\.\d+\.[0-9a-f]{64};/)
    expect(header).toMatch(/HttpOnly/)
    expect(header).not.toMatch(/Secure/)
    expect(res.headers.get('cache-control')).toBe('no-store')

    const me = await call('/api/student/me', { cookie: cookieFrom(res.headers) })
    expect(me.status).toBe(200)
    expect(me.json.id).toBe('u-001')
  })

  it('rejects a tampered, forged or expired cookie', async () => {
    const cookie = await studentCookie()
    const [, , expiry, signature] = cookie.split('=')[1].split('.')

    const otherStudent = `fadec_student=v1.u-002.${expiry}.${signature}`
    const longerLife = `fadec_student=v1.u-001.${Number(expiry) + 1}.${signature}`
    for (const forged of [otherStudent, longerLife, 'fadec_student=v1.u-001.9999999999999.00', 'fadec_student=garbage']) {
      expect((await call('/api/student/me', { cookie: forged })).status, forged).toBe(401)
    }

    // A cookie signed with a different secret is not accepted either.
    expect((await call('/api/student/me', { cookie, secret: 'some-other-secret' })).status).toBe(401)

    vi.setSystemTime(Number(expiry) + 1)
    try {
      expect((await call('/api/student/me', { cookie })).status).toBe(401)
    } finally {
      vi.setSystemTime(new Date('2026-11-25T12:00:00.000Z'))
    }
  })

  it('answers 401 without a session', async () => {
    for (const path of ['/api/student/me', '/api/student/assignments', '/api/student/assignments/a-02']) {
      expect((await call(path)).status, path).toBe(401)
    }
  })
})

describe('student assignments', () => {
  it('lists only assignments on courses the student is enrolled in', async () => {
    const res = await call('/api/student/assignments', { cookie: await studentCookie() })
    expect(res.status).toBe(200)
    expect(res.json.items.length).toBeGreaterThan(0)
    for (const a of res.json.items) expect(a.courseId).toBe('crs-ppl')
  })

  it("answers an assignment on someone else's course like a missing one", async () => {
    const cookie = await studentCookie()
    const otherCourse = await call('/api/student/assignments/a-04', { cookie })
    const missing = await call('/api/student/assignments/a-nope', { cookie })
    expect(otherCourse.status).toBe(404)
    expect(otherCourse.json).toEqual(missing.json)
    expect((await call('/api/student/assignments/a-02', { cookie })).status).toBe(200)
  })

  it('will not start an attempt before the assignment opens', async () => {
    const res = await call('/api/student/assignments/a-03/attempt', { cookie: await studentCookie(), method: 'POST' })
    expect(res.status).toBe(409)
  })

  it('starts, saves and hands in an attempt once', async () => {
    // Sam has not handed a-02 in yet in the seed data (Priya already has).
    const cookie = await studentCookie({ email: 'sam.whitfield@fadec.example', studentId: 'PPL-26-00008' })
    const started = await call('/api/student/assignments/a-02/attempt', { cookie, method: 'POST' })
    expect(started.status).toBe(200)
    const attemptId = started.json.id
    expect(attemptId).toBeTruthy()

    // Starting again resumes the open attempt instead of creating a second one.
    const resumed = await call('/api/student/assignments/a-02/attempt', { cookie, method: 'POST' })
    expect(resumed.json.id).toBe(attemptId)

    expect((await call(`/api/student/attempts/${attemptId}`, { cookie, method: 'PATCH', body: { text: 42 } })).status).toBe(422)
    const saved = await call(`/api/student/attempts/${attemptId}`, { cookie, method: 'PATCH', body: { text: 'Draft answer.' } })
    expect(saved.status).toBe(200)

    // Another student cannot see or hand in this attempt.
    const other = await studentCookie({ email: 'theo.bennett@fadec.example', studentId: 'PPL-26-00002' })
    expect((await call(`/api/student/attempts/${attemptId}/submit`, { cookie: other, body: { text: 'Hijack' } })).status).toBe(404)

    expect((await call(`/api/student/attempts/${attemptId}/submit`, { cookie, body: { text: '   ' } })).status).toBe(422)
    const submitted = await call(`/api/student/attempts/${attemptId}/submit`, { cookie, body: { text: 'Final answer.' } })
    expect(submitted.status).toBe(200)

    expect((await call(`/api/student/attempts/${attemptId}/submit`, { cookie, body: { text: 'Again' } })).status).toBe(409)
    expect((await call(`/api/student/attempts/${attemptId}`, { cookie, method: 'PATCH', body: { text: 'Edit' } })).status).toBe(409)
    // a-02 allows one attempt, so a new one cannot be started; Priya's seeded hand-in proves the same.
    expect((await call('/api/student/assignments/a-02/attempt', { cookie, method: 'POST' })).status).toBe(409)
    expect((await call('/api/student/assignments/a-02/attempt', { cookie: await studentCookie(), method: 'POST' })).status).toBe(409)

    // The hand-in reaches the teacher's queue.
    const queue = await call('/api/teacher/submissions', { cookie: await teacherCookie() })
    expect(queue.json.items).toContainEqual(expect.objectContaining({ assignmentId: 'a-02', studentUserId: 'u-008' }))
  })
})

describe('public subject catalogue', () => {
  it('lists published subjects and opens one', async () => {
    const list = await call('/api/subjects')
    expect(list.status).toBe(200)
    expect(list.json.totalCount).toBe(list.json.items.length)
    const first = list.json.items[0]
    const detail = await call(`/api/subjects/${first.id}`)
    expect(detail.status).toBe(200)
    expect((await call('/api/subjects/sub-nope')).status).toBe(404)
  })
})
