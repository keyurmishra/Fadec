import { describe, expect, it } from 'vitest'

import { call } from './harness'

describe('public API', () => {
  it('answers the health check', async () => {
    const res = await call('/api/health')
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ ok: true })
  })

  it('lists programmes with seats left per cohort, never negative', async () => {
    const res = await call('/api/programmes')
    expect(res.status).toBe(200)
    expect(res.json.programmes.length).toBeGreaterThan(0)
    for (const p of res.json.programmes) {
      expect(p).toEqual(expect.objectContaining({ slug: expect.any(String), title: expect.any(String), cohorts: expect.any(Array) }))
      for (const k of p.cohorts) expect(k.seatsLeft).toBeGreaterThanOrEqual(0)
    }
  })

  it('lists events with summary fields only', async () => {
    const res = await call('/api/events')
    expect(res.status).toBe(200)
    expect(res.json.events.length).toBeGreaterThan(0)
    for (const e of res.json.events) expect(Object.keys(e).sort()).toEqual(['date', 'id', 'time', 'title', 'type'])
  })

  it('rejects a body that is not a JSON object', async () => {
    for (const rawBody of ['not json', '[1,2]', 'null']) {
      const res = await call('/api/subscribe', { rawBody })
      expect(res.status).toBe(400)
      expect(res.json.error).toBe('Send a JSON object.')
    }
  })

  it('validates newsletter sign-ups', async () => {
    const bad = await call('/api/subscribe', { body: { email: 'nope' } })
    expect(bad.status).toBe(422)
    expect(bad.json.fieldErrors).toHaveProperty('email')

    const ok = await call('/api/subscribe', { body: { email: 'pilot@example.com' } })
    expect(ok.status).toBe(200)
    expect(ok.json).toEqual({ ok: true })
  })

  it('rejects an empty application with field errors', async () => {
    const res = await call('/api/applications', { body: {} })
    expect(res.status).toBe(422)
    expect(Object.keys(res.json.fieldErrors).length).toBeGreaterThan(0)
  })

  it('takes an RSVP for an event with seats and returns a reference', async () => {
    const events = (await call('/api/events')).json.events as { id: string }[]
    let accepted = false
    for (const { id } of events) {
      const res = await call('/api/rsvp', { body: { event: id, name: 'Ada Pilot', email: 'ada@example.com' } })
      if (res.status === 201) {
        expect(res.json.ref).toMatch(/^RSVP-[A-Z0-9]{1,6}$/)
        accepted = true
        break
      }
      expect(res.json.fieldErrors.event).toBe('This event is full.')
    }
    expect(accepted).toBe(true)

    const unknown = await call('/api/rsvp', { body: { event: 'no-such-event', name: 'Ada Pilot', email: 'ada@example.com' } })
    expect(unknown.status).toBe(422)
    expect(unknown.json.fieldErrors.event).toBe('Choose an event.')
  })

  it('normalises the device sign-in', async () => {
    const res = await call('/api/signin', { body: { email: '  Ada@Example.COM ', studentId: 'cpl-24-01873' } })
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ ok: true, email: 'ada@example.com', studentId: 'CPL-24-01873' })

    const bad = await call('/api/signin', { body: { email: 'ada@example.com', studentId: '123' } })
    expect(bad.status).toBe(422)
    expect(bad.json.fieldErrors).toHaveProperty('studentId')
  })

  it('answers unknown API paths with a JSON 404', async () => {
    const res = await call('/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.json).toEqual({ error: 'Not found' })
  })

  it('hands every non-API path to the static assets', async () => {
    const res = await call('/teacher/courses')
    expect(res.status).toBe(200)
    expect(res.json).toBe('asset')
  })
})
