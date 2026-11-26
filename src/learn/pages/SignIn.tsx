import { ArrowLeft, Sparkles } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { Button } from '../../components/Button'
import { FormError, Input } from '../../components/Field'
import { Card, Container, Kicker } from '../../components/ui'
import { useToast } from '../../components/Toast'
import type { StudentIdentityDTO } from '../../contracts/learning'
import { studentApi } from '../../lib/student-api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { validateSignIn } from '../../shared/validation'

/*
  Student portal sign-in: work email and student number, both issued by the
  academy. Success sets a signed HttpOnly cookie, so nothing about the session
  is stored in the browser and the portal re-reads it from /api/student/me.

  The accounts are seeded and the credential is shared demo data; the page says
  so rather than implying these are issued logins.
*/
const DEMO = { email: 'priya.nair@fadec.example', studentId: 'PPL-26-00001' }

export function StudentSignIn() {
  useDocumentTitle('Student portal · Sign in')
  const navigate = useNavigate()
  const toast = useToast()
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [studentId, setStudentId] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)

  // A live cookie means there is nothing to log in to; skip the form.
  useEffect(() => {
    let cancelled = false
    studentApi.get<StudentIdentityDTO>('/api/student/me').then((res) => {
      if (cancelled) return
      if (res.ok) navigate('/learn/assignments', { replace: true })
      else setChecking(false)
    })
    return () => {
      cancelled = true
    }
  }, [navigate])

  async function submit(e?: FormEvent, values = { email, studentId }) {
    e?.preventDefault()
    const errs = validateSignIn(values)
    setErrors(errs)
    setFormError('')
    if (Object.keys(errs).length) return
    setLoading(true)
    const res = await studentApi.post<StudentIdentityDTO>('/api/student/signin', values)
    setLoading(false)
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {})
      setFormError(res.error)
      return
    }
    toast(`Signed in as ${res.data.name}`)
    navigate('/learn/assignments', { replace: true })
  }

  return (
    <section className="border-b border-line py-12 md:py-20">
      <Container className="grid max-w-[1100px] gap-10 md:grid-cols-[1.05fr_0.95fr] md:items-center">
        <div className="flex flex-col gap-4">
          <Kicker>Student portal</Kicker>
          <h1 className="font-display text-[40px] leading-[1.02] tracking-[-0.015em] md:text-[54px]">Your assignments, in one place</h1>
          <p className="max-w-[48ch] text-[16px] leading-relaxed text-muted">
            Sign in with your academy email and student number. You will see the assignments published for the courses you are enrolled in, and nothing else.
          </p>
          <Link to="/dashboard" className="inline-flex min-h-10 items-center gap-2 text-[13.5px] text-muted underline decoration-line-strong underline-offset-4 hover:text-fg">
            <ArrowLeft className="size-4" aria-hidden />
            Back to the student hub
          </Link>
        </div>

        <Card className="p-6 md:p-8">
          {checking ? (
            <p role="status" className="text-[13.5px] text-muted">
              Checking your session…
            </p>
          ) : (
            <form onSubmit={submit} noValidate className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-[22px] leading-tight">Log in</h2>
                <p className="text-[13px] text-muted">Student accounts are created by the academy.</p>
              </div>
              <Input label="Student email" type="email" autoComplete="email" value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
              <Input
                label="Student number"
                autoComplete="username"
                placeholder="PPL-26-00001"
                value={studentId}
                error={errors.studentId}
                onChange={(e) => setStudentId(e.target.value)}
              />
              {formError && <FormError>{formError}</FormError>}
              <Button type="submit" size="lg" loading={loading}>
                Log in
              </Button>
              <Button
                variant="secondary"
                icon={<Sparkles className="size-4" aria-hidden />}
                onClick={() => {
                  setEmail(DEMO.email)
                  setStudentId(DEMO.studentId)
                  submit(undefined, { email: DEMO.email, studentId: DEMO.studentId })
                }}
              >
                Use the demo student
              </Button>
              <p className="border-t border-line pt-4 text-[12px] leading-relaxed text-muted">
                These accounts are seeded demo data, not issued logins. Signing in sets a signed cookie that expires after 12 hours, and the portal forgets it as
                soon as you sign out.
              </p>
            </form>
          )}
        </Card>
      </Container>
    </section>
  )
}
