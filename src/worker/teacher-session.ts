/*
  The teaching studio's signed session cookie (see session-cookie.ts for the
  format). It replaces the old demo cookie, which held a bare teacher id that
  any client could write for itself.

  The secret comes from `TEACHER_SESSION_SECRET`, kept separate from the student
  one, and when it is missing the studio refuses to sign anyone in rather than
  falling back to something guessable.
*/
import { sessionCookie } from './session-cookie'

const teacher = sessionCookie({ name: 'fadec_teacher', scope: 'teacher', ttlMs: 12 * 60 * 60 * 1000 })

export const TEACHER_COOKIE = teacher.name
export const TEACHER_SESSION_TTL_MS = teacher.ttlMs

export type TeacherSession = { teacherId: string; expiresAt: number }

export const createTeacherSession = teacher.create

export async function verifyTeacherSession(secret: string, value: string, now = Date.now()): Promise<TeacherSession | null> {
  const session = await teacher.verify(secret, value, now)
  return session && { teacherId: session.accountId, expiresAt: session.expiresAt }
}

export const teacherCookie = teacher.header
export const clearedTeacherCookie = teacher.cleared
