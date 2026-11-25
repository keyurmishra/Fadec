import { GraduationCap, LogOut, Menu, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router'

import { Button, IconButton } from '../../components/Button'
import { Logo } from '../../components/Logo'
import { Skeleton } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { cx } from '../../lib/cx'
import { useStore, type TeacherSession } from '../../lib/store'
import { teacherApi } from '../../lib/teacher-api'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { TEACHER_NAV } from '../nav'

/*
  The teaching studio shell: a fixed rail on large screens, a drawer below it,
  and a top bar that carries the signed-in teacher. Marketing chrome (Header,
  Footer) is not rendered under /teach.

  The guard here is a convenience redirect. Every /api/teacher request is
  re-authorised by the Worker from the session cookie.

  The browser copy of the session is only a cache: the cookie can expire while
  localStorage still holds a teacher. So the guard asks the Worker once per app
  load and, if the cookie is gone, clears the cache and redirects instead of
  letting every screen render 401 errors.
*/
export function RequireTeacher({ children }: { children: ReactNode }) {
  const { session, signOut } = useStore()
  const [verified, setVerified] = useState<'pending' | 'ok' | 'expired'>('pending')
  const isTeacher = session?.role === 'TEACHER'

  useEffect(() => {
    if (!isTeacher) return
    let cancelled = false
    teacherApi.get<unknown>('/api/teacher/me').then((res) => {
      if (cancelled) return
      if (res.ok) {
        setVerified('ok')
        return
      }
      setVerified('expired')
      signOut()
    })
    return () => {
      cancelled = true
    }
  }, [isTeacher, signOut])

  if (!isTeacher || verified === 'expired') return <Navigate to="/teach/signin" replace />

  if (verified === 'pending') {
    return (
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-3 px-5 py-10 md:px-8" role="status" aria-label="Checking your teaching session">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  return <>{children}</>
}

export function TeacherShell() {
  const { session } = useStore()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])

  const teacher = session?.role === 'TEACHER' ? session : null

  return (
    <div className="min-h-screen bg-bg">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-line bg-surface lg:flex">
        <SidebarContent teacher={teacher} />
      </aside>

      <div className="lg:pl-[264px]">
        <TopBar teacher={teacher} onMenu={() => setOpen(true)} />
        <div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-8 md:py-10">
          <Outlet />
        </div>
      </div>

      <AnimatePresence>{open && <MobileDrawer teacher={teacher} onClose={() => setOpen(false)} />}</AnimatePresence>
    </div>
  )
}

function SidebarContent({ teacher, onNavigate }: { teacher: TeacherSession | null; onNavigate?: () => void }) {
  return (
    <>
      <div className="flex h-20 shrink-0 items-center border-b border-line px-5">
        <Logo />
      </div>
      <div className="flex items-center gap-2 border-b border-line px-5 py-3">
        <NavLink
          to="/teach/overview"
          onClick={onNavigate}
          className="inline-flex items-center gap-1.5 border border-line bg-surface-2 px-2 py-1 text-[10px] font-semibold tracking-[0.14em] text-muted uppercase transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-deep"
        >
          <GraduationCap className="size-3 text-amber-ink" aria-hidden />
          Teaching studio
        </NavLink>
      </div>

      <nav aria-label="Teaching sections" className="flex-1 overflow-y-auto py-3">
        <ul className="flex flex-col gap-0.5 px-2">
          {TEACHER_NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cx(
                    'group relative flex min-h-11 items-center gap-3 rounded-[2px] px-3 text-[13.5px] transition-colors',
                    isActive ? 'bg-surface-2 font-semibold text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cx('absolute inset-y-1.5 left-0 w-0.5', isActive ? 'bg-amber-deep' : 'bg-transparent')} aria-hidden />
                    <item.icon className={cx('size-[17px] shrink-0', isActive ? 'text-fg' : 'text-muted group-hover:text-fg')} aria-hidden />
                    <span className="truncate">{item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto border-t border-line px-5 py-4">
        <p className="text-[12px] text-muted">{teacher?.department ?? 'Teaching'}</p>
        <p className="truncate text-[13px] font-medium">{teacher?.name ?? 'Teacher'}</p>
      </div>
    </>
  )
}

function TopBar({ teacher, onMenu }: { teacher: TeacherSession | null; onMenu: () => void }) {
  const { signOut } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)

  async function leave() {
    setLeaving(true)
    await teacherApi.post('/api/teacher/signout', {})
    setLeaving(false)
    signOut()
    toast('Signed out of the teaching studio')
    navigate('/teach/signin')
  }

  const initials = (teacher?.name ?? 'T')
    .replace(/^(Capt|Dr|Prof)\.?\s+/i, '')
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg">
      <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between gap-3 px-5 md:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton aria-label="Open teaching menu" onClick={onMenu} className="lg:hidden">
            <Menu className="size-5" aria-hidden />
          </IconButton>
          <span className="hidden text-[11px] font-semibold tracking-[0.16em] text-muted uppercase sm:inline">FADEC · Teaching</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden max-w-[220px] truncate text-[13px] text-muted md:inline">{teacher?.name}</span>
          <span aria-hidden className="flex size-9 items-center justify-center rounded-full border border-line bg-surface-2 text-[11.5px] font-semibold tracking-[0.04em]">
            {initials}
          </span>
          <Button variant="ghost" size="sm" icon={<LogOut className="size-4" aria-hidden />} loading={leaving} onClick={leave}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  )
}

function MobileDrawer({ teacher, onClose }: { teacher: TeacherSession | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, true, onClose)
  return (
    <div className="fixed inset-0 z-[70] lg:hidden">
      <motion.div className="absolute inset-0 bg-[rgb(15_33_55/0.45)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Teaching menu"
        tabIndex={-1}
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-y-0 left-0 flex w-[min(320px,88vw)] flex-col border-r border-line bg-surface focus:outline-none"
      >
        <div className="absolute top-3 right-3 z-10">
          <IconButton aria-label="Close menu" onClick={onClose}>
            <X className="size-5" aria-hidden />
          </IconButton>
        </div>
        <SidebarContent teacher={teacher} onNavigate={onClose} />
      </motion.div>
    </div>
  )
}

