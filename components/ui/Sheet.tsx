'use client'

/**
 * Sheet — bottom sheet that slides up from the bottom on mobile. Supports
 * drag-to-dismiss and an optional 2-snap-point "peek" mode where the sheet
 * starts at a small height and can be dragged up to expand fullscreen.
 *
 * Peek mode: pass `peek` (height in vh, eg 35) and the sheet will:
 * - Open at peek height (no backdrop, page underneath stays interactive)
 * - Drag up past 50% of expand range → snap to expanded
 * - Drag down past 50% → snap back to peek
 * - Drag down past peek → close
 *
 * @example
 *   <Sheet open={open} onClose={close} title="Filtros">...</Sheet>
 *   <Sheet open={open} onClose={close} peek={35}>peek + drag up to expand</Sheet>
 */

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, animate } from 'framer-motion'
import { modalBackdrop } from '@/lib/design/motion'

export type SheetProps = {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  /** When set, sheet opens at this height in vh and can be dragged up to fullscreen. No backdrop in peek mode. */
  peek?: number
  className?: string
}

export function Sheet({ open, onClose, title, children, peek, className = '' }: SheetProps) {
  const isPeek = typeof peek === 'number'
  // expanded = sheet is at fullscreen height
  const [expanded, setExpanded] = useState(false)
  const y = useMotionValue(0)

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
    if (isPeek) return // peek mode keeps the page underneath interactive
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, isPeek])

  useEffect(() => {
    if (!open) {
      setExpanded(false)
      y.set(0)
    }
  }, [open, y])

  if (!isPeek) {
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
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 200, damping: 32 }}
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

  // ── Peek mode ──
  // peekHeight is in vh, expandedHeight is 90vh
  const peekVh = peek!
  // y is the offset from the EXPANDED position. y=0 means expanded, y=positive means peek
  // peek y offset = (expandedHeight - peekHeight)
  // We use percentages relative to the sheet height for the drag.
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="false"
          aria-labelledby={title ? 'sheet-title' : undefined}
          initial={{ y: '100%' }}
          animate={{ y: expanded ? `0%` : `${100 - (peekVh / 90) * 100}%` }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.05}
          style={{ y, height: '90vh' }}
          onDragEnd={(_, info) => {
            const dy = info.offset.y
            const vy = info.velocity.y
            if (expanded) {
              // From expanded: drag down → peek; far drag down → close
              if (dy > 200 || vy > 700) {
                if (dy > 350 || vy > 1200) onClose()
                else setExpanded(false)
              }
            } else {
              // From peek: drag up → expand; drag down → close
              if (dy < -60 || vy < -500) setExpanded(true)
              else if (dy > 80 || vy > 500) onClose()
              else {
                // Snap back to peek
                animate(y, 0, { type: 'spring', stiffness: 260, damping: 30 })
              }
            }
          }}
          className={`fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 rounded-t-3xl shadow-2xl border-t border-zinc-800 ${className}`}
        >
          {/* Drag handle (always visible) */}
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? 'Contraer panel' : 'Expandir panel'}
            className="w-full pt-3 pb-2 flex justify-center cursor-pointer"
          >
            <span className="block w-10 h-1 rounded-full bg-zinc-600" aria-hidden="true" />
          </button>
          {title ? (
            <div className="px-5 pb-3">
              <h2 id="sheet-title" className="text-lg font-bold text-white">
                {title}
              </h2>
            </div>
          ) : null}
          <div
            className={`px-5 pb-8 ${expanded ? 'overflow-y-auto' : 'overflow-hidden'}`}
            style={{ height: 'calc(90vh - 60px)' }}
          >
            {children}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
