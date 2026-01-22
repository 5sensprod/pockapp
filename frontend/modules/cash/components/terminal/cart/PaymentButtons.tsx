// frontend/modules/cash/components/terminal/cart/PaymentButtons.tsx
// ✅ NOUVELLE VERSION - Charge les moyens depuis l'API

import { Button } from '@/components/ui/button'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { usePaymentMethods } from '@/lib/queries/payment-methods'
import {
	ArrowRightLeft,
	Banknote,
	CreditCard,
	DollarSign,
	Gift,
	Receipt,
	Ticket,
} from 'lucide-react'
import type { PaymentMethod } from '../types/payment'

interface PaymentButtonsProps {
	totalTtc: number
	cartLength: number
	onPaymentClick: (method: PaymentMethod) => void
}

// Mapping des icônes
const iconMap: Record<string, any> = {
	Banknote,
	CreditCard,
	Receipt,
	ArrowRightLeft,
	DollarSign,
	Gift,
	Ticket,
}

export function PaymentButtons({
	totalTtc,
	cartLength,
	onPaymentClick,
}: PaymentButtonsProps) {
	const { activeCompanyId } = useActiveCompany()
	const { paymentMethods, isLoading } = usePaymentMethods(activeCompanyId)

	const isDisabled = totalTtc <= 0 || cartLength === 0

	// Filtrer et trier les moyens actifs
	const enabledMethods =
		paymentMethods
			?.filter((m) => m.enabled)
			.sort((a, b) => a.display_order - b.display_order) || []

	// Moyen par défaut pour le gros bouton "Encaisser"
	const defaultMethod =
		enabledMethods.find((m) => m.accounting_category === 'card') ||
		enabledMethods[0]

	if (isLoading) {
		return (
			<div className='border-t px-4 py-4'>
				<div className='mb-3 text-center text-sm text-muted-foreground'>
					Chargement des moyens de paiement...
				</div>
			</div>
		)
	}

	if (!enabledMethods.length) {
		return (
			<div className='border-t px-4 py-4'>
				<div className='mb-3 text-center text-sm text-red-500'>
					Aucun moyen de paiement actif
				</div>
			</div>
		)
	}

	// Afficher maximum 6 boutons (3 par ligne × 2 lignes)
	const displayedMethods = enabledMethods.slice(0, 6)

	return (
		<div className='border-t px-4 py-4'>
			{/* Boutons moyens de paiement */}
			<div className='mb-3 grid grid-cols-3 gap-2 text-xs'>
				{displayedMethods.map((method) => {
					const IconComponent = iconMap[method.icon || 'Receipt'] || Receipt

					return (
						<Button
							key={method.id}
							type='button'
							variant='outline'
							className='h-10 flex-col gap-0.5 p-1'
							onClick={() => onPaymentClick(method)}
							disabled={isDisabled}
							style={{
								borderColor: method.color || '#e2e8f0',
							}}
						>
							<IconComponent className='h-4 w-4' />
							<span className='text-[10px] leading-tight truncate max-w-full'>
								{method.name}
							</span>
						</Button>
					)
				})}
			</div>

			{/* Gros bouton principal "Encaisser" */}
			<Button
				type='button'
				className='h-11 w-full text-sm font-semibold'
				disabled={isDisabled || !defaultMethod}
				onClick={() => defaultMethod && onPaymentClick(defaultMethod)}
			>
				Encaisser {totalTtc > 0 ? `${totalTtc.toFixed(2)} €` : ''}
			</Button>
		</div>
	)
}
