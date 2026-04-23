// frontend/modules/connect/features/orders/OrderCreateInline.tsx
//
// Formulaire de création de bon de commande monté inline dans CustomerDetailPage.
// Le subheader client reste visible — pas de navigation, pas de drawer.
// Le client est connu et non modifiable.

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { Textarea } from '@/components/ui/textarea'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { getAppPosToken, loginToAppPos, useAppPosProducts } from '@/lib/apppos'
import type { ProductsResponse } from '@/lib/pocketbase-types'
import { type OrderItem, useCreateOrder } from '@/lib/queries/orders'
import { useNavigate } from '@tanstack/react-router'
import {
	Loader2,
	Package,
	PackagePlus,
	PenLine,
	Plus,
	RotateCcw,
	Search,
	Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { computeItem, computeOrderTotals } from '../../types/order'

// ============================================================================
// HELPERS
// ============================================================================

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const fmt = (amount: number) =>
	new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
		amount,
	)

// ============================================================================
// PROPS
// ============================================================================

interface OrderCreateInlineProps {
	customerId: string
	customerName: string
	/** Appelé après annulation ou création réussie */
	onDone: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function OrderCreateInline({
	customerId,
	customerName,
	onDone,
}: OrderCreateInlineProps) {
	const { activeCompanyId } = useActiveCompany()
	const { mutateAsync: createOrder, isPending } = useCreateOrder()
	const navigate = useNavigate()

	// ── AppPOS ────────────────────────────────────────────────────────────────
	const [isAppPosConnected, setIsAppPosConnected] = useState(false)
	// Ouvre le picker catalogue immédiatement à l'arrivée sur le formulaire
	const [productPickerOpen, setProductPickerOpen] = useState(true)
	const [productPickerTab, setProductPickerTab] = useState<
		'catalogue' | 'libre'
	>('catalogue')
	const [productSearch, setProductSearch] = useState('')
	const productSearchRef = useRef<HTMLInputElement>(null)
	const freeLineDescRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		const connect = async () => {
			if (isAppPosConnected) return
			const token = getAppPosToken()
			if (token) {
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

	// ── Formulaire ────────────────────────────────────────────────────────────
	const [items, setItems] = useState<OrderItem[]>([])
	// Prix catalogue original par item.id — pour le bouton reset
	const [cataloguePrices, setCataloguePrices] = useState<
		Record<string, number>
	>({})
	const [paymentConditions, setPaymentConditions] = useState('30 jours net')
	const [deliveryConditions, setDeliveryConditions] = useState('')
	const [notes, setNotes] = useState('')

	// Ligne libre
	const [freeLineDescription, setFreeLineDescription] = useState('')
	const [freeLineQty, setFreeLineQty] = useState(1)
	const [freeLinePriceHT, setFreeLinePriceHT] = useState(0)
	const [freeLineVat, setFreeLineVat] = useState(0.2)

	// Sélection multiple dans le catalogue
	type CatalogueSelection = { product: ProductsResponse; qty: number }
	const [catalogueSelection, setCatalogueSelection] = useState<
		CatalogueSelection[]
	>([])

	const { total_ht, total_tva, total_ttc } = computeOrderTotals(items)

	// ── Handlers lignes ───────────────────────────────────────────────────────
	const openPicker = (tab: 'catalogue' | 'libre') => {
		setProductPickerTab(tab)
		setCatalogueSelection([])
		setProductPickerOpen(true)
	}

	const toggleCatalogueSelection = (product: ProductsResponse) => {
		setCatalogueSelection((prev) => {
			const exists = prev.find((s) => s.product.id === product.id)
			if (exists) return prev.filter((s) => s.product.id !== product.id)
			return [...prev, { product, qty: 1 }]
		})
	}

	const updateSelectionQty = (productId: string, qty: number) => {
		setCatalogueSelection((prev) =>
			prev.map((s) =>
				s.product.id === productId ? { ...s, qty: Math.max(1, qty) } : s,
			),
		)
	}

	const confirmCatalogueSelection = () => {
		const newItems = catalogueSelection.map(({ product, qty }) => {
			const vatRate = (product.tva_rate ?? 20) / 100
			const coef = 1 + vatRate
			let unitPriceHT = 0
			if (typeof product.price_ht === 'number')
				unitPriceHT = round2(product.price_ht)
			else if (typeof product.price_ttc === 'number')
				unitPriceHT = round2(product.price_ttc / coef)
			return computeItem({
				id: crypto.randomUUID(),
				description: product.name,
				quantity: qty,
				unit_price_ht: unitPriceHT,
				vat_rate: vatRate,
			})
		})
		// Mémoriser le prix catalogue de chaque nouvel item
		setCataloguePrices((prev) => {
			const next = { ...prev }
			catalogueSelection.forEach(({ product }, i) => {
				const vatRate = (product.tva_rate ?? 20) / 100
				const coef = 1 + vatRate
				let unitPriceHT = 0
				if (typeof product.price_ht === 'number')
					unitPriceHT = round2(product.price_ht)
				else if (typeof product.price_ttc === 'number')
					unitPriceHT = round2(product.price_ttc / coef)
				next[newItems[i].id] = unitPriceHT
			})
			return next
		})
		setItems((prev) => [...prev, ...newItems])
		setCatalogueSelection([])
		setProductPickerOpen(false)
		setProductSearch('')
	}
	const addFreeLine = () => {
		if (!freeLineDescription.trim()) return
		setItems((prev) => [
			...prev,
			computeItem({
				id: crypto.randomUUID(),
				description: freeLineDescription,
				quantity: freeLineQty,
				unit_price_ht: freeLinePriceHT,
				vat_rate: freeLineVat,
			}),
		])
		setFreeLineDescription('')
		setFreeLineQty(1)
		setFreeLinePriceHT(0)
		setFreeLineVat(0.2)
		setProductPickerOpen(false)
	}

	const updateItem = (
		id: string,
		field: keyof OrderItem,
		value: string | number,
	) => {
		setItems((prev) =>
			prev.map((item) =>
				item.id !== id ? item : computeItem({ ...item, [field]: value }),
			),
		)
	}

	const removeItem = (id: string) => {
		setItems((prev) => prev.filter((i) => i.id !== id))
		setCataloguePrices((prev) => {
			const n = { ...prev }
			delete n[id]
			return n
		})
	}

	const resetItemPrice = (id: string) => {
		const original = cataloguePrices[id]
		if (original == null) return
		setItems((prev) =>
			prev.map((item) =>
				item.id !== id
					? item
					: computeItem({ ...item, unit_price_ht: original }),
			),
		)
	}

	// ── Sauvegarde ────────────────────────────────────────────────────────────
	const handleSave = async (asDraft: boolean) => {
		if (!activeCompanyId) return
		try {
			const order = await createOrder({
				status: asDraft ? 'draft' : 'confirmed',
				customer: customerId,
				owner_company: activeCompanyId,
				customer_name: customerName,
				items,
				total_ht,
				total_tva,
				total_ttc,
				payment_conditions: paymentConditions || undefined,
				delivery_conditions: deliveryConditions || undefined,
				notes: notes || undefined,
			})
			// Naviguer vers le détail du bon — si confirmé, ouvrir le dialog paiement
			navigate({
				to: '/connect/orders/$orderId',
				params: { orderId: order.id },
				search: { action: asDraft ? undefined : 'payment' },
			})
		} catch (err) {
			console.error('Erreur création BC:', err)
		}
	}

	// ── Render ────────────────────────────────────────────────────────────────
	return (
		<>
			<div className='max-w-4xl mx-auto space-y-6'>
				<h2 className='text-lg font-semibold tracking-tight'>
					Nouveau bon de commande
				</h2>
				<div className='rounded-lg border bg-card divide-y'>
					{/* ── Lignes ────────────────────────────────────────────── */}
					<section className='p-5 space-y-3'>
						{items.length === 0 ? (
							<div className='flex flex-col items-center justify-center py-8 gap-3 text-muted-foreground border-2 border-dashed rounded-lg'>
								<PackagePlus className='h-8 w-8 opacity-40' />
								<p className='text-sm'>Aucun produit ajouté</p>
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
								<div className='hidden sm:grid grid-cols-[1fr_80px_130px_60px_100px_60px] gap-2 text-xs text-muted-foreground font-medium px-1'>
									<span>Description</span>
									<span className='text-right'>Qté</span>
									<span className='text-right'>PU HT</span>
									<span className='text-right'>TVA</span>
									<span className='text-right'>Total HT</span>
									<span />
								</div>
								{items.map((item) => {
									const originalPrice = cataloguePrices[item.id]
									const isPriceModified =
										originalPrice != null &&
										item.unit_price_ht !== originalPrice
									return (
										<div
											key={item.id}
											className='grid grid-cols-1 sm:grid-cols-[1fr_80px_130px_60px_100px_60px] gap-2 items-center'
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
											{/* PU HT — éditable + reset si modifié */}
											<div className='relative flex items-center'>
												<Input
													type='number'
													min={0}
													step={0.01}
													className={`text-right pr-7 ${isPriceModified ? 'border-amber-400 focus-visible:ring-amber-300' : ''}`}
													value={item.unit_price_ht || ''}
													onChange={(e) =>
														updateItem(
															item.id,
															'unit_price_ht',
															Number(e.target.value),
														)
													}
												/>
												{isPriceModified && (
													<button
														type='button'
														title='Revenir au prix catalogue'
														className='absolute right-2 text-amber-500 hover:text-amber-700 transition-colors'
														onClick={() => resetItemPrice(item.id)}
													>
														<RotateCcw className='h-3.5 w-3.5' />
													</button>
												)}
											</div>
											{/* TVA — lecture seule en % */}
											<div className='text-right text-sm text-muted-foreground py-2 font-medium'>
												{Math.round(item.vat_rate * 100)} %
											</div>
											<div className='text-right text-sm font-medium py-2'>
												{fmt(item.total_ht)}
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
									)
								})}
							</div>
						)}

						{/* Totaux — juste sous les lignes */}
						<div className='flex justify-between items-end pt-3 border-t mt-3'>
							<Button
								variant='ghost'
								size='sm'
								className='text-muted-foreground'
								onClick={() => openPicker('catalogue')}
							>
								<Plus className='h-4 w-4 mr-1.5' />
								Ajouter un produit
							</Button>
							<dl className='space-y-1 text-sm text-right'>
								<div className='flex justify-between gap-12'>
									<dt className='text-muted-foreground'>Total HT</dt>
									<dd className='font-medium'>{fmt(total_ht)}</dd>
								</div>
								<div className='flex justify-between gap-12'>
									<dt className='text-muted-foreground'>TVA</dt>
									<dd className='font-medium'>{fmt(total_tva)}</dd>
								</div>
								<div className='flex justify-between gap-12 text-base font-semibold border-t pt-1'>
									<dt>Total TTC</dt>
									<dd>{fmt(total_ttc)}</dd>
								</div>
							</dl>
						</div>
					</section>

					{/* ── Conditions ────────────────────────────────────────── */}
					<section className='p-5 grid grid-cols-1 sm:grid-cols-2 gap-4'>
						<div className='space-y-1.5'>
							<Label htmlFor='inline-payment'>Conditions de paiement</Label>
							<Input
								id='inline-payment'
								value={paymentConditions}
								onChange={(e) => setPaymentConditions(e.target.value)}
							/>
						</div>
						<div className='space-y-1.5'>
							<Label htmlFor='inline-delivery'>Conditions de livraison</Label>
							<Input
								id='inline-delivery'
								value={deliveryConditions}
								onChange={(e) => setDeliveryConditions(e.target.value)}
							/>
						</div>
						<div className='space-y-1.5 sm:col-span-2'>
							<Label htmlFor='inline-notes'>Notes internes</Label>
							<Textarea
								id='inline-notes'
								rows={2}
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								placeholder='Remarques, informations complémentaires…'
							/>
						</div>
					</section>

					{/* ── Actions — dans la card, en bas ───────────────────── */}
					<section className='p-5 flex items-center justify-end gap-3'>
						<Button variant='outline' onClick={onDone} disabled={isPending}>
							Annuler
						</Button>
						<Button
							variant='outline'
							onClick={() => handleSave(true)}
							disabled={isPending}
						>
							{isPending && <Loader2 className='h-4 w-4 mr-1.5 animate-spin' />}
							Enregistrer en brouillon
						</Button>
						<Button
							onClick={() => handleSave(false)}
							disabled={isPending || items.length === 0}
						>
							{isPending && <Loader2 className='h-4 w-4 mr-1.5 animate-spin' />}
							Confirmer le bon de commande
						</Button>
					</section>
				</div>
			</div>

			{/* ── Dialog picker produit ────────────────────────────────────── */}
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
									<>
										<Package className='h-4 w-4' />
										Catalogue
									</>
								) : (
									<>
										<PenLine className='h-4 w-4' />
										Ligne libre
									</>
								)}
							</button>
						))}
					</div>

					{productPickerTab === 'catalogue' && (
						<div className='space-y-3'>
							{/* Recherche */}
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

							{/* Liste produits */}
							<div className='max-h-56 overflow-y-auto border rounded-md divide-y'>
								{products.length === 0 ? (
									<div className='p-4 text-center text-sm text-muted-foreground'>
										{isAppPosConnected
											? 'Aucun produit trouvé'
											: 'Connexion au catalogue…'}
									</div>
								) : (
									products.slice(0, 30).map((product) => {
										const sel = catalogueSelection.find(
											(s) => s.product.id === product.id,
										)
										const isSelected = !!sel
										return (
											<div
												key={product.id}
												className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-muted'}`}
											>
												{/* Checkbox visuelle */}
												<button
													type='button'
													className={`shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-primary'}`}
													onClick={() => toggleCatalogueSelection(product)}
												>
													{isSelected && (
														<svg
															className='h-3 w-3'
															viewBox='0 0 12 12'
															fill='none'
															aria-hidden='true'
														>
															<title>Sélectionné</title>
															<path
																d='M2 6l3 3 5-5'
																stroke='currentColor'
																strokeWidth='1.5'
																strokeLinecap='round'
																strokeLinejoin='round'
															/>
														</svg>
													)}
												</button>

												{/* Infos produit */}
												<button
													type='button'
													className='flex-1 text-left min-w-0'
													onClick={() => toggleCatalogueSelection(product)}
												>
													<p className='font-medium text-sm truncate'>
														{product.name}
													</p>
													{(product as any).sku && (
														<p className='text-xs text-muted-foreground'>
															{(product as any).sku}
														</p>
													)}
												</button>

												{/* Prix + quantité si sélectionné */}
												<div className='shrink-0 flex items-center gap-3'>
													<div className='text-right'>
														{product.price_ht != null && (
															<p className='text-sm font-medium'>
																{fmt(product.price_ht)} HT
															</p>
														)}
														{product.price_ttc != null && (
															<p className='text-xs text-muted-foreground'>
																{fmt(product.price_ttc)} TTC
															</p>
														)}
													</div>
													{isSelected && (
														<input
															type='number'
															min={1}
															step={1}
															value={sel.qty}
															onClick={(e) => e.stopPropagation()}
															onChange={(e) =>
																updateSelectionQty(
																	product.id,
																	Number(e.target.value),
																)
															}
															className='w-14 h-7 text-center text-sm border rounded-md bg-background'
														/>
													)}
												</div>
											</div>
										)
									})
								)}
							</div>

							{/* Footer sélection */}
							{catalogueSelection.length > 0 && (
								<div className='flex items-center justify-between pt-1 border-t'>
									<div className='flex items-center gap-1.5 flex-wrap'>
										{catalogueSelection.map((s) => (
											<span
												key={s.product.id}
												className='inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5'
											>
												{s.product.name.split(' ').slice(0, 3).join(' ')}
												{s.qty > 1 && (
													<span className='font-semibold'>×{s.qty}</span>
												)}
											</span>
										))}
									</div>
									<Button
										size='sm'
										onClick={confirmCatalogueSelection}
										className='shrink-0 ml-3'
									>
										<Plus className='h-4 w-4 mr-1.5' />
										Ajouter la sélection (
										{catalogueSelection.reduce((n, s) => n + s.qty, 0)})
									</Button>
								</div>
							)}
						</div>
					)}

					{productPickerTab === 'libre' && (
						<div className='space-y-4'>
							<p className='text-sm text-muted-foreground'>
								Pour un produit hors catalogue, une prestation ou une commande
								spéciale.
							</p>
							<div className='space-y-1.5'>
								<Label htmlFor='fl-desc'>Description *</Label>
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
									<Label htmlFor='fl-qty'>Quantité</Label>
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
									<Label htmlFor='fl-pu'>PU HT (€)</Label>
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
									<Label htmlFor='fl-vat'>TVA</Label>
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
										{fmt(freeLineQty * freeLinePriceHT)}
									</span>
									{' · '}
									TTC :{' '}
									<span className='font-medium text-foreground'>
										{fmt(freeLineQty * freeLinePriceHT * (1 + freeLineVat))}
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
