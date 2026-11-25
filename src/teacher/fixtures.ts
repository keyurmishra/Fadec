/*
  Teaching fixtures.

  The portal is built against real HTTP endpoints from day one; until D1 is
  provisioned those endpoints read this module instead of a database. Every
  number the UI shows is derived here, so the overview, the course list and the
  roster cannot disagree with each other. Swapping to D1 later means replacing
  the worker's handlers, not the screens.
*/
import type { AssignmentStatus } from '../contracts/assessment'
import type { CourseStatus } from '../contracts/catalog'
import { courseCounts, publishedLessonCount } from './curriculum'
import type {
  CourseStudentSummaryDTO,
  LiveClassDTO,
  TeacherActivityDTO,
  TeacherCourseSummaryDTO,
  TeacherDashboardDTO,
  TeacherDeadlineDTO,
  TeacherIdentityDTO,
  TeacherRecentSubmissionDTO,
} from '../contracts/teaching'

const at = (s: string) => new Date(s).toISOString()

/* --------------------------------- people -------------------------------- */

export const TEACHERS: TeacherIdentityDTO[] = [
  {
    teacherId: 'TCH-2011-004',
    name: 'Capt. Naveen Rao',
    email: 'naveen.rao@fadec.example',
    department: 'Flight training',
    headline: 'Chief flying instructor',
    avatarUrl: '/images/faculty-1.webp',
  },
  {
    teacherId: 'TCH-2015-011',
    name: 'Capt. Tomas Rehn',
    email: 'tomas.rehn@fadec.example',
    department: 'Simulator',
    headline: 'Head of simulator training',
    avatarUrl: '/images/faculty-2.webp',
  },
]

export const DEMO_TEACHER = TEACHERS[0]

/* -------------------------------- courses -------------------------------- */

type CourseRow = {
  id: string
  slug: string
  title: string
  summary: string
  category: string
  level: string
  status: CourseStatus
  instructorId: string
  thumbnailUrl: string
  enrolledCount: number
  assignmentCount: number
  completionPercent: number
  updatedAt: string
  publishedAt: string | null
}

const COURSES: CourseRow[] = [
  {
    id: 'crs-ppl',
    slug: 'ppl-private-pilot-licence',
    title: 'Private Pilot Licence (PPL)',
    summary: 'Nine ground subjects, 45 flight hours and a skills test — the licence that starts most flying careers.',
    category: 'Licence',
    level: 'INTRODUCTORY',
    status: 'PUBLISHED',
    instructorId: 'TCH-2011-004',
    thumbnailUrl: '/images/prog-computing.webp',
    enrolledCount: 8,
    assignmentCount: 3,
    completionPercent: 62,
    updatedAt: at('2026-11-23T09:10:00Z'),
    publishedAt: at('2026-08-14T10:00:00Z'),
  },
  {
    id: 'crs-cpl',
    slug: 'cpl-commercial-pilot-licence',
    title: 'Commercial Pilot Licence (CPL)',
    summary: 'The professional licence: fourteen ground subjects, 200 flight hours and a commercial skills test.',
    category: 'Licence',
    level: 'ADVANCED',
    status: 'PUBLISHED',
    instructorId: 'TCH-2011-004',
    thumbnailUrl: '/images/prog-health.webp',
    enrolledCount: 7,
    assignmentCount: 3,
    completionPercent: 48,
    updatedAt: at('2026-11-24T08:40:00Z'),
    publishedAt: at('2026-06-02T09:30:00Z'),
  },
  {
    id: 'crs-ir',
    slug: 'instrument-rating',
    title: 'Instrument Rating (IR)',
    summary: 'Fifty hours of instrument time, procedure trainers and an IR skills test on a multi-engine type.',
    category: 'Rating',
    level: 'ADVANCED',
    status: 'DRAFT',
    instructorId: 'TCH-2011-004',
    thumbnailUrl: '/images/prog-business.webp',
    enrolledCount: 5,
    assignmentCount: 2,
    completionPercent: 0,
    updatedAt: at('2026-11-21T15:25:00Z'),
    publishedAt: null,
  },
  {
    id: 'crs-a320',
    slug: 'a320-type-rating-ground-school',
    title: 'A320 Type Rating Ground School',
    summary: 'Systems, SOPs and performance for the A320 family, taught by line training captains.',
    category: 'Rating',
    level: 'ADVANCED',
    status: 'PUBLISHED',
    instructorId: 'TCH-2011-004',
    thumbnailUrl: '/images/prog-a320.webp',
    enrolledCount: 4,
    assignmentCount: 2,
    completionPercent: 71,
    updatedAt: at('2026-11-22T12:05:00Z'),
    publishedAt: at('2026-09-01T08:00:00Z'),
  },
  {
    id: 'crs-mcc',
    slug: 'mcc-joc',
    title: 'MCC / JOC — Multi-Crew Cooperation',
    summary: 'Two-crew procedures, threat management and a full LOFT scenario in the fixed-base simulator.',
    category: 'Rating',
    level: 'ADVANCED',
    status: 'PUBLISHED',
    instructorId: 'TCH-2015-011',
    thumbnailUrl: '/images/prog-psych.webp',
    enrolledCount: 6,
    assignmentCount: 1,
    completionPercent: 66,
    updatedAt: at('2026-11-19T10:00:00Z'),
    publishedAt: at('2026-10-05T09:00:00Z'),
  },
]

