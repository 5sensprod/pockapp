// frontend/modules/cash/components/ticket-detail/TicketDetailContent.tsx
//
// Orchestrateur du détail ticket — remplace InvoiceDetailContent dans le module cash.
//
// Responsabilité : composer les sous-composants.
// Zéro logique métier, zéro state propre.
// Les données viennent de useTicketDetail, les actions de useTicketActions.

import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { TicketDetailHeader } from './TicketDetailHeader'
import { TicketDialogs } from './TicketDialogs'
import { TicketInfoCard } from './TicketInfoCard'
import { TicketItemsTable } from './TicketItemsTable'
import { useTicketActions } from './useTicketActions'
import { useTicketDetail } from './useTicketDetail'

export interface TicketDetailContentProps {
	invoiceId: string
	backRoute: string
	getDetailRoute?: (
		id: string,
		isTicket?: boolean,
	) => { to: string; params: Record<string, string> }
}

function defaultDetailRoute(id: string) {
	return { to: '/connect/invoices/$invoiceId', params: { invoiceId: id } }
}

export function TicketDetailContent({
	invoiceId,
	backRoute,
	getDetailRoute = defaultDetailRoute,
}: TicketDetailContentProps) {
	const navigate = useNavigate()
	const data = useTicketDetail(invoiceId)
	const actions = useTicketActions(data.invoice, data.company)

	// ── États de chargement ────────────────────────────────────────────────────
	if (data.isLoading) {
		return (
			<div className='container mx-auto px-6 py-8 flex items-center justify-center'>
				<Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
			</div>
		)
	}

	if (!data.invoice) {
		return (
			<div className='container mx-auto px-6 py-8'>
				<div className='text-muted-foreground'>Document introuvable</div>
				<Button
					variant='outline'
					className='mt-4'
					onClick={() => navigate({ to: backRoute as any })}
				>
					<ArrowLeft className='h-4 w-4 mr-2' />
					Retour
				</Button>
			</div>
		)
	}

	// ── Rendu principal ────────────────────────────────────────────────────────
	return (
		<div className='container mx-auto px-6 py-6'>
			<TicketDetailHeader
				data={data}
				actions={actions}
				backRoute={backRoute}
				invoiceId={invoiceId}
			/>

			<div className='grid grid-cols-1 lg:grid-cols-12 gap-6'>
				<TicketInfoCard
					data={data}
					actions={actions}
					getDetailRoute={getDetailRoute}
				/>

				<TicketItemsTable
					invoice={data.invoice}
					discounts={data.discounts}
					vatBreakdown={data.vatBreakdown}
					isTicket={data.isTicket}
					needsTicketSidebar={data.needsTicketSidebar}
				/>
			</div>

			<TicketDialogs invoice={data.invoice} actions={actions} />
		</div>
	)
}
