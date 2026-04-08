'use client'

/**
 * Modal — centered dialog with animated backdrop. Handles ESC key, click
 * outside, and body scroll lock.
 *
 * @example
 *   const [open, setOpen] = useState(false)
 *   <Modal open={open} onClose={() => setOpen(false)} title="Confirmar">
 *     ...
 *   </Modal>
 */

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { modalBackdrop, modalContent } from '@/lib/design/motion'
import { IconButton } from './IconButton'
import { Close } from './icons'

type Size = 'sm' | 'md' | 'lg' | 'xl'

export type ModalProps = {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: Size
  showCloseButton?: boolean
  className?: string
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  className = '',
}: ModalProps) {
  // ESC to close
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Body scroll lock
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
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
            aria-labelledby={title ? 'modal-title' : undefined}
            variants={modalContent}
            initial="initial"
            animate="animate"
            exit="exit"
            className={`relative w-full ${SIZE_CLASSES[size]} bg-zinc-900 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto ${className}`}
          >
            {(title || showCloseButton) && (
              <div className="flex items-center justify-between gap-4 p-5 border-b border-zinc-800/60 sticky top-0 bg-zinc-900 z-10">
                {title ? (
                  <h2 id="modal-title" className="text-lg font-bold text-white">
                    {title}
                  </h2>
                ) : (
                  <span />
                )}
                {showCloseButton ? (
                  <IconButton
                    icon={<Close className="w-5 h-5" />}
                    label="Cerrar"
                    size="sm"
                    variant="ghost"
                    onClick={onClose}
                  />
                ) : null}
              </div>
            )}
            <div className={title || showCloseButton ? 'p-5' : 'p-5'}>{children}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
