// frontend/modules/connect/pages/orders/OrderDetailPage.tsx

import { EmptyState } from '@/components/module-ui'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
	ArrowLeft,
	CheckCircle2,
	ClipboardList,
	FileText,
	Pencil,
	Truck,
	XCircle,
} from 'lucide-react'
import { ConnectModuleShell } from '../../ConnectModuleShell'
import { OrderStatusBadge } from '../../components/orders/OrderStatusBadge'
import {
	ORDER_STATUS_LABELS,
	ORDER_STATUS_TRANSITIONS,
	type Order,
	type OrderStatus,
} from '../../types/order'
import { formatCurrency, formatDate } from '../../utils/formatters'

// ── Données de démo ──────────────────────────────────────────────────────────
// À remplacer par : const { data: order, isLoading } = useOrder(orderId)
const DEMO_ORDER: Order = {
	id: 'order-2',
	reference: 'BC-2024-0002',
	customerId: 'cust-2',
	customerName: 'Martin & Associés',
	status: 'confirmed',
	lines: [
		{
			id: 'l1',
			description: 'Développement interface React',
			quantity: 5,
			unitPrice: 400,
			vatRate: 0.2,
			totalHT: 2000,
			totalTTC: 2400,
		},
		{
			id: 'l2',
			description: 'Intégration API REST',
			quantity: 3,
			unitPrice: 400,
			vatRate: 0.2,
			totalHT: 1200,
			totalTTC: 1440,
		},
	],
	totalHT: 3200,
	totalTVA: 640,
	totalTTC: 3840,
	paymentConditions: '30 jours net',
	deliveryConditions: 'Livraison sur site client',
	sourceQuoteId: 'quote-7',
	createdAt: '2024-11-20T14:00:00Z',
	confirmedAt: '2024-11-21T10:00:00Z',
	updatedAt: '2024-11-22T08:00:00Z',
}

const TRANSITION_ICONS: Partial<
	Record<OrderStatus, React.FC<{ className?: string }>>
> = {
	in_progress: Truck,
	delivered: CheckCircle2,
	billed: FileText,
	cancelled: XCircle,
}

