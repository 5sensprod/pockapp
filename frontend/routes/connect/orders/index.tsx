// frontend/routes/connect/orders/index.tsx
import { OrdersPage } from '@/modules/connect/pages/orders/OrdersPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/orders/')({
	component: OrdersPage,
})
