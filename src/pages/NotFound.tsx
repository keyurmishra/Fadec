import { ArrowLeft } from 'lucide-react'

import { Button } from '../components/Button'
import { Header } from '../components/Header'
import { Container } from '../components/ui'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export function NotFound({ what = 'page' }: { what?: string }) {
  useDocumentTitle('Not found')
  return (
    <>
      <Header />
      <section className="flex min-h-[72svh] items-center border-b border-line py-20">
        <Container className="flex flex-col items-start gap-5">
          <div className="flex w-full items-center gap-2 border-b border-line pb-4 text-[11px] font-medium tracking-[0.14em] text-muted uppercase">
            <span className="size-1.5 rounded-full bg-amber" aria-hidden />
            Error 404
          </div>
          <h1 className="max-w-[640px] font-display text-[46px] leading-[1.02] tracking-[-0.015em] text-balance md:text-[72px]">This {what} never got airborne</h1>
          <p className="max-w-[460px] text-[16px] leading-relaxed text-muted">The link may be old or mistyped. Try the course finder, or head back to the start.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button to="/" icon={<ArrowLeft className="size-4" aria-hidden />}>
              Back home
            </Button>
            <Button to="/programmes" variant="secondary">
              Find a course
            </Button>
          </div>
        </Container>
      </section>
    </>
  )
}
