// frontend/modules/connect/components/InvoicesTable.tsx
//
// Composant PRESENTATIONAL — contient uniquement la table + dialogs.
// Toute la logique métier reste dans InvoicesPage.

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import type { InvoiceResponse } from '@/lib/types/invoice.types'
import {
	canMarkAsPaid,
	canTransitionTo,
	getDisplayStatus,
	isOverdue,
} from '@/lib/types/invoice.types'
import { useNavigate } from '@tanstack/react-router'
import {
	AlertTriangle,
	CheckCircle,
	ChevronLeft,
	ChevronRight,
	Download,
	Edit,
	Eye,
	Mail,
	MoreHorizontal,
	Receipt,
	RotateCcw,
	Send,
	XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, formatDate } from '../utils/formatters'
import { getPaginationRange } from '../utils/pagination'

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
	// Handlers actions (remontent vers InvoicesPage)
	onDownloadPdf: (invoice: InvoiceResponse) => void
	onOpenSendEmail: (invoice: InvoiceResponse) => void
	onValidate: (invoice: InvoiceResponse) => void
	onMarkAsSent: (invoice: InvoiceResponse) => void
	onOpenPayment: (invoice: InvoiceResponse) => void
	onOpenCancel: (invoice: InvoiceResponse) => void
	onOpenDeleteDraft: (invoice: InvoiceResponse) => void
	onOpenRefundTicket: (invoice: InvoiceResponse) => void
	onOpenRefundInvoice: (invoice: InvoiceResponse) => void
	onOpenRefundDeposit: (invoice: InvoiceResponse) => void
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
	onDownloadPdf,
	onOpenSendEmail,
	onValidate,
	onMarkAsSent,
	onOpenPayment,
	onOpenCancel,
	onOpenDeleteDraft,
	onOpenRefundTicket,
	onOpenRefundInvoice,
	onOpenRefundDeposit,
}: InvoicesTableProps) {
	const navigate = useNavigate()

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
							<TableHead className='w-10' />
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading ? (
							<TableRow>
								<TableCell colSpan={9} className='h-24 text-center'>
									<div className='flex items-center justify-center'>
										<div className='h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin' />
									</div>
								</TableCell>
							</TableRow>
						) : invoices.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={9}
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

								const hasCancellationCreditNote = invoices.some(
									(other) =>
										other.invoice_type === 'credit_note' &&
										other.original_invoice_id === invoice.id,
								)

								const isTicket =
									invoice.is_pos_ticket === true ||
									invoice.number?.startsWith('TIK-')

								const remainingAmount =
									typeof invoice.remaining_amount === 'number'
										? invoice.remaining_amount
										: (invoice.total_ttc ?? 0) -
											(invoice.credit_notes_total ?? 0)

								return (
									<TableRow
										key={invoice.id}
										className={overdue ? 'bg-red-50/50' : ''}
									>
										<TableCell className='font-medium'>
											<div className='flex items-center gap-2'>
												<span className='font-mono'>{invoice.number}</span>
												{invoice.converted_to_invoice && <Badge>→ FAC</Badge>}
												{invoice.original_invoice_id && (
													<Badge>
														←{' '}
														{invoice.expand?.original_invoice_id?.is_pos_ticket
															? 'TIK'
															: 'FAC'}
													</Badge>
												)}
											</div>
										</TableCell>

										<TableCell className='text-sm text-muted-foreground'>
											{sellerName}
										</TableCell>

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

										<TableCell>{formatDate(invoice.date)}</TableCell>

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

										<TableCell>
											<div className='flex items-center gap-2'>
												<Badge variant={displayStatus.variant}>
													{displayStatus.label}
												</Badge>
												{displayStatus.isPaid && (
													<CheckCircle className='h-4 w-4 text-green-600' />
												)}
											</div>
										</TableCell>

										<TableCell
											className={`text-right font-medium ${invoice.total_ttc < 0 ? 'text-red-600' : ''}`}
										>
											{formatCurrency(invoice.total_ttc)}
										</TableCell>

										<TableCell>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button variant='ghost' className='h-8 w-8 p-0'>
														<MoreHorizontal className='h-4 w-4' />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align='end'>
													<DropdownMenuLabel>Actions</DropdownMenuLabel>

													<DropdownMenuItem
														onClick={() =>
															navigate({
																to: '/connect/invoices/$invoiceId',
																params: () => ({ invoiceId: invoice.id }),
															})
														}
													>
														<Eye className='h-4 w-4 mr-2' />
														Voir
													</DropdownMenuItem>

													<DropdownMenuItem
														onClick={() => onDownloadPdf(invoice)}
													>
														<Download className='h-4 w-4 mr-2' />
														Télécharger PDF
													</DropdownMenuItem>

													<DropdownMenuItem
														onClick={() => onOpenSendEmail(invoice)}
														disabled={invoice.status === 'draft'}
													>
														<Mail className='h-4 w-4 mr-2' />
														Envoyer par email
													</DropdownMenuItem>

													{/* Convertir ticket -> facture */}
													{invoice.number?.startsWith('TIK-') &&
														!invoice.converted_to_invoice && (
															<>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	onClick={() =>
																		navigate({
																			to: '/cash/convert-to-invoice/$ticketId',
																			params: { ticketId: invoice.id },
																		})
																	}
																>
																	<Receipt className='h-4 w-4 mr-2' />
																	Convertir en facture
																</DropdownMenuItem>
															</>
														)}

													{/* Remboursement ticket */}
													{isTicket &&
														displayStatus.isPaid &&
														invoice.invoice_type === 'invoice' && (
															<>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	onClick={() => {
																		if (remainingAmount <= 0) {
																			toast.error(
																				'Ticket déjà totalement remboursé',
																				{
																					description: `Le ticket ${invoice.number} a déjà été intégralement remboursé.`,
																				},
																			)
																			return
																		}
																		onOpenRefundTicket(invoice)
																	}}
																>
																	<RotateCcw className='h-4 w-4 mr-2' />
																	Rembourser ticket
																	{remainingAmount <= 0 && (
																		<span className='ml-2 text-xs text-muted-foreground'>
																			(remboursé)
																		</span>
																	)}
																</DropdownMenuItem>
															</>
														)}

													<DropdownMenuSeparator />

													{/* Brouillon */}
													{invoice.status === 'draft' &&
														invoice.invoice_type === 'invoice' && (
															<>
																<DropdownMenuItem
																	onClick={() =>
																		navigate({
																			to: '/connect/invoices/$invoiceId/edit',
																			params: { invoiceId: invoice.id },
																		})
																	}
																>
																	<Edit className='h-4 w-4 mr-2' />
																	Modifier
																</DropdownMenuItem>
																<DropdownMenuItem
																	onClick={() => onValidate(invoice)}
																>
																	<CheckCircle className='h-4 w-4 mr-2' />
																	Valider
																</DropdownMenuItem>
																<DropdownMenuItem
																	onClick={() => onOpenDeleteDraft(invoice)}
																	className='text-red-600'
																>
																	<XCircle className='h-4 w-4 mr-2' />
																	Supprimer le brouillon
																</DropdownMenuItem>
																<DropdownMenuSeparator />
															</>
														)}

													{/* Marquer envoyée */}
													{canTransitionTo(invoice.status, 'sent') && (
														<DropdownMenuItem
															onClick={() => onMarkAsSent(invoice)}
														>
															<Send className='h-4 w-4 mr-2' />
															Marquer envoyée
														</DropdownMenuItem>
													)}

													{/* Paiement */}
													{canMarkAsPaid(invoice) &&
														!hasCancellationCreditNote &&
														(invoice.invoice_type === 'invoice' &&
														(invoice.deposits_total_ttc ?? 0) > 0 &&
														!invoice.original_invoice_id ? (
															<DropdownMenuItem
																onClick={() =>
																	navigate({
																		to: '/connect/invoices/$invoiceId',
																		params: { invoiceId: invoice.id },
																	})
																}
															>
																<CheckCircle className='h-4 w-4 mr-2 text-blue-600' />
																Solder
															</DropdownMenuItem>
														) : (
															<DropdownMenuItem
																onClick={() => onOpenPayment(invoice)}
															>
																<CheckCircle className='h-4 w-4 mr-2 text-green-600' />
																Enregistrer paiement
															</DropdownMenuItem>
														))}

													{/* Rembourser acompte */}
													{invoice.invoice_type === 'deposit' &&
														invoice.is_paid &&
														invoice.status !== 'draft' &&
														!invoice.has_credit_note && (
															<>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	onClick={() => onOpenRefundDeposit(invoice)}
																	className='text-orange-600'
																>
																	<RotateCcw className='h-4 w-4 mr-2' />
																	Rembourser l'acompte
																</DropdownMenuItem>
															</>
														)}

													{/* Créer avoir */}
													{invoice.invoice_type === 'invoice' &&
														!isTicket &&
														invoice.status !== 'draft' &&
														!hasCancellationCreditNote && (
															<>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	onClick={() => {
																		if ((invoice.deposits_total_ttc ?? 0) > 0) {
																			toast.error(
																				'Impossible de créer un avoir',
																				{
																					description:
																						"Cette facture a des acomptes en cours ou payés. Remboursez d'abord les acomptes avant d'annuler la facture.",
																				},
																			)
																			return
																		}
																		onOpenCancel(invoice)
																	}}
																	className={
																		(invoice.deposits_total_ttc ?? 0) > 0
																			? 'text-muted-foreground'
																			: 'text-red-600'
																	}
																>
																	<XCircle className='h-4 w-4 mr-2' />
																	Créer un avoir
																	{(invoice.deposits_total_ttc ?? 0) > 0 && (
																		<span className='ml-2 text-xs'>
																			(acompte en cours)
																		</span>
																	)}
																</DropdownMenuItem>
															</>
														)}

													{/* Rembourser facture */}
													{invoice.invoice_type === 'invoice' &&
														displayStatus.isPaid &&
														!isTicket &&
														invoice.status !== 'draft' && (
															<>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	onClick={() => {
																		if (remainingAmount <= 0) {
																			toast.error(
																				'Facture déjà totalement remboursée',
																				{
																					description: `La facture ${invoice.number} a déjà été intégralement remboursée.`,
																				},
																			)
																			return
																		}
																		onOpenRefundInvoice(invoice)
																	}}
																	className={
																		remainingAmount <= 0
																			? 'text-muted-foreground'
																			: ''
																	}
																>
																	<RotateCcw className='h-4 w-4 mr-2' />
																	Rembourser
																	{remainingAmount <= 0 && (
																		<span className='ml-2 text-xs text-muted-foreground'>
																			(remboursée)
																		</span>
																	)}
																</DropdownMenuItem>
															</>
														)}
												</DropdownMenuContent>
											</DropdownMenu>
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
