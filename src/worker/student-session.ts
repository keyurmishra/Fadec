/*
  The student portal's signed session cookie (see session-cookie.ts for the
  format). The secret comes from `STUDENT_SESSION_SECRET`, and when it is
  missing the portal refuses to sign anyone in rather than falling back to
  something guessable.
*/
import { sessionCookie } from './session-cookie'

const student = sessionCookie({ name: 'fadec_student', scope: 'student', ttlMs: 12 * 60 * 60 * 1000 })

export const STUDENT_COOKIE = student.name
export const STUDENT_SESSION_TTL_MS = student.ttlMs

export type StudentSession = { studentId: string; expiresAt: number }

export const createStudentSession = student.create

export async function verifyStudentSession(secret: string, value: string, now = Date.now()): Promise<StudentSession | null> {
  const session = await student.verify(secret, value, now)
  return session && { studentId: session.accountId, expiresAt: session.expiresAt }
}

export const studentCookie = student.header
export const clearedStudentCookie = student.cleared