const instructorOf = (teacherId: string) => {
  const t = TEACHERS.find((x) => x.teacherId === teacherId) ?? TEACHERS[0]
  return { id: `prof-${t.teacherId}`, userId: t.teacherId, displayName: t.name, headline: t.headline, avatarUrl: t.avatarUrl }
}

export const courseSummary = (c: CourseRow): TeacherCourseSummaryDTO => {
  const counts = courseCounts(c.id)
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    summary: c.summary,
    category: c.category,
    level: c.level,
    status: c.status,
    thumbnailUrl: c.thumbnailUrl,
    instructor: instructorOf(c.instructorId),
    sectionCount: counts.sectionCount,
    lectureCount: counts.lectureCount,
    assignmentCount: c.assignmentCount,
    enrolledCount: c.enrolledCount,
    completionPercent: c.completionPercent,
    draftLectureCount: counts.draftLectureCount,
    price: null,
    publishedAt: c.publishedAt,
    updatedAt: c.updatedAt,
  }
}

/** Status changes the teacher is allowed to make from the studio. */
export function setCourseStatus(teacherId: string, courseId: string, status: CourseStatus) {
  const row = COURSES.find((c) => c.id === courseId && c.instructorId === teacherId)
  if (!row) return null
  row.status = status
  row.updatedAt = new Date().toISOString()
  if (status === 'PUBLISHED' && !row.publishedAt) row.publishedAt = row.updatedAt
  return courseSummary(row)
}

export const coursesForTeacher = (teacherId: string) => COURSES.filter((c) => c.instructorId === teacherId).map(courseSummary)

/** A course the teacher does not own is indistinguishable from a missing one. */
export const courseForTeacher = (teacherId: string, courseId: string) => {
  const row = COURSES.find((c) => c.id === courseId && c.instructorId === teacherId)
  return row ? courseSummary(row) : null
}

export const courseTitle = (courseId: string) => COURSES.find((c) => c.id === courseId)?.title ?? 'Course'

/** Every course id in the catalogue. Used where no teacher scope applies. */
export const allCourseIds = () => COURSES.map((c) => c.id)

/** A course's title and status without a teacher scope, for the student catalogue. */
export const publicCourse = (courseId: string) => {
  const row = COURSES.find((c) => c.id === courseId)
  return row ? { id: row.id, title: row.title, status: row.status } : null
}

/* -------------------------------- roster --------------------------------- */

/** name, course, assignment average, quiz average, lecture completion, attendance */
type RosterTuple = [string, string, number | null, number | null, number, number]

