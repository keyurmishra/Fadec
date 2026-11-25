import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useId, useRef, type ReactNode } from 'react'

import { useFocusTrap } from '../lib/useFocusTrap'

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  return <AnimatePresence>{open && <ModalBody onClose={onClose} title={title} footer={footer}>{children}</ModalBody>}</AnimatePresence>
}

function ModalBody({ onClose, title, children, footer }: { onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  useFocusTrap(ref, true, onClose)
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <motion.div className="absolute inset-0 bg-[rgb(15_33_55/0.45)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex max-h-[calc(100svh-24px)] w-full max-w-[520px] flex-col overflow-hidden rounded-[2px] border border-line bg-surface shadow-lift focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <h2 id={id} className="font-display text-[24px] leading-tight text-fg">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mt-1 -mr-2 flex size-10 items-center justify-center rounded-[3px] text-muted hover:bg-navy-soft hover:text-fg">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-6 pt-3 pb-6">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-bg px-6 py-4">{footer}</div>}
      </motion.div>
    </div>
  )
}
