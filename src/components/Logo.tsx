import { Link } from 'react-router'

import { SITE } from '../content'
import { cx } from '../lib/cx'

/** The mark: a swept delta in navy with an amber beacon. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cx('h-[1em] w-auto', className)} aria-hidden>
      <path d="M16 2 29 30 16 23.4 3 30Z" fill="currentColor" />
      <circle cx="16" cy="17.5" r="2.1" fill="var(--color-amber)" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cx('inline-flex min-h-10 items-center gap-2.5 text-fg', className)}
      aria-label={`${SITE.name} home`}
    >
      <Mark className="text-[19px]" />
      <span className="font-display text-[23px] leading-none tracking-[-0.01em]">FADEC</span>
      <span className="hidden border-l border-line pl-2.5 text-[9.5px] leading-[1.2] font-semibold tracking-[0.18em] text-muted uppercase sm:block">
        Pilot
        <br />
        Training
      </span>
    </Link>
  )
}
