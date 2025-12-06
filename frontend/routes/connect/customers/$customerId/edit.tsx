import { CustomerEditPage } from '@/modules/connect/components/CustomerEditPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/customers/$customerId/edit')({
	component: CustomerEditPage,
})
