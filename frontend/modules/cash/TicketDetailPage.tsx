// frontend/modules/cash/TicketDetailPage.tsx
//
// Une seule instance de data+actions partagée entre le shell et le contenu.
// Bouton "Envoyer" dans le header → ouvre le dialog dans TicketDialogs ✓

import { useParams } from '@tanstack/react-router'
import { Receipt } from 'lucide-react'
import { CashModuleShell } from './CashModuleShell'
import {
	TicketDetailContentInner,
	useTicketDetailSlots,
} from './components/ticket-detail/TicketDetailContent'

export function TicketDetailPage() {
	const { ticketId } = useParams({ from: '/cash/tickets/$ticketId/' })

	const getDetailRoute = (id: string) => ({
		to: '/cash/tickets/$ticketId' as any,
		params: { ticketId: id } as any,
	})

	// Une seule instanciation — data, actions, et slots header partagés
	const { data, actions, headerLeft, headerRight } = useTicketDetailSlots(
		ticketId,
		'/cash/tickets',
	)

	return (
		<CashModuleShell
			pageTitle='Détail du ticket'
			pageIcon={Receipt}
			hideSessionActions
			hideBadge
			hideTitle
			hideIcon
			headerLeft={headerLeft}
			headerRight={headerRight}
		>
			{/* Même data+actions → les dialogs réagissent aux boutons du header */}
			<TicketDetailContentInner
				invoiceId={ticketId}
				backRoute='/cash/tickets'
				getDetailRoute={getDetailRoute}
				data={data}
				actions={actions}
			/>
		</CashModuleShell>
	)
}
