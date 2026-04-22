// frontend/modules/connect/components/orders/OrderStatusBadge.tsx
//
// Affiche deux badges distincts :
//   1. État commande (manuel) : draft → confirmed → in_progress → delivered
//   2. État paiement (calculé depuis la facture) : unpaid → partial → paid
//
// L'état "billed" PocketBase est transparent pour l'utilisateur —
// il s'affiche comme "Livré" avec le badge paiement approprié.

import { cn } from '@/lib/utils'
import {
	ORDER_PAYMENT_STATUS_COLORS,
	ORDER_PAYMENT_STATUS_LABELS,
	ORDER_STATUS_COLORS,
	ORDER_STATUS_LABELS,
	type OrderPaymentStatus,
	type OrderStatus,
} from '../../types/order'

interface OrderStatusBadgeProps {
	status: OrderStatus
	// État paiement calculé depuis la facture liée (optionnel)
	paymentStatus?: OrderPaymentStatus
	className?: string
}

export function OrderStatusBadge({
	status,
	paymentStatus,
	className,
}: OrderStatusBadgeProps) {
	// "billed" s'affiche comme "delivered" côté commande — transparent pour l'user
	const displayStatus: OrderStatus = status === 'billed' ? 'delivered' : status

	const colors = ORDER_STATUS_COLORS[displayStatus]
	const label = ORDER_STATUS_LABELS[displayStatus]

	return (
		<span className={cn('inline-flex items-center gap-1.5', className)}>
			{/* Badge état commande */}
			<span
				className={cn(
					'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
					colors.bg,
					colors.text,
					colors.border,
				)}
			>
				{label}
			</span>

			{/* Badge état paiement — affiché uniquement si une facture existe */}
			{paymentStatus && paymentStatus !== 'unpaid' && (
				<span
					className={cn(
						'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
						ORDER_PAYMENT_STATUS_COLORS[paymentStatus].bg,
						ORDER_PAYMENT_STATUS_COLORS[paymentStatus].text,
						ORDER_PAYMENT_STATUS_COLORS[paymentStatus].border,
					)}
				>
					{ORDER_PAYMENT_STATUS_LABELS[paymentStatus]}
				</span>
			)}
		</span>
	)
}
