// frontend/components/module-ui/EmptyState.tsx
//
// Tokens Stitch → variables shadcn :
//   surface-container-low   → bg-muted       (fond card inline)
//   surface-container       → bg-muted/60    (cercle icône)
//   outline-variant/15      → border-border/40
//   on-surface/60           → text-muted-foreground
//   primary CTA             → bg-primary text-primary-foreground
//   secondary CTA           → bg-secondary text-secondary-foreground
//   touch target min 44px   → h-11 (Stitch : Tablet/POS compatibility)

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface EmptyStateAction {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
}

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  actions?: EmptyStateAction[]
  /** Centré verticalement dans la zone de contenu (pleine page) */
  fullPage?: boolean
  className?: string
  /** Contenu additionnel entre description et actions */
  children?: ReactNode
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actions = [],
  fullPage = false,
  className,
  children,
}: EmptyStateProps) {
  const content = (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        fullPage ? 'py-16 px-8' : 'p-8',
        className,
      )}
    >
      {/* Cercle icône */}
      <div className='w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-6'>
        <Icon className='h-7 w-7 text-muted-foreground' />
      </div>

      <h3 className='text-base font-medium text-foreground mb-2'>{title}</h3>

      {description && (
        <p className='text-sm text-muted-foreground max-w-xs leading-relaxed mb-6'>
          {description}
        </p>
      )}

      {children}

      {actions.length > 0 && (
        <div className='flex items-center gap-3 mt-6'>
          {actions.map((action) => (
            <button
              key={action.label}
              type='button'
              onClick={action.onClick}
              className={cn(
                // Touch target 44px (Stitch : Tablet/POS compatibility)
                'h-11 px-6 rounded-md text-sm font-medium transition-all active:scale-95',
                action.variant === 'secondary'
                  ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  if (fullPage) {
    return (
      <div className='flex-1 flex items-center justify-center'>
        {content}
      </div>
    )
  }

  // Mode inline : card avec ghost border
  return (
    <div className='w-full max-w-md mx-auto rounded-lg bg-muted/40 border border-border/40'>
      {content}
    </div>
  )
}
