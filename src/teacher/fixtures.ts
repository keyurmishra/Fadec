/*
  The read-only sample data left in the studio.

  Courses, curricula, lectures, subjects, assignments and submissions all live
  in D1 now. What remains here is overview-only sample data with no write path:
  the roster, live classes and the activity feed. Assignments and submissions
  are read from D1 by `assessmentDigest`, so the overview counts what the
  marking queue actually holds.
*/
import type {
  CourseStudentSummaryDTO,
  LiveClassDTO,
  TeacherActivityDTO,
  TeacherCourseSummaryDTO,
  TeacherDashboardDTO,
  TeacherIdentityDTO,
} from '../contracts/teaching'
import { assessmentDigest } from './assignments'
import { coursesForTeacher } from './courses'
import { courseCountsMany } from './curriculum'
import { SEED_TEACHERS } from './seeds'
import type { Db } from './sql'

const at = (s: string) => new Date(s).toISOString()

/* --------------------------------- people -------------------------------- */

export const TEACHERS: TeacherIdentityDTO[] = SEED_TEACHERS

export const DEMO_TEACHER = TEACHERS[0]

/* -------------------------------- roster --------------------------------- */

type StudentRow = {
  studentUserId: string
  name: string
  email: string
  courseId: string
  assignmentAverage: number | null
  quizAverage: number | null
  lectureCompletionPercent: number
  attendancePercent: number
  overallProgress: number
  atRisk: boolean
  lastActiveAt: string
}

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

const STUDENT_ROWS: StudentRow[] = ROSTER_ROWS.map(([name, courseId, a, q, lecture, attendance], i) => {
  const progress = overall(a, q, lecture, attendance)
  return {
    studentUserId: `u-${String(i + 1).padStart(3, '0')}`,
    name,
    email: emailFor(name),
    courseId,
    assignmentAverage: a,
    quizAverage: q,
    lectureCompletionPercent: lecture,
    attendancePercent: attendance,
    overallProgress: progress,
    atRisk: progress < 55 || attendance < 70 || (a !== null && a < 50),
    lastActiveAt: at(`2026-11-${String(10 + (i % 14)).padStart(2, '0')}T${String(8 + (i % 10)).padStart(2, '0')}:15:00Z`),
  }
})

const toStudentDTO = (row: StudentRow, titles: Map<string, string>): CourseStudentSummaryDTO => ({
  studentUserId: row.studentUserId,
  name: row.name,
  email: row.email,
  avatarUrl: null,
  courseIds: [row.courseId],
  courseTitles: [titles.get(row.courseId) ?? 'Course'],
  assignmentAverage: row.assignmentAverage,
  quizAverage: row.quizAverage,
  lectureCompletionPercent: row.lectureCompletionPercent,
  attendancePercent: row.attendancePercent,
  overallProgress: row.overallProgress,
  atRisk: row.atRisk,
  lastActiveAt: row.lastActiveAt,
})

/** Students enrolled in any course the teacher owns. */
export function rosterForTeacher(courses: TeacherCourseSummaryDTO[]): CourseStudentSummaryDTO[] {
  const titles = new Map(courses.map((course) => [course.id, course.title]))
  const ids = new Set(titles.keys())
  return STUDENT_ROWS.filter((student) => ids.has(student.courseId)).map((student) => toStudentDTO(student, titles))
}

/* ------------------------------ live classes ----------------------------- */

type LiveRow = { id: string; courseId: string; title: string; topic: string; startsAt: string; durationMinutes: number; status: LiveClassDTO['status']; attendanceTakenAt: string | null }

const LIVE_ROWS: LiveRow[] = [
  { id: 'lc-01', courseId: 'crs-ppl', title: 'Met briefing: winter fronts', topic: 'Reading fronts and icing risk on a winter route.', startsAt: at('2026-11-25T18:30:00Z'), durationMinutes: 90, status: 'SCHEDULED', attendanceTakenAt: null },
  { id: 'lc-02', courseId: 'crs-cpl', title: 'Instrument approach plates', topic: 'Briefing an ILS and an RNAV approach to minima.', startsAt: at('2026-11-27T09:30:00Z'), durationMinutes: 120, status: 'SCHEDULED', attendanceTakenAt: null },
  { id: 'lc-03', courseId: 'crs-a320', title: 'A320 systems: hydraulics', topic: 'Green, blue and yellow systems with abnormal drills.', startsAt: at('2026-12-01T08:30:00Z'), durationMinutes: 150, status: 'SCHEDULED', attendanceTakenAt: null },
  { id: 'lc-04', courseId: 'crs-ir', title: 'Holding entries workshop', topic: 'Direct, parallel and teardrop entries with timed turns.', startsAt: at('2026-12-04T13:00:00Z'), durationMinutes: 90, status: 'SCHEDULED', attendanceTakenAt: null },
  { id: 'lc-05', courseId: 'crs-cpl', title: 'Human performance review', topic: 'Fatigue, startle and workload from three occurrences.', startsAt: at('2026-11-18T09:30:00Z'), durationMinutes: 90, status: 'COMPLETED', attendanceTakenAt: at('2026-11-18T11:15:00Z') },
]

