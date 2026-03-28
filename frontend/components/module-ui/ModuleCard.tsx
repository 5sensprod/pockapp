// frontend/components/module-ui/ModuleCard.tsx
//
// Tokens Stitch :
//   Card bg        → bg-card  (blanc pur sur fond surface #F9F9FF → contraste visible)
//   Ghost border   → border border-border/50
//   Featured       → border-l-[3px] border-l-primary
//   Hover border   → hover:border-border
//   Icon container → bg-primary/8 text-primary (indigo-50 Stitch)
//
// a11y : onClick + onKeyDown — Biome useKeyWithClickEvents

import { cn } from '@/lib/utils'
import type { KeyboardEvent, ReactNode } from 'react'

interface ModuleCardProps {
	title?: string
	icon?: React.ComponentType<{ className?: string }>
	headerRight?: ReactNode
	children: ReactNode
	footer?: ReactNode
	featured?: boolean
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

	const handleKeyDown = onClick
		? (e: KeyboardEvent<HTMLDivElement>) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault()
					onClick()
				}
			}
		: undefined

	return (
		<div
			role={onClick ? 'button' : undefined}
			tabIndex={onClick ? 0 : undefined}
			onClick={onClick}
			onKeyDown={handleKeyDown}
			className={cn(
				// Fond blanc pur sur surface → lift tonal perceptible (principe Stitch)
				// bg-card (blanc pur) sur fond surface-container-low → lift tonal Stitch
				'relative bg-card rounded-xl',
				// Ghost border "felt not seen" + ambient shadow subtile
				'border border-border/60 shadow-[0_1px_4px_0_rgba(19,27,46,0.06)]',
				'transition-all duration-200',
				featured && 'border-l-[3px] border-l-primary',
				onClick && [
					'cursor-pointer',
					'hover:shadow-[0_4px_12px_0_rgba(19,27,46,0.10)] hover:-translate-y-px',
					'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
				],
				className,
			)}
		>
			{hasHeader && (
				<div
					className={cn(
						'flex items-center justify-between',
						noPadding ? 'px-6 pt-5 pb-4' : 'px-6 pt-5 pb-3',
					)}
				>
					<div className='flex items-center gap-3'>
						{Icon && (
							<div className='w-10 h-10 rounded-lg bg-primary/8 flex items-center justify-center shrink-0'>
								<Icon className='h-5 w-5 text-primary' />
							</div>
						)}
						{title && (
							<h3 className='text-[15px] font-medium text-foreground leading-tight tracking-tight'>
								{title}
							</h3>
						)}
					</div>
					{headerRight && (
						<div className='flex items-center gap-2'>{headerRight}</div>
					)}
				</div>
			)}

			<div
				className={cn(
					!noPadding && 'px-6 pb-5',
					!hasHeader && !noPadding && 'pt-5',
				)}
			>
				{children}
			</div>

			{footer && (
				<div className='px-6 py-4 border-t border-border/40 rounded-b-xl'>
					{footer}
				</div>
			)}
		</div>
	)
}
