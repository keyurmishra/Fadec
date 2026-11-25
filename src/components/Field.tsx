import { AlertCircle, Check, ChevronDown } from 'lucide-react'
import { useId, type ComponentProps, type ReactNode } from 'react'

import { cx } from '../lib/cx'

const control = (invalid?: boolean, force?: string) =>
  cx(
    'w-full rounded-[3px] border bg-surface px-3.5 text-[14.5px] text-fg placeholder:text-faint transition-[border-color,box-shadow,background-color] duration-150',
    'hover:border-line-strong focus:outline-none focus-visible:border-amber-deep focus-visible:shadow-[0_0_0_3px_rgb(176_118_28/0.18)]',
    force === 'hover' && 'border-line-strong',
    force === 'focus' && 'border-amber-deep shadow-[0_0_0_3px_rgb(176_118_28/0.18)]',
    'disabled:cursor-not-allowed disabled:opacity-50',
    invalid ? 'border-danger hover:border-danger focus-visible:border-danger focus-visible:shadow-[0_0_0_3px_rgb(160_48_36/0.16)]' : 'border-line-strong',
  )

type FieldProps = { label: string; hint?: string; error?: string; optional?: boolean; force?: 'hover' | 'focus'; className?: string; hideLabel?: boolean }

function Frame({ id, label, hint, error, optional, className, hideLabel, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <label htmlFor={id} className={cx('text-[12.5px] font-medium tracking-[0.01em] text-fg', hideLabel && 'sr-only')}>
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="flex items-center gap-1.5 text-[13px] text-danger">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function Input({ label, hint, error, optional, force, className, hideLabel, ...rest }: FieldProps & ComponentProps<'input'>) {
  const id = useId()
  return (
    <Frame id={id} label={label} hint={hint} error={error} optional={optional} className={className} hideLabel={hideLabel}>
      <input id={id} aria-invalid={!!error || undefined} aria-describedby={error || hint ? `${id}-msg` : undefined} {...rest} className={cx(control(!!error, force), 'h-12')} />
    </Frame>
  )
}

export function Textarea({ label, hint, error, optional, force, className, ...rest }: FieldProps & ComponentProps<'textarea'>) {
  const id = useId()
  return (
    <Frame id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      <textarea id={id} aria-invalid={!!error || undefined} aria-describedby={error || hint ? `${id}-msg` : undefined} rows={7} {...rest} className={cx(control(!!error, force), 'min-h-40 resize-y py-3 leading-relaxed')} />
    </Frame>
  )
}

export function Select({ label, hint, error, optional, force, className, hideLabel, children, ...rest }: FieldProps & ComponentProps<'select'>) {
  const id = useId()
  return (
    <Frame id={id} label={label} hint={hint} error={error} optional={optional} className={className} hideLabel={hideLabel}>
      <div className="relative">
        <select id={id} aria-invalid={!!error || undefined} aria-describedby={error || hint ? `${id}-msg` : undefined} {...rest} className={cx(control(!!error, force), 'h-12 appearance-none pr-11')}>
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted" aria-hidden />
      </div>
    </Frame>
  )
}

export function Checkbox({ label, error, className, ...rest }: { label: ReactNode; error?: string } & Omit<ComponentProps<'input'>, 'type'>) {
  const id = useId()
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cx('group inline-flex min-h-10 cursor-pointer items-center gap-3 text-[14.5px] text-fg', rest.disabled && 'cursor-not-allowed opacity-50')}>
        <span className="relative inline-flex size-5.5 shrink-0">
          <input
            id={id}
            type="checkbox"
            aria-invalid={!!error || undefined}
            aria-describedby={error ? `${id}-msg` : undefined}
            {...rest}
            className={cx(
              'peer absolute inset-0 appearance-none rounded-[2px] border bg-surface transition-colors checked:border-fg checked:bg-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-deep',
              error ? 'border-danger' : 'border-line-strong',
            )}
          />
          <Check className="pointer-events-none relative m-auto size-3.5 text-[#fdfbf7] opacity-0 peer-checked:opacity-100" strokeWidth={3} aria-hidden />
        </span>
        {label}
      </label>
      {error && (
        <p id={`${id}-msg`} className="flex items-center gap-1.5 text-[13px] text-danger">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}

/** A big selectable card for radio groups (intake, payment plan, funding). */
export function ChoiceCard({ checked, title, body, aside, className, ...rest }: { checked: boolean; title: ReactNode; body?: ReactNode; aside?: ReactNode } & Omit<ComponentProps<'input'>, 'type' | 'title'>) {
  return (
    <label
      className={cx(
        'relative flex min-h-14 cursor-pointer items-center gap-3.5 rounded-[2px] border bg-surface px-4 py-3.5 transition-[border-color,background-color] duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-amber-deep',
        checked ? 'border-amber-deep bg-amber-soft' : 'border-line hover:border-line-strong',
        rest.disabled && 'cursor-not-allowed opacity-45 hover:border-line-strong',
        className,
      )}
    >
      <input type="radio" checked={checked} {...rest} className="sr-only" />
      <span className={cx('flex size-4 shrink-0 items-center justify-center rounded-full border', checked ? 'border-amber-deep' : 'border-line-strong')} aria-hidden>
        {checked && <span className="size-2 rounded-full bg-amber-deep" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium text-fg">{title}</span>
        {body && <span className="text-[13px] text-muted">{body}</span>}
      </span>
      {aside}
    </label>
  )
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-[2px] border border-[rgb(160_48_36/0.25)] bg-danger-soft px-4 py-3 text-[14px] text-danger">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  )
}
