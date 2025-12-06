import { CustomerCreatePage } from '@/modules/connect/components/CustomerCreatePage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/customers/new')({
	component: CustomerCreatePage,
})
