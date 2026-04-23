// frontend/modules/connect/pages/customers/CustomerDetailTabs.tsx
//
// Tabs extraites de CustomerDetailPage.
// Contient : Factures | Devis | Bons de commande | Produits d'occasion
// Clic sur une ligne → navigation directe vers le détail avec contexte from=customer

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type {
	CompaniesResponse,
	CustomersResponse,
} from '@/lib/pocketbase-types'
import type { InvoiceResponse, QuoteResponse } from '@/lib/types/invoice.types'
import {
	CheckCircle,
	ClipboardList,
	Clock,
	FileText,
	Guitar,
	Plus,
	Receipt,
	XCircle,
} from 'lucide-react'
import { useDocumentNavigation } from '../../hooks/useDocumentNavigation'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { getQuoteStatus } from '../../utils/statusConfig'
import { ConsignmentTab } from './ConsignmentTab'
import { CustomerOrdersTab } from './CustomerOrdersTab'

// ============================================================================
// PROPS
// ============================================================================

interface CustomerDetailTabsProps {
	customer: CustomersResponse
	company?: CompaniesResponse
	activeCompanyId: string | null
	customerId: string
	invoices: InvoiceResponse[]
	quotes: QuoteResponse[]
	consignmentCount: number
	isLoadingInvoices: boolean
	isLoadingQuotes: boolean
	stats: {
		totalInvoices: number
		totalQuotes: number
		totalInvoiced: number
		totalPaid: number
		unpaidCount: number
		acceptedQuotes: number
		depositsByParent: Record<string, number>
	}
	defaultTab?: string
	/** Déclenche la vue inline de création de bon de commande */
	onNewOrder?: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CustomerDetailTabs({
	customer,
	company,
	activeCompanyId,
	customerId,
	invoices,
	quotes,
	consignmentCount,
	isLoadingInvoices,
	isLoadingQuotes,
	stats,
	defaultTab = 'invoices',
	onNewOrder,
}: CustomerDetailTabsProps) {
	const { goToDetail: goToInvoice } = useDocumentNavigation('invoice')
	const { goToDetail: goToQuote } = useDocumentNavigation('quote')

	// ── DESIGN DES ONGLETS ───────────────────────────────────────────────────
	const sharedTabsList = (
		<TabsList className='bg-transparent h-auto p-0 flex items-center justify-start gap-3 sm:gap-5'>
			<TabsTrigger
				value='invoices'
				className='p-0 gap-2 text-base sm:text-lg font-semibold tracking-tight text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-colors'
			>
				<Receipt className='h-5 w-5' />
				Factures ({stats.totalInvoices})
			</TabsTrigger>

			{/* biome-ignore lint/a11y/useFocusableInteractive: <explanation> */}
			<div role='separator' className='h-5 w-px bg-border' />

			<TabsTrigger
				value='quotes'
				className='p-0 gap-2 text-base sm:text-lg font-semibold tracking-tight text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-colors'
			>
				<FileText className='h-5 w-5' />
				Devis ({stats.totalQuotes})
			</TabsTrigger>

			{/* biome-ignore lint/a11y/useFocusableInteractive: <explanation> */}
			<div role='separator' className='h-5 w-px bg-border' />

			<TabsTrigger
				value='orders'
				className='p-0 gap-2 text-base sm:text-lg font-semibold tracking-tight text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-colors'
			>
				<ClipboardList className='h-5 w-5' />
				Commandes
			</TabsTrigger>

			{/* biome-ignore lint/a11y/useFocusableInteractive: <explanation> */}
			<div role='separator' className='h-5 w-px bg-border' />

			<TabsTrigger
				value='consignment'
				className='p-0 gap-2 text-base sm:text-lg font-semibold tracking-tight text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-colors'
			>
				<Guitar className='h-5 w-5' />
				Occasion {consignmentCount > 0 && `(${consignmentCount})`}
			</TabsTrigger>
		</TabsList>
	)

	return (
		<Tabs defaultValue={defaultTab} className='space-y-4'>
			{/* ── Tab Factures ─────────────────────────────────────────────────── */}
			<TabsContent value='invoices' className='mt-0'>
				<Card>
					<CardHeader className='flex flex-row items-center justify-between pb-4 border-b border-border/40'>
						{sharedTabsList}
						<Button
							size='sm'
							className='gap-2'
							onClick={() => goToInvoice('new', customerId)}
						>
							<Plus className='h-4 w-4' />
							Nouvelle facture
						</Button>
					</CardHeader>
					<CardContent className='pt-6'>
						{isLoadingInvoices ? (
							<p className='text-muted-foreground py-4'>Chargement...</p>
						) : invoices.length === 0 ? (
							<div className='text-center py-8 text-muted-foreground'>
								<Receipt className='h-12 w-12 mx-auto mb-2 opacity-30' />
								<p>Aucune facture pour ce client</p>
								<Button
									variant='outline'
									size='sm'
									className='mt-4 gap-2'
									onClick={() => goToInvoice('new', customerId)}
								>
									<Plus className='h-4 w-4' />
									Créer une facture
								</Button>
							</div>
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Numéro</TableHead>
										<TableHead>Date</TableHead>
										<TableHead>Montant TTC</TableHead>
										<TableHead>Paiement</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{invoices.map((invoice: InvoiceResponse) => {
										const isCreditNote = invoice.invoice_type === 'credit_note'
										const isDeposit = invoice.invoice_type === 'deposit'
										const totalTtc = invoice.total_ttc ?? 0
										const creditNotesTotal = invoice.credit_notes_total ?? 0
										const isFullyCancelled =
											totalTtc > 0 && creditNotesTotal >= totalTtc

										// Acompte remboursé : cherche un avoir lié dans la liste locale
										const depositRefundedAmount = isDeposit
											? invoices
													.filter(
														(inv) =>
															inv.invoice_type === 'credit_note' &&
															inv.original_invoice_id != null &&
															inv.original_invoice_id === invoice.id,
													)
													.reduce(
														(sum, inv) => sum + Math.abs(inv.total_ttc ?? 0),
														0,
													)
											: 0
										const isDepositRefunded =
											isDeposit && depositRefundedAmount >= totalTtc - 0.01

										// Avoir sur acompte : cet avoir porte sur un deposit
										const isDepositCreditNote =
											isCreditNote &&
											invoices.some(
												(inv) =>
													inv.id === invoice.original_invoice_id &&
													inv.invoice_type === 'deposit',
											)

										// Facture parente avec acompte(s) partiellement encaissé(s)
										const partialDepositAmount =
											!isCreditNote && !isDeposit && !invoice.is_paid
												? (stats.depositsByParent[invoice.id] ?? 0)
												: 0

										return (
											<TableRow
												key={invoice.id}
												className='cursor-pointer hover:bg-muted/50 transition-colors'
												onClick={() => goToInvoice(invoice.id, customerId)}
											>
												<TableCell className='font-medium'>
													{invoice.number || '-'}
												</TableCell>
												<TableCell>{formatDate(invoice.date)}</TableCell>
												<TableCell className='font-medium'>
													{formatCurrency(invoice.total_ttc)}
												</TableCell>
												<TableCell>
													{isCreditNote ? (
														<span className='flex items-center gap-1 text-purple-600'>
															<CheckCircle className='h-4 w-4' />
															{isDepositCreditNote
																? 'Avoir sur acompte'
																: 'Avoir'}
														</span>
													) : isDepositRefunded ? (
														<span className='flex items-center gap-1 text-orange-600'>
															<XCircle className='h-4 w-4' />
															Acompte remboursé
														</span>
													) : isFullyCancelled ? (
														invoice.is_paid ? (
															<span className='flex items-center gap-1 text-orange-600'>
																<CheckCircle className='h-4 w-4' />
																Remboursé
															</span>
														) : (
															<span className='flex items-center gap-1 text-gray-500'>
																<XCircle className='h-4 w-4' />
																Abandonné
															</span>
														)
													) : invoice.is_paid ? (
														<span className='flex items-center gap-1 text-green-600'>
															<CheckCircle className='h-4 w-4' />
															{isDeposit ? 'Acompte encaissé' : 'Payé'}
														</span>
													) : invoice.status !== 'draft' ? (
														partialDepositAmount > 0 ? (
															<span className='flex items-center gap-1 text-blue-600'>
																<Clock className='h-4 w-4' />
																Acompte {formatCurrency(partialDepositAmount)}{' '}
																encaissé
															</span>
														) : (
															<span className='flex items-center gap-1 text-orange-600'>
																<Clock className='h-4 w-4' />
																En attente
															</span>
														)
													) : (
														<span className='text-muted-foreground'>-</span>
													)}
												</TableCell>
											</TableRow>
										)
									})}
								</TableBody>
							</Table>
						)}
					</CardContent>
				</Card>
			</TabsContent>

			{/* ── Tab Devis ─────────────────────────────────────────────────────── */}
			<TabsContent value='quotes' className='mt-0'>
				<Card>
					<CardHeader className='flex flex-row items-center justify-between pb-4 border-b border-border/40'>
						{sharedTabsList}
						<Button
							size='sm'
							className='gap-2'
							onClick={() => goToQuote('new', customerId)}
						>
							<Plus className='h-4 w-4' />
							Nouveau devis
						</Button>
					</CardHeader>
					<CardContent className='pt-6'>
						{isLoadingQuotes ? (
							<p className='text-muted-foreground py-4'>Chargement...</p>
						) : quotes.length === 0 ? (
							<div className='text-center py-8 text-muted-foreground'>
								<FileText className='h-12 w-12 mx-auto mb-2 opacity-30' />
								<p>Aucun devis pour ce client</p>
								<Button
									variant='outline'
									size='sm'
									className='mt-4 gap-2'
									onClick={() => goToQuote('new', customerId)}
								>
									<Plus className='h-4 w-4' />
									Créer un devis
								</Button>
							</div>
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Numéro</TableHead>
										<TableHead>Date</TableHead>
										<TableHead>Validité</TableHead>
										<TableHead>Montant TTC</TableHead>
										<TableHead>Statut</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{quotes.map((quote: QuoteResponse) => {
										const statusInfo = getQuoteStatus(quote.status)
										const isExpired =
											quote.valid_until &&
											new Date(quote.valid_until) < new Date() &&
											quote.status !== 'accepted'

										return (
											<TableRow
												key={quote.id}
												className='cursor-pointer hover:bg-muted/50 transition-colors'
												onClick={() => goToQuote(quote.id, customerId)}
											>
												<TableCell className='font-medium'>
													{quote.number || '-'}
												</TableCell>
												<TableCell>{formatDate(quote.date)}</TableCell>
												<TableCell>
													{isExpired ? (
														<span className='flex items-center gap-1 text-red-600'>
															<XCircle className='h-4 w-4' />
															Expiré
														</span>
													) : (
														formatDate(quote.valid_until)
													)}
												</TableCell>
												<TableCell className='font-medium'>
													{formatCurrency(quote.total_ttc)}
												</TableCell>
												<TableCell>
													<Badge variant={statusInfo.variant}>
														{statusInfo.label}
													</Badge>
													{quote.generated_invoice_id && (
														<Badge variant='outline' className='ml-1'>
															Facturé
														</Badge>
													)}
												</TableCell>
											</TableRow>
										)
									})}
								</TableBody>
							</Table>
						)}
					</CardContent>
				</Card>
			</TabsContent>

			{/* ── Tab Bons de commande ─────────────────────────────────────────── */}
			<TabsContent value='orders' className='mt-0'>
				<Card>
					<CardHeader className='flex flex-row items-center justify-between pb-4 border-b border-border/40'>
						{sharedTabsList}
						<Button size='sm' className='gap-2' onClick={() => onNewOrder?.()}>
							<Plus className='h-4 w-4' />
							Nouveau bon
						</Button>
					</CardHeader>
					<CardContent className='pt-6'>
						<CustomerOrdersTab customerId={customerId} />
					</CardContent>
				</Card>
			</TabsContent>

			{/* ── Tab Produits d'occasion ──────────────────────────────────────── */}
			<TabsContent value='consignment' className='mt-0'>
				<ConsignmentTab
					customerId={customerId}
					ownerCompanyId={activeCompanyId ?? ''}
					customer={customer as CustomersResponse}
					company={company}
					commissionRate={20}
					tabsList={sharedTabsList}
				/>
			</TabsContent>
		</Tabs>
	)
}
