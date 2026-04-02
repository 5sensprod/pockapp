// frontend/modules/cash/components/reports/TicketsPage.tsx
// Page tickets POS — recherche par numéro au centre, pagination dans la barre

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { useInvoices } from '@/lib/queries/invoices'
import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { RefundTicketDialog } from '@/modules/common/RefundTicketDialog'
import {
	StockReclassificationDialog,
	type StockReclassificationItem,
} from '@/modules/common/StockReclassificationDialog'
import { useNavigate } from '@tanstack/react-router'
import {
	ChevronLeft,
	ChevronRight,
	Eye,
	FileText,
	MoreHorizontal,
	Receipt,
	RotateCcw,
	Search,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { CashModuleShell } from '../../CashModuleShell'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(amount: number) {
	return new Intl.NumberFormat('fr-FR', {
		style: 'currency',
		currency: 'EUR',
	}).format(amount)
}

function formatDate(dateStr: string) {
	if (!dateStr) return '-'
	return new Date(dateStr).toLocaleDateString('fr-FR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	})
}

function formatTime(dateStr: string) {
	if (!dateStr) return '-'
	return new Date(dateStr).toLocaleTimeString('fr-FR', {
		hour: '2-digit',
		minute: '2-digit',
	})
}

function getPaymentMethodLabel(method: string, label?: string) {
	if (label) return label
	const map: Record<string, string> = {
		cb: 'CB',
		especes: 'Espèces',
		cheque: 'Chèque',
		virement: 'Virement',
	}
	return map[method] || method
}

const PER_PAGE = 30

// ── Component ─────────────────────────────────────────────────────────────────

export function TicketsPage() {
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()

	const [search, setSearch] = useState('')
	const [page, setPage] = useState(1)
	const debouncedSearch = useDebounce(search, 400)

	const searchFilter = useMemo(() => {
		const parts: string[] = ['is_pos_ticket = true']
		if (debouncedSearch) parts.push(`number ~ "${debouncedSearch}"`)
		return parts.join(' && ')
	}, [debouncedSearch])

	const { data: invoicesData, isLoading } = useInvoices({
		companyId: activeCompanyId ?? undefined,
		filter: searchFilter,
		sort: '-created',
		page,
		perPage: PER_PAGE,
	})

	const tickets = (invoicesData?.items ?? []) as InvoiceResponse[]
	const totalItems = invoicesData?.totalItems ?? 0
	const totalPages = invoicesData?.totalPages ?? 1

	const rangeStart = totalItems === 0 ? 0 : (page - 1) * PER_PAGE + 1
	const rangeEnd = Math.min(page * PER_PAGE, totalItems)

	const [refundTicketDialogOpen, setRefundTicketDialogOpen] = useState(false)
	const [ticketToRefund, setTicketToRefund] = useState<InvoiceResponse | null>(
		null,
	)
	const [stockReclassifyOpen, setStockReclassifyOpen] = useState(false)
	const [stockItemsToReclassify, setStockItemsToReclassify] = useState<
		StockReclassificationItem[]
	>([])
	const [stockDocumentNumber, setStockDocumentNumber] = useState<
		string | undefined
	>()

	// ── Barre Centrale (Recherche Pro) ─────────────────────────────────────────
	const centerContent = (
		<div className='relative w-[350px] transition-all focus-within:w-[400px]'>
			<Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
			<Input
				placeholder='Rechercher un N° de ticket...'
				value={search}
				onChange={(e) => {
					setSearch(e.target.value)
					setPage(1)
				}}
				className='h-9 pl-9 bg-background/50 focus-visible:bg-background border-muted-foreground/20 shadow-sm transition-all text-sm'
			/>
		</div>
	)

	// ── Barre Droite (Pagination compacte et Stats) ──────────────────────────
	const headerExtras = (
		<div className='flex items-center gap-4 border-l pl-4 border-muted-foreground/20'>
			{/* Stats textuelles */}
			<div className='flex flex-col items-end leading-none'>
				<span className='text-xs font-semibold text-foreground mb-1'>
					{totalItems} ticket{totalItems > 1 ? 's' : ''}
				</span>
				<span className='text-[10px] text-muted-foreground uppercase tracking-wider'>
					{rangeStart} - {rangeEnd} affichés
				</span>
			</div>

			{/* Contrôles de pagination */}
			<div className='flex items-center gap-1.5 bg-background/50 p-1 rounded-md border border-muted-foreground/20 shadow-sm'>
				<Button
					variant='ghost'
					size='icon'
					className='h-6 w-6 rounded-[4px]'
					onClick={() => setPage((p) => p - 1)}
					disabled={page <= 1}
				>
					<ChevronLeft className='h-3 w-3' />
				</Button>
				<span className='text-[11px] font-medium min-w-[30px] text-center'>
					{page}/{totalPages}
				</span>
				<Button
					variant='ghost'
					size='icon'
					className='h-6 w-6 rounded-[4px]'
					onClick={() => setPage((p) => p + 1)}
					disabled={page >= totalPages}
				>
					<ChevronRight className='h-3 w-3' />
				</Button>
			</div>
		</div>
	)

	return (
		<CashModuleShell
			pageTitle='Tickets de caisse'
			pageIcon={Receipt} // <-- AJOUTEZ CETTE LIGNE
			centerContent={centerContent}
			headerExtras={headerExtras}
			hideSessionActions
		>
			<div className='container mx-auto px-6 py-6'>
				<Card className='shadow-sm border-muted/60'>
					<CardContent className='p-0'>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Numéro</TableHead>
									<TableHead>Date</TableHead>
									<TableHead>Heure</TableHead>
									<TableHead className='text-right'>Montant</TableHead>
									<TableHead>Paiement</TableHead>
									<TableHead className='w-10' />
								</TableRow>
							</TableHeader>
							<TableBody>
								{isLoading ? (
									<TableRow>
										<TableCell colSpan={6} className='h-24 text-center'>
											<div className='flex items-center justify-center'>
												<div className='h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin' />
											</div>
										</TableCell>
									</TableRow>
								) : tickets.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={6}
											className='h-24 text-center text-muted-foreground'
										>
											<Receipt className='h-8 w-8 mx-auto mb-2 opacity-30' />
											<p>Aucun ticket trouvé</p>
										</TableCell>
									</TableRow>
								) : (
									tickets.map((ticket) => {
										const remainingAmount =
											typeof ticket.remaining_amount === 'number'
												? ticket.remaining_amount
												: (ticket.total_ttc ?? 0) -
													(ticket.credit_notes_total ?? 0)

										return (
											<TableRow key={ticket.id}>
												<TableCell>
													<div className='flex items-center gap-2'>
														<span className='font-mono font-medium'>
															{ticket.number}
														</span>

														{/* Badge : Converti en facture */}
														{ticket.converted_to_invoice && (
															<Badge
																variant='secondary'
																className='text-[10px] uppercase tracking-wider bg-blue-100 text-blue-700 hover:bg-blue-100/80 dark:bg-blue-900/40 dark:text-blue-400 border-none'
															>
																Facture
															</Badge>
														)}

														{/* Badge : Remboursé (Totalement) */}
														{remainingAmount <= 0 &&
															(ticket.total_ttc ?? 0) > 0 && (
																<Badge
																	variant='secondary'
																	className='text-[10px] uppercase tracking-wider bg-orange-100 text-orange-700 hover:bg-orange-100/80 dark:bg-orange-900/40 dark:text-orange-400 border-none'
																>
																	Remboursé
																</Badge>
															)}

														{/* Badge optionnel : Remboursé (Partiellement) */}
														{remainingAmount > 0 &&
															(ticket.credit_notes_total ?? 0) > 0 && (
																<Badge
																	variant='outline'
																	className='text-[10px] uppercase tracking-wider text-orange-600 dark:text-orange-500 border-orange-200 dark:border-orange-900'
																>
																	Remb. partiel
																</Badge>
															)}
													</div>
												</TableCell>
												<TableCell>{formatDate(ticket.date)}</TableCell>
												<TableCell className='text-muted-foreground'>
													{formatTime(ticket.created)}
												</TableCell>
												<TableCell className='text-right font-medium'>
													{formatCurrency(ticket.total_ttc)}
												</TableCell>
												<TableCell className='text-sm text-muted-foreground'>
													{ticket.payment_method
														? getPaymentMethodLabel(
																ticket.payment_method,
																(ticket as any).payment_method_label,
															)
														: '-'}
												</TableCell>
												<TableCell>
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button variant='ghost' size='icon'>
																<MoreHorizontal className='h-4 w-4' />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align='end'>
															<DropdownMenuLabel>Actions</DropdownMenuLabel>
															<DropdownMenuSeparator />

															<DropdownMenuItem
																onClick={() =>
																	navigate({
																		to: '/cash/tickets/$ticketId' as any,
																		params: { ticketId: ticket.id } as any,
																	})
																}
															>
																<Eye className='h-4 w-4 mr-2' />
																Voir le détail
															</DropdownMenuItem>

															{ticket.invoice_type !== 'credit_note' &&
																!ticket.converted_to_invoice &&
																remainingAmount > 0 && (
																	<>
																		<DropdownMenuSeparator />
																		<DropdownMenuItem
																			onClick={() =>
																				navigate({
																					to: '/cash/convert-to-invoice/$ticketId',
																					params: { ticketId: ticket.id },
																				})
																			}
																		>
																			<Receipt className='h-4 w-4 mr-2' />
																			Convertir en facture
																		</DropdownMenuItem>
																	</>
																)}

															{ticket.converted_to_invoice &&
																ticket.converted_invoice_id && (
																	<>
																		<DropdownMenuSeparator />
																		<DropdownMenuItem
																			onClick={() => {
																				if (!ticket.converted_invoice_id) return
																				navigate({
																					to: '/connect/invoices/$invoiceId',
																					params: {
																						invoiceId:
																							ticket.converted_invoice_id,
																					},
																				})
																			}}
																		>
																			<FileText className='h-4 w-4 mr-2' />
																			Voir la facture associée
																		</DropdownMenuItem>
																	</>
																)}

															{ticket.invoice_type === 'invoice' &&
																ticket.is_paid &&
																!ticket.converted_to_invoice && (
																	<>
																		<DropdownMenuSeparator />
																		<DropdownMenuItem
																			disabled={remainingAmount <= 0}
																			onClick={() => {
																				if (remainingAmount <= 0) return
																				setTicketToRefund(ticket)
																				setRefundTicketDialogOpen(true)
																			}}
																			className={
																				remainingAmount <= 0
																					? 'text-muted-foreground'
																					: 'text-orange-600'
																			}
																		>
																			<RotateCcw className='h-4 w-4 mr-2' />
																			Rembourser
																			{remainingAmount <= 0 && (
																				<span className='ml-2 text-xs'>
																					(remboursé)
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
					</CardContent>
				</Card>

				{/* Dialogues */}
				<RefundTicketDialog
					open={refundTicketDialogOpen}
					onOpenChange={(o) => {
						if (!o) {
							setRefundTicketDialogOpen(false)
							setTicketToRefund(null)
						} else setRefundTicketDialogOpen(true)
					}}
					ticket={ticketToRefund}
					onSuccess={(stockItems) => {
						setRefundTicketDialogOpen(false)
						setTicketToRefund(null)
						if (stockItems && stockItems.length > 0) {
							setStockItemsToReclassify(stockItems)
							setStockDocumentNumber(ticketToRefund?.number)
							setStockReclassifyOpen(true)
						}
					}}
				/>
				<StockReclassificationDialog
					open={stockReclassifyOpen}
					onOpenChange={setStockReclassifyOpen}
					items={stockItemsToReclassify}
					documentNumber={stockDocumentNumber}
					onComplete={() => {
						setStockReclassifyOpen(false)
						setStockItemsToReclassify([])
						setStockDocumentNumber(undefined)
					}}
				/>
			</div>
		</CashModuleShell>
	)
}
