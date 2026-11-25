/*
  Course catalogue contracts: course, section, lesson, resource.

  Shape decisions:
  - A Course owns Sections; a Section owns Lessons (ordered by position); a
    Lesson owns Resources (PDFs and other downloads) plus at most one media
    asset for video lessons.
  - `position` is the single source of ordering. Reordering must rewrite
    position only — never delete and recreate rows, or progress records
    detach from their lessons (master PRD §5.7).
  - The public outline deliberately carries lesson titles for locked lessons
    but never a playback grant (PUB-03). Playback grants live in ./media.
  - Teachers are invite-only, so `instructorId` references an existing
    TeacherProfileDTO; there is no pending-instructor state.
*/
import type { AuditStamp, Id, IsoDateTime, MoneyDTO } from './common'
import type { ResourceDTO } from './media'

export type CourseStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED'

/** Only PUBLISHED + PUBLIC is ever visible to an anonymous visitor (PUB-01). */
export type CourseVisibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE'

export type CourseLevel = 'INTRODUCTORY' | 'INTERMEDIATE' | 'ADVANCED'

/** PDFs are attachments on a lesson, not a lesson kind of their own. */
export type LessonKind = 'VIDEO' | 'TEXT'

/** A course as shown in a list or card. */
export type CourseSummaryDTO = {
  id: Id
  slug: string
  title: string
  summary: string
  category: string
  level: CourseLevel
  status: CourseStatus
  visibility: CourseVisibility
  thumbnailUrl: string | null
  instructor: InstructorSummaryDTO
  sectionCount: number
  lessonCount: number
  /** Sum of lesson estimates; null while the outline is incomplete. */
  totalMinutes: number | null
  /** Null when the course is free. Payment is deferred; see EnrollmentSource. */
  price: MoneyDTO | null
  /** Free text shown on the course page, e.g. "DGCA CPL ground subjects". */
  accreditationNote: string | null
  publishedAt: IsoDateTime | null
}

/** The public/instructor-facing course record. */
export type CourseDTO = CourseSummaryDTO &
  AuditStamp & {
    description: string
    learningOutcomes: string[]
    requirements: string[]
    instructorId: Id
    /** Course completion certificates only — never a licence claim (§10.4). */
    certificateAvailable: boolean
  }

/** Minimal instructor block for course cards and the detail page. */
export type InstructorSummaryDTO = {
  id: Id
  userId: Id
  displayName: string
  headline: string
  avatarUrl: string | null
}

export type SectionDTO = AuditStamp & {
  id: Id
  courseId: Id
  title: string
  /** 0-based; unique per course. */
  position: number
}

/**
 * A chapter sits between a module (section) and its lessons, so the outline
 * reads Course → Module → Chapter → Lecture, which is what teachers organise
 * against. Lessons may still belong to a section without a chapter.
 */
export type ChapterDTO = AuditStamp & {
  id: Id
  sectionId: Id
  title: string
  /** 0-based; unique per section. */
  position: number
}

export type LessonDTO = AuditStamp & {
  id: Id
  sectionId: Id
  /** Null when the lesson sits directly under its section. */
  chapterId: Id | null
  title: string
  kind: LessonKind
  /** 0-based; unique per section. */
  position: number
  /** Preview lessons play before enrolment; everything else is locked. */
  isPreview: boolean
  /**
   * True when the viewer may not play this lesson. Locked lessons still carry
   * a title and position (so the syllabus is legible) but return
   * mediaAssetId: null, body: null and resources: [].
   */
  isLocked: boolean
  estimatedMinutes: number
  /** VIDEO lessons only; null until an upload reaches READY, or when locked. */
  mediaAssetId: Id | null
  /** TEXT lessons only; null when locked. */
  body: string | null
  resources: ResourceDTO[]
}

/**
 * Everything a course page needs in one payload. Locked lessons carry their
 * title and position so buyers can judge the syllabus, but no media, body or
 * resource URL. The server decides what is locked; the client never filters.
 */
export type CourseOutlineDTO = CourseDTO & {
  sections: Array<SectionDTO & { lessons: LessonDTO[] }>
  /** True when the viewer holds an active enrolment for this course. */
  isEnrolled: boolean
}

export type CourseDraftInputDTO = {
  title: string
  summary: string
  description: string
  category: string
  level: CourseLevel
  learningOutcomes: string[]
  requirements: string[]
  thumbnailAssetId: Id | null
}

export type SectionInputDTO = {
  title: string
  position: number
}

export type LessonInputDTO = {
  sectionId: Id
  chapterId: Id | null
  title: string
  kind: LessonKind
  position: number
  isPreview: boolean
  estimatedMinutes: number
  mediaAssetId: Id | null
  body: string | null
}

/** One unmet publish requirement. The checklist renders these directly. */
export type PublishRequirementDTO = {
  key:
    | 'title'
    | 'description'
    | 'instructor'
    | 'thumbnail'
    | 'section'
    | 'accessibleLesson'
    | 'mediaReady'
  label: string
  satisfied: boolean
  detail?: string
}

export type PublishValidationDTO = {
  canPublish: boolean
  requirements: PublishRequirementDTO[]
}