export function OrderDetailPage() {
	const navigate = useNavigate()
	const { orderId: _orderId } = useParams({ from: '/connect/orders/$orderId/' })
	// TODO: const { data: order, isLoading } = useOrder(_orderId)
	const isLoading = false
	const order = DEMO_ORDER

	if (isLoading) {
		return (
			<ConnectModuleShell
				pageTitle='Bon de commande'
				headerLeft={
					<Button
						variant='ghost'
						size='icon'
						onClick={() => navigate({ to: '/connect/orders' })}
					>
						<ArrowLeft className='h-4 w-4' />
					</Button>
				}
				primaryAction={null}
				hideBadge
			>
				<EmptyState icon={ClipboardList} title='Chargement...' fullPage />
			</ConnectModuleShell>
		)
	}

	if (!order) {
		return (
			<ConnectModuleShell
				pageTitle='Bon de commande'
				headerLeft={
					<Button
						variant='ghost'
						size='icon'
						onClick={() => navigate({ to: '/connect/orders' })}
					>
						<ArrowLeft className='h-4 w-4' />
					</Button>
				}
				primaryAction={null}
				hideBadge
			>
				<EmptyState
					icon={ClipboardList}
					title='Bon de commande introuvable'
					description="Ce bon de commande n'existe pas ou a été supprimé."
					actions={[
						{
							label: 'Retour aux commandes',
							onClick: () => navigate({ to: '/connect/orders' }),
							variant: 'secondary',
						},
					]}
					fullPage
				/>
			</ConnectModuleShell>
		)
	}

	const allowedTransitions = ORDER_STATUS_TRANSITIONS[order.status]
	const isTerminal = allowedTransitions.length === 0

	const handleTransition = async (next: OrderStatus) => {
		// TODO: appel API patchOrderStatus(order.id, next)
		console.log('Transition vers', next)
	}

	return (
		<ConnectModuleShell
			pageTitle={`Commande ${order.reference}`}
			pageIcon={ClipboardList}
			headerLeft={
				<Button
					variant='ghost'
					size='icon'
					onClick={() => navigate({ to: '/connect/orders' })}
				>
					<ArrowLeft className='h-4 w-4' />
				</Button>
			}
			headerRight={
				<div className='flex items-center gap-2'>
					<OrderStatusBadge status={order.status} />
					{/* Boutons de transition */}
					{!isTerminal &&
						allowedTransitions.map((next) => {
							const Icon = TRANSITION_ICONS[next]
							const isDanger = next === 'cancelled'
							return (
								<Button
									key={next}
									size='sm'
									variant={isDanger ? 'destructive' : 'outline'}
									onClick={() => handleTransition(next)}
								>
									{Icon && <Icon className='h-4 w-4 mr-1.5' />}
									{ORDER_STATUS_LABELS[next]}
								</Button>
							)
						})}
				</div>
			}
			primaryAction={
				order.status === 'draft' ? (
					<Button
						size='sm'
						onClick={() =>
							navigate({
								to: '/connect/orders/$orderId/edit',
								params: { orderId: order.id },
							})
						}
					>
						<Pencil className='h-4 w-4 mr-1.5' />
						Modifier
					</Button>
				) : null
			}
			hideBadge
		>
			<div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
				{/* ── Infos générales ─────────────────────────────────────────── */}
				<Card className='lg:col-span-2'>
					<CardHeader>
						<CardTitle>Détails</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<div className='grid grid-cols-2 gap-4'>
							<div>
								<p className='text-sm text-muted-foreground'>Référence</p>
								<p className='font-mono font-medium'>{order.reference}</p>
							</div>
							<div>
								<p className='text-sm text-muted-foreground'>
									Date de création
								</p>
								<p className='font-medium'>{formatDate(order.createdAt)}</p>
							</div>
							{order.confirmedAt && (
								<div>
									<p className='text-sm text-muted-foreground'>Confirmé le</p>
									<p className='font-medium'>{formatDate(order.confirmedAt)}</p>
								</div>
							)}
							{order.paymentConditions && (
								<div>
									<p className='text-sm text-muted-foreground'>
										Conditions de paiement
									</p>
									<p className='font-medium'>{order.paymentConditions}</p>
								</div>
							)}
							{order.deliveryConditions && (
								<div>
									<p className='text-sm text-muted-foreground'>
										Conditions de livraison
									</p>
									<p className='font-medium'>{order.deliveryConditions}</p>
								</div>
							)}
							{order.sourceQuoteId && (
								<div>
									<p className='text-sm text-muted-foreground'>
										Devis d'origine
									</p>
									<button
										type='button'
										className='font-medium text-primary hover:underline'
										onClick={() => {
											const quoteId = order.sourceQuoteId
											if (quoteId)
												navigate({
													to: '/connect/quotes/$quoteId',
													params: { quoteId },
												})
										}}
									>
										Voir le devis
									</button>
								</div>
							)}
						</div>
					</CardContent>
				</Card>

				{/* ── Client ──────────────────────────────────────────────────── */}
				<Card>
					<CardHeader>
						<CardTitle>Client</CardTitle>
					</CardHeader>
					<CardContent>
						<button
							type='button'
							className='font-semibold text-foreground hover:text-primary hover:underline text-left'
							onClick={() =>
								navigate({
									to: '/connect/customers/$customerId',
									params: { customerId: order.customerId },
								})
							}
						>
							{order.customerName}
						</button>
					</CardContent>
				</Card>

				{/* ── Lignes ──────────────────────────────────────────────────── */}
				<Card className='lg:col-span-3'>
					<CardHeader>
						<CardTitle>Lignes</CardTitle>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Description</TableHead>
									<TableHead className='text-right'>Qté</TableHead>
									<TableHead className='text-right'>PU HT</TableHead>
									<TableHead className='text-right'>TVA</TableHead>
									<TableHead className='text-right'>Total HT</TableHead>
									<TableHead className='text-right'>Total TTC</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{order.lines.map((line) => (
									<TableRow key={line.id}>
										<TableCell className='font-medium'>
											{line.description}
										</TableCell>
										<TableCell className='text-right'>
											{line.quantity}
										</TableCell>
										<TableCell className='text-right'>
											{formatCurrency(line.unitPrice)}
										</TableCell>
										<TableCell className='text-right'>
											{(line.vatRate * 100).toFixed(0)} %
										</TableCell>
										<TableCell className='text-right'>
											{formatCurrency(line.totalHT)}
										</TableCell>
										<TableCell className='text-right'>
											{formatCurrency(line.totalTTC)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>

						{/* Totaux */}
						<div className='mt-6 flex justify-end'>
							<div className='w-72 space-y-2'>
								<div className='flex justify-between'>
									<span className='text-muted-foreground'>Total HT</span>
									<span>{formatCurrency(order.totalHT)}</span>
								</div>
								<div className='flex justify-between'>
									<span className='text-muted-foreground'>TVA</span>
									<span>{formatCurrency(order.totalTVA)}</span>
								</div>
								<Separator />
								<div className='flex justify-between font-bold text-lg'>
									<span>Total TTC</span>
									<span>{formatCurrency(order.totalTTC)}</span>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</ConnectModuleShell>
	)
}
