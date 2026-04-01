// frontend/modules/connect/components/QuotesTable.tsx
//
// Composant PRESENTATIONAL — table des devis + pagination serveur.
// Toute la logique métier reste dans QuotesPage.

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
import type { InvoiceResponse, QuoteResponse, QuoteStatus } from '@/lib/types/invoice.types'
import { useNavigate } from '@tanstack/react-router'
import {
	ArrowRight,
	CheckCircle,
	ChevronLeft,
	ChevronRight,
	Download,
	Edit,
	Eye,
	Loader2,
	Mail,
	MoreHorizontal,
	Trash2,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr?: string) {
	if (!dateStr) return '-'
	return new Date(dateStr).toLocaleDateString('fr-FR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	})
}

function formatCurrency(amount: number, currency = 'EUR') {
	return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount)
}

function getQuoteStatusLabel(status: QuoteStatus) {
	const map: Record<QuoteStatus, string> = {
		draft: 'Brouillon',
		sent: 'Envoyé',
		accepted: 'Accepté',
		rejected: 'Refusé',
	}
	return map[status]
}

function getQuoteStatusVariant(status: QuoteStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
	switch (status) {
		case 'draft': return 'secondary'
		case 'sent': return 'outline'
		case 'accepted': return 'default'
		case 'rejected': return 'destructive'
	}
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuotesTableProps {
	quotes: QuoteResponse[]
	isLoading?: boolean
	downloadingQuoteId: string | null
	// Pagination serveur
	page: number
	totalPages: number
	totalItems: number
	perPage: number
	onPageChange: (page: number) => void
	// Handlers
	onDownloadPdf: (quote: QuoteResponse) => void
	onOpenEmail: (quote: QuoteResponse) => void
	onOpenConvert: (quote: QuoteResponse) => void
	onOpenDelete: (quote: QuoteResponse) => void
	convertIsPending: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function QuotesTable({
	quotes,
	isLoading = false,
	downloadingQuoteId,
	page,
	totalPages,
	totalItems,
	perPage,
	onPageChange,
	onDownloadPdf,
	onOpenEmail,
	onOpenConvert,
	onOpenDelete,
	convertIsPending,
}: QuotesTableProps) {
	const navigate = useNavigate()

	const rangeStart = totalItems === 0 ? 0 : (page - 1) * perPage + 1
	const rangeEnd = Math.min(page * perPage, totalItems)

	return (
		<div className='space-y-4'>
			<div className='rounded-md border'>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Numéro</TableHead>
							<TableHead>Vendeur</TableHead>
							<TableHead>Client</TableHead>
							<TableHead>Date</TableHead>
							<TableHead>Montant TTC</TableHead>
							<TableHead>Statut</TableHead>
							<TableHead>Facture liée</TableHead>
							<TableHead className='w-10' />
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
						) : quotes.length === 0 ? (
							<TableRow>
								<TableCell colSpan={8} className='h-24 text-center text-muted-foreground'>
									Aucun devis trouvé pour ces filtres.
								</TableCell>
							</TableRow>
						) : (
							quotes.map((quote) => {
								const customer = quote.expand?.customer
								const linkedInvoice = quote.expand?.generated_invoice_id as InvoiceResponse | undefined
								const isDownloading = downloadingQuoteId === quote.id

								const issuedBy = (quote as any).expand?.issued_by
								const sellerName =
									issuedBy?.name ||
									issuedBy?.username ||
									issuedBy?.email ||
									(quote as any).issued_by ||
									'—'

								return (
									<TableRow key={quote.id}>
										<TableCell className='font-mono font-medium'>
											{quote.number}
										</TableCell>
										<TableCell className='text-sm text-muted-foreground'>
											{sellerName}
										</TableCell>
										<TableCell>
											<div>
												<p className='font-medium'>{customer?.name || 'Client inconnu'}</p>
												{customer?.email && (
													<p className='text-xs text-muted-foreground'>{customer.email}</p>
												)}
											</div>
										</TableCell>
										<TableCell>{formatDate(quote.date)}</TableCell>
										<TableCell className='font-medium'>
											{formatCurrency(quote.total_ttc, quote.currency)}
										</TableCell>
										<TableCell>
											<Badge variant={getQuoteStatusVariant(quote.status)}>
												{getQuoteStatusLabel(quote.status)}
											</Badge>
										</TableCell>
										<TableCell>
											{linkedInvoice ? (
												<div className='flex items-center gap-2 text-sm text-green-700'>
													<CheckCircle className='h-4 w-4' />
													<span>Facture {linkedInvoice.number}</span>
												</div>
											) : (
												<span className='text-xs text-muted-foreground'>
													Pas encore transformé
												</span>
											)}
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
														onClick={() => navigate({ to: '/connect/quotes/$quoteId', params: { quoteId: quote.id } })}
													>
														<Eye className='h-4 w-4 mr-2' />
														Voir
													</DropdownMenuItem>

													<DropdownMenuItem
														onClick={() => navigate({ to: '/connect/quotes/$quoteId/edit', params: { quoteId: quote.id } })}
													>
														<Edit className='h-4 w-4 mr-2' />
														Modifier
													</DropdownMenuItem>

													<DropdownMenuSeparator />

													<DropdownMenuItem onClick={() => onDownloadPdf(quote)} disabled={isDownloading}>
														{isDownloading
															? <Loader2 className='h-4 w-4 mr-2 animate-spin' />
															: <Download className='h-4 w-4 mr-2' />}
														Télécharger PDF
													</DropdownMenuItem>

													<DropdownMenuItem onClick={() => onOpenEmail(quote)}>
														<Mail className='h-4 w-4 mr-2' />
														Envoyer par email
													</DropdownMenuItem>

													<DropdownMenuItem
														disabled={!!quote.generated_invoice_id || convertIsPending}
														onClick={() => onOpenConvert(quote)}
													>
														<ArrowRight className='h-4 w-4 mr-2' />
														Transformer en facture
													</DropdownMenuItem>

													<DropdownMenuSeparator />

													<DropdownMenuItem onClick={() => onOpenDelete(quote)} className='text-red-600'>
														<Trash2 className='h-4 w-4 mr-2' />
														Supprimer
													</DropdownMenuItem>
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
						{rangeStart}–{rangeEnd} sur {totalItems} devis
					</div>
					<div className='flex items-center gap-1'>
						<Button variant='outline' size='sm' onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
							<ChevronLeft className='h-4 w-4' />
							Précédent
						</Button>
						<span className='px-3 text-sm text-muted-foreground'>{page} / {totalPages}</span>
						<Button variant='outline' size='sm' onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
							Suivant
							<ChevronRight className='h-4 w-4' />
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}