const ROSTER_ROWS: RosterTuple[] = [
  ['Priya Nair', 'crs-ppl', 84, 78, 92, 96],
  ['Theo Bennett', 'crs-ppl', 71, 68, 74, 88],
  ['Maya Okafor', 'crs-ppl', 88, 91, 97, 100],
  ['Lucas Ferreira', 'crs-ppl', 63, 55, 61, 78],
  ['Hana Sato', 'crs-ppl', 92, 86, 88, 96],
  ['Daniel Kim', 'crs-ppl', 47, 52, 39, 64],
  ['Amelia Wright', 'crs-ppl', 76, 74, 81, 92],
  ['Omar Haddad', 'crs-ppl', 58, null, 44, 71],
  ['Sofia Rossi', 'crs-cpl', 81, 77, 86, 94],
  ['Jonas Weber', 'crs-cpl', 66, 62, 58, 82],
  ['Aisha Bello', 'crs-cpl', 74, 79, 83, 90],
  ['Ravi Menon', 'crs-cpl', 52, 48, 46, 68],
  ['Elena Petrova', 'crs-cpl', 89, 84, 91, 98],
  ['Tom Hughes', 'crs-cpl', 70, 66, 69, 80],
  ['Nia Campbell', 'crs-cpl', 77, 81, 72, 88],
  ['Marcus Lee', 'crs-ir', 83, 80, 78, 92],
  ['Clara Dubois', 'crs-ir', 72, 75, 66, 86],
  ['Yusuf Demir', 'crs-ir', 68, 71, 59, 84],
  ['Grace Mwangi', 'crs-ir', 90, 88, 84, 96],
  ['Ivan Volkov', 'crs-ir', 55, 60, 41, 74],
  ['Wei Chen', 'crs-a320', 86, 82, 88, 94],
  ['Fatima Zahra', 'crs-a320', 79, 84, 76, 90],
  ['Oliver Grant', 'crs-a320', 67, 63, 58, 82],
  ['Anya Sharma', 'crs-a320', 91, 93, 90, 100],
]

const emailFor = (name: string) => `${name.toLowerCase().replace(/[^a-z ]/g, '').trim().replace(/\s+/g, '.')}@example.com`

const overall = (a: number | null, q: number | null, lecture: number, attendance: number) =>
  Math.round(0.45 * (a ?? 0) + 0.2 * (q ?? 0) + 0.2 * lecture + 0.15 * attendance)

export const STUDENTS: Array<CourseStudentSummaryDTO & { courseId: string }> = ROSTER_ROWS.map(([name, courseId, a, q, lecture, attendance], i) => {
  const progress = overall(a, q, lecture, attendance)
  return {
    studentUserId: `u-${String(i + 1).padStart(3, '0')}`,
    name,
    email: emailFor(name),
    avatarUrl: null,
    courseIds: [courseId],
    courseTitles: [courseTitle(courseId)],
    assignmentAverage: a,
    quizAverage: q,
    lectureCompletionPercent: lecture,
    attendancePercent: attendance,
    overallProgress: progress,
    atRisk: progress < 55 || attendance < 70 || (a !== null && a < 50),
    lastActiveAt: at(`2026-11-${String(10 + (i % 14)).padStart(2, '0')}T${String(8 + (i % 10)).padStart(2, '0')}:15:00Z`),
    courseId,
  }
})

export const studentById = (studentUserId: string) => STUDENTS.find((s) => s.studentUserId === studentUserId) ?? null

/** Students enrolled in any course the teacher owns. */
export const rosterForTeacher = (teacherId: string): CourseStudentSummaryDTO[] => {
  const ids = new Set(COURSES.filter((c) => c.instructorId === teacherId).map((c) => c.id))
  return STUDENTS.filter((s) => ids.has(s.courseId))
}

/* ------------------------------ assignments ------------------------------ */

type AssignmentRow = {
  id: string
  courseId: string
  title: string
  dueAt: string
  maxScore: number
  status: AssignmentStatus
  submitted: number
  notSubmitted: number
}

