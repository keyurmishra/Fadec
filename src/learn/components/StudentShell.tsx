import { LogOut } from 'lucide-react'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router'

import { Button } from '../../components/Button'
import { Logo } from '../../components/Logo'
import { Skeleton } from '../../components/ui'
import { useToast } from '../../components/Toast'
import type { StudentIdentityDTO } from '../../contracts/learning'
import { cx } from '../../lib/cx'
import { STUDENT_SIGN_IN, studentApi } from '../../lib/student-api'

/*
  The student portal shell.

  There is no browser copy of the session: the cookie is HttpOnly and signed, so
  the guard asks /api/student/me who the caller is and renders from that answer.
  A 401 sends them to sign-in instead of letting the page show an error it
  cannot explain, and every API route re-checks the cookie anyway — this guard
  is a redirect, not the security boundary.
*/
const PORTAL_NAV = [
  { to: '/learn/assignments', label: 'Assignments' },
  { to: '/learn/quizzes', label: 'Quizzes' },
] as const

const StudentContext = createContext<StudentIdentityDTO | null>(null)

/** The signed-in student, available to every page under the shell. */
export function useStudentIdentity(): StudentIdentityDTO {
  const student = useContext(StudentContext)
  if (!student) throw new Error('useStudentIdentity must be used inside RequireStudent')
  return student
}

type Session =
  | { status: 'pending' }
  | { status: 'ready'; student: StudentIdentityDTO }
  | { status: 'signed-out' }

export function RequireStudent({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: 'pending' })

  useEffect(() => {
    let cancelled = false
    studentApi.get<StudentIdentityDTO>('/api/student/me').then((res) => {
      if (cancelled) return
      setSession(res.ok ? { status: 'ready', student: res.data } : { status: 'signed-out' })
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (session.status === 'signed-out') return <Navigate to={STUDENT_SIGN_IN} replace />
  if (session.status === 'pending') {
    return (
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 px-5 py-10 md:px-8" role="status" aria-label="Checking your student session">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40" />
      </div>
    )
  }
  return <StudentContext.Provider value={session.student}>{children}</StudentContext.Provider>
}

export function StudentShell() {
  const student = useStudentIdentity()

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg">
        <div className="mx-auto flex h-16 w-full max-w-[1100px] items-center justify-between gap-3 px-5 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Logo />
            <span className="hidden text-[11px] font-semibold tracking-[0.16em] text-muted uppercase sm:inline">Student portal</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-right text-[12.5px] leading-tight md:block">
              <span className="block font-medium text-fg">{student.name}</span>
              <span className="figures text-muted">
                {student.studentNo} · {student.cohort}
              </span>
            </span>
            <SignOut />
          </div>
        </div>
        <nav aria-label="Student portal sections" className="mx-auto w-full max-w-[1100px] px-5 md:px-8">
          <ul className="flex gap-1">
            {PORTAL_NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cx(
                      'relative inline-flex h-11 items-center px-3 text-[13.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-deep',
                      isActive ? 'text-fg' : 'text-muted hover:text-fg',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {item.label}
                      {isActive && <span className="absolute inset-x-2 -bottom-px h-0.5 bg-amber-deep" aria-hidden />}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <div className="mx-auto w-full max-w-[1100px] px-5 py-8 md:px-8 md:py-10">
        <Outlet />
      </div>
    </div>
  )
}

function SignOut() {
  const navigate = useNavigate()
  const toast = useToast()
  const [leaving, setLeaving] = useState(false)

  async function leave() {
    setLeaving(true)
    await studentApi.post('/api/student/signout', {})
    setLeaving(false)
    toast('Signed out of the student portal')
    navigate(STUDENT_SIGN_IN, { replace: true })
  }

  return (
    <Button variant="ghost" size="sm" icon={<LogOut className="size-4" aria-hidden />} loading={leaving} onClick={leave}>
      Sign out
    </Button>
  )
}
