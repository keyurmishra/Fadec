import { ChevronDown } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useId, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react'

import { cx } from '../lib/cx'

/* Small shared primitives. Bigger components live in their own files. */

export type Tone = 'neutral' | 'violet' | 'lime' | 'amber' | 'blue' | 'danger'

const TONES: Record<Tone, string> = {
  neutral: 'border border-line bg-[rgb(15_33_55/0.04)] text-muted',
  violet: 'border border-[rgb(29_63_99/0.22)] bg-[rgb(29_63_99/0.06)] text-[#1d3f63]',
  lime: 'border border-[rgb(47_107_79/0.25)] bg-lime-soft text-lime-ink',
  amber: 'border border-[rgb(176_118_28/0.3)] bg-amber-soft text-amber-ink',
  blue: 'border border-[rgb(29_63_99/0.18)] bg-[rgb(29_63_99/0.05)] text-[#1d3f63]',
  danger: 'border border-[rgb(160_48_36/0.25)] bg-danger-soft text-danger',
}

export function Badge({ tone = 'neutral', className, children, dot }: { tone?: Tone; className?: string; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx('inline-flex h-6 items-center gap-1.5 rounded-[2px] px-2 text-[10.5px] font-semibold tracking-[0.12em] whitespace-nowrap uppercase', TONES[tone], className)}>
      {dot && <span className="size-1.5 animate-pulse-dot rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}

/** A toggle chip for filters. Uses aria-pressed. */
export function Chip({ active, className, children, force, ...rest }: { active: boolean; force?: 'hover' | 'focus' } & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      data-force={force}
      {...rest}
      className={cx(
        'inline-flex h-9 items-center gap-2 rounded-[3px] border px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-deep data-[force=focus]:outline-2 data-[force=focus]:outline-offset-2 data-[force=focus]:outline-amber-deep disabled:opacity-40',
        active
          ? 'border-fg bg-fg text-[#fdfbf7]'
          : 'border-line-strong bg-surface text-fg hover:border-fg hover:bg-surface-2 data-[force=hover]:border-fg data-[force=hover]:bg-surface-2',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Radio-like segmented control. */
export function Segmented<T extends string>({ label, value, options, onChange, className }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string }) {
  const name = useId()
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex rounded-[3px] border border-line bg-surface p-0.5', className)}>
      {options.map((o) => (
        <label
          key={o.value}
          className={cx(
            'relative inline-flex h-8 cursor-pointer items-center rounded-[2px] px-3.5 text-[13px] font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-amber-deep',
            value === o.value ? 'bg-fg text-[#fdfbf7]' : 'text-muted hover:text-fg',
          )}
        >
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
          {o.label}
        </label>
      ))}
    </div>
  )
}

export function Card({ className, children, as: As = 'div' }: { className?: string; children: ReactNode; as?: 'div' | 'article' | 'section' | 'li' }) {
  return <As className={cx('relative rounded-[2px] border border-line bg-surface', className)}>{children}</As>
}

export function Kicker({ children, className, tone = 'violet' }: { children: ReactNode; className?: string; tone?: 'violet' | 'lime' | 'amber' | 'blue' }) {
  const c = { violet: 'text-violet-ink', lime: 'text-lime-ink', amber: 'text-amber-ink', blue: 'text-blue-ink' }[tone]
  return <p className={cx('text-[11px] leading-none font-semibold tracking-[0.16em] uppercase', c, className)}>{children}</p>
}

export function SectionHeading({ kicker, title, body, className, align = 'left', action }: { kicker?: string; title: ReactNode; body?: ReactNode; className?: string; align?: 'left' | 'center'; action?: ReactNode }) {
  return (
    <div className={cx('flex flex-col gap-4 md:flex-row md:items-end md:justify-between', align === 'center' && 'items-center text-center md:flex-col md:items-center', className)}>
      <div className={cx('flex max-w-[640px] flex-col gap-3', align === 'center' && 'items-center')}>
        {kicker && <Kicker>{kicker}</Kicker>}
        <h2 className="font-display text-[32px] leading-[1.06] tracking-[-0.01em] text-balance md:text-[44px]">{title}</h2>
        {body && <p className="text-[16px] leading-relaxed text-muted text-pretty">{body}</p>}
      </div>
      {action}
    </div>
  )
}

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('mx-auto w-full max-w-[1240px] px-5 md:px-8', className)}>{children}</div>
}

export function Stat({ value, label, className }: { value: string; label: string; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <span className="figures font-display text-[38px] leading-none tracking-[-0.01em] md:text-[48px]">{value}</span>
      <span className="text-[14px] text-muted">{label}</span>
    </div>
  )
}

export function Accordion({ items, className }: { items: { q: string; a: ReactNode }[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(0)
  const base = useId()
  return (
    <ul className={cx('flex flex-col gap-2', className)}>
      {items.map((it, i) => {
        const isOpen = open === i
        return (
          <li key={it.q} className="rounded-[2px] border border-line bg-surface">
            <h3>
              <button
                type="button"
                id={`${base}-h${i}`}
                aria-expanded={isOpen}
                aria-controls={`${base}-p${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex min-h-14 w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-deep"
              >
                {it.q}
                <ChevronDown className={cx('size-5 shrink-0 text-muted transition-transform duration-200', isOpen && 'rotate-180')} aria-hidden />
              </button>
            </h3>
            <div id={`${base}-p${i}`} role="region" aria-labelledby={`${base}-h${i}`} hidden={!isOpen} className="px-5 pb-5 text-[14.5px] leading-relaxed text-muted">
              {it.a}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-14 text-center', className)}>
      {icon && <div className="flex size-12 items-center justify-center rounded-[2px] border border-line bg-surface-2 text-muted">{icon}</div>}
      <h3 className="text-[19px] font-semibold">{title}</h3>
      {body && <p className="max-w-[420px] text-[14.5px] text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton rounded-[14px]', className)} aria-hidden />
}

/** Fades content up the first time it scrolls into view. Use as="li" inside lists. */
export function Reveal({ children, className, delay = 0, as = 'div' }: { children: ReactNode; className?: string; delay?: number; as?: 'div' | 'li' }) {
  const reduce = useReducedMotion()
  if (reduce) return as === 'li' ? <li className={className}>{children}</li> : <div className={className}>{children}</div>
  const M = as === 'li' ? motion.li : motion.div
  return (
    <M className={className} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </M>
  )
}

/** Numbered progress steps for multi-step forms. */
export function Stepper({ steps, current, className }: { steps: string[]; current: number; className?: string }) {
  return (
    <ol className={cx('flex gap-1.5', className)} aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} className="flex min-w-0 flex-1 flex-col gap-2" aria-current={i === current ? 'step' : undefined}>
          <span className={cx('h-1 transition-colors duration-300', i < current ? 'bg-lime' : i === current ? 'bg-amber-deep' : 'bg-[rgb(15_33_55/0.14)]')} aria-hidden />
          <span className={cx('hidden truncate text-[12.5px] md:block', i === current ? 'text-fg' : 'text-muted')}>
            {i + 1}. {s}
          </span>
          <span className="sr-only">
            Step {i + 1} of {steps.length}: {s}
            {i < current ? ' (done)' : ''}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Accessible tabs: arrow keys move between tabs, Home/End jump to the ends. */
export function Tabs<T extends string>({ label, tabs, value, onChange, className }: { label: string; tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  const base = useId()
  const onKey = (e: KeyboardEvent, i: number) => {
    let n = -1
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length
    if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length
    if (e.key === 'Home') n = 0
    if (e.key === 'End') n = tabs.length - 1
    if (n < 0) return
    e.preventDefault()
    onChange(tabs[n].value)
    document.getElementById(`${base}-${tabs[n].value}`)?.focus()
  }
  return (
    <div role="tablist" aria-label={label} className={cx('no-scrollbar flex gap-1 overflow-x-auto border-b border-line', className)}>
      {tabs.map((t, i) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            id={`${base}-${t.value}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`panel-${t.value}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx(
              'relative inline-flex h-12 shrink-0 items-center gap-2 px-4 text-[14.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-deep',
              active ? 'text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="figures rounded-[2px] bg-[rgb(15_33_55/0.07)] px-1.5 py-0.5 text-[11.5px]">{t.count}</span>}
            {active && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-amber-deep" aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}

export function TabPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={`panel-${value}`} tabIndex={0} className={cx('focus-visible:outline-none', className)}>
      {children}
    </div>
  )
}