export const ASSIGNMENTS: AssignmentRow[] = [
  { id: 'a-01', courseId: 'crs-ppl', title: 'Navigation log: Bristol–Exeter', dueAt: at('2026-11-27T17:00:00Z'), maxScore: 100, status: 'OPEN', submitted: 6, notSubmitted: 2 },
  { id: 'a-02', courseId: 'crs-ppl', title: 'Met briefing write-up', dueAt: at('2026-12-02T17:00:00Z'), maxScore: 50, status: 'OPEN', submitted: 4, notSubmitted: 4 },
  { id: 'a-03', courseId: 'crs-ppl', title: 'Air law progress test 6', dueAt: at('2026-12-09T17:00:00Z'), maxScore: 40, status: 'SCHEDULED', submitted: 0, notSubmitted: 8 },
  { id: 'a-04', courseId: 'crs-cpl', title: 'Performance and mass & balance', dueAt: at('2026-11-29T12:00:00Z'), maxScore: 100, status: 'OPEN', submitted: 5, notSubmitted: 2 },
  { id: 'a-05', courseId: 'crs-cpl', title: 'Flight planning case study', dueAt: at('2026-12-06T12:00:00Z'), maxScore: 100, status: 'OPEN', submitted: 2, notSubmitted: 5 },
  { id: 'a-06', courseId: 'crs-cpl', title: 'Human performance essay', dueAt: at('2026-11-20T12:00:00Z'), maxScore: 60, status: 'CLOSED', submitted: 7, notSubmitted: 0 },
  { id: 'a-07', courseId: 'crs-a320', title: 'Hydraulics systems report', dueAt: at('2026-11-30T09:00:00Z'), maxScore: 80, status: 'OPEN', submitted: 3, notSubmitted: 1 },
  { id: 'a-08', courseId: 'crs-a320', title: 'Performance chart set', dueAt: at('2026-12-08T09:00:00Z'), maxScore: 60, status: 'DRAFT', submitted: 0, notSubmitted: 4 },
  { id: 'a-09', courseId: 'crs-ir', title: 'Approach briefing pack', dueAt: at('2026-12-03T13:00:00Z'), maxScore: 50, status: 'OPEN', submitted: 2, notSubmitted: 3 },
  { id: 'a-10', courseId: 'crs-ir', title: 'Simulator debrief write-up', dueAt: at('2026-11-22T13:00:00Z'), maxScore: 40, status: 'CLOSED', submitted: 5, notSubmitted: 0 },
]

export const assignmentById = (id: string) => ASSIGNMENTS.find((a) => a.id === id) ?? null

/* ------------------------------ submissions ------------------------------ */

type SubmissionRow = { id: string; assignmentId: string; studentUserId: string; submittedAt: string; isLate: boolean; score: number | null }

export const SUBMISSIONS: SubmissionRow[] = [
  { id: 'sub-001', assignmentId: 'a-01', studentUserId: 'u-001', submittedAt: at('2026-11-24T09:12:00Z'), isLate: false, score: null },
  { id: 'sub-002', assignmentId: 'a-01', studentUserId: 'u-002', submittedAt: at('2026-11-24T11:40:00Z'), isLate: false, score: null },
  { id: 'sub-003', assignmentId: 'a-04', studentUserId: 'u-009', submittedAt: at('2026-11-23T20:05:00Z'), isLate: false, score: null },
  { id: 'sub-004', assignmentId: 'a-07', studentUserId: 'u-021', submittedAt: at('2026-11-24T07:30:00Z'), isLate: false, score: null },
  { id: 'sub-005', assignmentId: 'a-09', studentUserId: 'u-016', submittedAt: at('2026-11-24T13:10:00Z'), isLate: false, score: null },
  { id: 'sub-006', assignmentId: 'a-06', studentUserId: 'u-014', submittedAt: at('2026-11-21T08:15:00Z'), isLate: true, score: null },
  { id: 'sub-007', assignmentId: 'a-06', studentUserId: 'u-015', submittedAt: at('2026-11-21T09:02:00Z'), isLate: true, score: null },
  { id: 'sub-008', assignmentId: 'a-06', studentUserId: 'u-009', submittedAt: at('2026-11-19T18:40:00Z'), isLate: false, score: 54 },
  { id: 'sub-009', assignmentId: 'a-06', studentUserId: 'u-010', submittedAt: at('2026-11-19T21:10:00Z'), isLate: false, score: 48 },
  { id: 'sub-010', assignmentId: 'a-06', studentUserId: 'u-011', submittedAt: at('2026-11-20T07:55:00Z'), isLate: false, score: 57 },
  { id: 'sub-011', assignmentId: 'a-01', studentUserId: 'u-003', submittedAt: at('2026-11-22T16:30:00Z'), isLate: false, score: 78 },
]

