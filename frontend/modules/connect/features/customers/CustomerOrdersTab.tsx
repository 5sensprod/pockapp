// frontend/modules/connect/pages/customers/tabs/CustomerOrdersTab.tsx
//
// Onglet injecté dans CustomerDetailTabs via <CardContent>.
// Le Card, le CardHeader et le bouton "Nouveau bon" sont gérés par le parent —
// ce composant ne rend que le contenu (table ou état vide).

import { Button } from '@/components/ui/button'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { useNavigate } from '@tanstack/react-router'
import { ClipboardList, FilePen, Plus } from 'lucide-react'
import { OrderStatusBadge } from '../../components/orders/OrderStatusBadge'
import type { Order } from '../../types/order'

// ── Données de démo ──────────────────────────────────────────────────────────
// À remplacer par : const { data: orders, isLoading } = useOrdersByCustomer(customerId)
const DEMO_CUSTOMER_ORDERS: Order[] = [
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
		sourceQuoteId: 'quote-3',
		createdAt: '2024-10-01T09:00:00Z',
		confirmedAt: '2024-10-02T10:00:00Z',
		billedAt: '2024-10-20T11:00:00Z',
		updatedAt: '2024-10-20T11:00:00Z',
	},
]

interface CustomerOrdersTabProps {
	customerId: string
}

export function CustomerOrdersTab({ customerId }: CustomerOrdersTabProps) {
	const navigate = useNavigate()

	// TODO: const { data: orders, isLoading } = useOrdersByCustomer(customerId)
	const orders = DEMO_CUSTOMER_ORDERS

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

	if (orders.length === 0) {
		return (
			<div className='text-center py-8 text-muted-foreground'>
				<ClipboardList className='h-12 w-12 mx-auto mb-2 opacity-30' />
				<p>Aucun bon de commande pour ce client</p>
				<Button
					variant='outline'
					size='sm'
					className='mt-4 gap-2'
					onClick={() =>
						navigate({
							to: '/connect/orders/new',
							search: { customerId },
						})
					}
				>
					<Plus className='h-4 w-4' />
					Créer un bon de commande
				</Button>
			</div>
		)
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Référence</TableHead>
					<TableHead>Statut</TableHead>
					<TableHead className='text-right'>Total TTC</TableHead>
					<TableHead>Date</TableHead>
					<TableHead>Origine</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{orders.map((order) => (
					<TableRow
						key={order.id}
						className='cursor-pointer hover:bg-muted/50 transition-colors'
						onClick={() =>
							navigate({
								to: '/connect/orders/$orderId',
								params: { orderId: order.id },
							})
						}
					>
						<TableCell className='font-mono font-medium'>
							{order.reference}
						</TableCell>
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
								<button
									type='button'
									className='inline-flex items-center gap-1 text-xs text-blue-600 hover:underline'
									onClick={(e) => {
										e.stopPropagation()
										const quoteId = order.sourceQuoteId
										if (quoteId)
											navigate({
												to: '/connect/quotes/$quoteId',
												params: { quoteId },
											})
									}}
								>
									<FilePen className='h-3 w-3' />
									Devis #{order.sourceQuoteId}
								</button>
							) : (
								<span className='text-xs text-muted-foreground'>Manuel</span>
							)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	)
}
