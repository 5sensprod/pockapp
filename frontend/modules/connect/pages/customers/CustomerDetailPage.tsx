// frontend/modules/connect/pages/customers/CustomerDetailPage.tsx

import { EmptyState } from '@/components/module-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import type {
	CompaniesResponse,
	CustomersResponse,
} from '@/lib/pocketbase-types'
import { useConsignmentItems } from '@/lib/queries/consignmentItems'
import { useCustomer } from '@/lib/queries/customers'
import { useInvoices } from '@/lib/queries/invoices'
import { useQuotes } from '@/lib/queries/quotes'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import {
	ArrowLeft,
	ClipboardList,
	CreditCard,
	FileText,
	Guitar,
	Mail,
	MapPin,
	Pencil,
	Phone,
	Plus,
	Receipt,
	StickyNote,
	Tag,
	User,
} from 'lucide-react'
import { useState } from 'react'
import { ConnectModuleShell } from '../../ConnectModuleShell'
import { CustomerDetailTabs } from '../../features/customers/CustomerDetailTabs'
import { OrderCreateInline } from '../../features/orders/OrderCreateInline'
import { formatCurrency, formatPaymentTerms } from '../../utils/formatters'
import {
	getCustomerTypeDisplay,
	getTagClassName,
	normalizeTags,
} from '../../utils/statusConfig'

// ============================================================================
// HELPERS
// ============================================================================

