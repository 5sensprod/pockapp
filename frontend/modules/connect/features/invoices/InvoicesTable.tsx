// frontend/modules/connect/components/InvoicesTable.tsx
//
// Composant PRESENTATIONAL — table des factures + pagination serveur.
// Clic sur une ligne → navigation vers le détail de la facture.
// Les actions (PDF, email, paiement…) sont accessibles depuis la page de détail.

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { getDisplayStatus, isOverdue } from '@/lib/types/invoice.types'
import {
	AlertTriangle,
	CheckCircle,
	ChevronLeft,
	ChevronRight,
} from 'lucide-react'
import { useDocumentNavigation } from '../../hooks/useDocumentNavigation'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { getPaginationRange } from '../../utils/pagination'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InvoicesTableProps {
	invoices: InvoiceResponse[]
	isLoading?: boolean
	// Pagination serveur
	page: number
	totalPages: number
	totalItems: number
	perPage: number
	onPageChange: (page: number) => void
	// Props conservées pour compatibilité avec InvoicesPage (non utilisées dans la table)
	onDownloadPdf?: (invoice: InvoiceResponse) => void
	onOpenSendEmail?: (invoice: InvoiceResponse) => void
	onValidate?: (invoice: InvoiceResponse) => void
	onMarkAsSent?: (invoice: InvoiceResponse) => void
	onOpenPayment?: (invoice: InvoiceResponse) => void
	onOpenCancel?: (invoice: InvoiceResponse) => void
	onOpenDeleteDraft?: (invoice: InvoiceResponse) => void
	onOpenRefundTicket?: (invoice: InvoiceResponse) => void
	onOpenRefundInvoice?: (invoice: InvoiceResponse) => void
	onOpenRefundDeposit?: (invoice: InvoiceResponse) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function InvoicesTable({
	invoices,
	isLoading = false,
	page,
	totalPages,
	totalItems,
	perPage,
	onPageChange,
}: InvoicesTableProps) {
	const { goToDetail } = useDocumentNavigation('invoice')
	const { rangeStart, rangeEnd } = getPaginationRange(page, perPage, totalItems)

	return (
		<div className='space-y-4'>
			<div className='border rounded-lg overflow-hidden'>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Numéro</TableHead>
							<TableHead>Vendeur</TableHead>
							<TableHead>Type</TableHead>
							<TableHead>Client</TableHead>
							<TableHead>Date</TableHead>
							<TableHead>Échéance</TableHead>
							<TableHead>Statut</TableHead>
							<TableHead className='text-right'>Montant TTC</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading ? (
							<TableRow>
								<TableCell colSpan={8} className='h-24 text-center'>
									<div className='flex items-center justify-center'>
										<div className='h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin' />
									</div>
								</TableCell>
							</TableRow>
						) : invoices.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={8}
									className='h-24 text-center text-muted-foreground'
								>
									Aucune facture trouvée pour ces filtres.
								</TableCell>
							</TableRow>
						) : (
							invoices.map((invoice) => {
								const displayStatus = getDisplayStatus(invoice)
								const customer = invoice.expand?.customer
								const overdue = isOverdue(invoice)

								const soldBy = (invoice as any).expand?.sold_by
								const sellerName =
									soldBy?.name ||
									soldBy?.username ||
									soldBy?.email ||
									(invoice.sold_by ? String(invoice.sold_by) : '—')

								const hasCreditNote = invoices.some(
									(other) =>
										other.invoice_type === 'credit_note' &&
										other.original_invoice_id === invoice.id,
								)

								return (
									<TableRow
										key={invoice.id}
										className={`cursor-pointer hover:bg-muted/50 transition-colors ${overdue ? 'bg-red-50/50' : ''}`}
										onClick={() => goToDetail(invoice.id)}
									>
										{/* Numéro */}
										<TableCell className='font-medium'>
											<div className='flex items-center gap-2'>
												<span className='font-mono'>{invoice.number}</span>
												{invoice.converted_to_invoice && (
													<Badge variant='outline' className='text-xs'>
														→ FAC
													</Badge>
												)}
												{invoice.original_invoice_id && (
													<Badge variant='outline' className='text-xs'>
														←{' '}
														{invoice.expand?.original_invoice_id?.is_pos_ticket
															? 'TIK'
															: 'FAC'}
													</Badge>
												)}
											</div>
										</TableCell>

										{/* Vendeur */}
										<TableCell className='text-sm text-muted-foreground'>
											{sellerName}
										</TableCell>

										{/* Type */}
										<TableCell>
											<Badge
												variant={
													invoice.invoice_type === 'credit_note'
														? 'destructive'
														: 'outline'
												}
											>
												{invoice.is_pos_ticket
													? 'Ticket'
													: invoice.invoice_type === 'credit_note'
														? 'Avoir'
														: invoice.invoice_type === 'deposit'
															? 'Acompte'
															: 'Facture'}
											</Badge>
										</TableCell>

										{/* Client */}
										<TableCell>
											<div>
												<p className='font-medium'>
													{customer?.name || 'Client inconnu'}
												</p>
												{customer?.email && (
													<p className='text-xs text-muted-foreground'>
														{customer.email}
													</p>
												)}
											</div>
										</TableCell>

										{/* Date */}
										<TableCell>{formatDate(invoice.date)}</TableCell>

										{/* Échéance */}
										<TableCell>
											<span
												className={overdue ? 'text-red-600 font-medium' : ''}
											>
												{invoice.due_date ? formatDate(invoice.due_date) : '-'}
											</span>
											{overdue && (
												<AlertTriangle className='h-3 w-3 inline ml-1 text-red-500' />
											)}
										</TableCell>

										{/* Statut */}
										<TableCell>
											<div className='flex items-center gap-2'>
												<Badge variant={displayStatus.variant}>
													{displayStatus.label}
												</Badge>
												{displayStatus.isPaid && (
													<CheckCircle className='h-4 w-4 text-green-600' />
												)}
												{hasCreditNote && (
													<Badge variant='secondary' className='text-xs'>
														Avoir
													</Badge>
												)}
											</div>
										</TableCell>

										{/* Montant */}
										<TableCell
											className={`text-right font-medium ${invoice.total_ttc < 0 ? 'text-red-600' : ''}`}
										>
											{formatCurrency(invoice.total_ttc)}
										</TableCell>
									</TableRow>
								)
							})
						)}
					</TableBody>
				</Table>
			</div>

			{/* ── Pagination serveur ── */}
			{totalItems > 0 && (
				<div className='flex items-center justify-between'>
					<div className='text-sm text-muted-foreground'>
						{rangeStart}–{rangeEnd} sur {totalItems} facture
						{totalItems > 1 ? 's' : ''}
					</div>
					<div className='flex items-center gap-1'>
						<Button
							variant='outline'
							size='sm'
							onClick={() => onPageChange(page - 1)}
							disabled={page <= 1}
						>
							<ChevronLeft className='h-4 w-4' />
							Précédent
						</Button>
						<span className='px-3 text-sm text-muted-foreground'>
							{page} / {totalPages}
						</span>
						<Button
							variant='outline'
							size='sm'
							onClick={() => onPageChange(page + 1)}
							disabled={page >= totalPages}
						>
							Suivant
							<ChevronRight className='h-4 w-4' />
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}
