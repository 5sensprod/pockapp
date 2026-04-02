// frontend/modules/cash/components/reports/TicketDetailPage.tsx
import { InvoiceDetailContent } from '@/modules/connect/components/InvoiceDetailContent'
import { useParams } from '@tanstack/react-router'

export function TicketDetailPage() {
	const { ticketId } = useParams({ from: '/cash/tickets/$ticketId/' })

	return (
		<InvoiceDetailContent
			invoiceId={ticketId}
			backRoute='/cash/tickets'
			getDetailRoute={(id: string) => ({
				to: '/cash/tickets/$ticketId' as any,
				params: { ticketId: id } as any,
			})}
		/>
	)
}