// Formate un numéro de téléphone en "XX XX XX XX XX"
function formatPhoneNumber(phone: string | undefined | null) {
	if (!phone) return null
	// On retire tout ce qui n'est pas un chiffre
	const cleaned = phone.replace(/\D/g, '')
	// Si c'est un numéro standard à 10 chiffres (français)
	const match = cleaned.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/)
	if (match) {
		return `${match[1]} ${match[2]} ${match[3]} ${match[4]} ${match[5]}`
	}
	return phone // Si format différent, on retourne tel quel
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export function CustomerDetailPage() {
	const { customerId } = useParams({ from: '/connect/customers/$customerId/' })
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as any
	const search = useSearch({ strict: false }) as { tab?: string }
	const { data: company } = useQuery({
		queryKey: ['companies', activeCompanyId],
		enabled: !!activeCompanyId,
		queryFn: async () =>
			(await pb
				.collection('companies')
				.getOne(activeCompanyId)) as CompaniesResponse,
	})

	const { data: customer, isLoading: isLoadingCustomer } =
		useCustomer(customerId)

	const { data: invoicesData, isLoading: isLoadingInvoices } = useInvoices({
		companyId: activeCompanyId ?? undefined,
		customerId,
		sort: '-date',
		perPage: 100,
	})

	const { data: quotesData, isLoading: isLoadingQuotes } = useQuotes({
		companyId: activeCompanyId ?? undefined,
		customerId,
		sort: '-date',
		perPage: 100,
	})

	const { data: consignmentData } = useConsignmentItems(customerId)

	const invoices = invoicesData?.items ?? []
	const quotes = quotesData?.items ?? []
	const consignmentCount = consignmentData?.items?.length ?? 0

	// Avoirs par original_invoice_id (sans non-null assertion)
	const creditNotesByOriginal = invoices
		.filter(
			(inv) =>
				inv.invoice_type === 'credit_note' &&
				inv.original_invoice_id != null &&
				inv.original_invoice_id !== '',
		)
		.reduce(
			(acc, inv) => {
				const origId = inv.original_invoice_id as string
				acc[origId] = (acc[origId] ?? 0) + Math.abs(inv.total_ttc ?? 0)
				return acc
			},
			{} as Record<string, number>,
		)

	// Acomptes nets encaissés par facture parente
	const depositsByParent = invoices
		.filter((inv) => inv.invoice_type === 'deposit' && inv.is_paid)
		.reduce(
			(acc, inv) => {
				const parentId = inv.original_invoice_id
				if (!parentId) return acc
				const depositTtc = Math.abs(inv.total_ttc ?? 0)
				const refunded = creditNotesByOriginal[inv.id] ?? 0
				const net = Math.max(0, depositTtc - refunded)
				acc[parentId] = (acc[parentId] ?? 0) + net
				return acc
			},
			{} as Record<string, number>,
		)

	const stats = {
		totalInvoices: invoices.length,
		totalQuotes: quotes.length,
		totalInvoiced: invoices.reduce((sum, inv) => sum + (inv.total_ttc ?? 0), 0),
		// Total encaissé net : deposits nets + factures payées nettes
		totalPaid: invoices
			.filter((inv) => inv.is_paid && inv.invoice_type !== 'credit_note')
			.reduce((sum, inv) => {
				const total = inv.total_ttc ?? 0
				const refunded =
					inv.invoice_type === 'deposit'
						? (creditNotesByOriginal[inv.id] ?? 0)
						: ((inv as any).credit_notes_total ?? 0)
				return sum + Math.max(0, total - refunded)
			}, 0),
		// Comptage "En attente" (exclut Avoirs, Abandonnées et Deposits)
		unpaidCount: invoices.filter((inv) => {
			if (inv.status === 'draft') return false
			if (inv.invoice_type === 'credit_note') return false
			if (inv.invoice_type === 'deposit') return false
			if (inv.is_paid) return false
			const total = inv.total_ttc ?? 0
			const refunded = (inv as any).credit_notes_total ?? 0
			const isAbandoned = total > 0 && refunded >= total
			return !isAbandoned
		}).length,
		acceptedQuotes: quotes.filter((q) => q.status === 'accepted').length,
		depositsByParent,
	}

	const [view, setView] = useState<'tabs' | 'new-order'>('tabs')
	const [activeTab, setActiveTab] = useState(search.tab ?? 'invoices')

	const customerType = (customer as any)?.customer_type || 'individual'
	const typeDisplay = getCustomerTypeDisplay(customerType)

	// ── Guards ──

	if (isLoadingCustomer) {
		return (
			<ConnectModuleShell
				pageTitle='Chargement...'
				hideTitle
				hideIcon
				hideBadge
				headerLeft={
					<div className='flex items-center gap-3'>
						<Button
							variant='ghost'
							size='icon'
							className='-ml-2 text-muted-foreground hover:text-foreground shrink-0'
							onClick={() => navigate({ to: '/connect/customers' })}
						>
							<ArrowLeft className='h-4 w-4' />
						</Button>
						<div className='flex flex-col'>
							<h1 className='text-xl font-bold tracking-tight'>
								Chargement...
							</h1>
						</div>
					</div>
				}
				primaryAction={null}
			>
				<EmptyState icon={User} title='Chargement...' fullPage />
			</ConnectModuleShell>
		)
	}

	if (!customer) {
		return (
			<ConnectModuleShell
				pageTitle='Client introuvable'
				hideTitle
				hideIcon
				hideBadge
				headerLeft={
					<div className='flex items-center gap-3'>
						<Button
							variant='ghost'
							size='icon'
							className='-ml-2 text-muted-foreground hover:text-foreground shrink-0'
							onClick={() => navigate({ to: '/connect/customers' })}
						>
							<ArrowLeft className='h-4 w-4' />
						</Button>
						<div className='flex flex-col'>
							<h1 className='text-xl font-bold tracking-tight'>
								Client introuvable
							</h1>
						</div>
					</div>
				}
				primaryAction={null}
			>
				<EmptyState
					icon={User}
					title='Client introuvable'
					description="Ce client n'existe pas ou a été supprimé."
					actions={[
						{
							label: 'Retour aux clients',
							onClick: () => navigate({ to: '/connect/customers' }),
							variant: 'secondary',
						},
					]}
					fullPage
				/>
			</ConnectModuleShell>
		)
	}

	const tags = normalizeTags((customer as any).tags)

	return (
		<ConnectModuleShell
			pageTitle={customer.name}
			hideTitle
			hideIcon
			hideBadge
			headerLeft={
				<div className='flex items-center gap-3'>
					<Button
						variant='ghost'
						size='icon'
						className='-ml-2 text-muted-foreground hover:text-foreground shrink-0'
						onClick={() =>
							view === 'new-order'
								? setView('tabs')
								: navigate({ to: '/connect/customers' })
						}
					>
						<ArrowLeft className='h-4 w-4' />
					</Button>
					<div className='flex flex-col'>
						<div className='flex items-center gap-3'>
							<h1 className='text-xl font-bold tracking-tight text-foreground'>
								{customer.name}
							</h1>
							{/* BADGE TOTAL ENCAISSÉ DANS LE HEADER */}
							{stats.totalPaid > 0 && (
								<Badge
									variant='outline'
									className='bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-900 shadow-sm px-2'
								>
									Encaissé : {formatCurrency(stats.totalPaid)}
								</Badge>
							)}
						</div>

						<div className='flex items-center gap-2 text-sm text-muted-foreground mt-0.5'>
							<Badge
								variant='secondary'
								className={`text-[10px] px-1.5 py-0 h-4 ${typeDisplay.className}`}
							>
								{typeDisplay.label}
							</Badge>
							{customer.company && (
								<>
									<span className='opacity-50'>•</span>
									<span className='font-medium'>{customer.company}</span>
								</>
							)}
							{/* TÉLÉPHONE DANS LE HEADER */}
							{customer.phone && (
								<>
									<span className='opacity-50'>•</span>
									<span className='flex items-center gap-1 font-medium'>
										<Phone className='h-3 w-3' />
										{formatPhoneNumber(customer.phone)}
									</span>
								</>
							)}
						</div>
					</div>
				</div>
			}
			primaryAction={
				<div className='flex items-center gap-2'>
					{view !== 'new-order' && (
						<>
							<Button
								variant='outline'
								size='sm'
								className='hidden sm:flex gap-2'
								onClick={() =>
									navigate({
										to: '/connect/customers/$customerId/edit',
										params: () => ({ customerId }),
									})
								}
							>
								<Pencil className='h-3.5 w-3.5' />
								Modifier
							</Button>

							<DropdownMenu modal={false}>
								<DropdownMenuTrigger asChild>
									<Button size='icon'>
										<Plus className='h-4 w-4' />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align='end' className='w-48'>
									<DropdownMenuItem
										onClick={() =>
											navigate({
												to: '/connect/invoices/new',
												search: { from: 'customer', customerId },
											})
										}
									>
										<Receipt className='h-4 w-4 mr-2' />
										Facture
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() =>
											navigate({
												to: '/connect/quotes/new',
												search: { from: 'customer', customerId },
											})
										}
									>
										<FileText className='h-4 w-4 mr-2' />
										Devis
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() =>
											navigate({
												to: '/connect/orders/new',
												search: { from: 'customer', customerId },
											})
										}
									>
										<ClipboardList className='h-4 w-4 mr-2' />
										Commande
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() => {
											document
												.querySelector('[value="consignment"]')
												?.dispatchEvent(
													new MouseEvent('click', { bubbles: true }),
												)
											setTimeout(() => {
												const addBtn = document.evaluate(
													'//button[contains(., "Ajouter un produit")]',
													document,
													null,
													XPathResult.FIRST_ORDERED_NODE_TYPE,
													null,
												).singleNodeValue as HTMLButtonElement
												addBtn?.click()
											}, 100)
										}}
									>
										<Guitar className='h-4 w-4 mr-2' />
										Dépôt d'occasion
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</>
					)}
				</div>
			}
		>
			{/* ── Bloc d'information — masqué en mode création ── */}
			{view === 'tabs' && (
				<div className='mb-6'>
					<Card className='shadow-sm border-border/60 bg-background/50 backdrop-blur-sm'>
						<CardContent className='p-6 sm:p-8'>
							<div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
								{/* Colonne Contact */}
								<div className='space-y-5'>
									<div className='flex items-center gap-3 text-base'>
										<Mail className='h-5 w-5 text-muted-foreground shrink-0' />
										{customer.email ? (
											<span className='font-medium text-foreground'>
												{customer.email}
											</span>
										) : (
											<span className='text-muted-foreground italic text-sm'>
												Aucun email
											</span>
										)}
									</div>
									<div className='flex items-center gap-3 text-base'>
										<Phone className='h-5 w-5 text-muted-foreground shrink-0' />
										{customer.phone ? (
											<span className='font-medium text-foreground'>
												{formatPhoneNumber(customer.phone)}
											</span>
										) : (
											<span className='text-muted-foreground italic text-sm'>
												Aucun téléphone
											</span>
										)}
									</div>
									<div className='flex items-start gap-3 text-base'>
										<MapPin className='h-5 w-5 text-muted-foreground shrink-0 mt-0.5' />
										{customer.address ? (
											<span className='font-medium text-foreground whitespace-pre-line leading-relaxed'>
												{customer.address}
											</span>
										) : (
											<span className='text-muted-foreground italic text-sm'>
												Aucune adresse
											</span>
										)}
									</div>
								</div>

								{/* Colonne Paiement & Tags */}
								<div className='space-y-5'>
									<div className='flex items-center gap-3 text-base'>
										<CreditCard className='h-5 w-5 text-muted-foreground shrink-0' />
										<span className='text-muted-foreground'>Paiement :</span>
										<Badge
											variant='outline'
											className='font-medium text-sm bg-background'
										>
											{formatPaymentTerms((customer as any).payment_terms)}
										</Badge>
									</div>
									{tags.length > 0 && (
										<div className='flex items-start gap-3 text-base'>
											<Tag className='h-5 w-5 text-muted-foreground shrink-0 mt-0.5' />
											<div className='flex gap-2 flex-wrap'>
												{tags.map((tag) => (
													<Badge
														key={tag}
														variant='secondary'
														className={`text-sm px-2 py-0.5 ${getTagClassName(tag)}`}
													>
														{tag}
													</Badge>
												))}
											</div>
										</div>
									)}
								</div>

								{/* Colonne Notes (Optionnelle) */}
								{customer.notes && (
									<div className='md:border-l md:border-border/50 md:pl-8 space-y-3'>
										<div className='flex items-center gap-2 text-muted-foreground'>
											<StickyNote className='h-5 w-5 shrink-0' />
											<span className='font-medium text-base'>Notes</span>
										</div>
										<p className='text-base whitespace-pre-line text-foreground/90 leading-relaxed'>
											{customer.notes}
										</p>
									</div>
								)}
							</div>
						</CardContent>
					</Card>
				</div>
			)}

			{/* ── Vue principale : Tabs ou formulaire inline ── */}
			{view === 'new-order' ? (
				<OrderCreateInline
					customerId={customerId}
					customerName={customer.name}
					onDone={(tab) => {
						if (tab) setActiveTab(tab)
						setView('tabs')
					}}
				/>
			) : (
				<CustomerDetailTabs
					customer={customer as CustomersResponse}
					company={company}
					activeCompanyId={activeCompanyId}
					customerId={customerId}
					invoices={invoices}
					quotes={quotes}
					consignmentCount={consignmentCount}
					isLoadingInvoices={isLoadingInvoices}
					isLoadingQuotes={isLoadingQuotes}
					stats={stats}
					activeTab={activeTab}
					onTabChange={setActiveTab}
					onNewOrder={() => setView('new-order')}
				/>
			)}
		</ConnectModuleShell>
	)
}
