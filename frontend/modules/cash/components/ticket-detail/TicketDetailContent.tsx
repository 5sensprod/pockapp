// frontend/modules/cash/components/ticket-detail/TicketDetailContent.tsx
//
// Orchestrateur — une seule instance de useTicketDetail + useTicketActions.
// Les slots header sont exposés via useTicketDetailSlots pour que TicketDetailPage
// les passe au CashModuleShell — même instance, zéro désynchronisation.

import { Button } from '@/components/ui/button'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useTicketDetailHeader } from './TicketDetailHeader'
import { TicketDialogs } from './TicketDialogs'
import { TicketInfoCard } from './TicketInfoCard'
import { TicketItemsTable } from './TicketItemsTable'
import { useTicketActions } from './useTicketActions'
import type { TicketActionsState } from './useTicketActions'
import { useTicketDetail } from './useTicketDetail'
import type { TicketDetailData } from './useTicketDetail'

export interface TicketDetailContentProps {
	invoiceId: string
	backRoute: string
	getDetailRoute?: (
		id: string,
		isTicket?: boolean,
	) => { to: string; params: Record<string, string> }
}

export interface TicketDetailHeaderSlots {
	headerLeft: React.ReactNode
	headerRight: React.ReactNode
}

function defaultDetailRoute(id: string) {
	return { to: '/connect/invoices/$invoiceId', params: { invoiceId: id } }
}

// ── Hook public — utilisé par TicketDetailPage pour alimenter le shell ────────
//
// Retourne les slots ET les instances data/actions partagées.
// TicketDetailPage passe headerLeft/headerRight au CashModuleShell,
// puis passe data+actions à TicketDetailContent via props pour éviter
// un double appel aux hooks.

export interface TicketDetailSlots extends TicketDetailHeaderSlots {
	data: TicketDetailData
	actions: TicketActionsState
}

export function useTicketDetailSlots(
	invoiceId: string,
	backRoute: string,
): TicketDetailSlots {
	const data = useTicketDetail(invoiceId)
	const actions = useTicketActions(data.invoice, data.company)
	const { headerLeft, headerRight } = useTicketDetailHeader({
		data,
		actions,
		backRoute,
		invoiceId,
	})
	return { data, actions, headerLeft, headerRight }
}

// ── Composant — reçoit data+actions depuis la page (pas de double instanciation) ─

interface TicketDetailContentInnerProps extends TicketDetailContentProps {
	data: TicketDetailData
	actions: TicketActionsState
}

function TicketDetailContentInner({
	backRoute,
	getDetailRoute = defaultDetailRoute,
	data,
	actions,
}: TicketDetailContentInnerProps) {
	const navigate = useNavigate()

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

	return (
		<div className='container mx-auto px-6 py-6'>
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

// ── Export principal — autonome (usage sans TicketDetailPage) ─────────────────

export function TicketDetailContent({
	invoiceId,
	backRoute,
	getDetailRoute = defaultDetailRoute,
}: TicketDetailContentProps) {
	const data = useTicketDetail(invoiceId)
	const actions = useTicketActions(data.invoice, data.company)

	return (
		<TicketDetailContentInner
			invoiceId={invoiceId}
			backRoute={backRoute}
			getDetailRoute={getDetailRoute}
			data={data}
			actions={actions}
		/>
	)
}

// Export interne pour TicketDetailPage
export { TicketDetailContentInner }
