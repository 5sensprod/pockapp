// frontend/modules/cash/components/reports/TicketsPage.tsx
// Page tickets POS — recherche par numéro uniquement, table épurée

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

	const { data: allTicketsData } = useInvoices({
		companyId: activeCompanyId ?? undefined,
		filter: 'is_pos_ticket = true',
		perPage: 1,
	})

	const tickets = (invoicesData?.items ?? []) as InvoiceResponse[]
	const totalItems = invoicesData?.totalItems ?? 0
	const totalPages = invoicesData?.totalPages ?? 1
	const totalTickets = allTicketsData?.totalItems ?? 0
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

	// ── Barre contextuelle ────────────────────────────────────────────────────
	const headerExtras = (
		<div className='flex items-center gap-3 border-l pl-3'>
			{/* Compteur */}
			<span className='text-[11px] text-muted-foreground whitespace-nowrap'>
				<span className='font-semibold text-foreground'>{totalTickets}</span>{' '}
				tickets
			</span>

			{/* Recherche — large, feat principale */}
			<div className='relative'>
				<Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground' />
				<Input
					placeholder='Rechercher un N° de ticket…'
					value={search}
					onChange={(e) => {
						setSearch(e.target.value)
						setPage(1)
					}}
					className='h-8 w-64 pl-8 text-xs'
				/>
			</div>
		</div>
	)

	return (
		<CashModuleShell
			pageTitle='Tickets de caisse'
			headerExtras={headerExtras}
			hideSessionActions
		>
			<div className='container mx-auto px-6 py-6'>
				<Card>
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
														{ticket.converted_to_invoice && (
															<Badge variant='outline' className='text-xs'>
																→ FAC
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

				{totalItems > 0 && (
					<div className='flex items-center justify-between mt-4'>
						<div className='text-sm text-muted-foreground'>
							{rangeStart}–{rangeEnd} sur {totalItems} ticket
							{totalItems > 1 ? 's' : ''}
						</div>
						<div className='flex items-center gap-1'>
							<Button
								variant='outline'
								size='sm'
								onClick={() => setPage((p) => p - 1)}
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
								onClick={() => setPage((p) => p + 1)}
								disabled={page >= totalPages}
							>
								Suivant
								<ChevronRight className='h-4 w-4' />
							</Button>
						</div>
					</div>
				)}

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
