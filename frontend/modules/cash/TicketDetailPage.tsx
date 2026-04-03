// frontend/modules/cash/TicketDetailPage.tsx
//
// Page route — branche CashModuleShell sur TicketDetailContent.
// Zéro logique propre.

import { useParams } from '@tanstack/react-router'
import { Receipt } from 'lucide-react'
import { CashModuleShell } from './CashModuleShell'
import { TicketDetailContent } from './components/ticket-detail/TicketDetailContent'

export function TicketDetailPage() {
	const { ticketId } = useParams({ from: '/cash/tickets/$ticketId/' })

	return (
		<CashModuleShell
			pageTitle='Détail du ticket'
			pageIcon={Receipt}
			hideSessionActions
			hideBadge
			centerContent={
				<div
					id='ticket-info-portal'
					className='flex items-center w-full max-w-3xl px-4'
				/>
			}
			headerExtras={
				<div id='ticket-actions-portal' className='flex items-center gap-2' />
			}
		>
			<TicketDetailContent
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
