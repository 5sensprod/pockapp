// frontend/modules/connect/components/QuotesTable.tsx
//
// Composant PRESENTATIONAL — table des devis + pagination serveur.
// Clic sur une ligne → navigation vers le détail du devis.

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
import type {
	InvoiceResponse,
	QuoteResponse,
	QuoteStatus,
} from '@/lib/types/invoice.types'
import { CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { useDocumentNavigation } from '../../hooks/useDocumentNavigation'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { getPaginationRange } from '../../utils/pagination'

function getQuoteStatusLabel(status: QuoteStatus) {
	const map: Record<QuoteStatus, string> = {
		draft: 'Brouillon',
		sent: 'Envoyé',
		accepted: 'Accepté',
		rejected: 'Refusé',
	}
	return map[status]
}

function getQuoteStatusVariant(
	status: QuoteStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
	switch (status) {
		case 'draft':
			return 'secondary'
		case 'sent':
			return 'outline'
		case 'accepted':
			return 'default'
		case 'rejected':
			return 'destructive'
	}
}

export interface QuotesTableProps {
	quotes: QuoteResponse[]
	isLoading?: boolean
	// Pagination serveur
	page: number
	totalPages: number
	totalItems: number
	perPage: number
	onPageChange: (page: number) => void
	// Props conservées pour compatibilité avec QuotesPage
	downloadingQuoteId?: string | null
	onDownloadPdf?: (quote: QuoteResponse) => void
	onOpenEmail?: (quote: QuoteResponse) => void
	onOpenConvert?: (quote: QuoteResponse) => void
	onOpenDelete?: (quote: QuoteResponse) => void
	convertIsPending?: boolean
}

export function QuotesTable({
	quotes,
	isLoading = false,
	page,
	totalPages,
	totalItems,
	perPage,
	onPageChange,
}: QuotesTableProps) {
	const { goToDetail } = useDocumentNavigation('quote')
	const { rangeStart, rangeEnd } = getPaginationRange(page, perPage, totalItems)

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
							<TableHead>Validité</TableHead>
							<TableHead>Montant TTC</TableHead>
							<TableHead>Statut</TableHead>
							<TableHead>Facture liée</TableHead>
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
								<TableCell
									colSpan={8}
									className='h-24 text-center text-muted-foreground'
								>
									Aucun devis trouvé pour ces filtres.
								</TableCell>
							</TableRow>
						) : (
							quotes.map((quote) => {
								const customer = quote.expand?.customer
								const linkedInvoice = quote.expand?.generated_invoice_id as
									| InvoiceResponse
									| undefined
								const issuedBy = (quote as any).expand?.issued_by
								const sellerName =
									issuedBy?.name ||
									issuedBy?.username ||
									issuedBy?.email ||
									(quote as any).issued_by ||
									'—'

								return (
									<TableRow
										key={quote.id}
										className='cursor-pointer hover:bg-muted/50 transition-colors'
										onClick={() => goToDetail(quote.id)}
									>
										<TableCell className='font-mono font-medium'>
											{quote.number}
										</TableCell>
										<TableCell className='text-sm text-muted-foreground'>
											{sellerName}
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
										<TableCell>{formatDate(quote.date)}</TableCell>
										<TableCell>
											{quote.valid_until ? formatDate(quote.valid_until) : '-'}
										</TableCell>
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
												<span className='text-xs text-muted-foreground'>—</span>
											)}
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
