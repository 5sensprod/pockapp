// frontend/modules/connect/pages/orders/OrderDetailPage.tsx

import { EmptyState } from '@/components/module-ui'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { getAppPosToken, loginToAppPos, useAppPosProducts } from '@/lib/apppos'
import type { ProductsResponse } from '@/lib/pocketbase-types'
import {
	useDeleteDraftOrder,
	useOrder,
	usePatchOrderStatus,
	useUpdateOrder,
} from '@/lib/queries/orders'
import type { OrderItem, OrderStatus } from '@/lib/queries/orders'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
	ArrowLeft,
	CheckCircle2,
	ClipboardList,
	FileText,
	Package,
	PenLine,
	Plus,
	Search,
	Trash2,
	Truck,
	XCircle,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ConnectModuleShell } from '../../ConnectModuleShell'
import { OrderStatusBadge } from '../../components/orders/OrderStatusBadge'
import { useOrderNavigation } from '../../hooks/useOrderNavigation'
import {
	ORDER_STATUS_LABELS,
	ORDER_STATUS_TRANSITIONS,
	computeItem,
	computeOrderTotals,
} from '../../types/order'
import { formatCurrency, formatDate } from '../../utils/formatters'

// ── Helpers ───────────────────────────────────────────────────────────────────
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const TRANSITION_ICONS: Partial<
	Record<OrderStatus, React.FC<{ className?: string }>>
> = {
	in_progress: Truck,
	delivered: CheckCircle2,
	billed: FileText,
	cancelled: XCircle,
}

