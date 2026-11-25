/*
  Teaching contracts: the teacher's own view of their courses, live classes,
  attendance, announcements and the analytics the studio renders.

  These sit on top of ./catalog, ./learning and ./assessment, which already
  describe courses, lessons, enrolments, submissions and grades. Nothing here
  grants access: every teacher payload is filtered server-side by the courses
  assigned to the requesting teacher.
*/
import type { AuditStamp, Id, IsoDateTime, MoneyDTO } from './common'
import type { ChapterDTO, CourseStatus, InstructorSummaryDTO, LessonDTO, SectionDTO } from './catalog'

/** Who the teaching studio is signed in as. */
export type TeacherIdentityDTO = {
  teacherId: Id
  name: string
  email: string
  department: string
  headline: string
  avatarUrl: string | null
}

/** Session returned by `POST /api/teacher/signin`. */
export type TeacherSessionDTO = TeacherIdentityDTO & {
  /** Demo session only: replaced by a real session cookie when auth lands. */
  demo: boolean
  expiresAt: IsoDateTime
}

/**
 * A course as its own teacher sees it. Extends the public summary with the
 * counts the studio needs, so a course card never costs a second request.
 */
export type TeacherCourseSummaryDTO = {
  id: Id
  slug: string
  title: string
  summary: string
  category: string
  level: string
  status: CourseStatus
  thumbnailUrl: string | null
  instructor: InstructorSummaryDTO
  sectionCount: number
  lectureCount: number
  assignmentCount: number
  enrolledCount: number
  /** 0–100, mean completion across active enrolments. */
  completionPercent: number
  /** Lectures saved but not published; the overview surfaces this as work. */
  draftLectureCount: number
  price: MoneyDTO | null
  publishedAt: IsoDateTime | null
  updatedAt: IsoDateTime
}

/**
 * A lecture as its author sees it: the public lesson fields plus the two
 * states the builder and the publish checklist need. Learners never see this
 * shape — it exposes nothing they should not have, but it is teacher-scoped by
 * contract so a review can tell which payload carries draft state.
 */
export type TeacherLessonDTO = LessonDTO & {
  status: 'DRAFT' | 'PUBLISHED'
  mediaStatus: 'READY' | 'PROCESSING' | 'NONE'
}

export type TeacherOutlineSection = SectionDTO & {
  chapters: Array<ChapterDTO & { lessons: TeacherLessonDTO[] }>
}

/** A file or link attached to one lecture. */
export type LectureResourceDTO = {
  id: Id
  title: string
  kind: 'PDF' | 'SLIDES' | 'DATASET' | 'LINK' | 'OTHER'
  /** Set for links; null for a file held in media storage. */
  externalUrl: string | null
  sizeBytes: number | null
  addedAt: IsoDateTime
}

/**
 * The window in which students may open a lecture. `status` is derived on the
 * server so every screen reports the same thing without comparing clocks.
 */
export type LectureAvailabilityStatus = 'IMMEDIATE' | 'SCHEDULED' | 'EXPIRED'

export type LectureAvailabilityDTO = {
  availableFrom: IsoDateTime | null
  availableUntil: IsoDateTime | null
  status: LectureAvailabilityStatus
}

export type LectureWatchStatsDTO = {
  enrolled: number
  started: number
  completed: number
  /** 0–100, completed learners over enrolments on the course. */
  completionPercent: number
  averageWatchMinutes: number
  /** 0–100 of the lecture's length. */
  averageWatchPercent: number
  /** Daily starts for the last seven days, oldest first. */
  trend: Array<{ date: string; starts: number }>
}

/** One row of the Lectures & Videos list. */
export type TeacherLectureSummaryDTO = {
  id: Id
  courseId: Id
  courseTitle: string
  sectionTitle: string
  chapterTitle: string
  title: string
  kind: 'VIDEO' | 'TEXT'
  estimatedMinutes: number
  status: 'DRAFT' | 'PUBLISHED'
  mediaStatus: 'READY' | 'PROCESSING' | 'NONE'
  isPreview: boolean
  resourceCount: number
  /** 0–100, watch completion; 0 while the lecture is not live. */
  watchCompletionPercent: number
  availabilityStatus: LectureAvailabilityStatus
  updatedAt: IsoDateTime
}

/** What still blocks a lecture from going live. */
export type TeacherLectureValidationDTO = {
  canPublish: boolean
  requirements: Array<{ key: string; label: string; satisfied: boolean; detail?: string }>
}

