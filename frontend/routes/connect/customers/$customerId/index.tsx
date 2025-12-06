// frontend/routes/connect/customers/$customerId/index.tsx
import { CustomerDetailPage } from '@/modules/connect/components/CustomerDetailPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/customers/$customerId/')({
	component: CustomerDetailPage,
})