// ── Composant ─────────────────────────────────────────────────────────────────
export function OrderDetailPage() {
	const navigate = useNavigate()
	const { orderId } = useParams({ from: '/connect/orders/$orderId/' })
	const { goBack } = useOrderNavigation()

	const { data: order, isLoading } = useOrder(orderId)
	const { mutateAsync: patchStatus, isPending: isPatching } =
		usePatchOrderStatus()
	const { mutateAsync: updateOrder, isPending: isUpdating } = useUpdateOrder()
	const { mutateAsync: deleteDraft, isPending: isDeleting } =
		useDeleteDraftOrder()

	// ── État édition lignes (draft seulement) ─────────────────────────────────
	const [draftItems, setDraftItems] = useState<OrderItem[]>([])
	const [saveTimeout, setSaveTimeout] = useState<ReturnType<
		typeof setTimeout
	> | null>(null)
	// Ref pour tracker l'id déjà initialisé et éviter de réinitialiser les items locaux à chaque refetch
	const initializedOrderId = useRef<string | null>(null)

	useEffect(() => {
		if (order && initializedOrderId.current !== order.id) {
			initializedOrderId.current = order.id
			setDraftItems(order.items ?? [])
		}
	}, [order])

	// ── Dialogs ───────────────────────────────────────────────────────────────
	const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
	const [cancellationReason, setCancellationReason] = useState('')
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [validateDialogOpen, setValidateDialogOpen] = useState(false)

	// ── Picker produits ───────────────────────────────────────────────────────
	const [productPickerOpen, setProductPickerOpen] = useState(false)
	const [productPickerTab, setProductPickerTab] = useState<
		'catalogue' | 'libre'
	>('catalogue')
	const [productSearch, setProductSearch] = useState('')
	const [freeLineDescription, setFreeLineDescription] = useState('')
	const [freeLineQty, setFreeLineQty] = useState(1)
	const [freeLinePriceHT, setFreeLinePriceHT] = useState(0)
	const [freeLineVat, setFreeLineVat] = useState(0.2)
	const productSearchRef = useRef<HTMLInputElement>(null)
	const freeLineDescRef = useRef<HTMLInputElement>(null)

	// ── AppPOS ────────────────────────────────────────────────────────────────
	const [isAppPosConnected, setIsAppPosConnected] = useState(false)
	useEffect(() => {
		const connect = async () => {
			if (isAppPosConnected) return
			const existing = getAppPosToken()
			if (existing) {
				setIsAppPosConnected(true)
				return
			}
			try {
				const res = await loginToAppPos('admin', 'admin123')
				if (res.success && res.token) setIsAppPosConnected(true)
			} catch (err) {
				console.error('AppPOS connexion:', err)
			}
		}
		void connect()
	}, [isAppPosConnected])

	const { data: productsData } = useAppPosProducts({
		enabled:
			isAppPosConnected &&
			productPickerOpen &&
			productPickerTab === 'catalogue',
		searchTerm: productSearch || undefined,
	})
	const products = (productsData?.items ?? []) as ProductsResponse[]

	useEffect(() => {
		if (productPickerOpen && productPickerTab === 'catalogue')
			productSearchRef.current?.focus()
		if (productPickerOpen && productPickerTab === 'libre')
			freeLineDescRef.current?.focus()
	}, [productPickerOpen, productPickerTab])

	// ── Auto-save debounced (600ms) ───────────────────────────────────────────
	const triggerSave = (items: OrderItem[]) => {
		if (!order || order.status !== 'draft') return
		if (saveTimeout) clearTimeout(saveTimeout)
		const { total_ht, total_tva, total_ttc } = computeOrderTotals(items)
		const timeout = setTimeout(async () => {
			try {
				await updateOrder({
					id: order.id,
					data: { items, total_ht, total_tva, total_ttc },
				})
				toast.success('Brouillon mis à jour')
			} catch (err) {
				console.error('Erreur sauvegarde:', err)
				toast.error('Erreur lors de la sauvegarde')
			}
		}, 600)
		setSaveTimeout(timeout)
	}

	// ── Mutations lignes ──────────────────────────────────────────────────────
	const updateItem = (
		id: string,
		field: keyof OrderItem,
		value: string | number,
	) => {
		const next = draftItems.map((item) =>
			item.id !== id ? item : computeItem({ ...item, [field]: value }),
		)
		setDraftItems(next)
		triggerSave(next)
	}

	const removeItem = (id: string) => {
		const next = draftItems.filter((i) => i.id !== id)
		setDraftItems(next)
		triggerSave(next)
	}

	const addFromCatalogue = (product: ProductsResponse) => {
		const vatRate = (product.tva_rate ?? 20) / 100
		const coef = 1 + vatRate
		let unitPriceHT = 0
		if (typeof product.price_ht === 'number')
			unitPriceHT = round2(product.price_ht)
		else if (typeof product.price_ttc === 'number')
			unitPriceHT = round2(product.price_ttc / coef)
		const newItem = computeItem({
			id: crypto.randomUUID(),
			description: product.name,
			quantity: 1,
			unit_price_ht: unitPriceHT,
			vat_rate: vatRate,
		})
		const next = [...draftItems, newItem]
		setDraftItems(next)
		triggerSave(next)
		setProductPickerOpen(false)
		setProductSearch('')
	}

	const addFreeLine = () => {
		if (!freeLineDescription.trim()) return
		const newItem = computeItem({
			id: crypto.randomUUID(),
			description: freeLineDescription,
			quantity: freeLineQty,
			unit_price_ht: freeLinePriceHT,
			vat_rate: freeLineVat,
		})
		const next = [...draftItems, newItem]
		setDraftItems(next)
		triggerSave(next)
		setFreeLineDescription('')
		setFreeLineQty(1)
		setFreeLinePriceHT(0)
		setFreeLineVat(0.2)
		setProductPickerOpen(false)
	}

	const openPicker = (tab: 'catalogue' | 'libre') => {
		setProductPickerTab(tab)
		setProductPickerOpen(true)
	}

	// ── Transitions statut ────────────────────────────────────────────────────
	const handleTransition = async (next: OrderStatus) => {
		if (next === 'cancelled') {
			setCancelDialogOpen(true)
			return
		}
		try {
			if (!order) return
			await patchStatus({ id: order.id, status: next })
		} catch (err) {
			console.error('Erreur transition statut:', err)
		}
	}

	const handleConfirmCancel = async () => {
		if (!cancellationReason.trim()) return
		try {
			if (!order) return
			await patchStatus({
				id: order.id,
				status: 'cancelled',
				cancellation_reason: cancellationReason.trim(),
			})
			setCancelDialogOpen(false)
			setCancellationReason('')
		} catch (err) {
			console.error('Erreur annulation:', err)
		}
	}

	const handleDelete = async () => {
		try {
			if (!order) return
			await deleteDraft(order.id)
			goBack()
		} catch (err) {
			console.error('Erreur suppression:', err)
		}
	}

	// ── Header gauche ─────────────────────────────────────────────────────────
	const headerLeft = (title: string, badge?: React.ReactNode) => (
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
				{badge}
			</div>
		</div>
	)

	// ── Loading / Not found ───────────────────────────────────────────────────
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

	const isDraft = order.status === 'draft'
	const allowedTransitions = ORDER_STATUS_TRANSITIONS[order.status]
	const isTerminal = allowedTransitions.length === 0
	const displayTotals = isDraft
		? computeOrderTotals(draftItems)
		: {
				total_ht: order.total_ht,
				total_tva: order.total_tva,
				total_ttc: order.total_ttc,
			}

	return (
		<>
			<ConnectModuleShell
				hideTitle
				hideIcon
				hideBadge
				headerLeft={headerLeft(
					order.number,
					<OrderStatusBadge status={order.status} />,
				)}
				headerRight={
					isDraft ? (
						<div className='flex items-center gap-2'>
							<Button
								size='sm'
								variant='destructive'
								onClick={() => setDeleteDialogOpen(true)}
								disabled={isDeleting}
							>
								<Trash2 className='h-4 w-4 mr-1.5' />
								Supprimer
							</Button>
							<Button
								size='sm'
								onClick={() => setValidateDialogOpen(true)}
								disabled={isPatching || draftItems.length === 0}
							>
								<CheckCircle2 className='h-4 w-4 mr-1.5' />
								Valider
							</Button>
						</div>
					) : !isTerminal ? (
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
				primaryAction={null}
			>
				<div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
					{/* ── Infos générales ───────────────────────────────────────── */}
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
												const q = order.source_quote_id
												if (q)
													navigate({
														to: '/connect/quotes/$quoteId',
														params: { quoteId: q },
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

					{/* ── Client ────────────────────────────────────────────────── */}
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

					{/* ── Lignes ────────────────────────────────────────────────── */}
					<Card className='lg:col-span-3'>
						<CardHeader className='flex flex-row items-center justify-between'>
							<CardTitle className='flex items-center gap-2'>
								Lignes
								{isUpdating && (
									<span className='text-xs text-muted-foreground font-normal animate-pulse'>
										Sauvegarde…
									</span>
								)}
							</CardTitle>
							{isDraft && (
								<Button
									variant='outline'
									size='sm'
									onClick={() => openPicker('catalogue')}
								>
									<Plus className='h-4 w-4 mr-1.5' />
									Ajouter une ligne
								</Button>
							)}
						</CardHeader>
						<CardContent>
							{isDraft ? (
								/* Mode édition */
								draftItems.length === 0 ? (
									<div className='flex flex-col items-center justify-center py-8 gap-3 text-muted-foreground border-2 border-dashed rounded-lg'>
										<Plus className='h-8 w-8 opacity-30' />
										<p className='text-sm'>Aucune ligne ajoutée</p>
										<div className='flex gap-2'>
											<Button
												variant='outline'
												size='sm'
												onClick={() => openPicker('catalogue')}
											>
												<Package className='h-4 w-4 mr-1.5' />
												Depuis le catalogue
											</Button>
											<Button
												variant='outline'
												size='sm'
												onClick={() => openPicker('libre')}
											>
												<PenLine className='h-4 w-4 mr-1.5' />
												Ligne libre
											</Button>
										</div>
									</div>
								) : (
									<div className='space-y-2'>
										<div className='hidden sm:grid grid-cols-[1fr_80px_110px_80px_110px_36px] gap-2 text-xs text-muted-foreground font-medium px-1'>
											<span>Description</span>
											<span className='text-right'>Qté</span>
											<span className='text-right'>PU HT</span>
											<span className='text-right'>TVA</span>
											<span className='text-right'>Total HT</span>
											<span />
										</div>
										{draftItems.map((item) => (
											<div
												key={item.id}
												className='grid grid-cols-1 sm:grid-cols-[1fr_80px_110px_80px_110px_36px] gap-2 items-center'
											>
												<Input
													value={item.description}
													placeholder='Description…'
													onChange={(e) =>
														updateItem(item.id, 'description', e.target.value)
													}
												/>
												<Input
													type='number'
													min={0}
													step={1}
													className='text-right'
													value={item.quantity}
													onChange={(e) =>
														updateItem(
															item.id,
															'quantity',
															Number(e.target.value),
														)
													}
												/>
												<Input
													type='number'
													min={0}
													step={0.01}
													className='text-right'
													value={item.unit_price_ht || ''}
													onChange={(e) =>
														updateItem(
															item.id,
															'unit_price_ht',
															Number(e.target.value),
														)
													}
												/>
												<Input
													type='number'
													min={0}
													max={1}
													step={0.01}
													className='text-right'
													value={item.vat_rate}
													onChange={(e) =>
														updateItem(
															item.id,
															'vat_rate',
															Number(e.target.value),
														)
													}
												/>
												<div className='text-right text-sm font-medium py-2'>
													{formatCurrency(item.total_ht)}
												</div>
												<Button
													variant='ghost'
													size='icon'
													className='h-8 w-8 text-muted-foreground hover:text-destructive'
													onClick={() => removeItem(item.id)}
												>
													<Trash2 className='h-4 w-4' />
												</Button>
											</div>
										))}
										<Button
											variant='ghost'
											size='sm'
											className='text-muted-foreground mt-1'
											onClick={() => openPicker('catalogue')}
										>
											<Plus className='h-4 w-4 mr-1.5' />
											Ajouter une autre ligne
										</Button>
									</div>
								)
							) : (
								/* Mode lecture */
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
							)}

							{/* Totaux */}
							<div className='mt-6 flex justify-end'>
								<div className='w-72 space-y-2'>
									<div className='flex justify-between'>
										<span className='text-muted-foreground'>Total HT</span>
										<span>{formatCurrency(displayTotals.total_ht)}</span>
									</div>
									<div className='flex justify-between'>
										<span className='text-muted-foreground'>TVA</span>
										<span>{formatCurrency(displayTotals.total_tva)}</span>
									</div>
									<Separator />
									<div className='flex justify-between font-bold text-lg'>
										<span>Total TTC</span>
										<span>{formatCurrency(displayTotals.total_ttc)}</span>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</ConnectModuleShell>

			{/* ── Dialog validation brouillon ───────────────────────────────── */}
			<Dialog open={validateDialogOpen} onOpenChange={setValidateDialogOpen}>
				<DialogContent className='sm:max-w-md'>
					<DialogHeader>
						<DialogTitle>Valider le bon de commande</DialogTitle>
						<DialogDescription>
							Le bon{' '}
							<span className='font-mono font-medium'>{order.number}</span> sera
							confirmé. Cette action est irréversible et ne pourra plus être
							modifié.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className='gap-2'>
						<Button
							variant='outline'
							onClick={() => setValidateDialogOpen(false)}
							disabled={isPatching}
						>
							Annuler
						</Button>
						<Button
							onClick={async () => {
								setValidateDialogOpen(false)
								await handleTransition('confirmed')
							}}
							disabled={isPatching}
						>
							<CheckCircle2 className='h-4 w-4 mr-1.5' />
							Valider le bon de commande
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ── Dialog suppression brouillon ─────────────────────────────── */}
			<Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<DialogContent className='sm:max-w-md'>
					<DialogHeader>
						<DialogTitle>Supprimer le brouillon</DialogTitle>
						<DialogDescription>
							Cette action est irréversible. Le bon de commande{' '}
							<span className='font-mono font-medium'>{order.number}</span> sera
							définitivement supprimé.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className='gap-2'>
						<Button
							variant='outline'
							onClick={() => setDeleteDialogOpen(false)}
							disabled={isDeleting}
						>
							Annuler
						</Button>
						<Button
							variant='destructive'
							onClick={handleDelete}
							disabled={isDeleting}
						>
							<Trash2 className='h-4 w-4 mr-1.5' />
							Supprimer définitivement
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ── Dialog motif annulation (non-draft) ──────────────────────── */}
			<Dialog
				open={cancelDialogOpen}
				onOpenChange={(open) => {
					setCancelDialogOpen(open)
					if (!open) setCancellationReason('')
				}}
			>
				<DialogContent className='sm:max-w-md'>
					<DialogHeader>
						<DialogTitle>Annuler le bon de commande</DialogTitle>
						<DialogDescription>
							Veuillez indiquer le motif d'annulation. Cette information sera
							conservée sur le bon de commande.
						</DialogDescription>
					</DialogHeader>
					<Textarea
						placeholder="Motif d'annulation…"
						value={cancellationReason}
						onChange={(e) => setCancellationReason(e.target.value)}
						rows={4}
						className='resize-none'
					/>
					<DialogFooter className='gap-2'>
						<Button
							variant='outline'
							onClick={() => {
								setCancelDialogOpen(false)
								setCancellationReason('')
							}}
							disabled={isPatching}
						>
							Retour
						</Button>
						<Button
							variant='destructive'
							onClick={handleConfirmCancel}
							disabled={!cancellationReason.trim() || isPatching}
						>
							<XCircle className='h-4 w-4 mr-1.5' />
							Confirmer l'annulation
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ── Dialog picker produits (brouillon) ───────────────────────── */}
			<Dialog open={productPickerOpen} onOpenChange={setProductPickerOpen}>
				<DialogContent className='sm:max-w-2xl'>
					<DialogHeader>
						<DialogTitle>Ajouter une ligne</DialogTitle>
					</DialogHeader>

					<div className='flex gap-1 p-1 bg-muted rounded-lg'>
						{(['catalogue', 'libre'] as const).map((tab) => (
							<button
								key={tab}
								type='button'
								className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${
									productPickerTab === tab
										? 'bg-background shadow-sm text-foreground'
										: 'text-muted-foreground hover:text-foreground'
								}`}
								onClick={() => setProductPickerTab(tab)}
							>
								{tab === 'catalogue' ? (
									<Package className='h-4 w-4' />
								) : (
									<PenLine className='h-4 w-4' />
								)}
								{tab === 'catalogue' ? 'Catalogue' : 'Ligne libre'}
							</button>
						))}
					</div>

					{productPickerTab === 'catalogue' && (
						<div className='space-y-3'>
							<div className='flex items-center gap-2 px-3 py-2 border rounded-md'>
								<Search className='h-4 w-4 text-muted-foreground shrink-0' />
								<input
									ref={productSearchRef}
									className='flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground'
									placeholder='Rechercher un produit…'
									value={productSearch}
									onChange={(e) => setProductSearch(e.target.value)}
								/>
							</div>
							<div className='max-h-64 overflow-y-auto border rounded-md divide-y'>
								{products.length === 0 ? (
									<div className='p-4 text-center text-sm text-muted-foreground'>
										{isAppPosConnected
											? 'Aucun produit trouvé'
											: 'Connexion au catalogue…'}
									</div>
								) : (
									products.slice(0, 30).map((product) => (
										<button
											key={product.id}
											type='button'
											className='w-full px-3 py-2.5 text-left hover:bg-muted transition-colors flex items-center justify-between gap-4'
											onClick={() => addFromCatalogue(product)}
										>
											<div className='min-w-0'>
												<p className='font-medium text-sm truncate'>
													{product.name}
												</p>
												{(product as any).sku && (
													<p className='text-xs text-muted-foreground'>
														{(product as any).sku}
													</p>
												)}
											</div>
											<div className='text-right shrink-0'>
												{product.price_ht != null && (
													<p className='text-sm font-medium'>
														{new Intl.NumberFormat('fr-FR', {
															style: 'currency',
															currency: 'EUR',
														}).format(product.price_ht)}{' '}
														HT
													</p>
												)}
												{product.price_ttc != null && (
													<p className='text-xs text-muted-foreground'>
														{new Intl.NumberFormat('fr-FR', {
															style: 'currency',
															currency: 'EUR',
														}).format(product.price_ttc)}{' '}
														TTC
													</p>
												)}
											</div>
										</button>
									))
								)}
							</div>
						</div>
					)}

					{productPickerTab === 'libre' && (
						<div className='space-y-4'>
							<p className='text-sm text-muted-foreground'>
								Pour un produit hors catalogue, une prestation ou une commande
								spéciale.
							</p>
							<div className='space-y-1.5'>
								<label className='text-sm font-medium' htmlFor='fl-desc'>
									Description *
								</label>
								<Input
									ref={freeLineDescRef}
									id='fl-desc'
									placeholder='Ex : Guitare sur mesure, prestation spéciale…'
									value={freeLineDescription}
									onChange={(e) => setFreeLineDescription(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') addFreeLine()
									}}
								/>
							</div>
							<div className='grid grid-cols-3 gap-3'>
								<div className='space-y-1.5'>
									<label className='text-sm font-medium' htmlFor='fl-qty'>
										Quantité
									</label>
									<Input
										id='fl-qty'
										type='number'
										min={1}
										step={1}
										value={freeLineQty}
										onChange={(e) => setFreeLineQty(Number(e.target.value))}
									/>
								</div>
								<div className='space-y-1.5'>
									<label className='text-sm font-medium' htmlFor='fl-pu'>
										PU HT (€)
									</label>
									<Input
										id='fl-pu'
										type='number'
										min={0}
										step={0.01}
										placeholder='0,00'
										value={freeLinePriceHT || ''}
										onChange={(e) => setFreeLinePriceHT(Number(e.target.value))}
									/>
								</div>
								<div className='space-y-1.5'>
									<label className='text-sm font-medium' htmlFor='fl-vat'>
										TVA
									</label>
									<select
										id='fl-vat'
										className='h-9 w-full rounded-md border bg-background px-3 text-sm'
										value={freeLineVat}
										onChange={(e) => setFreeLineVat(Number(e.target.value))}
									>
										<option value={0.2}>20 %</option>
										<option value={0.1}>10 %</option>
										<option value={0.055}>5,5 %</option>
										<option value={0.021}>2,1 %</option>
										<option value={0}>0 %</option>
									</select>
								</div>
							</div>
							{freeLinePriceHT > 0 && (
								<p className='text-sm text-right text-muted-foreground'>
									HT :{' '}
									<span className='font-medium text-foreground'>
										{new Intl.NumberFormat('fr-FR', {
											style: 'currency',
											currency: 'EUR',
										}).format(freeLineQty * freeLinePriceHT)}
									</span>
									{' · '}
									TTC :{' '}
									<span className='font-medium text-foreground'>
										{new Intl.NumberFormat('fr-FR', {
											style: 'currency',
											currency: 'EUR',
										}).format(
											freeLineQty * freeLinePriceHT * (1 + freeLineVat),
										)}
									</span>
								</p>
							)}
							<Button
								className='w-full'
								onClick={addFreeLine}
								disabled={!freeLineDescription.trim()}
							>
								<Plus className='h-4 w-4 mr-1.5' />
								Ajouter cette ligne
							</Button>
						</div>
					)}
				</DialogContent>
			</Dialog>
		</>
	)
}
