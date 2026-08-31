// frontend/modules/connect/pages/orders/OrdersPage.tsx

import { DocumentSearchInput } from '@/components/DocumentSearchInput'
import { PeriodFilterCard } from '@/components/PeriodFilterCard'
import { ModulePageShell } from '@/components/module-ui/ModulePageShell'
import { Button } from '@/components/ui/button'
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
import { useDocumentSearchFilter } from '@/lib/hooks/useDocumentSearchFilter'
import {
	PERIOD_PREFERENCE_KEYS,
	usePeriodFilter,
} from '@/lib/hooks/usePeriodFilter'
import { useOrders } from '@/lib/queries/orders'
import type { OrderStatus } from '@/lib/queries/orders'
import { useNavigate } from '@tanstack/react-router'
import { ClipboardList, FilePen, Loader2, Plus } from 'lucide-react'
import { useState } from 'react'
import { OrderStatusBadge } from '../../components/orders/OrderStatusBadge'
import { manifest } from '../../manifest'
import { ORDER_STATUS_LABELS } from '../../types/order'

const ALL_STATUSES = Object.entries(ORDER_STATUS_LABELS) as [
	OrderStatus,
	string,
][]

const formatAmount = (amount: number) =>
	new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
		amount,
	)

const formatDate = (iso: string) =>
	new Intl.DateTimeFormat('fr-FR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	}).format(new Date(iso))

export function OrdersPage() {
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()
	const [search, setSearch] = useState('')
	const debouncedSearch = useDebounce(search, 400)
	const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
	const { period, setPeriod, setDateFrom, setDateTo, dateRange } =
		usePeriodFilter('trente-jours', PERIOD_PREFERENCE_KEYS.orders)
	const searchFilter = useDocumentSearchFilter({
		term: debouncedSearch,
		textFields: ['number', 'customer_name', 'notes', 'items'],
	})

	const { data, isLoading } = useOrders({
		companyId: activeCompanyId ?? undefined,
		status: statusFilter === 'all' ? undefined : statusFilter,
		filter: searchFilter,
		dateFrom: dateRange.from,
		dateTo: dateRange.to,
	})

	const orders = data?.items ?? []

	return (
		<ModulePageShell
			manifest={manifest}
			actions={
				<Button
					size='sm'
					onClick={() => navigate({ to: '/connect/orders/new' })}
				>
					<Plus className='h-4 w-4 mr-1.5' />
					Nouveau bon
				</Button>
			}
		>
			<div className='space-y-4'>
				<PeriodFilterCard
					period={period}
					from={dateRange.from ?? ''}
					to={dateRange.to ?? ''}
					onPeriodChange={setPeriod}
					onFromChange={setDateFrom}
					onToChange={setDateTo}
					filters={
						<>
							<DocumentSearchInput
								placeholder='N°, client, description ou montant…'
								value={search}
								onValueChange={setSearch}
							/>
							<Select
								value={statusFilter}
								onValueChange={(value) =>
									setStatusFilter(value as OrderStatus | 'all')
								}
							>
								<SelectTrigger className='w-full sm:w-48'>
									<SelectValue placeholder='Tous les statuts' />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='all'>Tous les statuts</SelectItem>
									{ALL_STATUSES.map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</>
					}
				/>

				{/* ── Contenu ────────────────────────────────────────────────── */}
				{isLoading ? (
					<div className='flex justify-center py-16'>
						<Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
					</div>
				) : orders.length === 0 ? (
					<EmptyOrdersState
						onNew={() => navigate({ to: '/connect/orders/new' })}
					/>
				) : (
					<div className='rounded-lg border bg-card overflow-hidden'>
						<Table>
							<TableHeader>
								<TableRow className='bg-muted/40 hover:bg-muted/40'>
									<TableHead className='font-semibold'>Référence</TableHead>
									<TableHead className='font-semibold'>Client</TableHead>
									<TableHead className='font-semibold'>Statut</TableHead>
									<TableHead className='font-semibold text-right'>
										Total TTC
									</TableHead>
									<TableHead className='font-semibold'>Date</TableHead>
									<TableHead className='font-semibold'>Origine</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{orders.map((order) => (
									<TableRow
										key={order.id}
										className='cursor-pointer hover:bg-muted/30 transition-colors'
										onClick={() =>
											navigate({
												to: '/connect/orders/$orderId',
												params: { orderId: order.id },
											})
										}
									>
										<TableCell className='font-mono text-sm font-medium'>
											{order.number}
										</TableCell>
										<TableCell>{order.customer_name}</TableCell>
										<TableCell>
											<OrderStatusBadge status={order.status} />
										</TableCell>
										<TableCell className='text-right font-medium'>
											{formatAmount(order.total_ttc)}
										</TableCell>
										<TableCell className='text-muted-foreground text-sm'>
											{formatDate(order.created)}
										</TableCell>
										<TableCell>
											{order.source_quote_id ? (
												<span className='inline-flex items-center gap-1 text-xs text-muted-foreground'>
													<FilePen className='h-3 w-3' />
													Depuis devis
												</span>
											) : (
												<span className='text-xs text-muted-foreground'>
													Manuel
												</span>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</div>
		</ModulePageShell>
	)
}

function EmptyOrdersState({ onNew }: { onNew: () => void }) {
	return (
		<div className='flex flex-col items-center justify-center py-16 text-center gap-4'>
			<div className='w-14 h-14 rounded-2xl bg-muted flex items-center justify-center'>
				<ClipboardList className='h-7 w-7 text-muted-foreground' />
			</div>
			<div>
				<p className='font-semibold text-foreground'>Aucun bon de commande</p>
				<p className='text-sm text-muted-foreground mt-1'>
					Créez votre premier bon ou convertissez un devis accepté.
				</p>
			</div>
			<Button onClick={onNew} size='sm'>
				<Plus className='h-4 w-4 mr-1.5' />
				Nouveau bon de commande
			</Button>
		</div>
	)
}
