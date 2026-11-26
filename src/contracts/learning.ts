/*
  Enrolment and progress contracts.

  FADEC decisions encoded here:
  - Payments are deferred. An enrolment is created by an operator grant or a
    teacher invite (`EnrollmentSource`), never by a client success callback.
    When checkout ships, its only job is to create this same record after a
    verified server-side confirmation.
  - Completion is server-computed from required lessons, never accepted as a
    client percentage (master PRD §5.11). `percent` is read-only.
  - Progress is a per-lesson row plus an aggregate view; the client pings and
    the server decides whether the jump was plausible.
*/
import type { AuditStamp, Id, IsoDateTime } from './common'

/** Payment is not a source yet; it is the reserved fourth value. */
export type EnrollmentSource = 'MANUAL_GRANT' | 'TEACHER_INVITE' | 'FREE'

export type EnrollmentStatus = 'ACTIVE' | 'SUSPENDED' | 'COMPLETED' | 'REVOKED'

export type EnrollmentDTO = AuditStamp & {
  id: Id
  studentUserId: Id
  courseId: Id
  status: EnrollmentStatus
  source: EnrollmentSource
  /** Operator or teacher who granted access; null for self-service free. */
  grantedByUserId: Id | null
  grantedAt: IsoDateTime
  /** Set when access ends, so the player can explain why content locked. */
  accessExpiresAt: IsoDateTime | null
  completedAt: IsoDateTime | null
}

export type LessonProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'

export type LessonProgressDTO = AuditStamp & {
  enrollmentId: Id
  lessonId: Id
  status: LessonProgressStatus
  /** Resume position in seconds. */
  positionSeconds: number
  watchedSeconds: number
  lastActivityAt: IsoDateTime
  completedAt: IsoDateTime | null
}

/** Aggregate shown on the dashboard and course card. */
export type CourseProgressDTO = {
  enrollmentId: Id
  courseId: Id
  completedLessons: number
  requiredLessons: number
  /** 0–100, server-computed. */
  percent: number
  /** Where "Continue" should send the student. */
  resumeLessonId: Id | null
  lastActivityAt: IsoDateTime | null
}

/**
 * Who the student portal is signed in as. `id` is the internal key the enrolment
 * and submission tables use and never appears in a URL; `studentNo` is the
 * number the student types at sign-in.
 */
export type StudentIdentityDTO = {
  id: Id
  studentNo: string
  name: string
  email: string
  cohort: string
}

/** Returned by `POST /api/student/signin`, behind a signed session cookie. */
export type StudentSessionDTO = StudentIdentityDTO & {
  /** Seeded accounts and a demo credential until real auth lands. */
  demo: boolean
  expiresAt: IsoDateTime
}

/** Client → server progress ping. The server may reject impossible jumps. */
export type ProgressPingDTO = {
  enrollmentId: Id
  lessonId: Id
  positionSeconds: number
  /** Wall-clock elapsed on the client since the last ping, for tolerance. */
  elapsedSeconds: number
  /** Sent on pause, seek or unload in addition to the periodic loop. */
  reason: 'INTERVAL' | 'PAUSE' | 'SEEK' | 'UNLOAD'
}

/** Result of a progress ping; `accepted: false` is not an error. */
export type ProgressPingResultDTO = {
  accepted: boolean
  progress: LessonProgressDTO
  courseProgress: CourseProgressDTO
}
