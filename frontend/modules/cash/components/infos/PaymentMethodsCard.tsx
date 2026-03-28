// frontend/modules/cash/components/infos/PaymentMethodsCard.tsx
//
// Layout Stitch : grille de tuiles icône + label + statut dot
// Pas de liste — tuiles cliquables centrées style "payment tile"

import { ModuleCard } from '@/components/module-ui'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { usePaymentMethods } from '@/lib/queries/payment-methods'
import { cn } from '@/lib/utils'
import {
	ArrowRightLeft,
	Banknote,
	CreditCard,
	Plus,
	Receipt,
} from 'lucide-react'
import * as React from 'react'
import { PaymentMethodsManager } from '../payment-methods/PaymentMethodsManager'

export function PaymentMethodsCard() {
	const { activeCompanyId } = useActiveCompany()
	const { paymentMethods, isLoading } = usePaymentMethods(activeCompanyId)
	const [showManager, setShowManager] = React.useState(false)

	const iconMap: Record<string, React.ComponentType<any>> = {
		CreditCard,
		Banknote,
		Receipt,
		ArrowRightLeft,
	}

	// Sous-titre dynamique avec les noms des méthodes
	const subtitle = paymentMethods?.length
		? paymentMethods
				.slice(0, 3)
				.map((m) => m.name)
				.join(', ') + (paymentMethods.length > 3 ? '…' : '')
		: undefined

	const headerRight = (
		<button
			type='button'
			onClick={() => setShowManager(true)}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') setShowManager(true)
			}}
			className='text-[11px] font-medium text-primary hover:underline transition-colors'
		>
			Gérer tout
		</button>
	)

	return (
		<>
			<ModuleCard
				icon={CreditCard}
				title='Moyens de paiement'
				headerRight={headerRight}
			>
				{/* Sous-titre méthodes */}
				{subtitle && (
					<p className='text-[10px] uppercase tracking-wider text-muted-foreground -mt-2 mb-4'>
						{subtitle}
					</p>
				)}

				{isLoading ? (
					<div className='text-xs text-muted-foreground py-4 text-center'>
						Chargement...
					</div>
				) : (
					<div className='flex flex-wrap gap-2'>
						{paymentMethods?.map((method) => {
							const IconComponent = iconMap[method.icon] || Receipt
							return (
								<button
									key={method.id}
									type='button'
									onClick={() => setShowManager(true)}
									onKeyDown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') setShowManager(true)
									}}
									className={cn(
										'group flex flex-col items-center gap-1.5 py-3 w-24 rounded-lg text-center shrink-0',
										'bg-muted/30 border border-border/20',
										'hover:bg-card hover:shadow-sm hover:border-border/40 transition-all',
										!method.enabled && 'opacity-40 grayscale',
									)}
								>
									{/* Icône — fond neutre, couleur en tinte légère */}
									<div className='w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0'>
										<IconComponent className='h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors' />
									</div>

									{/* Nom */}
									<span className='text-xs font-medium text-foreground leading-tight group-hover:text-primary transition-colors'>
										{method.name}
									</span>

									{/* Dot statut */}
									<span
										className={cn(
											'h-1.5 w-1.5 rounded-full',
											method.enabled
												? 'bg-emerald-500'
												: 'bg-muted-foreground/40',
										)}
									/>
								</button>
							)
						})}

						{/* Tuile "Ajouter" */}
						<button
							type='button'
							onClick={() => setShowManager(true)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') setShowManager(true)
							}}
							className={cn(
								'group flex flex-col items-center gap-2 p-4 rounded-lg text-center',
								'bg-background border border-dashed border-border/30',
								'hover:bg-card hover:border-primary/30 transition-all',
							)}
						>
							<div className='w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center'>
								<Plus className='h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors' />
							</div>
							<span className='text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors'>
								Ajouter
							</span>
							<span className='h-1.5 w-1.5' /> {/* spacer alignement */}
						</button>
					</div>
				)}

				{paymentMethods?.length === 0 && !isLoading && (
					<div className='text-xs text-muted-foreground text-center py-4'>
						Aucun moyen de paiement configuré
					</div>
				)}
			</ModuleCard>

			<PaymentMethodsManager open={showManager} onOpenChange={setShowManager} />
		</>
	)
}
