import { CustomerCreatePage } from '@/modules/connect/pages/customers/CustomerCreatePage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/customers/new')({
	component: CustomerCreatePage,
})
