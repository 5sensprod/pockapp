// frontend/modules/cash/components/reports/TicketDetailPage.tsx

import { InvoiceDetailContent } from '@/modules/connect/components/InvoiceDetailContent'
import { useParams } from '@tanstack/react-router'
import { Receipt } from 'lucide-react'
import { CashModuleShell } from '../../CashModuleShell'

export function TicketDetailPage() {
	const { ticketId } = useParams({ from: '/cash/tickets/$ticketId/' })

	return (
		<CashModuleShell
			pageTitle='Détail du ticket'
			pageIcon={Receipt}
			hideSessionActions
		>
			<InvoiceDetailContent
				invoiceId={ticketId}
				backRoute='/cash/tickets'
				getDetailRoute={(id: string) => ({
					to: '/cash/tickets/$ticketId' as any,
					params: { ticketId: id } as any,
				})}
			/>
		</CashModuleShell>
	)
}
