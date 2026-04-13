// frontend/modules/connect/pages/invoices/InvoiceDetailHeader.tsx
//
// Retourne headerLeft + headerRight pour ConnectModuleShell.
// Pattern identique à TicketDetailHeader.
//
// headerLeft  — bouton retour + titre + badges statut
// headerRight — boutons contextuels + dropdown Actions

import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { InvoiceResponse } from '@/lib/types/invoice.types'
import {
	canMarkAsPaid,
	canTransitionTo,
	getDisplayStatus,
	isOverdue,
} from '@/lib/types/invoice.types'
import { useNavigate } from '@tanstack/react-router'
import {
	ArrowLeft,
	CheckCircle,
	ChevronDown,
	Download,
	Edit,
	FileText,
	Loader2,
	Mail,
	Receipt,
	RotateCcw,
	Send,
	XCircle,
} from 'lucide-react'
import type { InvoiceActionsState } from '../../hooks/useInvoiceActions'
import type { BadgeProps } from '@/components/ui/badge'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, RefreshCcw } from 'lucide-react'

interface InvoiceDetailHeaderProps {
	invoice: InvoiceResponse
	invoiceId: string
	actions: InvoiceActionsState
	goBack: () => void
	// Pour les badges statut
	isCreditNote: boolean
	isDeposit: boolean
	isTicket: boolean
	remainingAmount: number
	hasCancellationCreditNote: boolean
}

interface HeaderSlots {
	headerLeft: React.ReactNode
	headerRight: React.ReactNode
}

