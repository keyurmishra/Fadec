import { ArrowRight } from 'lucide-react'

import { HERO, STATS } from '../content'
import { img } from '../lib/images'
import { Button } from './Button'

/*
  The opening plate: editorial masthead, a serif headline with one amber word,
  a framed image and a hairline data strip. No shapes, no gradient, no glass.
*/
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="border-b border-line bg-bg">
      <div className="mx-auto w-full max-w-[1240px] px-5 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-5 text-[11px] font-medium tracking-[0.14em] text-muted uppercase">
          <span className="inline-flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-amber" aria-hidden />
            {HERO.kicker}
          </span>
          <span className="hidden sm:block">{HERO.credential}</span>
        </div>

        <div className="grid gap-12 pt-12 pb-14 md:grid-cols-[1.25fr_0.9fr] md:gap-16 md:pt-16 md:pb-20">
          <div className="flex flex-col justify-center">
            <h1 id="hero-title" className="font-display text-[46px] leading-[1.02] tracking-[-0.015em] text-fg sm:text-[64px] md:text-[82px]">
              <span className="block animate-rise">{HERO.headline}</span>
              <span className="block animate-rise text-amber-ink [animation-delay:90ms]">{HERO.headlineAccent}</span>
            </h1>
            <p className="mt-7 max-w-[54ch] text-[16.5px] leading-relaxed text-muted md:text-[18px]">{HERO.body}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button to={HERO.primary.to} size="lg" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                {HERO.primary.label}
              </Button>
              <Button to={HERO.secondary.to} size="lg" variant="secondary">
                {HERO.secondary.label}
              </Button>
            </div>
          </div>

          <figure className="flex flex-col gap-3 md:pt-2">
            <div className="border border-line bg-surface-2 p-2">
              <img
                src={img('campus-hub')}
                alt="Two crew at the flight deck in cruise during an approach briefing"
                className="aspect-[4/3] w-full object-cover"
                loading="eager"
              />
            </div>
            <figcaption className="flex items-start justify-between gap-4 border-t border-line pt-2 text-[12px] leading-relaxed text-muted">
              <span>Flight deck, Kestrel Works. Approach briefing, cohort 14.</span>
              <span className="figures shrink-0 text-faint">51.44°N 2.58°W</span>
            </figcaption>
          </figure>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-6 border-t border-line py-7 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="flex flex-col gap-1">
              <dt className="sr-only">{s.label}</dt>
              <dd className="figures font-display text-[32px] leading-none tracking-[-0.01em] md:text-[38px]">{s.value}</dd>
              <dd className="max-w-[22ch] text-[12.5px] leading-snug text-muted">{s.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
