// frontend/modules/cash/TicketsPage.tsx

import { EmptyState } from '@/components/module-ui'
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
import { loadPosPrinterSettings } from '@/lib/pos/printerSettings'
import { useReprintTicket } from '@/lib/pos/useReprintTicket'
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
	Printer,
	Receipt,
	RotateCcw,
	Search,
	X,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { CashModuleShell } from './CashModuleShell'

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

function getItemsPreview(ticket: any) {
	const lines =
		ticket.items || // ← champ JSON direct, à mettre en premier
		ticket.expand?.['invoice_lines(invoice)'] ||
		ticket.expand?.['invoice_items(invoice)'] ||
		ticket.expand?.items ||
		ticket.expand?.lines

	if (Array.isArray(lines) && lines.length > 0) {
		const names = lines.map(
			(l: any) =>
				l.name || l.designation || l.title || l.product_name || 'Article',
		)
		const firstTwo = names.slice(0, 2)
		const extra = names.length - 2

		return (
			<div className='flex flex-col gap-0.5'>
				{firstTwo.map((name: string) => (
					<span key={name} className='text-sm truncate'>
						{name}
					</span>
				))}
				{extra > 0 && (
					<span className='text-xs text-muted-foreground'>
						+{extra} article{extra > 1 ? 's' : ''}
					</span>
				)}
			</div>
		)
	}

	return (
		<span className='text-muted-foreground italic text-xs'>
			Détails dans le ticket...
		</span>
	)
}

const PER_PAGE = 30

// ── Composant ─────────────────────────────────────────────────────────────────

