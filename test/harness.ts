/*
  Runs the Worker's Hono app in Node against a real (in-memory) D1 database.

  Wrangler's platform proxy (Miniflare underneath) provides the D1 binding, so
  the SQL the routes issue is executed by the same engine the deployed Worker
  uses. Each test file gets its own
  database; `ensureDatabase` creates and seeds it on the first /api request.
*/
import { getPlatformProxy } from 'wrangler'
import { afterAll } from 'vitest'

import app from '../src/worker/index'

export const SESSION_SECRET = 'test-only-session-secret'

// Bindings from wrangler.jsonc, held in memory only: nothing is written to .wrangler/.
const proxy = await getPlatformProxy<{ DB: D1Database }>({ persist: false, envFiles: [] })

afterAll(() => proxy.dispose())

const assets = { fetch: async () => new Response('asset', { status: 200 }) } as unknown as Fetcher

let env: { ASSETS: Fetcher; DB: D1Database; STUDENT_SESSION_SECRET?: string } | null = null

async function getEnv() {
  if (!env) env = { ASSETS: assets, DB: proxy.env.DB, STUDENT_SESSION_SECRET: SESSION_SECRET }
  return env
}

type CallOptions = { method?: string; body?: unknown; rawBody?: string; cookie?: string; secret?: string | null }

/** Sends one request through the app and returns the status, headers and parsed JSON. */
export async function call(path: string, { method, body, rawBody, cookie, secret }: CallOptions = {}) {
  const base = await getEnv()
  const bindings = secret === undefined ? base : { ...base, STUDENT_SESSION_SECRET: secret ?? undefined }
  const headers = new Headers()
  if (cookie) headers.set('cookie', cookie)
  let payload: string | undefined
  if (rawBody !== undefined) payload = rawBody
  else if (body !== undefined) payload = JSON.stringify(body)
  if (payload !== undefined) headers.set('content-type', 'application/json')
  const res = await app.fetch(
    new Request(`http://localhost${path}`, { method: method ?? (payload !== undefined ? 'POST' : 'GET'), headers, body: payload }),
    bindings,
  )
  const text = await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: res.status, headers: res.headers, json }
}

/** The `name=value` part of a Set-Cookie header, ready to send back. */
export const cookieFrom = (headers: Headers) => (headers.get('set-cookie') ?? '').split(';')[0]

export const TEACHER = { email: 'naveen.rao@fadec.example', teacherId: 'TCH-2011-004' }
export const OTHER_TEACHER = { email: 'tomas.rehn@fadec.example', teacherId: 'TCH-2015-011' }
export const STUDENT = { email: 'priya.nair@fadec.example', studentId: 'PPL-26-00001' }

export async function teacherCookie(who = TEACHER) {
  const res = await call('/api/teacher/signin', { body: who })
  if (res.status !== 200) throw new Error(`teacher sign-in failed: ${res.status}`)
  return cookieFrom(res.headers)
}

export async function studentCookie(who = STUDENT) {
  const res = await call('/api/student/signin', { body: who })
  if (res.status !== 200) throw new Error(`student sign-in failed: ${res.status}`)
  return cookieFrom(res.headers)
}