const liveClass = (row: LiveRow, courses: Map<string, TeacherCourseSummaryDTO>): LiveClassDTO => {
  const course = courses.get(row.courseId)
  return {
    id: row.id,
    courseId: row.courseId,
    courseTitle: course?.title ?? 'Course',
    sectionId: null,
    title: row.title,
    topic: row.topic,
    startsAt: row.startsAt,
    durationMinutes: row.durationMinutes,
    meetingUrl: `https://meet.fadec.example/${row.id}`,
    status: row.status,
    enrolledCount: course?.enrolledCount ?? 0,
    attendanceTakenAt: row.attendanceTakenAt,
    createdAt: at('2026-11-01T09:00:00Z'),
    updatedAt: at('2026-11-01T09:00:00Z'),
  }
}

/* ------------------------------- activity -------------------------------- */

const ACTIVITY: TeacherActivityDTO[] = [
  { id: 'act-1', kind: 'SUBMISSION', at: at('2026-11-21T08:15:00Z'), text: 'Tom Hughes submitted Human performance essay, late', href: '/teach/submissions/sub-018' },
  { id: 'act-2', kind: 'ENROLMENT', at: at('2026-11-24T08:00:00Z'), text: 'Amelia Wright joined Private Pilot Licence (PPL), January 2027', href: '/teach/students/u-007' },
  { id: 'act-3', kind: 'SUBMISSION', at: at('2026-11-24T11:40:00Z'), text: 'Theo Bennett submitted Navigation log: Bristol–Exeter', href: '/teach/submissions/sub-002' },
  { id: 'act-4', kind: 'QUIZ_ATTEMPT', at: at('2026-11-23T19:12:00Z'), text: 'Maya Okafor scored 91% on Air law mock 6', href: '/teach/quizzes' },
  { id: 'act-5', kind: 'LECTURE_COMPLETE', at: at('2026-11-23T07:00:00Z'), text: '14 students completed “Circuits and the circuit pattern”', href: '/teach/lectures' },
  { id: 'act-6', kind: 'LIVE_CLASS', at: at('2026-11-22T10:00:00Z'), text: 'Met briefing moved to 25 November, 18:30 GMT', href: '/teach/live' },
]

/* ------------------------------- dashboard ------------------------------- */

export async function dashboardForTeacher(db: Db, teacherId: string): Promise<TeacherDashboardDTO | null> {
  const teacher = TEACHERS.find((t) => t.teacherId === teacherId)
  if (!teacher) return null

  const courses = await coursesForTeacher(db, teacherId)
  const byId = new Map(courses.map((course) => [course.id, course]))
  const courseIds = new Set(byId.keys())
  const roster = rosterForTeacher(courses)
  const [counts, assessment] = await Promise.all([courseCountsMany(db, [...courseIds]), assessmentDigest(db, teacherId)])

  return {
    teacher,
    kpis: {
      assignedCourses: courses.length,
      enrolledStudents: roster.length,
      publishedLectures: [...courseIds].reduce((n, id) => n + (counts.get(id)?.publishedCount ?? 0), 0),
      pendingEvaluations: assessment.pendingEvaluations,
    },
    quickCounts: {
      draftsAwaitingPublish: courses.reduce((n, course) => n + course.draftLectureCount, 0),
      lateSubmissions: assessment.latePending,
      atRiskStudents: roster.filter((s) => s.atRisk).length,
    },
    upcomingClasses: LIVE_ROWS.filter((l) => courseIds.has(l.courseId) && l.status === 'SCHEDULED')
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
      .slice(0, 4)
      .map((row) => liveClass(row, byId)),
    upcomingDeadlines: assessment.upcomingDeadlines,
    recentSubmissions: assessment.recentSubmissions,
    activity: ACTIVITY.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
  }
}
