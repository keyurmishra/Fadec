import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { EMPTY_DRAFT, type ApplicationDraft } from '../shared/validation'

/*
  Everything this device remembers lives under one key: who is signed in (a
  student workspace or a teaching workspace), submitted applications and the
  draft, event RSVPs, shortlisted courses and ticked assignments.

  v2 adds a role to the session so the student hub and the teaching studio can
  coexist. A v1 session migrates on first load, so existing student data and
  drafts survive. The Worker still decides what any teaching request may read —
  this state is only what the browser shows.
*/

export type Application = { ref: string; programme: string; cohort: string; name: string; email: string; submittedAt: number }
export type Rsvp = { ref: string; event: string; name: string; email: string }

export type StudentSession = { role: 'STUDENT'; userId: string; name: string; email: string; studentId: string }
export type TeacherSession = { role: 'TEACHER'; userId: string; name: string; email: string; teacherId: string; department: string }
export type Session = StudentSession | TeacherSession

type State = {
  session: Session | null
  applications: Application[]
  draft: ApplicationDraft
  draftStep: number
  rsvps: Rsvp[]
  shortlist: string[]
  done: string[]
}

const KEY = 'fadec:v2'
const LEGACY_KEY = 'fadec:v1'
const EMPTY: State = { session: null, applications: [], draft: EMPTY_DRAFT, draftStep: 0, rsvps: [], shortlist: [], done: [] }

const arr = <T,>(v: unknown, fallback: T[] = []): T[] => (Array.isArray(v) ? (v as T[]) : fallback)

type LegacyStudent = { email: string; studentId: string }
type StoredState = Partial<Omit<State, 'session'>> & { session?: Session | null; student?: LegacyStudent | null }

function load(): State {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (!raw) return EMPTY
    const p = JSON.parse(raw) as StoredState
    const migrated: Session | null = p.student
      ? { role: 'STUDENT', userId: p.student.email, name: p.student.email.split('@')[0], email: p.student.email, studentId: p.student.studentId }
      : null
    return {
      session: p.session ?? migrated,
      applications: arr(p.applications),
      draft: { ...EMPTY_DRAFT, ...(p.draft ?? {}) },
      draftStep: typeof p.draftStep === 'number' ? Math.min(4, Math.max(0, p.draftStep)) : 0,
      rsvps: arr(p.rsvps),
      shortlist: arr(p.shortlist),
      done: arr(p.done),
    }
  } catch {
    return EMPTY
  }
}

type Store = State & {
  /** The student workspace, or null when nobody is signed in as a student. */
  student: { email: string; studentId: string } | null
  signIn: (s: { email: string; studentId: string }) => void
  signInTeacher: (t: TeacherSession) => void
  signOut: () => void
  updateDraft: (patch: Partial<ApplicationDraft>, step?: number) => void
  submitApplication: (a: Application) => void
  withdrawApplication: (ref: string) => void
  addRsvp: (r: Rsvp) => void
  cancelRsvp: (event: string) => void
  toggleShortlist: (slug: string) => void
  toggleDone: (id: string) => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* storage blocked or full: keep working in memory */
    }
  }, [state])

  const signIn = useCallback(({ email, studentId }: { email: string; studentId: string }) => {
    setState((s) => ({
      ...s,
      session: { role: 'STUDENT', userId: email, name: email.split('@')[0], email, studentId },
    }))
  }, [])
  const signInTeacher = useCallback((t: TeacherSession) => setState((s) => ({ ...s, session: t })), [])
  const signOut = useCallback(() => setState((s) => ({ ...s, session: null })), [])
  const updateDraft = useCallback(
    (patch: Partial<ApplicationDraft>, step?: number) => setState((s) => ({ ...s, draft: { ...s.draft, ...patch }, draftStep: step ?? s.draftStep })),
    [],
  )
  const submitApplication = useCallback((a: Application) => setState((s) => ({ ...s, applications: [a, ...s.applications], draft: EMPTY_DRAFT, draftStep: 0 })), [])
  const withdrawApplication = useCallback((ref: string) => setState((s) => ({ ...s, applications: s.applications.filter((a) => a.ref !== ref) })), [])
  const addRsvp = useCallback((r: Rsvp) => setState((s) => ({ ...s, rsvps: [...s.rsvps.filter((x) => x.event !== r.event), r] })), [])
  const cancelRsvp = useCallback((event: string) => setState((s) => ({ ...s, rsvps: s.rsvps.filter((x) => x.event !== event) })), [])
  const toggleShortlist = useCallback(
    (slug: string) => setState((s) => ({ ...s, shortlist: s.shortlist.includes(slug) ? s.shortlist.filter((x) => x !== slug) : [...s.shortlist, slug] })),
    [],
  )
  const toggleDone = useCallback((id: string) => setState((s) => ({ ...s, done: s.done.includes(id) ? s.done.filter((x) => x !== id) : [...s.done, id] })), [])

  const student = state.session?.role === 'STUDENT' ? { email: state.session.email, studentId: state.session.studentId } : null

  const value = useMemo(
    () => ({ ...state, student, signIn, signInTeacher, signOut, updateDraft, submitApplication, withdrawApplication, addRsvp, cancelRsvp, toggleShortlist, toggleDone }),
    [state, student, signIn, signInTeacher, signOut, updateDraft, submitApplication, withdrawApplication, addRsvp, cancelRsvp, toggleShortlist, toggleDone],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore outside StoreProvider')
  return v
}
