// frontend/routes/cash/tickets/$ticketId/index.tsx
import { TicketDetailPage } from '@/modules/cash/components/reports/TicketDetailPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/cash/tickets/$ticketId/')({
	component: TicketDetailPage,
})
