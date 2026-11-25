/*
  Identity, session and workspace contracts.

  FADEC decisions encoded here:
  - Two working roles today: STUDENT and TEACHER. The wider role set is
    reserved so the type does not have to change when administration lands.
  - Teachers are INVITE-ONLY: there is no self-serve teacher application and
    no PENDING review queue. A STUDENT becomes a TEACHER by accepting a
    TeacherInviteDTO. The invite is created by an operator, not by the user.
  - A user may hold both roles at once, so the session carries an
    activeWorkspace rather than a single role (frontend PRD §3).
*/
import type { AuditStamp, Id, IsoDateTime } from './common'

export type Role = 'STUDENT' | 'TEACHER' | 'ACADEMY_ADMIN' | 'SUPPORT' | 'SUPER_ADMIN'

/** Roles a user can actually enter a workspace as, in this phase. */
export type WorkspaceRole = 'STUDENT' | 'TEACHER'

export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED'

export type UserDTO = AuditStamp & {
  id: Id
  email: string
  /** Display name; may be empty until the user sets it. */
  name: string
  status: AccountStatus
  emailVerifiedAt: IsoDateTime | null
  roles: Role[]
}

/** Teacher profile created when an invite is accepted. */
export type TeacherProfileDTO = AuditStamp & {
  id: Id
  userId: Id
  headline: string
  bio: string
  /** Free-text qualifications; FADEC records them, it does not verify them. */
  qualifications: string[]
  /** Set by the operator who invited the teacher, never by the teacher. */
  invitedByUserId: Id
  activatedAt: IsoDateTime
}

export type TeacherInviteStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'

export type TeacherInviteDTO = AuditStamp & {
  id: Id
  /** Normalised lowercase email the invite was issued to. */
  email: string
  status: TeacherInviteStatus
  invitedByUserId: Id
  /** Display label for the operator who issued it. */
  invitedByName: string
  expiresAt: IsoDateTime
  acceptedAt: IsoDateTime | null
  /** Set when status is ACCEPTED. */
  acceptedByUserId: Id | null
}

/** One signed-in device. Revoking is per-session (IAM-05). */
export type SessionDeviceDTO = {
  id: Id
  deviceLabel: string
  location: string
  lastActiveAt: IsoDateTime
  createdAt: IsoDateTime
  isCurrent: boolean
}

/**
 * The authenticated session. `activeWorkspace` is client-selectable between
 * the roles the user actually holds; the server re-checks it on every call.
 */
export type UserSessionDTO = {
  user: UserDTO
  /** Workspaces this account may enter right now. */
  availableWorkspaces: WorkspaceRole[]
  activeWorkspace: WorkspaceRole
  /** Present only when the account holds the TEACHER role. */
  teacherProfileId: Id | null
  /** Pending invite, if this account has been invited but not yet accepted. */
  pendingInvite: TeacherInviteDTO | null
  /** Short-lived access token expiry; refresh is handled by cookie rotation. */
  expiresAt: IsoDateTime
}

export type LoginRequestDTO = {
  email: string
  password: string
}

export type RegisterRequestDTO = {
  email: string
  password: string
  name: string
}

/**
 * Login outcomes. `INVALID_CREDENTIALS` must never reveal whether the email
 * exists; `SUSPENDED` is a deliberately distinct state (IAM-06).
 */
export type LoginResultDTO =
  | { outcome: 'AUTHENTICATED'; session: UserSessionDTO }
  | { outcome: 'EMAIL_UNVERIFIED' }
  | { outcome: 'INVALID_CREDENTIALS' }
  | { outcome: 'SUSPENDED'; supportEmail: string }
