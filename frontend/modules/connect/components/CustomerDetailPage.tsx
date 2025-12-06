// frontend/modules/connect/components/CustomerDetailPage.tsx

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
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useCustomer } from '@/lib/queries/customers'
import { useInvoices } from '@/lib/queries/invoices'
import { useQuotes } from '@/lib/queries/quotes'
import type { InvoiceResponse, QuoteResponse } from '@/lib/types/invoice.types'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
	ArrowLeft,
	CheckCircle,
	Clock,
	FileText,
	Mail,
	Phone,
	Plus,
	Receipt,
	User,
	XCircle,
} from 'lucide-react'

// ============================================================================
// HELPERS
// ============================================================================

const formatDate = (dateString?: string) => {
	if (!dateString) return '-'
	return new Date(dateString).toLocaleDateString('fr-FR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	})
}

const formatCurrency = (amount?: number) => {
	if (amount === undefined || amount === null) return '-'
	return new Intl.NumberFormat('fr-FR', {
		style: 'currency',
		currency: 'EUR',
	}).format(amount)
}

// Statuts factures
const invoiceStatusConfig: Record<
	string,
	{
		label: string
		variant: 'default' | 'secondary' | 'destructive' | 'outline'
	}
> = {
	draft: { label: 'Brouillon', variant: 'secondary' },
	validated: { label: 'Validée', variant: 'default' },
	sent: { label: 'Envoyée', variant: 'default' },
	cancelled: { label: 'Annulée', variant: 'destructive' },
}

// Statuts devis
const quoteStatusConfig: Record<
	string,
	{
		label: string
		variant: 'default' | 'secondary' | 'destructive' | 'outline'
	}
> = {
	draft: { label: 'Brouillon', variant: 'secondary' },
	sent: { label: 'Envoyé', variant: 'default' },
	accepted: { label: 'Accepté', variant: 'default' },
	rejected: { label: 'Refusé', variant: 'destructive' },
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CustomerDetailPage() {
	const { customerId } = useParams({
		from: '/connect/customers/$customerId/',
	})
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()

	// Récupérer le client
	const { data: customer, isLoading: isLoadingCustomer } =
		useCustomer(customerId)

	// Récupérer les factures du client
	const { data: invoicesData, isLoading: isLoadingInvoices } = useInvoices({
		companyId: activeCompanyId ?? undefined,
		customerId,
		sort: '-date',
		perPage: 100,
	})

	// Récupérer les devis du client
	const { data: quotesData, isLoading: isLoadingQuotes } = useQuotes({
		companyId: activeCompanyId ?? undefined,
		customerId,
		sort: '-date',
		perPage: 100,
	})

	const invoices = invoicesData?.items ?? []
	const quotes = quotesData?.items ?? []

	// Calculer les stats
	const stats = {
		totalInvoices: invoices.length,
		totalQuotes: quotes.length,
		totalInvoiced: invoices.reduce((sum, inv) => sum + (inv.total_ttc || 0), 0),
		totalPaid: invoices
			.filter((inv) => inv.is_paid)
			.reduce((sum, inv) => sum + (inv.total_ttc || 0), 0),
		unpaidCount: invoices.filter(
			(inv) => !inv.is_paid && inv.status !== 'draft',
		).length,
		acceptedQuotes: quotes.filter((q) => q.status === 'accepted').length,
	}

	if (isLoadingCustomer) {
		return (
			<div className='container mx-auto px-6 py-8'>
				<p className='text-muted-foreground'>Chargement du client...</p>
			</div>
		)
	}

	if (!customer) {
		return (
			<div className='container mx-auto px-6 py-8'>
				<p className='text-muted-foreground'>Client introuvable</p>
				<Button
					variant='outline'
					className='mt-4'
					onClick={() => navigate({ to: '/connect/customers' })}
				>
					<ArrowLeft className='h-4 w-4 mr-2' />
					Retour aux clients
				</Button>
			</div>
		)
	}

	return (
		<div className='container mx-auto px-6 py-8 max-w-5xl'>
			{/* Header */}
			<div className='flex items-center gap-4 mb-6'>
				<Button
					variant='ghost'
					size='icon'
					onClick={() => navigate({ to: '/connect/customers' })}
				>
					<ArrowLeft className='h-5 w-5' />
				</Button>
				<div className='flex-1'>
					<h1 className='text-2xl font-bold flex items-center gap-2'>
						<User className='h-6 w-6' />
						{customer.name}
					</h1>
					<p className='text-muted-foreground'>Fiche détaillée du client</p>
				</div>
				<Button
					onClick={() =>
						navigate({
							to: '/connect/customers/$customerId/edit',
							params: () => ({ customerId }),
						})
					}
				>
					Modifier
				</Button>
			</div>

			{/* Stats rapides */}
			<div className='grid grid-cols-2 md:grid-cols-4 gap-4 mb-6'>
				<Card>
					<CardContent className='pt-4'>
						<div className='text-2xl font-bold'>{stats.totalInvoices}</div>
						<p className='text-sm text-muted-foreground'>Factures</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className='pt-4'>
						<div className='text-2xl font-bold'>{stats.totalQuotes}</div>
						<p className='text-sm text-muted-foreground'>Devis</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className='pt-4'>
						<div className='text-2xl font-bold text-green-600'>
							{formatCurrency(stats.totalPaid)}
						</div>
						<p className='text-sm text-muted-foreground'>Payé</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className='pt-4'>
						<div className='text-2xl font-bold text-orange-600'>
							{stats.unpaidCount}
						</div>
						<p className='text-sm text-muted-foreground'>En attente</p>
					</CardContent>
				</Card>
			</div>

			{/* Contenu principal avec tabs */}
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
				</TabsList>

				{/* Tab Informations */}
				<TabsContent value='info'>
					<Card>
						<CardHeader>
							<CardTitle>Informations</CardTitle>
						</CardHeader>
						<CardContent className='space-y-4'>
							<div className='space-y-1'>
								<p className='text-sm text-muted-foreground'>Nom</p>
								<p className='font-medium'>{customer.name}</p>
							</div>

							<div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
								<div className='space-y-1'>
									<p className='text-sm text-muted-foreground'>Email</p>
									{customer.email ? (
										<a
											href={`mailto:${customer.email}`}
											className='flex items-center gap-2 text-blue-600 hover:underline'
										>
											<Mail className='h-4 w-4' />
											{customer.email}
										</a>
									) : (
										<p className='text-muted-foreground'>-</p>
									)}
								</div>
								<div className='space-y-1'>
									<p className='text-sm text-muted-foreground'>Téléphone</p>
									{customer.phone ? (
										<a
											href={`tel:${customer.phone}`}
											className='flex items-center gap-2 hover:underline'
										>
											<Phone className='h-4 w-4' />
											{customer.phone}
										</a>
									) : (
										<p className='text-muted-foreground'>-</p>
									)}
								</div>
							</div>

							<div className='space-y-1'>
								<p className='text-sm text-muted-foreground'>Entreprise</p>
								<p className='font-medium'>{customer.company || '-'}</p>
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

				{/* Tab Factures */}
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
											const statusInfo =
												invoiceStatusConfig[invoice.status] ||
												invoiceStatusConfig.draft
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
														{invoice.is_paid ? (
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

				{/* Tab Devis */}
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
											const statusInfo =
												quoteStatusConfig[quote.status] ||
												quoteStatusConfig.draft

											// Vérifier si le devis est expiré
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
			</Tabs>
		</div>
	)
}
