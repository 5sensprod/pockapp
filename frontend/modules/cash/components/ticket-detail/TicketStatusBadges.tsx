// frontend/modules/cash/components/ticket-detail/TicketStatusBadges.tsx
//
// Affiche les badges de statut d'un ticket ou d'une facture.
// Entrée : flags sémantiques. Sortie : fragments de badges.

import { Badge, type BadgeProps } from '@/components/ui/badge'
import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { AlertTriangle, CheckCircle, RefreshCcw } from 'lucide-react'

interface TicketStatusBadgesProps {
	invoice: InvoiceResponse
	isCreditNote: boolean
	isDeposit: boolean
	overdue: boolean
	displayStatus: { label: string; variant?: string; isPaid: boolean }
}

export function TicketStatusBadges({
	invoice,
	isCreditNote,
	isDeposit,
	overdue,
	displayStatus,
}: TicketStatusBadgesProps) {
	const badgeVariant = (displayStatus.variant ?? 'outline') as BadgeProps['variant']

	if (isCreditNote) {
		return (
			<>
				<Badge variant={badgeVariant}>{displayStatus.label}</Badge>
				<Badge className='bg-blue-600 hover:bg-blue-600'>
					<RefreshCcw className='h-3 w-3 mr-1' />
					Remboursé
				</Badge>
			</>
		)
	}

	if (isDeposit) {
		return (
			<>
				<Badge variant={badgeVariant}>{displayStatus.label}</Badge>
				{invoice.is_paid && (
					<Badge className='bg-emerald-600 hover:bg-emerald-600'>
						<CheckCircle className='h-3 w-3 mr-1' />
						Réglé
					</Badge>
				)}
				{(invoice as any).has_credit_note && (
					<Badge className='bg-red-600 hover:bg-red-600'>
						<RefreshCcw className='h-3 w-3 mr-1' />
						Remboursé
					</Badge>
				)}
			</>
		)
	}

	const statusLabel = displayStatus.label
	const showStatusBadge = statusLabel && statusLabel !== 'Payée'

	return (
		<>
			{showStatusBadge && <Badge variant={badgeVariant}>{statusLabel}</Badge>}
			{invoice.is_paid || displayStatus.isPaid ? (
				<Badge className='bg-emerald-600 hover:bg-emerald-600'>
					<CheckCircle className='h-3 w-3 mr-1' />
					Payée
				</Badge>
			) : overdue ? (
				<Badge className='bg-amber-600 hover:bg-amber-600'>
					<AlertTriangle className='h-3 w-3 mr-1' />
					En retard
				</Badge>
			) : (
				<Badge variant='secondary'>Non payée</Badge>
			)}
		</>
	)
}
