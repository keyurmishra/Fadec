import { Menu, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router'

import { NAV } from '../content'
import { cx } from '../lib/cx'
import { useStore } from '../lib/store'
import { useFocusTrap } from '../lib/useFocusTrap'
import { Button, IconButton } from './Button'
import { Logo } from './Logo'

/*
  The masthead: wordmark left, section links centre on large screens,
  Log in and Apply right. A hairline base rule, no transparency.
*/
export function Header({ overlay = false }: { overlay?: boolean }) {
  const [open, setOpen] = useState(false)
  const { student } = useStore()
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])

  return (
    <header className={cx('z-40 w-full border-b border-line bg-bg', overlay ? 'absolute inset-x-0 top-0' : 'relative')}>
      <div className="mx-auto flex h-20 max-w-[1240px] items-center justify-between gap-6 px-5 md:px-8">
        <Logo />

        <nav aria-label="Sections" className="hidden lg:block">
          <ul className="flex items-center gap-7">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.to === '/admissions'}
                  className={({ isActive }) =>
                    cx(
                      'relative inline-flex h-20 items-center text-[13px] font-medium tracking-[0.01em] transition-colors',
                      isActive && !n.to.includes('#')
                        ? 'text-fg after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-amber-deep'
                        : 'text-muted hover:text-fg',
                    )
                  }
                >
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            <Button to="/dashboard" variant="ghost" size="sm">
              {student ? 'My hub' : 'Log in'}
            </Button>
            <Button to="/apply" variant="primary" size="sm">
              Apply now
            </Button>
          </div>
          <IconButton aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)} className="lg:hidden">
            <Menu className="size-5" aria-hidden />
          </IconButton>
        </div>
      </div>
      <AnimatePresence>{open && <Drawer onClose={() => setOpen(false)} />}</AnimatePresence>
    </header>
  )
}

function Drawer({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const { student } = useStore()
  useFocusTrap(ref, true, onClose)
  return (
    <div className="fixed inset-0 z-[70] lg:hidden">
      <motion.div className="absolute inset-0 bg-[rgb(15_33_55/0.45)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-y-0 right-0 flex w-[min(360px,88vw)] flex-col gap-7 border-l border-line bg-bg p-5 focus:outline-none"
      >
        <div className="flex items-center justify-between">
          <Logo />
          <IconButton aria-label="Close menu" onClick={onClose}>
            <X className="size-5" aria-hidden />
          </IconButton>
        </div>
        <nav aria-label="Main">
          <ul className="flex flex-col">
            {NAV.map((n) => (
              <li key={n.to} className="border-b border-line">
                <NavLink
                  to={n.to}
                  className={({ isActive }) =>
                    cx(
                      'flex min-h-14 items-center text-[17px] font-medium',
                      isActive && !n.to.includes('#') ? 'text-fg' : 'text-muted hover:text-fg',
                    )
                  }
                >
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          <Button to="/dashboard" variant="secondary" size="lg">
            {student ? 'My hub' : 'Log in'}
          </Button>
          <Button to="/apply" variant="primary" size="lg">
            Apply now
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