export type TeacherLectureDetailDTO = TeacherLectureSummaryDTO & {
  sectionId: Id
  chapterId: Id | null
  position: number
  /** TEXT lectures only; null for video lectures until notes are added. */
  body: string | null
  resources: LectureResourceDTO[]
  availability: LectureAvailabilityDTO
  watch: LectureWatchStatsDTO
  courseStatus: CourseStatus
  /** Null until a video has been processed to READY. */
  media: { assetId: Id; durationSeconds: number | null } | null
  publish: TeacherLectureValidationDTO
  createdAt: IsoDateTime
}

/** A download attached to an assignment, a lesson or a course. */
export type AttachmentDTO = {
  id: Id
  ownerKind: 'ASSIGNMENT' | 'LESSON' | 'COURSE'
  ownerId: Id
  title: string
  kind: 'PDF' | 'SLIDES' | 'DATASET' | 'LINK' | 'OTHER'
  mediaAssetId: Id | null
  externalUrl: string | null
  sizeBytes: number | null
}

export type LiveClassStatus = 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED'

export type LiveClassDTO = AuditStamp & {
  id: Id
  courseId: Id
  courseTitle: string
  sectionId: Id | null
  title: string
  topic: string
  startsAt: IsoDateTime
  durationMinutes: number
  meetingUrl: string | null
  status: LiveClassStatus
  enrolledCount: number
  attendanceTakenAt: IsoDateTime | null
}

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT'

export type AttendanceRecordDTO = {
  sessionId: Id
  liveClassId: Id | null
  studentUserId: Id
  status: AttendanceStatus
  note: string | null
  markedByUserId: Id
  markedAt: IsoDateTime
}

export type AttendanceSummaryDTO = {
  sessionId: Id
  courseId: Id
  total: number
  present: number
  late: number
  absent: number
  /** 0–100, (present + late) / total. */
  percent: number
  savedAt: IsoDateTime | null
}

export type AnnouncementDTO = AuditStamp & {
  id: Id
  courseIds: Id[]
  title: string
  body: string
  pinned: boolean
  deliverEmail: boolean
  sentAt: IsoDateTime
  deliveredCount: number
  authorUserId: Id
}

/** One row of the teacher's roster, with every metric the brief lists. */
export type CourseStudentSummaryDTO = {
  studentUserId: Id
  name: string
  email: string
  avatarUrl: string | null
  courseIds: Id[]
  courseTitles: string[]
  /** 0–100, or null when nothing has been marked yet. */
  assignmentAverage: number | null
  quizAverage: number | null
  lectureCompletionPercent: number
  attendancePercent: number
  /** 0–100, weighted from the four metrics above. */
  overallProgress: number
  atRisk: boolean
  lastActiveAt: IsoDateTime | null
}

export type TeacherDeadlineDTO = {
  assignmentId: Id
  title: string
  courseId: Id
  courseTitle: string
  dueAt: IsoDateTime
  submitted: number
  notSubmitted: number
}

export type TeacherRecentSubmissionDTO = {
  submissionId: Id
  assignmentId: Id
  assignmentTitle: string
  courseTitle: string
  studentUserId: Id
  studentName: string
  submittedAt: IsoDateTime
  isLate: boolean
  /** Null until evaluated. */
  score: number | null
  maxScore: number
}

export type TeacherActivityKind = 'ENROLMENT' | 'SUBMISSION' | 'QUIZ_ATTEMPT' | 'LECTURE_COMPLETE' | 'LIVE_CLASS'

export type TeacherActivityDTO = {
  id: Id
  kind: TeacherActivityKind
  at: IsoDateTime
  text: string
  /** Route the feed row links to. */
  href: string
}

/** Everything the overview screen needs, in one payload. */
export type TeacherDashboardDTO = {
  teacher: TeacherIdentityDTO
  kpis: {
    assignedCourses: number
    enrolledStudents: number
    publishedLectures: number
    pendingEvaluations: number
  }
  quickCounts: {
    draftsAwaitingPublish: number
    lateSubmissions: number
    atRiskStudents: number
  }
  upcomingClasses: LiveClassDTO[]
  upcomingDeadlines: TeacherDeadlineDTO[]
  recentSubmissions: TeacherRecentSubmissionDTO[]
  activity: TeacherActivityDTO[]
}

export type TeacherAnalyticsDTO = {
  range: { from: string; to: string }
  byCourse: Array<{
    courseId: Id
    courseTitle: string
    averageAssignmentScore: number | null
    averageQuizScore: number | null
    lectureCompletionPercent: number
    attendancePercent: number
    submissionRate: number
  }>
  attendanceTrend: Array<{ weekStart: string; percent: number }>
  atRiskStudentIds: Id[]
}

export type TeacherNotificationPrefsDTO = {
  newSubmission: boolean
  lateSubmission: boolean
  quizAttempt: boolean
  liveClassReminder: boolean
  weeklyDigest: boolean
}
