'use client'

/**
 * Sheet — bottom sheet that slides up from the bottom on mobile. Supports
 * drag-to-dismiss.
 *
 * @example
 *   <Sheet open={open} onClose={close} title="Filtros">
 *     ...
 *   </Sheet>
 */

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { modalBackdrop, sheetSlide } from '@/lib/design/motion'

export type SheetProps = {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

export function Sheet({ open, onClose, title, children, className = '' }: SheetProps) {
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[60]">
          <motion.div
            variants={modalBackdrop}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'sheet-title' : undefined}
            variants={sheetSlide}
            initial="initial"
            animate="animate"
            exit="exit"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose()
            }}
            className={`absolute bottom-0 left-0 right-0 bg-zinc-900 rounded-t-3xl max-h-[90vh] overflow-y-auto shadow-2xl ${className}`}
          >
            <div className="sticky top-0 bg-zinc-900 pt-2 pb-1 flex justify-center">
              <span className="block w-10 h-1 rounded-full bg-zinc-700" aria-hidden="true" />
            </div>
            {title ? (
              <div className="px-5 pt-2 pb-4">
                <h2 id="sheet-title" className="text-lg font-bold text-white">
                  {title}
                </h2>
              </div>
            ) : null}
            <div className="px-5 pb-8">{children}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
