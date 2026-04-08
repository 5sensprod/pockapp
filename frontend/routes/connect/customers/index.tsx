import { CustomersPage } from '@/modules/connect/pages/customers/CustomersPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/customers/')({
	component: CustomersPage,
})
