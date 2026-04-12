// frontend/modules/connect/pages/orders/OrdersPage.tsx

import { ModulePageShell } from '@/components/module-ui/ModulePageShell'
import { Button } from '@/components/ui/button'
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
import { useNavigate } from '@tanstack/react-router'
import { ClipboardList, FilePen, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { OrderStatusBadge } from '../../components/orders/OrderStatusBadge'
import { manifest } from '../../manifest'
import {
	ORDER_STATUS_LABELS,
	type Order,
	type OrderStatus,
} from '../../types/order'

// ── Données de démonstration ─────────────────────────────────────────────────
// À remplacer par un hook useOrders() connecté à ton backend
const DEMO_ORDERS: Order[] = [
	{
		id: 'order-1',
		reference: 'BC-2024-0001',
		customerId: 'cust-1',
		customerName: 'Atelier Dupont SARL',
		status: 'confirmed',
		lines: [],
		totalHT: 1500,
		totalTVA: 300,
		totalTTC: 1800,
		paymentConditions: '30 jours net',
		createdAt: '2024-11-15T10:00:00Z',
		confirmedAt: '2024-11-16T09:30:00Z',
		updatedAt: '2024-11-16T09:30:00Z',
	},
	{
		id: 'order-2',
		reference: 'BC-2024-0002',
		customerId: 'cust-2',
		customerName: 'Martin & Associés',
		status: 'in_progress',
		lines: [],
		totalHT: 3200,
		totalTVA: 640,
		totalTTC: 3840,
		sourceQuoteId: 'quote-7',
		createdAt: '2024-11-20T14:00:00Z',
		confirmedAt: '2024-11-21T10:00:00Z',
		updatedAt: '2024-11-22T08:00:00Z',
	},
	{
		id: 'order-3',
		reference: 'BC-2024-0003',
		customerId: 'cust-1',
		customerName: 'Atelier Dupont SARL',
		status: 'billed',
		lines: [],
		totalHT: 800,
		totalTVA: 160,
		totalTTC: 960,
		invoiceId: 'inv-12',
		createdAt: '2024-10-01T09:00:00Z',
		confirmedAt: '2024-10-02T10:00:00Z',
		billedAt: '2024-10-20T11:00:00Z',
		updatedAt: '2024-10-20T11:00:00Z',
	},
	{
		id: 'order-4',
		reference: 'BC-2024-0004',
		customerId: 'cust-3',
		customerName: 'Tech Solutions SAS',
		status: 'draft',
		lines: [],
		totalHT: 5500,
		totalTVA: 1100,
		totalTTC: 6600,
		createdAt: '2024-12-01T16:00:00Z',
		updatedAt: '2024-12-01T16:00:00Z',
	},
]

const ALL_STATUSES = Object.entries(ORDER_STATUS_LABELS) as [
	OrderStatus,
	string,
][]

export function OrdersPage() {
	const navigate = useNavigate()
	const [search, setSearch] = useState('')
	const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')

	const filtered = DEMO_ORDERS.filter((o) => {
		const matchSearch =
			o.reference.toLowerCase().includes(search.toLowerCase()) ||
			o.customerName.toLowerCase().includes(search.toLowerCase())
		const matchStatus = statusFilter === 'all' || o.status === statusFilter
		return matchSearch && matchStatus
	})

	const formatAmount = (amount: number) =>
		new Intl.NumberFormat('fr-FR', {
			style: 'currency',
			currency: 'EUR',
		}).format(amount)

	const formatDate = (iso: string) =>
		new Intl.DateTimeFormat('fr-FR', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
		}).format(new Date(iso))

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
				{/* ── Filtres ────────────────────────────────────────────────── */}
				<div className='flex flex-col sm:flex-row gap-3'>
					<div className='relative flex-1'>
						<Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
						<Input
							placeholder='Rechercher un bon, un client…'
							className='pl-9'
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
					</div>
					<Select
						value={statusFilter}
						onValueChange={(v) => setStatusFilter(v as OrderStatus | 'all')}
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
				</div>

				{/* ── Tableau ────────────────────────────────────────────────── */}
				{filtered.length === 0 ? (
					<EmptyState onNew={() => navigate({ to: '/connect/orders/new' })} />
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
								{filtered.map((order) => (
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
											{order.reference}
										</TableCell>
										<TableCell>{order.customerName}</TableCell>
										<TableCell>
											<OrderStatusBadge status={order.status} />
										</TableCell>
										<TableCell className='text-right font-medium'>
											{formatAmount(order.totalTTC)}
										</TableCell>
										<TableCell className='text-muted-foreground text-sm'>
											{formatDate(order.createdAt)}
										</TableCell>
										<TableCell>
											{order.sourceQuoteId ? (
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

function EmptyState({ onNew }: { onNew: () => void }) {
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
