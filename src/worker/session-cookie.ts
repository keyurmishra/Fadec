/*
  Signed session cookies, shared by the student portal and the teaching studio.

  The value is an HMAC-SHA256 signature over the account id and an expiry, so a
  client can neither mint an identity nor extend one. Each kind of session has
  its own cookie name, its own secret, and its own scope label mixed into the
  signed payload, so a student cookie can never be replayed as a teacher one even
  if an operator reused the same secret for both.

  Cookie value: `v1.<accountId>.<expiresAtMs>.<hex signature>`, where the
  signature covers `<scope>:<accountId>.<expiresAtMs>`.
*/
const encoder = new TextEncoder()

const VERSION = 'v1'
const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,64}$/
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

export type SignedSession = { accountId: string; expiresAt: number }

export type SessionCookieConfig = {
  /** Cookie name, e.g. `fadec_student`. */
  name: string
  /** Mixed into the signed payload so one kind of session cannot stand in for another. */
  scope: string
  ttlMs: number
}

export function sessionCookie({ name, scope, ttlMs }: SessionCookieConfig) {
  const signed = (accountId: string, expiry: string | number) => `${scope}:${accountId}.${expiry}`

  async function create(secret: string, accountId: string, now = Date.now()): Promise<{ value: string; expiresAt: number }> {
    if (!ACCOUNT_ID.test(accountId)) throw new Error(`Refusing to sign a malformed ${scope} id`)
    const expiresAt = now + ttlMs
    return { value: `${VERSION}.${accountId}.${expiresAt}.${await sign(secret, signed(accountId, expiresAt))}`, expiresAt }
  }

  /** Returns the account the cookie names, or null for anything tampered, expired or malformed. */
  async function verify(secret: string, value: string, now = Date.now()): Promise<SignedSession | null> {
    const parts = value.split('.')
    if (parts.length !== 4 || parts[0] !== VERSION) return null

    const [, accountId, expiry, signature] = parts
    if (!ACCOUNT_ID.test(accountId) || !EXPIRY.test(expiry)) return null

    if (!sameSignature(await sign(secret, signed(accountId, expiry)), signature)) return null

    const expiresAt = Number(expiry)
    if (expiresAt <= now) return null
    return { accountId, expiresAt }
  }

  /** `Secure` is added only on https, so the cookie still works on loopback development. */
  function header(value: string, secure: boolean): string {
    // From the TTL, not from the expiry: subtracting two clocks loses the second
    // that has already passed and would advertise 43199 instead of 43200.
    const maxAge = Math.floor(ttlMs / 1000)
    return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
  }

  const cleared = (secure: boolean) => `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`

  return { name, ttlMs, create, verify, header, cleared }
}
