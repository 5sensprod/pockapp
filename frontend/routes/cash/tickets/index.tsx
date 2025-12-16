import { TicketsPage } from '@/modules/cash/components/TicketsPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/cash/tickets/')({
	component: TicketsPage,
})
