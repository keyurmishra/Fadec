import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { cx } from '../../lib/cx'

/* Teacher-scoped primitives. The public components in src/components are reused
   as they are; only what the studio needs and the site does not gets added. */

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
      <div className="flex max-w-[62ch] flex-col gap-2">
        {eyebrow && <p className="text-[11px] font-semibold tracking-[0.16em] text-amber-ink uppercase">{eyebrow}</p>}
        <h1 className="font-display text-[32px] leading-[1.05] tracking-[-0.015em] md:text-[40px]">{title}</h1>
        {description && <p className="text-[14.5px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/**
 * A KPI tile. `to` makes the whole tile a link, which is what the brief asks of
 * each overview number: clicking it opens the list it counts.
 */
export function KpiCard({ label, value, sub, to, tone = 'navy' }: { label: string; value: string | number; sub?: string; to?: string; tone?: 'navy' | 'amber' | 'lime' }) {
  const bar = { navy: 'bg-navy', amber: 'bg-amber', lime: 'bg-lime' }[tone]
  const inner = (
    <div className={cx('flex h-full flex-col gap-3 border border-line bg-surface p-5', to && 'transition-colors duration-150 hover:border-line-strong hover:bg-surface-2')}>
      <span className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] tracking-[0.01em] text-muted">{label}</span>
        <span className={cx('h-1 w-8', bar)} aria-hidden />
      </span>
      <span className="figures text-[34px] leading-none font-semibold tracking-[-0.03em]">{value}</span>
      {sub && <span className="truncate text-[12.5px] text-muted">{sub}</span>}
    </div>
  )
  if (!to) return inner
  return (
    <Link to={to} className="block rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-deep">
      {inner}
    </Link>
  )
}

/** A titled panel with a hairline header and an optional action. */
export function Panel({ title, description, action, children, className }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('flex flex-col border border-line bg-surface', className)}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold tracking-[-0.005em]">{title}</h2>
          {description && <p className="text-[12.5px] text-muted">{description}</p>}
        </div>
        {action}
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  )
}

/**
 * Stands in for a metric the platform does not record yet. A number would look
 * measured; this says plainly that there is nothing to measure.
 */
export function NotTracked({ label = 'Not tracked yet', reason }: { label?: string; reason?: string }) {
  return (
    <span className="text-[12px] text-faint" title={reason}>
      {label}
    </span>
  )
}

export function ProgressBar({ value, tone = 'bg-navy', label }: { value: number; tone?: string; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <span className="flex items-center gap-2">
      <span className="h-1 flex-1 overflow-hidden bg-[rgb(15_33_55/0.1)]" aria-hidden>
        <span className={cx('block h-full', tone)} style={{ width: `${clamped}%` }} />
      </span>
      <span className="figures w-9 shrink-0 text-right text-[12px] text-muted">{label ?? `${clamped}%`}</span>
    </span>
  )
}