/* ------------------------------ live classes ----------------------------- */

type LiveRow = { id: string; courseId: string; title: string; topic: string; startsAt: string; durationMinutes: number; status: LiveClassDTO['status']; attendanceTakenAt: string | null }

const LIVE_ROWS: LiveRow[] = [
  { id: 'lc-01', courseId: 'crs-ppl', title: 'Met briefing: winter fronts', topic: 'Reading fronts and icing risk on a winter route.', startsAt: at('2026-11-25T18:30:00Z'), durationMinutes: 90, status: 'SCHEDULED', attendanceTakenAt: null },
  { id: 'lc-02', courseId: 'crs-cpl', title: 'Instrument approach plates', topic: 'Briefing an ILS and an RNAV approach to minima.', startsAt: at('2026-11-27T09:30:00Z'), durationMinutes: 120, status: 'SCHEDULED', attendanceTakenAt: null },
  { id: 'lc-03', courseId: 'crs-a320', title: 'A320 systems: hydraulics', topic: 'Green, blue and yellow systems with abnormal drills.', startsAt: at('2026-12-01T08:30:00Z'), durationMinutes: 150, status: 'SCHEDULED', attendanceTakenAt: null },
  { id: 'lc-04', courseId: 'crs-ir', title: 'Holding entries workshop', topic: 'Direct, parallel and teardrop entries with timed turns.', startsAt: at('2026-12-04T13:00:00Z'), durationMinutes: 90, status: 'SCHEDULED', attendanceTakenAt: null },
  { id: 'lc-05', courseId: 'crs-cpl', title: 'Human performance review', topic: 'Fatigue, startle and workload from three occurrences.', startsAt: at('2026-11-18T09:30:00Z'), durationMinutes: 90, status: 'COMPLETED', attendanceTakenAt: at('2026-11-18T11:15:00Z') },
]

const liveClass = (l: LiveRow): LiveClassDTO => ({
  id: l.id,
  courseId: l.courseId,
  courseTitle: courseTitle(l.courseId),
  sectionId: null,
  title: l.title,
  topic: l.topic,
  startsAt: l.startsAt,
  durationMinutes: l.durationMinutes,
  meetingUrl: `https://meet.fadec.example/${l.id}`,
  status: l.status,
  enrolledCount: COURSES.find((c) => c.id === l.courseId)?.enrolledCount ?? 0,
  attendanceTakenAt: l.attendanceTakenAt,
  createdAt: at('2026-11-01T09:00:00Z'),
  updatedAt: at('2026-11-01T09:00:00Z'),
})

export const liveClassesForTeacher = (teacherId: string) => {
  const ids = new Set(COURSES.filter((c) => c.instructorId === teacherId).map((c) => c.id))
  return LIVE_ROWS.filter((l) => ids.has(l.courseId)).map(liveClass)
}

/* ------------------------------- activity -------------------------------- */

