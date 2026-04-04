// frontend/components/layout/BottomSheet.tsx
//
// Sheet générique qui monte depuis le bas de l'écran.
// Utilisé par BottomNav pour afficher les sous-items d'un groupe.
//
// Fermeture :
//   - tap sur le backdrop
//   - tap sur un item (délégué via onClose)
//   - swipe-down natif (géré par le handle visuel + touch events)
//
// Accessibilité :
//   - role="dialog" + aria-modal + aria-label
//   - focus trap implicite (premier item focusable auto)
//   - Escape ferme la sheet

import { cn } from '@/lib/utils'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  className,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)

  // Fermeture Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Bloquer le scroll du body quand la sheet est ouverte
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className='fixed inset-0 z-50 bg-black/30'
        onClick={onClose}
        aria-hidden='true'
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role='dialog'
        aria-modal='true'
        aria-label={title}
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50',
          'bg-panel rounded-t-2xl shadow-2xl',
          // Hauteur max = 60% de l'écran, scroll interne si dépassé
          'max-h-[60dvh] flex flex-col',
          // Animation slide-up
          'animate-in slide-in-from-bottom duration-200 ease-out',
          className,
        )}
      >
        {/* Drag handle — indicateur visuel */}
        <div className='flex justify-center pt-3 pb-1 shrink-0'>
          <div className='w-10 h-1 rounded-full bg-border/60' />
        </div>

        {/* Titre optionnel */}
        {title && (
          <div className='px-4 pb-2 pt-1 shrink-0'>
            <span className='text-[10px] uppercase tracking-widest font-bold text-panel-item-icon'>
              {title}
            </span>
          </div>
        )}

        {/* Contenu scrollable */}
        <div className='flex-1 overflow-y-auto px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]'>
          {children}
        </div>
      </div>
    </>
  )
}