export function TicketsPage() {
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()

	const [search, setSearch] = useState('')
	const [page, setPage] = useState(1)
	const debouncedSearch = useDebounce(search, 400)
	const searchInputRef = useRef<HTMLInputElement>(null)

	// ── Impression / aperçu ───────────────────────────────────────────────────
	const { reprintTicket, previewTicket, isPrinting, isPreviewing } =
		useReprintTicket()

	const isPrinterConfigured = useMemo(() => {
		const s = loadPosPrinterSettings()
		return s.enabled && !!s.printerName
	}, [])

	// ── Données ───────────────────────────────────────────────────────────────
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

	// ── Dialogues ────────────────────────────────────────────────────────────
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

	const handleResetSearch = () => {
		setSearch('')
		setPage(1)
		setTimeout(() => searchInputRef.current?.focus(), 0)
	}

	// ── Slots header ──────────────────────────────────────────────────────────

	// Centre : barre de recherche
	const headerCenter = (
		<div className='relative w-[350px] transition-all focus-within:w-[400px]'>
			<Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
			<Input
				ref={searchInputRef}
				placeholder='Rechercher un N° de ticket...'
				value={search}
				onChange={(e) => {
					setSearch(e.target.value)
					setPage(1)
				}}
				className='h-9 pl-9 pr-9 bg-background/50 focus-visible:bg-background border-muted-foreground/20 shadow-sm transition-all text-sm'
			/>
			{search && (
				<button
					type='button'
					onClick={handleResetSearch}
					className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors'
				>
					<X className='h-4 w-4' />
				</button>
			)}
		</div>
	)

	// Droite : compteur + pagination (avant le badge session)
	const headerRight = (
		<div className='flex items-center gap-3'>
			{/* Compteur */}
			<div className='hidden md:flex flex-col items-end leading-none'>
				<span className='text-xs font-semibold text-foreground'>
					{totalItems} ticket{totalItems > 1 ? 's' : ''}
				</span>
				<span className='text-[10px] text-muted-foreground'>
					{rangeStart}–{rangeEnd} affichés
				</span>
			</div>

			{/* Pagination */}
			<div className='flex items-center gap-1 bg-background/50 p-1 rounded-md border border-muted-foreground/20 shadow-sm'>
				<Button
					variant='ghost'
					size='icon'
					className='h-6 w-6 rounded-[4px]'
					onClick={() => setPage((p) => p - 1)}
					disabled={page <= 1}
				>
					<ChevronLeft className='h-3 w-3' />
				</Button>
				<span className='text-[11px] font-medium min-w-[28px] text-center'>
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

	// ── Rendu ─────────────────────────────────────────────────────────────────
	return (
		<CashModuleShell
			pageTitle='Tickets de caisse'
			pageIcon={Receipt}
			hideSessionActions
			headerCenter={headerCenter}
			headerRight={headerRight}
		>
			<div className='container mx-auto px-6 py-6'>
				<Card className='shadow-sm border-muted/60'>
					<CardContent className='p-0'>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Numéro</TableHead>
									<TableHead>Date & Heure</TableHead>
									<TableHead className='w-1/3'>Articles</TableHead>
									<TableHead className='text-right'>Montant</TableHead>
									<TableHead>Paiement</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{isLoading ? (
									<TableRow>
										<TableCell colSpan={5} className='h-24 text-center'>
											<div className='flex items-center justify-center'>
												<div className='h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin' />
											</div>
										</TableCell>
									</TableRow>
								) : tickets.length === 0 ? (
									<TableRow>
										<TableCell colSpan={5} className='py-16'>
											<EmptyState
												icon={debouncedSearch ? Search : Receipt}
												title='Aucun ticket trouvé'
												description={
													debouncedSearch
														? `Aucun résultat ne correspond à votre recherche "${debouncedSearch}".`
														: "Aucun ticket de caisse n'a été enregistré pour le moment."
												}
												actions={
													debouncedSearch
														? [
																{
																	label: 'Effectuer une nouvelle recherche',
																	onClick: handleResetSearch,
																},
															]
														: []
												}
											/>
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
											<DropdownMenu key={ticket.id} modal={false}>
												<DropdownMenuTrigger asChild>
													<TableRow className='cursor-pointer hover:bg-muted/50 data-[state=open]:bg-muted transition-colors'>
														<TableCell>
															<div className='flex items-center gap-2'>
																<span className='font-mono font-medium'>
																	{ticket.number}
																</span>

																{ticket.converted_to_invoice && (
																	<Badge
																		variant='secondary'
																		className='text-[10px] uppercase tracking-wider bg-blue-100 text-blue-700 hover:bg-blue-100/80 dark:bg-blue-900/40 dark:text-blue-400 border-none'
																	>
																		Facturé
																	</Badge>
																)}

																{remainingAmount <= 0 &&
																	(ticket.total_ttc ?? 0) > 0 && (
																		<Badge
																			variant='secondary'
																			className='text-[10px] uppercase tracking-wider bg-orange-100 text-orange-700 hover:bg-orange-100/80 dark:bg-orange-900/40 dark:text-orange-400 border-none'
																		>
																			Remboursé
																		</Badge>
																	)}

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

														<TableCell>
															<div className='flex flex-col'>
																<span className='font-medium'>
																	{formatDate(ticket.date)}
																</span>
																<span className='text-xs text-muted-foreground'>
																	{formatTime(ticket.created)}
																</span>
															</div>
														</TableCell>

														<TableCell className='max-w-[200px]'>
															{getItemsPreview(ticket)}
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
													</TableRow>
												</DropdownMenuTrigger>

												<DropdownMenuContent align='center' className='w-56'>
													<DropdownMenuLabel>
														Actions pour {ticket.number}
													</DropdownMenuLabel>
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

													<DropdownMenuItem
														disabled={isPreviewing}
														onClick={() => previewTicket(ticket)}
													>
														<Receipt className='h-4 w-4 mr-2' />
														{isPreviewing ? 'Chargement…' : 'Aperçu ticket'}
													</DropdownMenuItem>

													{isPrinterConfigured && (
														<DropdownMenuItem
															disabled={isPrinting}
															onClick={() => reprintTicket(ticket)}
														>
															<Printer className='h-4 w-4 mr-2' />
															{isPrinting ? 'Impression…' : 'Réimprimer'}
														</DropdownMenuItem>
													)}

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
																	<FileText className='h-4 w-4 mr-2' />
																	Convertir en facture
																</DropdownMenuItem>
															</>
														)}

													{ticket.converted_to_invoice &&
														ticket.converted_invoice_id && (
															<DropdownMenuItem
																onClick={() => {
																	if (!ticket.converted_invoice_id) return
																	navigate({
																		to: '/connect/invoices/$invoiceId',
																		params: {
																			invoiceId: ticket.converted_invoice_id,
																		},
																	})
																}}
															>
																<FileText className='h-4 w-4 mr-2 text-blue-600' />
																Voir la facture associée
															</DropdownMenuItem>
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
																			: 'text-orange-600 focus:text-orange-700'
																	}
																>
																	<RotateCcw className='h-4 w-4 mr-2' />
																	Rembourser
																</DropdownMenuItem>
															</>
														)}
												</DropdownMenuContent>
											</DropdownMenu>
										)
									})
								)}
							</TableBody>
						</Table>
					</CardContent>
				</Card>

				<RefundTicketDialog
					open={refundTicketDialogOpen}
					onOpenChange={(o) => {
						if (!o) {
							setRefundTicketDialogOpen(false)
							setTicketToRefund(null)
						} else {
							setRefundTicketDialogOpen(true)
						}
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