const ACTIVITY: TeacherActivityDTO[] = [
  { id: 'act-1', kind: 'SUBMISSION', at: at('2026-11-21T08:15:00Z'), text: 'Tom Hughes submitted Human performance essay, late', href: '/teach/submissions/sub-006' },
  { id: 'act-2', kind: 'ENROLMENT', at: at('2026-11-24T08:00:00Z'), text: 'Amelia Wright joined Private Pilot Licence (PPL), January 2027', href: '/teach/students/u-007' },
  { id: 'act-3', kind: 'SUBMISSION', at: at('2026-11-24T11:40:00Z'), text: 'Theo Bennett submitted Navigation log: Bristol–Exeter', href: '/teach/submissions/sub-002' },
  { id: 'act-4', kind: 'QUIZ_ATTEMPT', at: at('2026-11-23T19:12:00Z'), text: 'Maya Okafor scored 91% on Air law mock 6', href: '/teach/quizzes' },
  { id: 'act-5', kind: 'LECTURE_COMPLETE', at: at('2026-11-23T07:00:00Z'), text: '14 students completed “Circuits and the circuit pattern”', href: '/teach/lectures' },
  { id: 'act-6', kind: 'LIVE_CLASS', at: at('2026-11-22T10:00:00Z'), text: 'Met briefing moved to 25 November, 18:30 GMT', href: '/teach/live' },
]

/* ------------------------------- dashboard ------------------------------- */

export function dashboardForTeacher(teacherId: string): TeacherDashboardDTO | null {
  const teacher = TEACHERS.find((t) => t.teacherId === teacherId)
  if (!teacher) return null
  const courses = COURSES.filter((c) => c.instructorId === teacherId)
  const courseIds = new Set(courses.map((c) => c.id))
  const roster = rosterForTeacher(teacherId)

  const submissions = SUBMISSIONS.filter((s) => {
    const a = assignmentById(s.assignmentId)
    return !!a && courseIds.has(a.courseId)
  })
  const pending = submissions.filter((s) => s.score === null)

  const toRecent = (s: SubmissionRow): TeacherRecentSubmissionDTO => {
    const assignment = assignmentById(s.assignmentId)!
    const student = studentById(s.studentUserId)
    return {
      submissionId: s.id,
      assignmentId: s.assignmentId,
      assignmentTitle: assignment.title,
      courseTitle: courseTitle(assignment.courseId),
      studentUserId: s.studentUserId,
      studentName: student?.name ?? 'Student',
      submittedAt: s.submittedAt,
      isLate: s.isLate,
      score: s.score,
      maxScore: assignment.maxScore,
    }
  }

  const deadlines: TeacherDeadlineDTO[] = ASSIGNMENTS.filter((a) => courseIds.has(a.courseId) && a.status !== 'DRAFT' && Date.parse(a.dueAt) >= Date.parse('2026-11-24T00:00:00Z'))
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
    .slice(0, 3)
    .map((a) => ({
      assignmentId: a.id,
      title: a.title,
      courseId: a.courseId,
      courseTitle: courseTitle(a.courseId),
      dueAt: a.dueAt,
      submitted: a.submitted,
      notSubmitted: a.notSubmitted,
    }))

  return {
    teacher,
    kpis: {
      assignedCourses: courses.length,
      enrolledStudents: roster.length,
      publishedLectures: courses.reduce((n, c) => n + publishedLessonCount(c.id), 0),
      pendingEvaluations: pending.length,
    },
    quickCounts: {
      draftsAwaitingPublish: courses.reduce((n, c) => n + courseCounts(c.id).draftLectureCount, 0),
      lateSubmissions: pending.filter((s) => s.isLate).length,
      atRiskStudents: roster.filter((s) => s.atRisk).length,
    },
    upcomingClasses: LIVE_ROWS.filter((l) => courseIds.has(l.courseId) && l.status === 'SCHEDULED')
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
      .slice(0, 4)
      .map(liveClass),
    upcomingDeadlines: deadlines,
    recentSubmissions: submissions
      .slice()
      .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))
      .slice(0, 5)
      .map(toRecent),
    activity: ACTIVITY.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
  }
}
