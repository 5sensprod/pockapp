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
			hideBadge // <-- On masque le badge et l'heure ici !
			// Portail pour les informations générales et le bouton retour
			centerContent={
				<div
					id='ticket-info-portal'
					className='flex items-center w-full max-w-3xl px-4'
				/>
			}
			// Portail pour les actions (Télécharger, etc.)
			headerExtras={
				<div id='ticket-actions-portal' className='flex items-center gap-2' />
			}
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
