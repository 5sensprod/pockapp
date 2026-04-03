// frontend/modules/cash/components/ticket-detail/TicketDetailHeader.tsx
//
// Gère :
//  - Les portails CashModuleShell (ticket-info-portal, ticket-actions-portal)
//  - La barre d'actions hors-portail (fallback mode facture B2B)
// Encapsule toute la mécanique createPortal pour en libérer TicketDetailPage.

import { Button } from '@/components/ui/button'

import { formatDate } from '@/modules/connect/utils/formatters'
import { useNavigate } from '@tanstack/react-router'
import {
	ArrowLeft,
	Download,
	FileText,
	Loader2,
	Mail,
	Pencil,
	Printer,
	Receipt,
	RotateCcw,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TicketActionsState } from './useTicketActions'
import type { TicketDetailData } from './useTicketDetail'

function getPaymentMethodLabel(invoice: any): string {
	const label = (invoice?.payment_method_label || '').trim()
	if (label) return label
	const map: Record<string, string> = {
		especes: 'Espèces',
		cb: 'Carte bancaire',
		cheque: 'Chèque',
		virement: 'Virement',
		autre: 'Autre',
	}
	return (
		(invoice?.payment_method && map[invoice.payment_method]) ||
		invoice?.payment_method ||
		'-'
	)
}

interface TicketDetailHeaderProps {
	data: TicketDetailData
	actions: TicketActionsState
	backRoute: string
	invoiceId: string
}

export function TicketDetailHeader({
	data,
	actions,
	backRoute,
	invoiceId,
}: TicketDetailHeaderProps) {
	const navigate = useNavigate()
	const { invoice, isTicket, remainingAmount, soldByLabel } = data

	const [infoTarget, setInfoTarget] = useState<HTMLElement | null>(null)
	const [actionsTarget, setActionsTarget] = useState<HTMLElement | null>(null)

	useEffect(() => {
		setInfoTarget(document.getElementById('ticket-info-portal'))
		setActionsTarget(document.getElementById('ticket-actions-portal'))
	}, [])

	if (!invoice) return null

	// ── Bouton retour (mode B2B) ────────────────────────────────────────────────
	const standardRetourContent = !isTicket && (
		<Button
			variant='ghost'
			className='-ml-2 text-muted-foreground'
			onClick={() => navigate({ to: backRoute as any })}
		>
			<ArrowLeft className='h-4 w-4 mr-2' />
			Retour
		</Button>
	)

	// ── Info ticket (portail header gauche) ─────────────────────────────────────
	const ticketInfoContent = isTicket && (
		<div className='flex items-center gap-4 w-full'>
			<Button
				variant='ghost'
				size='sm'
				className='-ml-2 text-muted-foreground hover:text-foreground'
				onClick={() => navigate({ to: backRoute as any })}
			>
				<ArrowLeft className='h-4 w-4 mr-1.5' />
				Retour
			</Button>
			<div className='h-4 w-px bg-border/60 shrink-0' />
			<div className='flex items-center flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground'>
				<span className='font-mono font-medium text-foreground'>
					{invoice.number}
				</span>
				<span className='opacity-40'>•</span>
				<span>{formatDate(invoice.date)}</span>
				<span className='opacity-40'>•</span>
				<span>{soldByLabel}</span>
				{invoice.is_paid && (
					<>
						<span className='opacity-40'>•</span>
						<span>{getPaymentMethodLabel(invoice)}</span>
					</>
				)}
			</div>
		</div>
	)

	// ── Boutons d'action (portail header droit) ─────────────────────────────────
	const actionsContent = (
		<>
			{invoice.status === 'draft' && !isTicket && (
				<Button
					variant='outline'
					onClick={() =>
						navigate({
							to: '/connect/invoices/$invoiceId/edit' as any,
							params: { invoiceId } as any,
						})
					}
				>
					<Pencil className='h-4 w-4 mr-2' />
					Modifier
				</Button>
			)}

			{isTicket &&
				invoice.invoice_type === 'invoice' &&
				invoice.is_paid &&
				!invoice.converted_to_invoice &&
				remainingAmount > 0 && (
					<Button
						variant='outline'
						className='text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-200'
						onClick={() => actions.setRefundTicketDialogOpen(true)}
					>
						<RotateCcw className='h-4 w-4 mr-2' />
						Rembourser
					</Button>
				)}

			{isTicket &&
				invoice.invoice_type !== 'credit_note' &&
				!invoice.converted_to_invoice &&
				remainingAmount > 0 && (
					<Button
						variant='outline'
						onClick={() =>
							navigate({
								to: '/cash/convert-to-invoice/$ticketId' as any,
								params: { ticketId: invoice.id } as any,
							})
						}
					>
						<FileText className='h-4 w-4 mr-2' />
						Convertir en facture
					</Button>
				)}

			<Button
				variant='outline'
				onClick={() => actions.setEmailDialogOpen(true)}
			>
				<Mail className='h-4 w-4 mr-2' />
				Envoyer
			</Button>

			{isTicket && (
				<>
					<Button
						variant='outline'
						disabled={actions.isPreviewing}
						onClick={() => actions.previewTicket(invoice as any)}
					>
						{actions.isPreviewing ? (
							<Loader2 className='h-4 w-4 animate-spin mr-2' />
						) : (
							<Receipt className='h-4 w-4 mr-2' />
						)}
						Aperçu ticket
					</Button>

					{actions.isPrinterConfigured && (
						<Button
							variant='outline'
							disabled={actions.isPrinting}
							onClick={() => actions.reprintTicket(invoice as any)}
						>
							{actions.isPrinting ? (
								<Loader2 className='h-4 w-4 animate-spin mr-2' />
							) : (
								<Printer className='h-4 w-4 mr-2' />
							)}
							Réimprimer
						</Button>
					)}
				</>
			)}

			<Button
				onClick={
					isTicket
						? actions.handleDownloadTicketHtml
						: actions.handleDownloadPdf
				}
				disabled={actions.isDownloading}
			>
				{actions.isDownloading ? (
					<Loader2 className='h-4 w-4 animate-spin mr-2' />
				) : (
					<Download className='h-4 w-4 mr-2' />
				)}
				Télécharger
			</Button>
		</>
	)

	// ── Rendu : portails si disponibles, fallback inline sinon ──────────────────
	return (
		<>
			{!actionsTarget && (
				<div className='flex items-center justify-between gap-3 mb-6'>
					{!isTicket && standardRetourContent}
					<div className='flex items-center gap-2'>{actionsContent}</div>
				</div>
			)}
			{actionsTarget && createPortal(actionsContent, actionsTarget)}
			{infoTarget &&
				ticketInfoContent &&
				createPortal(ticketInfoContent, infoTarget)}
		</>
	)
}
