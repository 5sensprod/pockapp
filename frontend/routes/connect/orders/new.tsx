// frontend/routes/connect/orders/new.tsx
import { OrderCreatePage } from '@/modules/connect/pages/orders/OrderCreatePage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/orders/new')({
	component: OrderCreatePage,
})
