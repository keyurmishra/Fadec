import { Loader2 } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Link } from 'react-router'

import { cx } from '../lib/cx'

export type ButtonVariant = 'primary' | 'violet' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

/*
  Editorial controls: squared plates with a hairline edge, a deep navy primary
  and the single amber accent. `violet` is kept as the accent variant name so
  older screens keep compiling; it renders amber.
*/
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-fg text-[#fdfbf7] hover:bg-[#1d3f63] data-[force=hover]:bg-[#1d3f63] active:bg-[#081527] data-[force=pressed]:bg-[#081527]',
  violet:
    'bg-amber-deep text-[#fdfbf7] hover:bg-[#7a4a0c] data-[force=hover]:bg-[#7a4a0c] active:bg-[#6a400a] data-[force=pressed]:bg-[#6a400a]',
  secondary:
    'border border-line-strong bg-surface text-fg hover:border-fg hover:bg-surface-2 data-[force=hover]:border-fg data-[force=hover]:bg-surface-2 active:bg-raised data-[force=pressed]:bg-raised',
  ghost: 'text-fg hover:bg-navy-soft data-[force=hover]:bg-navy-soft active:bg-[rgb(15_33_55/0.1)] data-[force=pressed]:bg-[rgb(15_33_55/0.1)]',
  danger:
    'border border-[rgb(160_48_36/0.35)] bg-surface text-danger hover:bg-danger-soft data-[force=hover]:bg-danger-soft active:bg-[rgb(160_48_36/0.14)] data-[force=pressed]:bg-[rgb(160_48_36/0.14)]',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 gap-1.5 px-3.5 text-[13px]',
  md: 'h-11 gap-2 px-5 text-[14px]',
  lg: 'h-12 gap-2.5 px-6 text-[15px]',
}

export const buttonClass = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) =>
  cx(
    'relative inline-flex shrink-0 items-center justify-center rounded-[3px] font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-150 ease-out',
    'select-none',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-deep data-[force=focus]:outline-2 data-[force=focus]:outline-offset-2 data-[force=focus]:outline-amber-deep',
    'disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40',
    VARIANTS[variant],
    SIZES[size],
    className,
  )

type Common = { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; icon?: ReactNode; iconRight?: ReactNode; force?: 'hover' | 'focus' | 'pressed' }
type AsButton = Common & ComponentProps<'button'> & { to?: undefined; href?: undefined }
type AsLink = Common & Omit<ComponentProps<typeof Link>, 'to'> & { to: string }
type AsAnchor = Common & ComponentProps<'a'> & { href: string; to?: undefined }

export function Button(props: AsButton | AsLink | AsAnchor) {
  const { variant, size, loading, icon, iconRight, force, className, children, ...rest } = props
  const cls = buttonClass(variant, size, className)
  const inner = (
    <>
      {loading ? <Loader2 className="size-[1.1em] animate-spin" aria-hidden /> : icon}
      <span>{children}</span>
      {!loading && iconRight}
    </>
  )
  if ('to' in rest && rest.to !== undefined) {
    return (
      <Link {...(rest as AsLink)} data-force={force} className={cls}>
        {inner}
      </Link>
    )
  }
  if ('href' in rest && rest.href !== undefined) {
    return (
      <a {...(rest as AsAnchor)} data-force={force} className={cls}>
        {inner}
      </a>
    )
  }
  const b = rest as ComponentProps<'button'>
  return (
    <button type="button" {...b} data-force={force} disabled={b.disabled || loading} aria-busy={loading || undefined} className={cls}>
      {inner}
    </button>
  )
}

/** A square icon-only button. Always pass an aria-label. */
export function IconButton({ className, children, force, ...rest }: ComponentProps<'button'> & { force?: 'hover' | 'focus' | 'pressed' }) {
  return (
    <button
      type="button"
      {...rest}
      data-force={force}
      className={cx(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-[3px] border border-line bg-surface text-fg transition-colors hover:border-fg hover:bg-surface-2 data-[force=hover]:border-fg data-[force=hover]:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-deep data-[force=focus]:outline-2 data-[force=focus]:outline-offset-2 data-[force=focus]:outline-amber-deep disabled:opacity-35',
        className,
      )}
    >
      {children}
    </button>
  )
}
