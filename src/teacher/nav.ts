import { BookOpen, CalendarDays, ChartColumn, ClipboardList, LayoutDashboard, ListChecks, Megaphone, Settings, SquareCheck, UserCheck, Users, Video } from 'lucide-react'

/*
  The teaching studio's navigation. One list, used by both the desktop rail and
  the mobile drawer, in the order the brief fixes. `short` is the label used at
  narrow widths.
*/
export const TEACHER_NAV = [
  { to: '/teach/overview', label: 'Dashboard', short: 'Dashboard', icon: LayoutDashboard },
  { to: '/teach/courses', label: 'My Courses', short: 'Courses', icon: BookOpen },
  { to: '/teach/lectures', label: 'Lectures & Videos', short: 'Lectures', icon: Video },
  { to: '/teach/assignments', label: 'Assignments', short: 'Assignments', icon: ClipboardList },
  { to: '/teach/submissions', label: 'Submissions & Evaluation', short: 'Submissions', icon: SquareCheck },
  { to: '/teach/quizzes', label: 'Quizzes & Tests', short: 'Quizzes', icon: ListChecks },
  { to: '/teach/live', label: 'Live Classes', short: 'Live', icon: CalendarDays },
  { to: '/teach/attendance', label: 'Attendance', short: 'Attendance', icon: UserCheck },
  { to: '/teach/students', label: 'Students', short: 'Students', icon: Users },
  { to: '/teach/announcements', label: 'Announcements', short: 'News', icon: Megaphone },
  { to: '/teach/analytics', label: 'Analytics & Reports', short: 'Analytics', icon: ChartColumn },
  { to: '/teach/settings', label: 'Profile & Settings', short: 'Settings', icon: Settings },
] as const
