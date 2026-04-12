// frontend/modules/connect/components/orders/OrderStatusBadge.tsx

import { cn } from '@/lib/utils'
import {
	ORDER_STATUS_COLORS,
	ORDER_STATUS_LABELS,
	type OrderStatus,
} from '../../types/order'

interface OrderStatusBadgeProps {
	status: OrderStatus
	className?: string
}

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
	const colors = ORDER_STATUS_COLORS[status]
	return (
		<span
			className={cn(
				'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
				colors.bg,
				colors.text,
				colors.border,
				className,
			)}
		>
			{ORDER_STATUS_LABELS[status]}
		</span>
	)
}
