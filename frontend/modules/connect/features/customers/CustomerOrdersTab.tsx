// frontend/modules/connect/pages/customers/tabs/CustomerOrdersTab.tsx

import { Button } from '@/components/ui/button'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { useOrdersByCustomer } from '@/lib/queries/orders'
import { useNavigate } from '@tanstack/react-router'
import { ClipboardList, FilePen, Loader2, Plus } from 'lucide-react'
import { OrderStatusBadge } from '../../components/orders/OrderStatusBadge'

interface CustomerOrdersTabProps {
	customerId: string
}

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

export function CustomerOrdersTab({ customerId }: CustomerOrdersTabProps) {
	const navigate = useNavigate()
	const { data: orders = [], isLoading } = useOrdersByCustomer(customerId)

	if (isLoading) {
		return (
			<div className='flex justify-center py-8'>
				<Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
			</div>
		)
	}

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
						navigate({ to: '/connect/orders/new', search: { customerId } })
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
							{order.number}
						</TableCell>
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
								<button
									type='button'
									className='inline-flex items-center gap-1 text-xs text-blue-600 hover:underline'
									onClick={(e) => {
										e.stopPropagation()
										const quoteId = order.source_quote_id
										if (quoteId)
											navigate({
												to: '/connect/quotes/$quoteId',
												params: { quoteId },
											})
									}}
								>
									<FilePen className='h-3 w-3' />
									Devis #{order.source_quote_id}
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
