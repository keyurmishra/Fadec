/*
  The studio overview, read from D1 and nothing else.

  Every number on the overview is counted from rows that exist: courses,
  enrolments, lectures, hand-ins and quiz attempts. Where the product has no
  data yet the payload says so instead of inventing it:

  - atRiskStudents is null. "At risk" needs progress, attendance and quiz
    history that are not recorded yet, so no rule could be applied honestly.
  - upcomingClasses is empty. Live classes are not built (Phase 5).

  This replaces the sample roster, timetable and activity feed that used to be
  hard-coded here, whose names did not even match the seeded students.
*/
import type { TeacherActivityDTO, TeacherDashboardDTO } from '../contracts/teaching'
import { assessmentDigest } from './assignments'
import { coursesForTeacher } from './courses'
import { courseCountsMany } from './curriculum'
import { TEACHERS } from './fixtures'
import { query, queryOne, type Db } from './sql'

/** How many feed rows the overview shows. */
const ACTIVITY_LIMIT = 8

type ActivityRow = { kind: 'SUBMISSION' | 'QUIZ_ATTEMPT' | 'ENROLMENT'; id: string; at: string; who: string; what: string; ref: string; flag: number }

/**
 * The latest hand-ins, quiz submissions and enrolments on this teacher's
 * courses, newest first. Each source is limited in SQL before the merge, so the
 * feed costs three small indexed reads however much history there is.
 */
async function activityFor(db: Db, teacherId: string): Promise<TeacherActivityDTO[]> {
  const [submissions, attempts, enrolments] = await Promise.all([
    query<ActivityRow>(
      db,
      `SELECT 'SUBMISSION' AS kind, s.id AS id, s.submitted_at AS at, s.student_name AS who, a.title AS what, s.id AS ref, s.is_late AS flag
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       JOIN courses c ON c.id = a.course_id
       WHERE c.instructor_id = ?1 AND s.status = 'SUBMITTED'
       ORDER BY s.submitted_at DESC LIMIT ?2`,
      teacherId,
      ACTIVITY_LIMIT,
    ),
    query<ActivityRow>(
      db,
      `SELECT 'QUIZ_ATTEMPT' AS kind, t.id AS id, t.submitted_at AS at, t.student_name AS who, z.title AS what, z.id AS ref, t.needs_marking AS flag
       FROM quiz_attempts t
       JOIN quizzes z ON z.id = t.quiz_id
       JOIN courses c ON c.id = z.course_id
       WHERE c.instructor_id = ?1 AND t.status = 'SUBMITTED'
       ORDER BY t.submitted_at DESC LIMIT ?2`,
      teacherId,
      ACTIVITY_LIMIT,
    ),
    query<ActivityRow>(
      db,
      `SELECT 'ENROLMENT' AS kind, e.course_id || ':' || e.student_id AS id, e.enrolled_at AS at, st.name AS who, c.title AS what, c.id AS ref, 0 AS flag
       FROM course_enrolments e
       JOIN courses c ON c.id = e.course_id
       JOIN students st ON st.id = e.student_id
       WHERE c.instructor_id = ?1 AND e.status = 'ACTIVE'
       ORDER BY e.enrolled_at DESC LIMIT ?2`,
      teacherId,
      ACTIVITY_LIMIT,
    ),
  ])

  return [...submissions, ...attempts, ...enrolments]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id))
    .slice(0, ACTIVITY_LIMIT)
    .map((row): TeacherActivityDTO => {
      if (row.kind === 'SUBMISSION') {
        return { id: `act-sub-${row.id}`, kind: row.kind, at: row.at, text: `${row.who} handed in ${row.what}${row.flag ? ', late' : ''}`, href: `/teach/submissions/${row.ref}` }
      }
      if (row.kind === 'QUIZ_ATTEMPT') {
        return {
          id: `act-quiz-${row.id}`,
          kind: row.kind,
          at: row.at,
          text: `${row.who} submitted ${row.what}${row.flag ? ', awaiting marking' : ''}`,
          href: `/teach/quizzes/${row.ref}/attempts/${row.id}`,
        }
      }
      return { id: `act-enrol-${row.id}`, kind: row.kind, at: row.at, text: `${row.who} enrolled on ${row.what}`, href: `/teach/courses/${row.ref}/curriculum` }
    })
}

export async function dashboardForTeacher(db: Db, teacherId: string): Promise<TeacherDashboardDTO | null> {
  const teacher = TEACHERS.find((t) => t.teacherId === teacherId)
  if (!teacher) return null

  const courses = await coursesForTeacher(db, teacherId)
  const courseIds = courses.map((course) => course.id)
  const [counts, assessment, students, activity] = await Promise.all([
    courseCountsMany(db, courseIds),
    assessmentDigest(db, teacherId),
    // A student on two of this teacher's courses is one student.
    queryOne<{ n: number }>(
      db,
      `SELECT COUNT(DISTINCT e.student_id) AS n
       FROM course_enrolments e JOIN courses c ON c.id = e.course_id
       WHERE c.instructor_id = ?1 AND e.status = 'ACTIVE'`,
      teacherId,
    ),
    activityFor(db, teacherId),
  ])

  return {
    teacher,
    kpis: {
      assignedCourses: courses.length,
      enrolledStudents: students?.n ?? 0,
      publishedLectures: courseIds.reduce((n, id) => n + (counts.get(id)?.publishedCount ?? 0), 0),
      pendingEvaluations: assessment.pendingEvaluations,
    },
    quickCounts: {
      draftsAwaitingPublish: courses.reduce((n, course) => n + course.draftLectureCount, 0),
      lateSubmissions: assessment.latePending,
      atRiskStudents: null,
    },
    upcomingClasses: [],
    upcomingDeadlines: assessment.upcomingDeadlines,
    recentSubmissions: assessment.recentSubmissions,
    activity,
  }
}
