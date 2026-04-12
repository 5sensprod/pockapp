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
import { useOrder, usePatchOrderStatus } from '@/lib/queries/orders'
import type { OrderStatus } from '@/lib/queries/orders'
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
import { useOrderNavigation } from '../../hooks/useOrderNavigation'
import {
	ORDER_STATUS_LABELS,
	ORDER_STATUS_TRANSITIONS,
} from '../../types/order'
import { formatCurrency, formatDate } from '../../utils/formatters'

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
	const { orderId } = useParams({ from: '/connect/orders/$orderId/' })
	const { goBack } = useOrderNavigation()

	const { data: order, isLoading } = useOrder(orderId)
	const { mutateAsync: patchStatus, isPending: isPatching } =
		usePatchOrderStatus()

	// ── Header gauche partagé ─────────────────────────────────────────────
	const headerLeft = (title: string) => (
		<div className='flex items-center gap-3'>
			<Button
				variant='ghost'
				size='icon'
				className='-ml-2 text-muted-foreground hover:text-foreground shrink-0'
				onClick={goBack}
			>
				<ArrowLeft className='h-4 w-4' />
			</Button>
			<div className='flex items-center gap-2'>
				<ClipboardList className='h-5 w-5 text-muted-foreground' />
				<h1 className='text-xl font-bold tracking-tight'>{title}</h1>
			</div>
		</div>
	)

	// ── Loading ───────────────────────────────────────────────────────────
	if (isLoading) {
		return (
			<ConnectModuleShell
				hideTitle
				hideIcon
				hideBadge
				headerLeft={headerLeft('Bon de commande')}
				primaryAction={null}
			>
				<EmptyState icon={ClipboardList} title='Chargement...' fullPage />
			</ConnectModuleShell>
		)
	}

	// ── Not found ─────────────────────────────────────────────────────────
	if (!order) {
		return (
			<ConnectModuleShell
				hideTitle
				hideIcon
				hideBadge
				headerLeft={headerLeft('Bon de commande introuvable')}
				primaryAction={null}
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
		try {
			await patchStatus({ id: order.id, status: next })
		} catch (err) {
			console.error('Erreur transition statut:', err)
		}
	}

	return (
		<ConnectModuleShell
			hideTitle
			hideIcon
			hideBadge
			headerLeft={
				<div className='flex items-center gap-3'>
					<Button
						variant='ghost'
						size='icon'
						className='-ml-2 text-muted-foreground hover:text-foreground shrink-0'
						onClick={goBack}
					>
						<ArrowLeft className='h-4 w-4' />
					</Button>
					<div className='flex items-center gap-2'>
						<ClipboardList className='h-5 w-5 text-muted-foreground' />
						<h1 className='text-xl font-bold tracking-tight'>{order.number}</h1>
						<OrderStatusBadge status={order.status} />
					</div>
				</div>
			}
			headerRight={
				!isTerminal ? (
					<div className='flex items-center gap-2'>
						{allowedTransitions.map((next) => {
							const Icon = TRANSITION_ICONS[next]
							const isDanger = next === 'cancelled'
							return (
								<Button
									key={next}
									size='sm'
									variant={isDanger ? 'destructive' : 'outline'}
									onClick={() => handleTransition(next)}
									disabled={isPatching}
								>
									{Icon && <Icon className='h-4 w-4 mr-1.5' />}
									{ORDER_STATUS_LABELS[next]}
								</Button>
							)
						})}
					</div>
				) : null
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
								<p className='font-mono font-medium'>{order.number}</p>
							</div>
							<div>
								<p className='text-sm text-muted-foreground'>
									Date de création
								</p>
								<p className='font-medium'>{formatDate(order.created)}</p>
							</div>
							{order.confirmed_at && (
								<div>
									<p className='text-sm text-muted-foreground'>Confirmé le</p>
									<p className='font-medium'>
										{formatDate(order.confirmed_at)}
									</p>
								</div>
							)}
							{order.payment_conditions && (
								<div>
									<p className='text-sm text-muted-foreground'>
										Conditions de paiement
									</p>
									<p className='font-medium'>{order.payment_conditions}</p>
								</div>
							)}
							{order.delivery_conditions && (
								<div>
									<p className='text-sm text-muted-foreground'>
										Conditions de livraison
									</p>
									<p className='font-medium'>{order.delivery_conditions}</p>
								</div>
							)}
							{order.cancellation_reason && (
								<div className='col-span-2'>
									<p className='text-sm text-muted-foreground'>
										Motif d'annulation
									</p>
									<p className='font-medium text-destructive'>
										{order.cancellation_reason}
									</p>
								</div>
							)}
							{order.source_quote_id && (
								<div>
									<p className='text-sm text-muted-foreground'>
										Devis d'origine
									</p>
									<button
										type='button'
										className='font-medium text-primary hover:underline'
										onClick={() => {
											const quoteId = order.source_quote_id
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
									params: { customerId: order.customer },
								})
							}
						>
							{order.customer_name}
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
								{order.items.map((item) => (
									<TableRow key={item.id}>
										<TableCell className='font-medium'>
											{item.description}
										</TableCell>
										<TableCell className='text-right'>
											{item.quantity}
										</TableCell>
										<TableCell className='text-right'>
											{formatCurrency(item.unit_price_ht)}
										</TableCell>
										<TableCell className='text-right'>
											{(item.vat_rate * 100).toFixed(0)} %
										</TableCell>
										<TableCell className='text-right'>
											{formatCurrency(item.total_ht)}
										</TableCell>
										<TableCell className='text-right'>
											{formatCurrency(item.total_ttc)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>

						<div className='mt-6 flex justify-end'>
							<div className='w-72 space-y-2'>
								<div className='flex justify-between'>
									<span className='text-muted-foreground'>Total HT</span>
									<span>{formatCurrency(order.total_ht)}</span>
								</div>
								<div className='flex justify-between'>
									<span className='text-muted-foreground'>TVA</span>
									<span>{formatCurrency(order.total_tva)}</span>
								</div>
								<Separator />
								<div className='flex justify-between font-bold text-lg'>
									<span>Total TTC</span>
									<span>{formatCurrency(order.total_ttc)}</span>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</ConnectModuleShell>
	)
}
