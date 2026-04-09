// frontend/modules/connect/pages/customers/CustomerDetailTabs.tsx
//
// Tabs extraites de CustomerDetailPage.
// Contient : Informations | Factures | Devis | Produits d'occasion

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useNavigate } from '@tanstack/react-router'
import {
	ArrowLeft,
	CheckCircle,
	Clock,
	FileText,
	Guitar,
	Mail,
	Phone,
	Plus,
	Receipt,
	XCircle,
} from 'lucide-react'
import {
	formatCurrency,
	formatDate,
	formatPaymentTerms,
} from '../../utils/formatters'
import {
	getCustomerTypeDisplay,
	getInvoiceStatus,
	getQuoteStatus,
	getTagClassName,
	normalizeTags,
} from '../../utils/statusConfig'
import { ConsignmentTab } from './ConsignmentTab'

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
	}
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
}: CustomerDetailTabsProps) {
	const navigate = useNavigate()

	const customerType = (customer as any)?.customer_type || 'individual'
	const typeDisplay = getCustomerTypeDisplay(customerType)
	const TypeIcon = typeDisplay.icon
	const paymentTerms = (customer as any)?.payment_terms
	const isIndividual = customerType === 'individual'

	return (
		<Tabs defaultValue='info' className='space-y-4'>
			<TabsList>
				<TabsTrigger value='info'>Informations</TabsTrigger>
				<TabsTrigger value='invoices' className='gap-2'>
					<Receipt className='h-4 w-4' />
					Factures ({stats.totalInvoices})
				</TabsTrigger>
				<TabsTrigger value='quotes' className='gap-2'>
					<FileText className='h-4 w-4' />
					Devis ({stats.totalQuotes})
				</TabsTrigger>
				<TabsTrigger value='consignment' className='gap-2'>
					<Guitar className='h-4 w-4' />
					Occasion {consignmentCount > 0 && `(${consignmentCount})`}
				</TabsTrigger>
			</TabsList>

			{/* ── Tab Informations ── */}
			<TabsContent value='info'>
				<Card>
					<CardHeader>
						<CardTitle>Informations</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<div className='space-y-1'>
							<p className='text-sm text-muted-foreground'>Type de client</p>
							<Badge variant='secondary' className={typeDisplay.className}>
								<TypeIcon className='h-3 w-3 mr-1' />
								{typeDisplay.label}
							</Badge>
						</div>

						<div className='space-y-1'>
							<p className='text-sm text-muted-foreground'>Nom</p>
							<p className='font-medium'>{customer.name}</p>
						</div>

						<div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
							<div className='space-y-1'>
								<p className='text-sm text-muted-foreground'>Email</p>
								{customer.email ? (
									<span>
										<Mail className='h-4 w-4' />
										{customer.email}
									</span>
								) : (
									<p className='text-muted-foreground'>-</p>
								)}
							</div>
							<div className='space-y-1'>
								<p className='text-sm text-muted-foreground'>Téléphone</p>
								{customer.phone ? (
									<a
										href={`tel:${customer.phone}`}
										className='flex items-center gap-2 text-blue-600 hover:underline'
									>
										<Phone className='h-4 w-4' />
										{customer.phone}
									</a>
								) : (
									<p className='text-muted-foreground'>-</p>
								)}
							</div>
						</div>

						{!isIndividual && (
							<div className='space-y-1'>
								<p className='text-sm text-muted-foreground'>
									Entreprise / Organisation
								</p>
								<p className='font-medium'>{customer.company || '-'}</p>
							</div>
						)}

						{!isIndividual && (
							<div className='space-y-1'>
								<p className='text-sm text-muted-foreground'>
									Délai de paiement
								</p>
								<Badge variant='outline'>
									{formatPaymentTerms(paymentTerms)}
								</Badge>
							</div>
						)}

						<div className='space-y-1'>
							<p className='text-sm text-muted-foreground'>Tags</p>
							<div className='flex gap-1 flex-wrap'>
								{(() => {
									const tags = normalizeTags((customer as any).tags)
									return tags.length > 0 ? (
										tags.map((tag) => (
											<Badge
												key={tag}
												variant='secondary'
												className={getTagClassName(tag)}
											>
												{tag}
											</Badge>
										))
									) : (
										<span className='text-muted-foreground'>-</span>
									)
								})()}
							</div>
						</div>

						<div className='space-y-1'>
							<p className='text-sm text-muted-foreground'>Adresse</p>
							<p className='font-medium whitespace-pre-line'>
								{customer.address || '-'}
							</p>
						</div>

						<div className='space-y-1'>
							<p className='text-sm text-muted-foreground'>Notes</p>
							<p className='font-medium whitespace-pre-line'>
								{customer.notes || '-'}
							</p>
						</div>
					</CardContent>
				</Card>
			</TabsContent>

			{/* ── Tab Factures ── */}
			<TabsContent value='invoices'>
				<Card>
					<CardHeader className='flex flex-row items-center justify-between'>
						<CardTitle className='flex items-center gap-2'>
							<Receipt className='h-5 w-5' />
							Factures
						</CardTitle>
						<Button
							size='sm'
							className='gap-2'
							onClick={() => navigate({ to: '/connect/invoices/new' })}
						>
							<Plus className='h-4 w-4' />
							Nouvelle facture
						</Button>
					</CardHeader>
					<CardContent>
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
									onClick={() => navigate({ to: '/connect/invoices/new' })}
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
										<TableHead>Statut</TableHead>
										<TableHead>Paiement</TableHead>
										<TableHead className='w-10' />
									</TableRow>
								</TableHeader>
								<TableBody>
									{invoices.map((invoice: InvoiceResponse) => {
										const statusInfo = getInvoiceStatus(invoice.status)
										return (
											<TableRow
												key={invoice.id}
												className='cursor-pointer hover:bg-muted/50'
												onClick={() =>
													navigate({
														to: '/connect/invoices/$invoiceId',
														params: { invoiceId: invoice.id },
													})
												}
											>
												<TableCell className='font-medium'>
													{invoice.number || '-'}
												</TableCell>
												<TableCell>{formatDate(invoice.date)}</TableCell>
												<TableCell className='font-medium'>
													{formatCurrency(invoice.total_ttc)}
												</TableCell>
												<TableCell>
													<Badge variant={statusInfo.variant}>
														{statusInfo.label}
													</Badge>
												</TableCell>
												<TableCell>
													{/* Vérification si c'est un avoir (ajuste 'invoice_type' selon ta base de données) */}
													{invoice.invoice_type === 'credit_note' ? (
														<span className='flex items-center gap-1 text-purple-600'>
															<CheckCircle className='h-4 w-4' />
															Avoir
														</span>
													) : invoice.is_paid ? (
														<span className='flex items-center gap-1 text-green-600'>
															<CheckCircle className='h-4 w-4' />
															Payé
														</span>
													) : invoice.status !== 'draft' ? (
														<span className='flex items-center gap-1 text-orange-600'>
															<Clock className='h-4 w-4' />
															En attente
														</span>
													) : (
														<span className='text-muted-foreground'>-</span>
													)}
												</TableCell>
												<TableCell>
													<Button
														variant='ghost'
														size='icon'
														className='h-8 w-8'
														onClick={(e) => {
															e.stopPropagation()
															navigate({
																to: '/connect/invoices/$invoiceId',
																params: { invoiceId: invoice.id },
															})
														}}
													>
														<ArrowLeft className='h-4 w-4 rotate-180' />
													</Button>
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

			{/* ── Tab Devis ── */}
			<TabsContent value='quotes'>
				<Card>
					<CardHeader className='flex flex-row items-center justify-between'>
						<CardTitle className='flex items-center gap-2'>
							<FileText className='h-5 w-5' />
							Devis
						</CardTitle>
						<Button
							size='sm'
							className='gap-2'
							onClick={() => navigate({ to: '/connect/quotes/new' })}
						>
							<Plus className='h-4 w-4' />
							Nouveau devis
						</Button>
					</CardHeader>
					<CardContent>
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
									onClick={() => navigate({ to: '/connect/quotes/new' })}
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
										<TableHead className='w-10' />
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
												className='cursor-pointer hover:bg-muted/50'
												onClick={() =>
													navigate({
														to: '/connect/quotes/$quoteId',
														params: { quoteId: quote.id },
													})
												}
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
												<TableCell>
													<Button
														variant='ghost'
														size='icon'
														className='h-8 w-8'
														onClick={(e) => {
															e.stopPropagation()
															navigate({
																to: '/connect/quotes/$quoteId',
																params: { quoteId: quote.id },
															})
														}}
													>
														<ArrowLeft className='h-4 w-4 rotate-180' />
													</Button>
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

			{/* ── Tab Produits d'occasion ── */}
			<TabsContent value='consignment'>
				<ConsignmentTab
					customerId={customerId}
					ownerCompanyId={activeCompanyId ?? ''}
					customer={customer as CustomersResponse}
					company={company}
					commissionRate={20}
				/>
			</TabsContent>
		</Tabs>
	)
}
