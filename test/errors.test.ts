import { afterEach, describe, expect, it, vi } from 'vitest'

import { call, teacherCookie } from './harness'

/*
  The error contract: every failure under /api answers JSON with an `error`
  sentence, and nothing about the cause reaches the caller. This file runs in its
  own module graph, so the first request here is the first the Worker's isolate
  serves and the database bootstrap can be made to fail on purpose.
*/
const SECRET_DETAIL = 'D1_ERROR: no such table: secret_internal_detail'

/** A D1 binding whose every call fails, standing in for storage being down. */
const brokenDb = new Proxy({} as D1Database, {
  get: () => () => {
    throw new Error(SECRET_DETAIL)
  },
})

afterEach(() => vi.restoreAllMocks())

describe('API errors', () => {
  it('answers 503 when the database cannot be set up, then recovers', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const down = await call('/api/health', { db: brokenDb })
    expect(down.status).toBe(503)
    expect(down.headers.get('content-type')).toMatch(/application\/json/)
    expect(down.json).toEqual({ error: expect.any(String) })
    expect(JSON.stringify(down.json)).not.toContain('secret_internal_detail')
    expect(log).toHaveBeenCalled()

    // A failed setup is not cached: the next request with working storage succeeds.
    const up = await call('/api/health')
    expect(up.status).toBe(200)
    expect(up.json).toEqual({ ok: true })
  })

  it('answers an unexpected failure with a JSON 500 and logs the cause', async () => {
    const cookie = await teacherCookie()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await call('/api/teacher/courses', { cookie, db: brokenDb })
    expect(res.status).toBe(500)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    expect(res.json).toEqual({ error: 'Something went wrong on our side. Please try again.' })
    expect(JSON.stringify(res.json)).not.toContain('secret_internal_detail')
    expect(String(log.mock.calls[0]?.[0])).toContain('GET /api/teacher/courses')
  })

  it('answers ids no route could own as not found, before touching storage', async () => {
    const cookie = await teacherCookie()
    for (const path of [`/api/teacher/courses/${'x'.repeat(129)}`, '/api/teacher/courses/%00', '/api/teacher/courses/%E0%A4%A', `/api/${'a/'.repeat(300)}`]) {
      const res = await call(path, { cookie, db: brokenDb })
      expect(res.status, path).toBe(404)
      expect(res.json, path).toEqual({ error: 'Not found' })
    }
    // A long but plausible id still reaches its route.
    expect((await call(`/api/teacher/courses/${'x'.repeat(128)}`, { cookie })).status).toBe(404)
    expect((await call('/api/teacher/courses/crs-ppl', { cookie })).status).toBe(200)
  })

  it('keeps the existing shapes for bad JSON, field errors and unknown routes', async () => {
    const cookie = await teacherCookie()
    const bad = await call('/api/teacher/assignments', { cookie, rawBody: '{"title":' })
    expect(bad.status).toBe(400)
    expect(bad.json).toEqual({ error: 'Send a JSON object.' })

    const invalid = await call('/api/teacher/assignments', { cookie, body: { courseId: 'crs-ppl' } })
    expect(invalid.status).toBe(422)
    expect(invalid.json).toEqual({ error: 'Please check the highlighted fields.', fieldErrors: expect.any(Object) })

    const unknown = await call('/api/teacher/nothing-here', { cookie, method: 'DELETE' })
    expect(unknown.status).toBe(404)
    expect(unknown.json).toEqual({ error: 'Not found' })

    const missing = await call('/api/teacher/lectures/lec-nope', { cookie })
    expect(missing.status).toBe(404)
    expect(missing.json).toEqual({ error: 'That lecture is not in one of your courses.' })
  })
})
