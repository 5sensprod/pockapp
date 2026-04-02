// frontend/components/module-ui/StatusBadge.tsx
//
// Tokens Stitch → variables shadcn :
//   Couleurs sémantiques (open/closed/warning/error/info)
//   conservées en hex car shadcn n'a pas d'équivalents directs
//   pour les états métier — on utilise des valeurs fixes légères
//   qui restent cohérentes avec la palette shadcn en mode clair/sombre.

import { cn } from '@/lib/utils'

export type StatusVariant = 'open' | 'closed' | 'warning' | 'error' | 'info'

const variantStyles: Record<
	StatusVariant,
	{ pill: string; dot: string; pulse: boolean }
> = {
	open: {
		pill: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
		dot: 'bg-emerald-500',
		pulse: true,
	},
	closed: {
		pill: 'bg-muted text-muted-foreground',
		dot: 'bg-muted-foreground/40',
		pulse: false,
	},
	warning: {
		pill: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
		dot: 'bg-amber-500',
		pulse: false,
	},
	error: {
		pill: 'bg-destructive/10 text-destructive',
		dot: 'bg-destructive',
		pulse: false,
	},
	info: {
		pill: 'bg-primary/10 text-primary',
		dot: 'bg-primary',
		pulse: false,
	},
}

interface StatusBadgeProps {
	label: string
	variant: StatusVariant
	/** Ligne secondaire optionnelle (ex : date du jour) */
	sublabel?: string
	className?: string
}

export function StatusBadge({
	label,
	variant,
	sublabel,
	className,
}: StatusBadgeProps) {
	const styles = variantStyles[variant]

	// Avec sublabel → affichage vertical (style module_shell_full_cash Stitch)
	if (sublabel) {
		return (
			<div className={cn('flex flex-col items-end gap-0.5', className)}>
				{/* 1. Point et Label : Toujours visible, pas de retour à la ligne */}
				<div className='flex items-center gap-1.5 whitespace-nowrap'>
					<span
						className={cn(
							'w-2 h-2 rounded-full shrink-0',
							styles.dot,
							styles.pulse && 'animate-pulse',
						)}
					/>
					<span className='text-xs font-medium text-foreground'>{label}</span>
				</div>

				{/* 2. Sublabel (Heure/Date) : Toujours visible, pas de retour à la ligne */}
				<span className='text-xs text-muted-foreground whitespace-nowrap'>
					{sublabel}
				</span>
			</div>
		)
	}

	// Sans sublabel → pill compacte (style module_shell_with_badge Stitch)
	return (
		<div
			className={cn(
				'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap',
				styles.pill,
				className,
			)}
		>
			<span
				className={cn(
					'w-2 h-2 rounded-full shrink-0',
					styles.dot,
					styles.pulse && 'animate-pulse',
				)}
			/>
			<span>{label}</span>
		</div>
	)
}
