// frontend/routes/connect/orders/$orderId/index.tsx
import { OrderDetailPage } from '@/modules/connect/pages/orders/OrderDetailPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/orders/$orderId/')({
	component: OrderDetailPage,
})
