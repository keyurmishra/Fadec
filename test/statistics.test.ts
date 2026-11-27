import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { call, OTHER_TEACHER, studentCookie, teacherCookie } from './harness'

/*
  No number on a teacher screen may be invented. Each figure is either counted
  from D1 or reported as null (not recorded yet), and the overview's lists hold
  only rows that exist. "Now" sits inside the seeded assignment windows.
*/
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-25T12:00:00.000Z'))
})
afterAll(() => vi.useRealTimers())

const PPL_STUDENTS = [
  ['priya.nair', 'PPL-26-00001'],
  ['theo.bennett', 'PPL-26-00002'],
  ['maya.okafor', 'PPL-26-00003'],
  ['lucas.ferreira', 'PPL-26-00004'],
  ['hana.sato', 'PPL-26-00005'],
  ['daniel.kim', 'PPL-26-00006'],
  ['amelia.wright', 'PPL-26-00007'],
  ['sam.whitfield', 'PPL-26-00008'],
] as const

const SEEDED_STUDENT_NAMES = async (cookie: string) => {
  // Every student a hand-in or enrolment can name is a row in D1; the roster API does not exist yet,
  // so collect the names through the submissions queue and each course's enrolment count instead.
  const queue = await call('/api/teacher/submissions', { cookie })
  return new Set<string>(queue.json.items.map((s: { studentName: string }) => s.studentName))
}

describe('teacher overview', () => {
  it('counts enrolled students from D1 and reports no invented figures', async () => {
    const cookie = await teacherCookie()
    const [dashboard, courses] = await Promise.all([call('/api/teacher/dashboard', { cookie }), call('/api/teacher/courses', { cookie })])
    expect(dashboard.status).toBe(200)

    // Each seeded student is on exactly one course, so the distinct count is the sum of course enrolments.
    const enrolled = courses.json.items.reduce((n: number, c: { enrolledCount: number }) => n + c.enrolledCount, 0)
    expect(dashboard.json.kpis.enrolledStudents).toBe(enrolled)
    expect(dashboard.json.kpis.assignedCourses).toBe(courses.json.items.length)

    expect(dashboard.json.quickCounts.atRiskStudents).toBeNull()
    expect(dashboard.json.upcomingClasses).toEqual([])

    const other = await call('/api/teacher/dashboard', { cookie: await teacherCookie(OTHER_TEACHER) })
    expect(other.json.kpis.enrolledStudents).toBe(6)
  })

  it('builds the activity feed from real hand-ins, quiz submissions and enrolments', async () => {
    const cookie = await teacherCookie()
    const { activity } = (await call('/api/teacher/dashboard', { cookie })).json as { activity: { id: string; kind: string; at: string; text: string; href: string }[] }
    expect(activity.length).toBeGreaterThan(0)
    expect(activity.length).toBeLessThanOrEqual(8)

    const times = activity.map((a) => Date.parse(a.at))
    expect(times).toEqual([...times].sort((a, b) => b - a))

    const names = await SEEDED_STUDENT_NAMES(cookie)
    for (const a of activity) {
      expect(['SUBMISSION', 'QUIZ_ATTEMPT', 'ENROLMENT']).toContain(a.kind)
      // Every link opens a screen that exists and is this teacher's.
      expect(a.href).toMatch(/^\/teach\/(submissions\/[\w-]+|quizzes\/[\w-]+\/attempts\/[\w-]+|courses\/[\w-]+\/curriculum)$/)
      if (a.kind === 'SUBMISSION') {
        const id = a.href.split('/').pop()
        expect((await call(`/api/teacher/submissions/${id}`, { cookie })).status, a.href).toBe(200)
        expect([...names].some((n) => a.text.startsWith(n)), a.text).toBe(true)
      }
      if (a.kind === 'ENROLMENT') {
        const courseId = a.href.split('/')[3]
        expect((await call(`/api/teacher/courses/${courseId}`, { cookie })).status, a.href).toBe(200)
      }
    }
  })

  it('counts students who handed in, not open drafts', async () => {
    const cookie = await teacherCookie()
    const deadline = async () => (await call('/api/teacher/dashboard', { cookie })).json.upcomingDeadlines.find((d: { assignmentId: string }) => d.assignmentId === 'a-01')
    const before = await deadline()
    expect(before).toBeDefined()
    expect(before.submitted + before.notSubmitted).toBe(8)
    expect(before.notSubmitted).toBeGreaterThan(0)

    // A PPL student who has not handed a-01 in opens a draft and stops there.
    let opened = false
    for (const [name, no] of PPL_STUDENTS) {
      const student = await studentCookie({ email: `${name}@fadec.example`, studentId: no })
      if ((await call('/api/student/assignments/a-01/attempt', { cookie: student, method: 'POST' })).status === 200) {
        opened = true
        break
      }
    }
    expect(opened).toBe(true)

    const after = await deadline()
    expect(after.submitted).toBe(before.submitted)
    expect(after.notSubmitted).toBe(before.notSubmitted)
  })
})

describe('course and lecture figures', () => {
  it('counts assignments from the table and does not report course completion', async () => {
    const cookie = await teacherCookie()
    const courses = (await call('/api/teacher/courses', { cookie })).json.items as { id: string; assignmentCount: number; completionPercent: number | null }[]
    const assignments = (await call('/api/teacher/assignments', { cookie })).json.items as { courseId: string }[]
    for (const course of courses) {
      expect(course.completionPercent, course.id).toBeNull()
      expect(course.assignmentCount, course.id).toBe(assignments.filter((a) => a.courseId === course.id).length)
    }

    const created = await call('/api/teacher/assignments', {
      cookie,
      body: { courseId: 'crs-ir', title: 'Holding entry drill', instructions: 'Brief the entry.', opensAt: '2026-12-01T09:00:00.000Z', dueAt: '2026-12-08T17:00:00.000Z' },
    })
    expect(created.status).toBe(201)
    const ir = (await call('/api/teacher/courses/crs-ir', { cookie })).json
    expect(ir.assignmentCount).toBe(courses.find((c) => c.id === 'crs-ir')!.assignmentCount + 1)
  })

  it('reports no watch statistics, because no viewing is recorded', async () => {
    const cookie = await teacherCookie()
    const lectures = (await call('/api/teacher/lectures', { cookie })).json.items as { id: string; status: string; mediaStatus: string; watchCompletionPercent: number | null }[]
    expect(lectures.length).toBeGreaterThan(0)
    for (const l of lectures) expect(l.watchCompletionPercent, l.id).toBeNull()

    // Including a published lecture whose video is marked ready, which used to get hash-generated numbers.
    const live = lectures.find((l) => l.status === 'PUBLISHED' && l.mediaStatus === 'READY')
    expect(live).toBeDefined()
    const detail = await call(`/api/teacher/lectures/${live!.id}`, { cookie })
    expect(detail.status).toBe(200)
    expect(detail.json.watch).toBeNull()
    expect(detail.json.watchCompletionPercent).toBeNull()
  })
})
