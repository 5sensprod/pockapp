// frontend/routes/connect/orders/$orderId/edit.tsx
import { OrderEditPage } from '@/modules/connect/pages/orders/OrderEditPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/orders/$orderId/edit')({
	component: OrderEditPage,
})
