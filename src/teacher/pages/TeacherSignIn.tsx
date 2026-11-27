import { ArrowLeft, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'

import { Button } from '../../components/Button'
import { FormError, Input } from '../../components/Field'
import { Card, Container, Kicker } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { useStore } from '../../lib/store'
import { teacherApi } from '../../lib/teacher-api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import type { TeacherSessionDTO } from '../../contracts/teaching'
import { validateTeacherSignIn } from '../../shared/validation'

/*
  Teaching studio sign-in. Teachers are invite-only, so there is no application
  form here — only the credentials an operator issued.

  The Worker answers with a signed, HttpOnly session cookie, so the API can
  trust who is calling. The credentials themselves are still a demo: a teacher
  ID is not a password, and the page says so. Real credentials (invites and
  passwords or SSO) are a separate deliverable.
*/
const DEMO = { name: 'Capt. Naveen Rao', email: 'naveen.rao@fadec.example', teacherId: 'TCH-2011-004' }

export function TeacherSignIn() {
  useDocumentTitle('Teaching studio · Sign in')
  const { session, signInTeacher } = useStore()
  const navigate = useNavigate()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)

  if (session?.role === 'TEACHER') return <Navigate to="/teach/overview" replace />

  async function submit(e?: FormEvent, values = { email, teacherId }) {
    e?.preventDefault()
    const errs = validateTeacherSignIn(values)
    setErrors(errs)
    setFormError('')
    if (Object.keys(errs).length) return
    setLoading(true)
    const res = await teacherApi.post<TeacherSessionDTO>('/api/teacher/signin', values)
    setLoading(false)
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {})
      setFormError(res.error)
      return
    }
    signInTeacher({
      role: 'TEACHER',
      userId: res.data.email,
      name: res.data.name,
      email: res.data.email,
      teacherId: res.data.teacherId,
      department: res.data.department,
    })
    toast(`Signed in as ${res.data.name}`)
    navigate('/teach/overview')
  }

  return (
    <section className="border-b border-line py-12 md:py-20">
      <Container className="grid max-w-[1100px] gap-10 md:grid-cols-[1.05fr_0.95fr] md:items-center">
        <div className="flex flex-col gap-4">
          <Kicker>Teaching studio</Kicker>
          <h1 className="font-display text-[40px] leading-[1.02] tracking-[-0.015em] md:text-[54px]">Courses, lectures and marking in one place</h1>
          <p className="max-w-[48ch] text-[16px] leading-relaxed text-muted">
            Sign in with the work email and teacher ID issued by the academy. Your courses, rosters and submissions are scoped to your account.
          </p>
          <Link to="/" className="inline-flex min-h-10 items-center gap-2 text-[13.5px] text-muted underline decoration-line-strong underline-offset-4 hover:text-fg">
            <ArrowLeft className="size-4" aria-hidden />
            Back to the academy site
          </Link>
        </div>

        <Card className="p-6 md:p-8">
          <form onSubmit={submit} noValidate className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-[22px] leading-tight">Log in</h2>
              <p className="text-[13px] text-muted">Teaching accounts are created by invitation.</p>
            </div>
            <Input label="Work email" type="email" autoComplete="email" value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Teacher ID" autoComplete="username" placeholder="TCH-2011-004" value={teacherId} error={errors.teacherId} onChange={(e) => setTeacherId(e.target.value)} />
            {formError && <FormError>{formError}</FormError>}
            <Button type="submit" size="lg" loading={loading}>
              Log in
            </Button>
            <Button
              variant="secondary"
              icon={<Sparkles className="size-4" aria-hidden />}
              onClick={() => {
                setEmail(DEMO.email)
                setTeacherId(DEMO.teacherId)
                submit(undefined, { email: DEMO.email, teacherId: DEMO.teacherId })
              }}
            >
              Use the demo teacher
            </Button>
            <p className="border-t border-line pt-4 text-[12px] leading-relaxed text-muted">
              Demo sign-in: your session is signed and checked on every request, but a teacher ID is not a password. This is not production authentication yet.
            </p>
          </form>
        </Card>
      </Container>
    </section>
  )
}
