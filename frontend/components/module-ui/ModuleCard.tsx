// frontend/components/module-ui/ModuleCard.tsx
//
// Tokens Stitch → variables shadcn :
//   surface-container-lowest  → bg-card          (lift tonal)
//   surface                   → bg-background    (fond de page)
//   outline-variant/15        → border border-border/40  (ghost border)
//   ambient shadow hover      → shadow-sm hover:shadow-md
//   spacing-6 interne         → p-6
//   left-border accent        → border-l-2 border-l-primary (featured)

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface ModuleCardProps {
  title?: string
  icon?: React.ComponentType<{ className?: string }>
  /** Badge ou élément affiché à droite du titre */
  headerRight?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** Left-border accent primary — pour les cards en avant */
  featured?: boolean
  /** Désactive le padding interne (tableaux plein-bord, etc.) */
  noPadding?: boolean
  className?: string
  onClick?: () => void
}

export function ModuleCard({
  title,
  icon: Icon,
  headerRight,
  children,
  footer,
  featured = false,
  noPadding = false,
  className,
  onClick,
}: ModuleCardProps) {
  const hasHeader = !!(title || Icon || headerRight)

  return (
    <div
      onClick={onClick}
      className={cn(
        // Base : bg-card sur bg-background → lift tonal sans border visible
        'bg-card rounded-lg',
        // Ghost border "felt not seen" (Stitch)
        'border border-border/40',
        // Hover ambient (uniquement si cliquable)
        onClick && [
          'cursor-pointer transition-all duration-200',
          'hover:shadow-md hover:-translate-y-px',
        ],
        // Featured : left-border accent 2px primary
        featured && 'border-l-2 border-l-primary',
        className,
      )}
    >
      {/* Header */}
      {hasHeader && (
        <div
          className={cn(
            'flex items-center justify-between',
            noPadding ? 'px-6 pt-5 pb-4' : 'px-6 pt-5 pb-3',
          )}
        >
          <div className='flex items-center gap-3'>
            {Icon && (
              <div className='w-8 h-8 rounded-md bg-muted flex items-center justify-center'>
                <Icon className='h-4 w-4 text-muted-foreground' />
              </div>
            )}
            {title && (
              <h3 className='text-sm font-medium text-foreground leading-tight'>
                {title}
              </h3>
            )}
          </div>
          {headerRight && (
            <div className='flex items-center gap-2'>{headerRight}</div>
          )}
        </div>
      )}

      {/* Body */}
      <div
        className={cn(
          !noPadding && 'px-6 pb-5',
          !hasHeader && !noPadding && 'pt-5',
        )}
      >
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div className='px-6 py-4 border-t border-border/40'>
          {footer}
        </div>
      )}
    </div>
  )
}
