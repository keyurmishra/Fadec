import type { ReactNode } from 'react'

import { Container } from './ui'

/*
  The masthead that opens every inner page. Same construction as the home
  page hero: a hairline strip with an eyebrow, a serif title, a muted standfirst
  and optional actions. No shapes, no glass, no gradient.
*/
export function PageIntro({ kicker, title, body, children, meta }: { kicker?: string; title: ReactNode; body?: ReactNode; children?: ReactNode; meta?: ReactNode }) {
  return (
    <section className="border-b border-line bg-bg pt-4 pb-10 md:pt-6 md:pb-14">
      <Container className="flex flex-col gap-6">
        {(kicker || meta) && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4 text-[11px] font-medium tracking-[0.14em] text-muted uppercase">
            {kicker && (
              <span className="inline-flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-amber" aria-hidden />
                {kicker}
              </span>
            )}
            {meta && <span className="hidden sm:block">{meta}</span>}
          </div>
        )}
        <h1 className="max-w-[820px] font-display text-[40px] leading-[1.02] tracking-[-0.015em] text-balance md:text-[64px]">{title}</h1>
        {body && <p className="max-w-[600px] text-[16.5px] leading-relaxed text-muted text-pretty">{body}</p>}
        {children}
      </Container>
    </section>
  )
}
