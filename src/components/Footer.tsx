import { ArrowRight } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'

import { FOOTER, SITE } from '../content'
import { postJson } from '../lib/api'
import { validateEmailOnly } from '../shared/validation'
import { Button } from './Button'
import { Input } from './Field'
import { Logo } from './Logo'
import { Container } from './ui'

export function Footer() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<{ kind: 'idle' | 'loading' | 'done' } | { kind: 'error'; msg: string }>({ kind: 'idle' })

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs = validateEmailOnly({ email })
    if (errs.email) return setState({ kind: 'error', msg: errs.email })
    setState({ kind: 'loading' })
    const res = await postJson('/api/subscribe', { email })
    setState(res.ok ? { kind: 'done' } : { kind: 'error', msg: res.fieldErrors?.email ?? res.error })
  }

  return (
    <footer className="relative border-t border-line bg-surface pt-16 pb-28 md:pb-32">
      <Container className="grid gap-12 md:grid-cols-[1.3fr_2fr]">
        <div className="flex flex-col gap-5">
          <Logo />
          <p className="max-w-[360px] text-[14px] leading-relaxed text-muted">{FOOTER.blurb}</p>
          <form onSubmit={submit} noValidate className="flex max-w-[400px] flex-col gap-2">
            <div className="flex items-start gap-2">
              <Input
                label="Email address"
                hideLabel
                type="email"
                autoComplete="email"
                placeholder="Get intake dates by email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (state.kind !== 'idle' && state.kind !== 'loading') setState({ kind: 'idle' })
                }}
                error={state.kind === 'error' ? state.msg : undefined}
                className="flex-1"
              />
              <Button type="submit" variant="primary" size="md" loading={state.kind === 'loading'} className="h-12" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                Subscribe
              </Button>
            </div>
            <p className="text-[13px] text-lime-ink" role="status">
              {state.kind === 'done' ? 'You’re on the list. We write once a month.' : ''}
            </p>
          </form>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {FOOTER.columns.map((c) => (
            <div key={c.title} className="flex flex-col gap-3">
              <h2 className="text-[13px] font-medium text-faint">{c.title}</h2>
              <ul className="flex flex-col gap-1">
                {c.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="inline-flex min-h-10 items-center text-[14.5px] text-muted hover:text-fg">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
      <Container className="mt-14 flex flex-col gap-2 border-t border-line pt-6 text-[13px] text-faint md:flex-row md:justify-between">
        <p>© 2026 {SITE.name}</p>
        <p>{SITE.address}</p>
      </Container>
    </footer>
  )
}
