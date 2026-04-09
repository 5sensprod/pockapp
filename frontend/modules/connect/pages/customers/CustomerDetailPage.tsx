// frontend/modules/connect/pages/customers/CustomerDetailPage.tsx
//
// Migré sur ConnectModuleShell — même pattern que les pages cash.
//

import { EmptyState } from '@/components/module-ui'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, User } from 'lucide-react'
import { ConnectModuleShell } from '../../ConnectModuleShell'
import { CustomerDetailTabs } from '../../features/customers/CustomerDetailTabs'
import { formatCurrency } from '../../utils/formatters'
import { getCustomerTypeDisplay } from '../../utils/statusConfig'

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export function CustomerDetailPage() {
	const { customerId } = useParams({ from: '/connect/customers/$customerId/' })
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as any

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

	const customerType = (customer as any)?.customer_type || 'individual'
	const typeDisplay = getCustomerTypeDisplay(customerType)
	const TypeIcon = typeDisplay.icon

	// ── Guards ── (dans le shell, pas de container inline)

	if (isLoadingCustomer) {
		return (
			<ConnectModuleShell
				pageTitle='Fiche client'
				hideTitle
				hideIcon
				hideBadge
				headerLeft={
					<div className='flex items-center gap-2'>
						<Button
							variant='ghost'
							size='icon'
							className='-ml-2 text-muted-foreground hover:text-foreground'
							onClick={() => navigate({ to: '/connect/customers' })}
						>
							<ArrowLeft className='h-4 w-4' />
						</Button>
						<div className='flex items-center gap-2'>
							<User className='h-5 w-5 text-muted-foreground' />
							<h1 className='text-lg font-semibold tracking-tight'>
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
				pageTitle='Fiche client'
				hideTitle
				hideIcon
				hideBadge
				headerLeft={
					<div className='flex items-center gap-2'>
						<Button
							variant='ghost'
							size='icon'
							className='-ml-2 text-muted-foreground hover:text-foreground'
							onClick={() => navigate({ to: '/connect/customers' })}
						>
							<ArrowLeft className='h-4 w-4' />
						</Button>
						<div className='flex items-center gap-2'>
							<User className='h-5 w-5 text-muted-foreground' />
							<h1 className='text-lg font-semibold tracking-tight'>
								Fiche client
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

	return (
		<ConnectModuleShell
			pageTitle={customer.name}
			pageIcon={TypeIcon}
			hideTitle
			hideIcon
			hideBadge
			headerLeft={
				<div className='flex items-center gap-2'>
					<Button
						variant='ghost'
						size='icon'
						className='-ml-2 text-muted-foreground hover:text-foreground'
						onClick={() => navigate({ to: '/connect/customers' })}
					>
						<ArrowLeft className='h-4 w-4' />
					</Button>
					<div className='flex items-center gap-2'>
						<TypeIcon className='h-5 w-5 text-muted-foreground' />
						<h1 className='text-lg font-semibold tracking-tight'>
							{customer.name}
						</h1>
					</div>
				</div>
			}
			primaryAction={
				<Button
					size='sm'
					onClick={() =>
						navigate({
							to: '/connect/customers/$customerId/edit',
							params: () => ({ customerId }),
						})
					}
				>
					Modifier
				</Button>
			}
		>
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

			{/* Tabs */}
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
			/>
		</ConnectModuleShell>
	)
}
