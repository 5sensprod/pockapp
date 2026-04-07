// frontend/modules/cash/components/terminal/cart/PaymentButtons.tsx
// Bouton Encaisser uniquement — la modale gère le choix du moyen de paiement

import { Button } from '@/components/ui/button'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { usePaymentMethods } from '@/lib/queries/payment-methods'
import type { PaymentMethod } from '../types/payment'

interface PaymentButtonsProps {
	totalTtc: number
	cartLength: number
	onPaymentClick: (method: PaymentMethod) => void
	hideMethodButtons?: boolean
}

export function PaymentButtons({
	totalTtc,
	cartLength,
	onPaymentClick,
}: PaymentButtonsProps) {
	const { activeCompanyId } = useActiveCompany()
	const { paymentMethods, isLoading } = usePaymentMethods(activeCompanyId)
	const isDisabled = totalTtc <= 0 || cartLength === 0

	const enabledMethods =
		paymentMethods
			?.filter((m) => m.enabled)
			.sort((a, b) => a.display_order - b.display_order) || []

	const defaultMethod =
		enabledMethods.find((m) => m.accounting_category === 'card') ||
		enabledMethods[0]

	if (isLoading) {
		return (
			<div className='border-t px-4 py-3'>
				<div className='h-11 w-full rounded-md bg-muted animate-pulse' />
			</div>
		)
	}

	return (
		<div className='border-t px-4 py-3'>
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
