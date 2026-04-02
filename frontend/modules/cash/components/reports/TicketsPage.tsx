// frontend/modules/cash/components/reports/TicketsPage.tsx
// Page tickets POS — pattern ModulePageShell, pagination serveur, debounce

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
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
import { usePocketBase } from '@/lib/use-pocketbase'
import { RefundTicketDialog } from '@/modules/common/RefundTicketDialog'
import {
	StockReclassificationDialog,
	type StockReclassificationItem,
} from '@/modules/common/StockReclassificationDialog'
import { useQuery } from '@tanstack/react-query'
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
	const pb = usePocketBase() as any

	// ── Filtres + pagination en un seul état atomique ──────────────────────────
	const [filters, setFilters] = useState({
		search: '',
		conversionFilter: 'all' as 'all' | 'converted' | 'not_converted',
		dateFilter: '',
		page: 1,
	})

	const setSearch = (v: string) =>
		setFilters((f) => ({ ...f, search: v, page: 1 }))
	const setConversion = (v: typeof filters.conversionFilter) =>
		setFilters((f) => ({ ...f, conversionFilter: v, page: 1 }))
	const setDate = (v: string) =>
		setFilters((f) => ({ ...f, dateFilter: v, page: 1 }))
	const setPage = (v: number) => setFilters((f) => ({ ...f, page: v }))

	const debouncedSearch = useDebounce(filters.search, 400)

	// ── Résolution IDs clients par nom ─────────────────────────────────────────
	const { data: matchingCustomerIds } = useQuery({
		queryKey: ['customer-search-ids-tickets', activeCompanyId, debouncedSearch],
		queryFn: async () => {
			if (!debouncedSearch || !activeCompanyId) return []
			const result = await pb.collection('customers').getFullList({
				filter: `owner_company = "${activeCompanyId}" && name ~ "${debouncedSearch}"`,
				fields: 'id',
			})
			return result.map((c: any) => c.id as string)
		},
		enabled: !!debouncedSearch && !!activeCompanyId,
		staleTime: 10_000,
	})

	// ── Filtre de recherche combiné ────────────────────────────────────────────
	const searchFilter = useMemo(() => {
		const parts: string[] = ['is_pos_ticket = true']
		if (debouncedSearch) {
			const textParts: string[] = [`number ~ "${debouncedSearch}"`]
			if (matchingCustomerIds && matchingCustomerIds.length > 0) {
				textParts.push(
					`(${matchingCustomerIds
						.map((id: string) => `customer = "${id}"`)
						.join(' || ')})`,
				)
			}
			parts.push(`(${textParts.join(' || ')})`)
		}
		if (filters.conversionFilter === 'converted')
			parts.push('converted_to_invoice = true')
		if (filters.conversionFilter === 'not_converted')
			parts.push('converted_to_invoice = false')
		if (filters.dateFilter)
			parts.push(
				`date >= "${filters.dateFilter}" && date <= "${filters.dateFilter} 23:59:59"`,
			)
		return parts.join(' && ')
	}, [
		debouncedSearch,
		matchingCustomerIds,
		filters.conversionFilter,
		filters.dateFilter,
	])

	// ── Bloquer useInvoices tant que les IDs clients ne sont pas résolus ───────
	const customerIdsReady = !debouncedSearch || matchingCustomerIds !== undefined

	const { data: invoicesData, isLoading } = useInvoices({
		companyId: customerIdsReady ? (activeCompanyId ?? undefined) : undefined,
		filter: searchFilter,
		sort: '-created',
		page: filters.page,
		perPage: PER_PAGE,
	})

	// ── Stats (total tickets, sans filtre) ─────────────────────────────────────
	const { data: allTicketsData } = useInvoices({
		companyId: activeCompanyId ?? undefined,
		filter: 'is_pos_ticket = true',
		perPage: 1,
	})

	const tickets = (invoicesData?.items ?? []) as InvoiceResponse[]
	const totalItems = invoicesData?.totalItems ?? 0
	const totalPages = invoicesData?.totalPages ?? 1
	const totalTickets = allTicketsData?.totalItems ?? 0

	const rangeStart = totalItems === 0 ? 0 : (filters.page - 1) * PER_PAGE + 1
	const rangeEnd = Math.min(filters.page * PER_PAGE, totalItems)

	// ── Dialogs remboursement ──────────────────────────────────────────────────
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

	// ── Rendu ──────────────────────────────────────────────────────────────────
	return (
		<div className='container mx-auto px-6 py-8'>
			{/* Header */}
			<div className='flex items-center justify-between mb-6'>
				<div>
					<h1 className='text-2xl font-bold flex items-center gap-2'>
						<Receipt className='h-6 w-6' />
						Tickets de caisse
					</h1>
					<p className='text-muted-foreground'>
						Consultez et gérez les tickets POS.
					</p>
				</div>
			</div>

			{/* Stats */}
			<div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-6'>
				<Card>
					<CardHeader className='pb-3'>
						<CardTitle className='text-sm font-medium text-muted-foreground'>
							Total tickets
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold'>{totalTickets}</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className='pb-3'>
						<CardTitle className='text-sm font-medium text-muted-foreground'>
							Affichés
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold'>{totalItems}</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className='pb-3'>
						<CardTitle className='text-sm font-medium text-muted-foreground'>
							Page
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='text-2xl font-bold'>
							{filters.page} / {totalPages || 1}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Filtres */}
			<Card className='mb-6'>
				<CardContent className='pt-6'>
					<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
						<div className='md:col-span-1 relative'>
							<Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
							<Input
								placeholder='Rechercher par numéro ou client...'
								value={filters.search}
								onChange={(e) => setSearch(e.target.value)}
								className='pl-10'
							/>
						</div>
						<Select
							value={filters.conversionFilter}
							onValueChange={(v: any) => setConversion(v)}
						>
							<SelectTrigger>
								<SelectValue placeholder='Conversion' />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='all'>Tous les tickets</SelectItem>
								<SelectItem value='not_converted'>Non convertis</SelectItem>
								<SelectItem value='converted'>Convertis en facture</SelectItem>
							</SelectContent>
						</Select>
						<Input
							type='date'
							value={filters.dateFilter}
							onChange={(e) => setDate(e.target.value)}
						/>
					</div>
				</CardContent>
			</Card>

			{/* Table */}
			<Card>
				<CardContent className='p-0'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Numéro</TableHead>
								<TableHead>Date</TableHead>
								<TableHead>Heure</TableHead>
								<TableHead>Client</TableHead>
								<TableHead>Caissier</TableHead>
								<TableHead className='text-right'>Montant</TableHead>
								<TableHead>Paiement</TableHead>
								<TableHead>Statut</TableHead>
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
							) : tickets.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={9}
										className='h-24 text-center text-muted-foreground'
									>
										<Receipt className='h-8 w-8 mx-auto mb-2 opacity-30' />
										<p>Aucun ticket trouvé</p>
									</TableCell>
								</TableRow>
							) : (
								tickets.map((ticket) => {
									const customer = ticket.expand?.customer
									const soldBy = (ticket as any).expand?.sold_by
									const cashierName =
										soldBy?.name ||
										soldBy?.username ||
										soldBy?.email ||
										(ticket.sold_by ? String(ticket.sold_by) : '—')
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
											<TableCell>
												<div>
													<p className='font-medium'>
														{customer?.name || 'Client passage'}
													</p>
													{customer?.email && (
														<p className='text-xs text-muted-foreground'>
															{customer.email}
														</p>
													)}
												</div>
											</TableCell>
											<TableCell className='text-sm text-muted-foreground'>
												{cashierName}
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
												<Badge variant='default' className='text-xs'>
													Payé
												</Badge>
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

			{/* Pagination serveur */}
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
							onClick={() => setPage(filters.page - 1)}
							disabled={filters.page <= 1}
						>
							<ChevronLeft className='h-4 w-4' />
							Précédent
						</Button>
						<span className='px-3 text-sm text-muted-foreground'>
							{filters.page} / {totalPages}
						</span>
						<Button
							variant='outline'
							size='sm'
							onClick={() => setPage(filters.page + 1)}
							disabled={filters.page >= totalPages}
						>
							Suivant
							<ChevronRight className='h-4 w-4' />
						</Button>
					</div>
				</div>
			)}

			{/* Dialogs */}
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
	)
}
