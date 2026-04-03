// frontend/modules/cash/components/ticket-detail/TicketDetailHeader.tsx
//
// Retourne headerLeft + headerRight pour CashModuleShell.
//
// headerLeft — affiché après le titre "DÉTAIL DU TICKET" dans ModulePageShell :
//   Ligne 1 : numéro ticket (monospace, fort)
//   Ligne 2 : date · vendeur · moyen de paiement (secondaire)
//
// headerRight — boutons d'action :
//   Convertir en facture (conditionnel, visible)
//   Rembourser           (conditionnel, visible orange)
//   Actions ▾            (dropdown : Envoyer, Aperçu, Réimprimer, Modifier)
//   Télécharger          (toujours visible, primaire)

import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatDate } from '@/modules/connect/utils/formatters'
import { useNavigate } from '@tanstack/react-router'
import {
	ArrowLeft,
	ChevronDown,
	Download,
	FileText,
	Loader2,
	Mail,
	Pencil,
	Printer,
	Receipt,
	RotateCcw,
} from 'lucide-react'
import type { TicketActionsState } from './useTicketActions'
import type { TicketDetailData } from './useTicketDetail'

function getPaymentMethodLabel(invoice: any): string {
	const label = (invoice?.payment_method_label || '').trim()
	if (label) return label
	const map: Record<string, string> = {
		especes: 'Espèces',
		cb: 'CB',
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

interface TicketHeaderSlots {
	headerLeft: React.ReactNode
	headerRight: React.ReactNode
}

interface TicketDetailHeaderProps {
	data: TicketDetailData
	actions: TicketActionsState
	backRoute: string
	invoiceId: string
}

export function useTicketDetailHeader({
	data,
	actions,
	backRoute,
	invoiceId,
}: TicketDetailHeaderProps): TicketHeaderSlots {
	const navigate = useNavigate()
	const { invoice, isTicket, remainingAmount, soldByLabel } = data

	if (!invoice) return { headerLeft: null, headerRight: null }

	// ── headerLeft : bouton retour + bloc infos ticket sur 2 lignes ─────────
	const headerLeft = (
		<div className='flex items-center gap-3 min-w-0'>
			{/* Bouton retour */}
			<Button
				variant='ghost'
				size='sm'
				className='-ml-1 text-muted-foreground hover:text-foreground shrink-0'
				onClick={() => navigate({ to: backRoute as any })}
			>
				<ArrowLeft className='h-4 w-4 mr-1.5' />
				Retour
			</Button>

			{isTicket && (
				<>
					<div className='h-8 w-px bg-border/50 shrink-0' />
					<div className='flex flex-col min-w-0 flex-1'>
						<span className='font-mono font-semibold text-[15px] text-foreground leading-tight truncate'>
							{invoice.number}
						</span>
						<div className='flex items-center gap-1.5 text-[12px] text-muted-foreground leading-tight mt-0.5 overflow-hidden'>
							<span className='shrink-0'>{formatDate(invoice.date)}</span>
							<span className='opacity-40 shrink-0'>·</span>
							<span className='shrink-0'>
								{new Date(invoice.created).toLocaleTimeString('fr-FR', {
									hour: '2-digit',
									minute: '2-digit',
								})}
							</span>
							{soldByLabel && soldByLabel !== '-' && (
								<>
									<span className='opacity-40 shrink-0'>·</span>
									<span className='truncate'>{soldByLabel}</span>
								</>
							)}
							{invoice.is_paid && (
								<>
									<span className='opacity-40 shrink-0'>·</span>
									<span className='truncate'>
										{getPaymentMethodLabel(invoice)}
									</span>
								</>
							)}
						</div>
					</div>
				</>
			)}
		</div>
	)

	// ── headerRight : actions contextuelles ─────────────────────────────────
	const secondaryItems: React.ReactNode[] = []

	if (invoice.status === 'draft' && !isTicket) {
		secondaryItems.push(
			<DropdownMenuItem
				key='modifier'
				onClick={() =>
					navigate({
						to: '/connect/invoices/$invoiceId/edit' as any,
						params: { invoiceId } as any,
					})
				}
			>
				<Pencil className='h-4 w-4 mr-2' />
				Modifier
			</DropdownMenuItem>,
		)
	}

	secondaryItems.push(
		<DropdownMenuItem
			key='envoyer'
			onClick={() => actions.setEmailDialogOpen(true)}
		>
			<Mail className='h-4 w-4 mr-2' />
			Envoyer par email
		</DropdownMenuItem>,
	)

	if (isTicket) {
		secondaryItems.push(
			<DropdownMenuItem
				key='apercu'
				disabled={actions.isPreviewing}
				onClick={() => actions.previewTicket(invoice as any)}
			>
				{actions.isPreviewing ? (
					<Loader2 className='h-4 w-4 mr-2 animate-spin' />
				) : (
					<Receipt className='h-4 w-4 mr-2' />
				)}
				Aperçu ticket
			</DropdownMenuItem>,
		)

		if (actions.isPrinterConfigured) {
			secondaryItems.push(
				<DropdownMenuSeparator key='sep-print' />,
				<DropdownMenuItem
					key='reimprimer'
					disabled={actions.isPrinting}
					onClick={() => actions.reprintTicket(invoice as any)}
				>
					{actions.isPrinting ? (
						<Loader2 className='h-4 w-4 mr-2 animate-spin' />
					) : (
						<Printer className='h-4 w-4 mr-2' />
					)}
					Réimprimer
				</DropdownMenuItem>,
			)
		}
	}

	const headerRight = (
		<div className='flex items-center gap-1.5'>
			{/* Convertir en facture */}
			{isTicket &&
				invoice.invoice_type !== 'credit_note' &&
				!invoice.converted_to_invoice &&
				remainingAmount > 0 && (
					<Button
						variant='outline'
						size='sm'
						title='Convertir en facture'
						onClick={() =>
							navigate({
								to: '/cash/convert-to-invoice/$ticketId' as any,
								params: { ticketId: invoice.id } as any,
							})
						}
						className='gap-1.5'
					>
						<FileText className='h-4 w-4 shrink-0' />
						<span className='hidden lg:inline'>Convertir en facture</span>
					</Button>
				)}

			{/* Rembourser */}
			{isTicket &&
				invoice.invoice_type === 'invoice' &&
				invoice.is_paid &&
				!invoice.converted_to_invoice &&
				remainingAmount > 0 && (
					<Button
						variant='outline'
						size='sm'
						title='Rembourser'
						className='text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-200 gap-1.5'
						onClick={() => actions.setRefundTicketDialogOpen(true)}
					>
						<RotateCcw className='h-4 w-4 shrink-0' />
						<span className='hidden lg:inline'>Rembourser</span>
					</Button>
				)}

			{/* Actions secondaires — dropdown */}
			{secondaryItems.length > 0 && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant='outline'
							size='sm'
							title="Plus d'actions"
							className='gap-1.5'
						>
							<ChevronDown className='h-4 w-4 shrink-0' />
							<span className='hidden lg:inline'>Actions</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align='end' className='w-48'>
						{secondaryItems}
					</DropdownMenuContent>
				</DropdownMenu>
			)}

			{/* Télécharger */}
			<Button
				size='sm'
				title='Télécharger'
				onClick={
					isTicket
						? actions.handleDownloadTicketHtml
						: actions.handleDownloadPdf
				}
				disabled={actions.isDownloading}
				className='gap-1.5'
			>
				{actions.isDownloading ? (
					<Loader2 className='h-4 w-4 animate-spin shrink-0' />
				) : (
					<Download className='h-4 w-4 shrink-0' />
				)}
				<span className='hidden lg:inline'>Télécharger</span>
			</Button>
		</div>
	)

	return { headerLeft, headerRight }
}
