// frontend/modules/cash/components/layout/CashPageHeader.tsx
import { Button } from '@/components/ui/button'
import { clearLastRouteForModule } from '@/lib/stores/moduleNavigationStore'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

interface CashPageHeaderProps {
	/** Titre principal (string ou ReactNode pour inclure une icône) */
	title: ReactNode
	/** Sous-titre / description */
	subtitle?: ReactNode
	/**
	 * Callback retour personnalisé.
	 * Par défaut : efface la route mémorisée du module cash et navigue vers /cash.
	 */
	onBack?: () => void
	/** Contenu de la zone droite (boutons, badges, tags…) */
	actions?: ReactNode
}

export function CashPageHeader({
	title,
	subtitle,
	onBack,
	actions,
}: CashPageHeaderProps) {
	const navigate = useNavigate()

	const handleBack = onBack ?? (() => {
		clearLastRouteForModule('cash')
		navigate({ to: '/cash' })
	})

	return (
		<header className='flex items-center justify-between gap-4'>
			{/* Gauche — bouton retour + titre */}
			<div className='flex items-center gap-3'>
				<Button type='button' variant='ghost' size='sm' onClick={handleBack}>
					<ArrowLeft className='h-4 w-4 mr-2' />
					Retour
				</Button>

				<div>
					<h1 className='text-2xl font-semibold tracking-tight flex items-center gap-2'>
						{title}
					</h1>
					{subtitle && (
						<p className='text-sm text-muted-foreground'>{subtitle}</p>
					)}
				</div>
			</div>

			{/* Droite — actions optionnelles */}
			{actions && (
				<div className='flex items-center gap-4 text-xs text-muted-foreground'>
					{actions}
				</div>
			)}
		</header>
	)
}