export function useInvoiceDetailHeader({
	invoice,
	invoiceId,
	actions,
	goBack,
	isCreditNote,
	isDeposit,
	isTicket,
	remainingAmount,
	hasCancellationCreditNote,
}: InvoiceDetailHeaderProps): HeaderSlots {
	const navigate = useNavigate()

	const displayStatus = getDisplayStatus(invoice)
	const badgeVariant = (displayStatus.variant ?? 'outline') as BadgeProps['variant']
	const overdue = isOverdue(invoice)

	// ── Titre contextuel ────────────────────────────────────────────────────────
	const pageTitle = isCreditNote
		? `Avoir ${invoice.number || ''}`
		: isTicket
			? `Ticket ${invoice.number || ''}`
			: `Facture ${invoice.number || ''}`

	// ── Badges statut ───────────────────────────────────────────────────────────
	const statusBadges = isCreditNote ? (
		<>
			<Badge variant={badgeVariant}>{displayStatus.label}</Badge>
			<Badge className='bg-blue-600 hover:bg-blue-600'>
				<RefreshCcw className='h-3 w-3 mr-1' />
				Remboursé
			</Badge>
		</>
	) : isDeposit ? (
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
	) : (
		<>
			{displayStatus.label && displayStatus.label !== 'Payée' && (
				<Badge variant={badgeVariant}>{displayStatus.label}</Badge>
			)}
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

	// ── headerLeft ──────────────────────────────────────────────────────────────
	const headerLeft = (
		<div className='flex items-center gap-3 min-w-0'>
			<Button
				variant='ghost'
				size='icon'
				className='-ml-2 text-muted-foreground hover:text-foreground shrink-0'
				onClick={goBack}
			>
				<ArrowLeft className='h-4 w-4' />
			</Button>
			<div className='flex items-center gap-2 min-w-0'>
				<FileText className='h-5 w-5 text-muted-foreground shrink-0' />
				<h1 className='text-xl font-bold tracking-tight truncate'>{pageTitle}</h1>
				{statusBadges}
			</div>
		</div>
	)

	// ── Items dropdown Actions ──────────────────────────────────────────────────
	const dropdownItems: React.ReactNode[] = []

	// Envoyer email
	dropdownItems.push(
		<DropdownMenuItem
			key='email'
			onClick={() => actions.setEmailDialogOpen(true)}
		>
			<Mail className='h-4 w-4 mr-2' />
			Envoyer par email
		</DropdownMenuItem>,
	)

	// Marquer envoyée
	if (canTransitionTo(invoice.status, 'sent')) {
		dropdownItems.push(
			<DropdownMenuItem key='sent' onClick={actions.handleMarkAsSent}>
				<Send className='h-4 w-4 mr-2' />
				Marquer envoyée
			</DropdownMenuItem>,
		)
	}

	// Séparateur + actions brouillon
	if (invoice.status === 'draft' && !isCreditNote) {
		dropdownItems.push(<DropdownMenuSeparator key='sep-draft' />)
		dropdownItems.push(
			<DropdownMenuItem
				key='modifier'
				onClick={() =>
					navigate({
						to: '/connect/invoices/$invoiceId/edit',
						params: { invoiceId },
					})
				}
			>
				<Edit className='h-4 w-4 mr-2' />
				Modifier
			</DropdownMenuItem>,
		)
		dropdownItems.push(
			<DropdownMenuItem
				key='valider'
				onClick={actions.handleValidate}
				disabled={actions.isValidating}
			>
				<CheckCircle className='h-4 w-4 mr-2' />
				Valider
			</DropdownMenuItem>,
		)
		dropdownItems.push(
			<DropdownMenuItem
				key='delete-draft'
				onClick={actions.handleOpenDeleteDraft}
				className='text-red-600'
			>
				<XCircle className='h-4 w-4 mr-2' />
				Supprimer le brouillon
			</DropdownMenuItem>,
		)
	}

	// Convertir ticket → facture
	if (isTicket && !invoice.converted_to_invoice) {
		dropdownItems.push(<DropdownMenuSeparator key='sep-convert' />)
		dropdownItems.push(
			<DropdownMenuItem
				key='convert'
				onClick={() =>
					navigate({
						to: '/cash/convert-to-invoice/$ticketId',
						params: { ticketId: invoice.id },
					})
				}
			>
				<Receipt className='h-4 w-4 mr-2' />
				Convertir en facture
			</DropdownMenuItem>,
		)
	}

	// Paiement
	if (canMarkAsPaid(invoice) && !hasCancellationCreditNote) {
		dropdownItems.push(<DropdownMenuSeparator key='sep-pay' />)
		dropdownItems.push(
			<DropdownMenuItem
				key='payment'
				onClick={actions.handleOpenPaymentDialog}
			>
				<CheckCircle className='h-4 w-4 mr-2 text-green-600' />
				Enregistrer paiement
			</DropdownMenuItem>,
		)
	}

	// Créer avoir
	if (
		invoice.invoice_type === 'invoice' &&
		!isTicket &&
		invoice.status !== 'draft' &&
		!hasCancellationCreditNote
	) {
		dropdownItems.push(<DropdownMenuSeparator key='sep-cancel' />)
		dropdownItems.push(
			<DropdownMenuItem
				key='avoir'
				onClick={actions.handleOpenCancelDialog}
				className='text-red-600'
				disabled={(invoice.deposits_total_ttc ?? 0) > 0}
			>
				<XCircle className='h-4 w-4 mr-2' />
				Créer un avoir
			</DropdownMenuItem>,
		)
	}

	// Rembourser facture
	if (
		invoice.invoice_type === 'invoice' &&
		(displayStatus.isPaid || invoice.is_paid) &&
		!isTicket &&
		invoice.status !== 'draft' &&
		remainingAmount > 0
	) {
		dropdownItems.push(
			<DropdownMenuItem
				key='refund-invoice'
				onClick={() => actions.setRefundInvoiceOpen(true)}
			>
				<RotateCcw className='h-4 w-4 mr-2' />
				Rembourser
			</DropdownMenuItem>,
		)
	}

	// Rembourser ticket
	if (
		isTicket &&
		invoice.invoice_type === 'invoice' &&
		invoice.is_paid &&
		remainingAmount > 0
	) {
		dropdownItems.push(
			<DropdownMenuItem
				key='refund-ticket'
				onClick={() => actions.setRefundTicketDialogOpen(true)}
				className='text-orange-600'
			>
				<RotateCcw className='h-4 w-4 mr-2' />
				Rembourser ticket
			</DropdownMenuItem>,
		)
	}

	// Rembourser acompte
	if (
		invoice.invoice_type === 'deposit' &&
		invoice.is_paid &&
		invoice.status !== 'draft' &&
		!(invoice as any).has_credit_note
	) {
		dropdownItems.push(<DropdownMenuSeparator key='sep-refund-deposit' />)
		dropdownItems.push(
			<DropdownMenuItem
				key='refund-deposit'
				onClick={() => {
					actions.setRefundDepositReason('')
					actions.setRefundDepositOpen(true)
				}}
				className='text-orange-600'
			>
				<RotateCcw className='h-4 w-4 mr-2' />
				Rembourser l'acompte
			</DropdownMenuItem>,
		)
	}

	// ── headerRight ─────────────────────────────────────────────────────────────
	const headerRight = (
		<div className='flex items-center gap-1.5'>
			{/* Dropdown Actions */}
			{dropdownItems.length > 0 && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant='outline' size='sm' className='gap-1.5'>
							<ChevronDown className='h-4 w-4 shrink-0' />
							<span className='hidden lg:inline'>Actions</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align='end' className='w-52'>
						{dropdownItems}
					</DropdownMenuContent>
				</DropdownMenu>
			)}

			{/* Télécharger PDF */}
			<Button
				size='sm'
				onClick={actions.handleDownloadPdf}
				disabled={actions.isDownloading}
				className='gap-1.5'
			>
				{actions.isDownloading ? (
					<Loader2 className='h-4 w-4 animate-spin shrink-0' />
				) : (
					<Download className='h-4 w-4 shrink-0' />
				)}
				<span className='hidden lg:inline'>PDF</span>
			</Button>
		</div>
	)

	return { headerLeft, headerRight }
}
