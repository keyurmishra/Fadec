import { MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'

import { Footer } from './components/Footer'
import { ToastProvider } from './components/Toast'
import { StoreProvider } from './lib/store'
import { Admissions } from './pages/Admissions'
import { Apply } from './pages/Apply'
import { Dashboard } from './pages/Dashboard'
import { Events } from './pages/Events'
import { Home } from './pages/Home'
import { NotFound } from './pages/NotFound'
import { ProgrammeDetail } from './pages/ProgrammeDetail'
import { Programmes } from './pages/Programmes'
import { Styleguide } from './pages/Styleguide'
import { SubjectDetail as StudentSubjectDetail, Subjects as StudentSubjects } from './pages/Subjects'
import { RequireTeacher, TeacherShell } from './teacher/components/TeacherShell'
import { TeacherAssignmentDetail } from './teacher/pages/AssignmentDetail'
import { TeacherAssignments } from './teacher/pages/Assignments'
import { TeacherCourseDetail } from './teacher/pages/CourseDetail'
import { TeacherCourses } from './teacher/pages/Courses'
import { TeacherLectureDetail } from './teacher/pages/LectureDetail'
import { TeacherLectures } from './teacher/pages/Lectures'
import { TeacherOverview } from './teacher/pages/Overview'
import { TeacherPlaceholder } from './teacher/pages/Placeholder'
import { TeacherSignIn } from './teacher/pages/TeacherSignIn'
import { TeacherSubjectDetail } from './teacher/pages/SubjectDetail'
import { TeacherSubmissionDetail } from './teacher/pages/SubmissionDetail'
import { TeacherSubmissions } from './teacher/pages/Submissions'
import { TeacherSubjects } from './teacher/pages/Subjects'

/** Scroll to the top on a new page, or to the #hash target when there is one. */
function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1))
      if (el) {
        requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }))
        return
      }
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname, hash])
  return null
}

/*
  The teaching studio is its own workspace: it renders its own shell, sidebar
  and top bar, and none of the marketing chrome. Every public route below is
  unchanged.
*/
function AppRoutes() {
  const { pathname } = useLocation()
  const isStudio = pathname === '/teach' || pathname.startsWith('/teach/')

  return (
    <>
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <Routes>
          <Route index element={<Home />} />
          <Route path="programmes" element={<Programmes />} />
          <Route path="programmes/:slug" element={<ProgrammeDetail />} />
          <Route path="admissions" element={<Admissions />} />
          <Route path="apply" element={<Apply />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="subjects" element={<StudentSubjects />} />
          <Route path="subjects/:subjectId" element={<StudentSubjectDetail />} />
          <Route path="events" element={<Events />} />
          <Route path="styleguide" element={<Styleguide />} />

          <Route path="teach/signin" element={<TeacherSignIn />} />
          <Route
            path="teach"
            element={
              <RequireTeacher>
                <TeacherShell />
              </RequireTeacher>
            }
          >
            <Route index element={<Navigate to="/teach/overview" replace />} />
            <Route path="overview" element={<TeacherOverview />} />
            <Route path="courses" element={<TeacherCourses />} />
            <Route path="courses/:courseId/curriculum" element={<TeacherCourseDetail />} />
            <Route path="subjects" element={<TeacherSubjects />} />
            <Route path="subjects/:subjectId" element={<TeacherSubjectDetail />} />
            <Route path="lectures" element={<TeacherLectures />} />
            <Route path="lectures/:lectureId" element={<TeacherLectureDetail />} />
            <Route path="assignments" element={<TeacherAssignments />} />
            <Route path="assignments/:assignmentId" element={<TeacherAssignmentDetail />} />
            <Route path="submissions" element={<TeacherSubmissions />} />
            <Route path="submissions/:submissionId" element={<TeacherSubmissionDetail />} />
            <Route
              path="quizzes"
              element={
                <TeacherPlaceholder
                  title="Quizzes & Tests"
                  phase="Phase 4"
                  description="Build quizzes, publish them and read the results."
                  items={['Multiple-choice, true/false and short answer', 'Duration, window, attempts and pass mark', 'Automatic scoring for objective questions', 'Manual marking queue for short answers']}
                />
              }
            />
            <Route
              path="live"
              element={
                <TeacherPlaceholder
                  title="Live Classes"
                  phase="Phase 5"
                  description="Schedule sessions, share the link and keep a record of what ran."
                  items={['Month calendar of scheduled classes', 'Meeting link and topic', 'Edit or cancel with a notification', 'Past sessions and attendance hand-off']}
                />
              }
            />
            <Route
              path="attendance"
              element={
                <TeacherPlaceholder
                  title="Attendance"
                  phase="Phase 5"
                  description="Mark a register for each session and report on attendance."
                  items={['Course and session picker', 'Present, late and absent', 'Saved register history', 'Percentage totals and CSV export']}
                />
              }
            />
            <Route
              path="students"
              element={
                <TeacherPlaceholder
                  title="Students"
                  phase="Phase 6"
                  description="Everyone enrolled in your courses, and how each of them is doing."
                  items={['Roster with assignment, quiz and lecture metrics', 'Individual student profile', 'At-risk filter', 'Message a student or send feedback']}
                />
              }
            />
            <Route
              path="announcements"
              element={
                <TeacherPlaceholder
                  title="Announcements"
                  phase="Phase 6"
                  description="Tell a cohort about a new lecture, a deadline or a moved class."
                  items={['Compose for one or more courses', 'Pinned announcements', 'Email notification toggle', 'Sent history and delivery count']}
                />
              }
            />
            <Route
              path="analytics"
              element={
                <TeacherPlaceholder
                  title="Analytics & Reports"
                  phase="Phase 7"
                  description="Performance, completion, attendance and submission rates by course."
                  items={['Course comparison with charts', 'Attendance and engagement trends', 'Submission rates', 'Students at risk, with CSV export']}
                />
              }
            />
            <Route
              path="settings"
              element={
                <TeacherPlaceholder
                  title="Profile & Settings"
                  phase="Phase 7"
                  description="Your teaching profile, assigned courses and notification preferences."
                  items={['Profile photo and department', 'Assigned courses', 'Password and active sessions', 'Notification preferences']}
                />
              }
            />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {!isStudio && <Footer />}
    </>
  )
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <StoreProvider>
          <ToastProvider>
            <ScrollManager />
            <a href="#main" className="sr-only z-[100] rounded-[10px] bg-fg px-4 py-2 text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
              Skip to content
            </a>
            <AppRoutes />
          </ToastProvider>
        </StoreProvider>
      </BrowserRouter>
    </MotionConfig>
  )
}
