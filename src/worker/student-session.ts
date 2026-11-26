/*
  The student portal's signed session cookie.

  The teacher studio's demo cookie holds a bare id, which is why it is labelled
  as unsafe. Students get the real shape from the start: an HMAC-SHA256 signature
  over the account id and an expiry, so a client can neither mint an identity nor
  extend one. The secret comes from `STUDENT_SESSION_SECRET`, and when it is
  missing the portal refuses to sign anyone in rather than falling back to
  something guessable.

  Cookie value: `v1.<studentId>.<expiresAtMs>.<hex signature>`.
*/
const encoder = new TextEncoder()

export const STUDENT_COOKIE = 'fadec_student'
export const STUDENT_SESSION_TTL_MS = 12 * 60 * 60 * 1000

const VERSION = 'v1'
const STUDENT_ID = /^[A-Za-z0-9_-]{1,64}$/
const EXPIRY = /^\d{1,16}$/

const toHex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)))
}

/** Compare every character, so a rejected signature does not reveal how close it was. */
function sameSignature(expected: string, actual: string): boolean {
  if (expected.length !== actual.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i)
  return diff === 0
}

export type StudentSession = { studentId: string; expiresAt: number }

export async function createStudentSession(secret: string, studentId: string, now = Date.now()): Promise<{ value: string; expiresAt: number }> {
  const expiresAt = now + STUDENT_SESSION_TTL_MS
  const payload = `${studentId}.${expiresAt}`
  return { value: `${VERSION}.${payload}.${await sign(secret, payload)}`, expiresAt }
}

/** Returns the account the cookie names, or null for anything tampered, expired or malformed. */
export async function verifyStudentSession(secret: string, value: string, now = Date.now()): Promise<StudentSession | null> {
  const parts = value.split('.')
  if (parts.length !== 4 || parts[0] !== VERSION) return null

  const [, studentId, expiry, signature] = parts
  if (!STUDENT_ID.test(studentId) || !EXPIRY.test(expiry)) return null

  if (!sameSignature(await sign(secret, `${studentId}.${expiry}`), signature)) return null

  const expiresAt = Number(expiry)
  if (expiresAt <= now) return null
  return { studentId, expiresAt }
}

/** `Secure` is added only on https, so the cookie still works on loopback development. */
export function studentCookie(value: string, secure: boolean): string {
  // From the TTL, not from the expiry: subtracting two clocks loses the second
  // that has already passed and would advertise 43199 instead of 43200.
  const maxAge = Math.floor(STUDENT_SESSION_TTL_MS / 1000)
  return `${STUDENT_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
}

export const clearedStudentCookie = (secure: boolean) => `${STUDENT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
