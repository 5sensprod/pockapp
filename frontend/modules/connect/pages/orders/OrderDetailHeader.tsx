// frontend/modules/connect/pages/orders/OrderDetailHeader.tsx
//
// Retourne headerLeft + headerRight pour ConnectModuleShell.
// Pattern identique à InvoiceDetailHeader.
//
// order est optionnel — le hook est appelé avant les guards dans OrderDetailPage.

import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
	ArrowLeft,
	CheckCircle2,
	ChevronDown,
	ClipboardList,
	Download,
	FileText,
	Loader2,
	Mail,
	Receipt,
	Trash2,
	Truck,
	XCircle,
} from 'lucide-react'
import { OrderStatusBadge } from '../../components/orders/OrderStatusBadge'
import type { OrderActionsState } from '../../hooks/useOrderActions'
import {
	ORDER_STATUS_LABELS,
	ORDER_STATUS_TRANSITIONS,
	type OrderStatus,
} from '../../types/order'

const TRANSITION_ICONS: Partial<
	Record<OrderStatus, React.FC<{ className?: string }>>
> = {
	in_progress: Truck,
	delivered: CheckCircle2,
	billed: FileText,
	cancelled: XCircle,
}

interface OrderDetailHeaderProps {
	order: any | undefined
	actions: OrderActionsState
	goBack: () => void
}

interface HeaderSlots {
	headerLeft: React.ReactNode
	headerRight: React.ReactNode
}

export function useOrderDetailHeader({
	order,
	actions,
	goBack,
}: OrderDetailHeaderProps): HeaderSlots {
	// ── Guard ─────────────────────────────────────────────────────────────────
	if (!order) {
		return {
			headerLeft: (
				<div className='flex items-center gap-3'>
					<Button
						variant='ghost'
						size='icon'
						className='-ml-2 text-muted-foreground hover:text-foreground shrink-0'
						onClick={goBack}
					>
						<ArrowLeft className='h-4 w-4' />
					</Button>
					<div className='flex items-center gap-2'>
						<ClipboardList className='h-5 w-5 text-muted-foreground' />
						<h1 className='text-xl font-bold tracking-tight'>
							Bon de commande
						</h1>
					</div>
				</div>
			),
			headerRight: null,
		}
	}

	const isDraft = order.status === 'draft'
	const allowedTransitions =
		ORDER_STATUS_TRANSITIONS[order.status as OrderStatus] ?? []
	const isTerminal = allowedTransitions.length === 0
	// const isBilled = order.status === 'billed'

	// ── Header gauche ─────────────────────────────────────────────────────────
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
				<ClipboardList className='h-5 w-5 text-muted-foreground shrink-0' />
				<h1 className='text-xl font-bold tracking-tight truncate'>
					{order.number}
				</h1>
				<OrderStatusBadge status={order.status} />
			</div>
		</div>
	)

	// ── Dropdown items ────────────────────────────────────────────────────────
	const dropdownItems: React.ReactNode[] = []

	// Email — toujours disponible
	dropdownItems.push(
		<DropdownMenuItem
			key='email'
			onClick={() => actions.setEmailDialogOpen(true)}
		>
			<Mail className='h-4 w-4 mr-2' />
			Envoyer par email
		</DropdownMenuItem>,
	)

	// Générer la facture — dès confirmed, non-annulé, non-déjà-facturé
	const alreadyConverted = !!(order as any).invoice_id
	const canGenerateInvoice =
		!isDraft &&
		order.status !== 'cancelled' &&
		order.status !== 'draft' &&
		!alreadyConverted
	if (canGenerateInvoice || alreadyConverted) {
		dropdownItems.push(<DropdownMenuSeparator key='sep-convert' />)
		dropdownItems.push(
			<DropdownMenuItem
				key='convert'
				onClick={actions.handleOpenConvert}
				disabled={actions.isConverting || alreadyConverted}
			>
				<Receipt className='h-4 w-4 mr-2' />
				{alreadyConverted ? 'Facture déjà générée' : 'Générer la facture'}
			</DropdownMenuItem>,
		)
	}

	// Actions brouillon
	if (isDraft) {
		dropdownItems.push(<DropdownMenuSeparator key='sep-draft' />)
		dropdownItems.push(
			<DropdownMenuItem
				key='validate'
				onClick={() => actions.setValidateDialogOpen(true)}
				disabled={actions.isPatching}
			>
				<CheckCircle2 className='h-4 w-4 mr-2' />
				Valider le bon
			</DropdownMenuItem>,
		)
		dropdownItems.push(
			<DropdownMenuItem
				key='delete'
				onClick={() => actions.setDeleteDialogOpen(true)}
				className='text-red-600'
				disabled={actions.isDeleting}
			>
				<Trash2 className='h-4 w-4 mr-2' />
				Supprimer le brouillon
			</DropdownMenuItem>,
		)
	}

	// Transitions statut (non-draft, non-terminal)
	if (!isDraft && !isTerminal) {
		dropdownItems.push(<DropdownMenuSeparator key='sep-transitions' />)
		for (const next of allowedTransitions) {
			const Icon = TRANSITION_ICONS[next]
			const isDanger = next === 'cancelled'
			dropdownItems.push(
				<DropdownMenuItem
					key={next}
					onClick={() => actions.handleTransition(next)}
					disabled={actions.isPatching}
					className={isDanger ? 'text-red-600' : undefined}
				>
					{Icon && <Icon className='h-4 w-4 mr-2' />}
					{ORDER_STATUS_LABELS[next]}
				</DropdownMenuItem>,
			)
		}
	}

	// ── Header droit ──────────────────────────────────────────────────────────
	const headerRight = (
		<div className='flex items-center gap-1.5'>
			{dropdownItems.length > 0 && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant='outline' size='sm' className='gap-1.5'>
							<ChevronDown className='h-4 w-4 shrink-0' />
							<span className='hidden lg:inline'>Actions</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align='end' className='w-56'>
						{dropdownItems}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
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
