// frontend/modules/connect/pages/orders/OrderCreatePage.tsx

import { ModulePageShell } from '@/components/module-ui/ModulePageShell'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { getAppPosToken, loginToAppPos, useAppPosProducts } from '@/lib/apppos'
import type { ProductsResponse } from '@/lib/pocketbase-types'
import { useAllCustomers } from '@/lib/queries/customers'
import { useCreateOrder } from '@/lib/queries/orders'
import type { OrderItem } from '@/lib/queries/orders'
import { useSearch } from '@tanstack/react-router'
import {
	ArrowLeft,
	ChevronsUpDown,
	Loader2,
	Package,
	PackagePlus,
	PenLine,
	Plus,
	Search,
	Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useOrderNavigation } from '../../hooks/useOrderNavigation'
import { manifest } from '../../manifest'
import { computeItem, computeOrderTotals } from '../../types/order'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const formatAmount = (amount: number) =>
	new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
		amount,
	)

interface SelectedCustomer {
	id: string
	name: string
	company?: string
}

export function OrderCreatePage() {
	const { goBack } = useOrderNavigation()
	const { activeCompanyId } = useActiveCompany()
	const search = useSearch({ strict: false }) as {
		sourceQuoteId?: string
		customerId?: string
	}

	const { mutateAsync: createOrder, isPending } = useCreateOrder()

	// ── Clients ───────────────────────────────────────────────────────────
	const { data: allCustomers = [] } = useAllCustomers(
		activeCompanyId ?? undefined,
	)
	const [customerPickerOpen, setCustomerPickerOpen] = useState(false)
	const [customerSearch, setCustomerSearch] = useState('')
	const [selectedCustomer, setSelectedCustomer] =
		useState<SelectedCustomer | null>(() => {
			if (search.customerId) {
				const found = allCustomers.find((c) => c.id === search.customerId)
				if (found)
					return { id: found.id, name: found.name, company: found.company }
			}
			return null
		})

	const filteredCustomers = allCustomers.filter((c) => {
		const term = customerSearch.toLowerCase()
		return (
			c.name.toLowerCase().includes(term) ||
			(c.company ?? '').toLowerCase().includes(term) ||
			(c.email ?? '').toLowerCase().includes(term)
		)
	})

	// ── Focus refs ────────────────────────────────────────────────────────
	const customerSearchRef = useRef<HTMLInputElement>(null)
	const productSearchRef = useRef<HTMLInputElement>(null)
	const freeLineDescRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (customerPickerOpen) customerSearchRef.current?.focus()
	}, [customerPickerOpen])

	// ── AppPOS ────────────────────────────────────────────────────────────
	const [isAppPosConnected, setIsAppPosConnected] = useState(false)
	const [productPickerOpen, setProductPickerOpen] = useState(false)
	const [productPickerTab, setProductPickerTab] = useState<
		'catalogue' | 'libre'
	>('catalogue')
	const [productSearch, setProductSearch] = useState('')

	const [freeLineDescription, setFreeLineDescription] = useState('')
	const [freeLineQty, setFreeLineQty] = useState(1)
	const [freeLinePriceHT, setFreeLinePriceHT] = useState(0)
	const [freeLineVat, setFreeLineVat] = useState(0.2)

	useEffect(() => {
		const connect = async () => {
			if (isAppPosConnected) return
			const existingToken = getAppPosToken()
			if (existingToken) {
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

	// ── Lignes ────────────────────────────────────────────────────────────
	const [items, setItems] = useState<OrderItem[]>([])
	const [paymentConditions, setPaymentConditions] = useState('30 jours net')
	const [deliveryConditions, setDeliveryConditions] = useState('')
	const [notes, setNotes] = useState('')

	const isFromQuote = !!search.sourceQuoteId
	const { total_ht, total_tva, total_ttc } = computeOrderTotals(items)

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
		setItems((prev) => [...prev, newItem])
		setProductPickerOpen(false)
		setProductSearch('')
	}
	useEffect(() => {
		if (productPickerOpen && productPickerTab === 'catalogue') {
			productSearchRef.current?.focus()
		}
		if (productPickerOpen && productPickerTab === 'libre') {
			freeLineDescRef.current?.focus()
		}
	}, [productPickerOpen, productPickerTab])

	const addFreeLine = () => {
		if (!freeLineDescription.trim()) return
		const newItem = computeItem({
			id: crypto.randomUUID(),
			description: freeLineDescription,
			quantity: freeLineQty,
			unit_price_ht: freeLinePriceHT,
			vat_rate: freeLineVat,
		})
		setItems((prev) => [...prev, newItem])
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

	const removeItem = (id: string) =>
		setItems((prev) => prev.filter((i) => i.id !== id))

	const handleSave = async (asDraft: boolean) => {
		if (!selectedCustomer || !activeCompanyId) return
		try {
			await createOrder({
				status: asDraft ? 'draft' : 'confirmed',
				customer: selectedCustomer.id,
				owner_company: activeCompanyId,
				customer_name: selectedCustomer.name,
				items,
				total_ht,
				total_tva,
				total_ttc,
				payment_conditions: paymentConditions || undefined,
				delivery_conditions: deliveryConditions || undefined,
				notes: notes || undefined,
				source_quote_id: search.sourceQuoteId,
			})
			goBack()
		} catch (err) {
			console.error('Erreur création BC:', err)
		}
	}

	const openPicker = (tab: 'catalogue' | 'libre') => {
		setProductPickerTab(tab)
		setProductPickerOpen(true)
	}

	return (
		<ModulePageShell
			manifest={manifest}
			headerLeft={
				<Button variant='ghost' size='sm' onClick={goBack}>
					<ArrowLeft className='h-4 w-4 mr-1.5' />
					Bons de commande
				</Button>
			}
		>
			<div className='max-w-4xl mx-auto space-y-6'>
				<div>
					<h2 className='text-lg font-semibold'>Nouveau bon de commande</h2>
					<p className='text-sm text-muted-foreground mt-0.5'>
						La référence sera générée automatiquement à la création.
						{isFromQuote && (
							<span className='ml-2 text-blue-600'>
								· Depuis devis #{search.sourceQuoteId}
							</span>
						)}
					</p>
				</div>

				<div className='rounded-lg border bg-card divide-y'>
					{/* ── Client ──────────────────────────────────────────── */}
					<section className='p-5 space-y-3'>
						<h3 className='text-sm font-semibold'>Client</h3>
						<div className='space-y-1.5'>
							<Label>Client *</Label>
							<Button
								type='button'
								variant='outline'
								className='w-full sm:w-80 justify-between font-normal'
								onClick={() => setCustomerPickerOpen((v) => !v)}
							>
								<span
									className={
										selectedCustomer
											? 'text-foreground'
											: 'text-muted-foreground'
									}
								>
									{selectedCustomer
										? selectedCustomer.company
											? `${selectedCustomer.name} — ${selectedCustomer.company}`
											: selectedCustomer.name
										: 'Sélectionner un client…'}
								</span>
								<ChevronsUpDown className='h-4 w-4 opacity-50' />
							</Button>

							{customerPickerOpen && (
								<div className='w-full sm:w-80 border rounded-md bg-popover shadow-md'>
									<div className='flex items-center gap-2 px-3 py-2 border-b'>
										<Search className='h-4 w-4 text-muted-foreground shrink-0' />
										<input
											ref={customerSearchRef}
											className='flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground'
											placeholder='Rechercher…'
											value={customerSearch}
											onChange={(e) => setCustomerSearch(e.target.value)}
										/>
									</div>
									<ul className='max-h-52 overflow-y-auto divide-y'>
										{filteredCustomers.length === 0 ? (
											<li className='px-3 py-4 text-sm text-center text-muted-foreground'>
												Aucun client trouvé
											</li>
										) : (
											filteredCustomers.slice(0, 20).map((c) => (
												<li key={c.id}>
													<button
														type='button'
														className='w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors'
														onClick={() => {
															setSelectedCustomer({
																id: c.id,
																name: c.name,
																company: c.company,
															})
															setCustomerPickerOpen(false)
															setCustomerSearch('')
														}}
													>
														<p className='font-medium'>{c.name}</p>
														{c.company && (
															<p className='text-xs text-muted-foreground'>
																{c.company}
															</p>
														)}
													</button>
												</li>
											))
										)}
									</ul>
								</div>
							)}
						</div>
					</section>

					{/* ── Lignes ─────────────────────────────────────────── */}
					<section className='p-5 space-y-3'>
						<div className='flex items-center justify-between'>
							<h3 className='text-sm font-semibold'>Lignes</h3>
							<Button
								variant='outline'
								size='sm'
								onClick={() => openPicker('catalogue')}
							>
								<Plus className='h-4 w-4 mr-1.5' />
								Ajouter une ligne
							</Button>
						</div>

						{items.length === 0 ? (
							<div className='flex flex-col items-center justify-center py-8 gap-3 text-muted-foreground border-2 border-dashed rounded-lg'>
								<PackagePlus className='h-8 w-8 opacity-40' />
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
								{items.map((item) => (
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
												updateItem(item.id, 'quantity', Number(e.target.value))
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
												updateItem(item.id, 'vat_rate', Number(e.target.value))
											}
										/>
										<div className='text-right text-sm font-medium py-2'>
											{formatAmount(item.total_ht)}
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
						)}
					</section>

					{/* ── Conditions ─────────────────────────────────────── */}
					<section className='p-5 grid grid-cols-1 sm:grid-cols-2 gap-4'>
						<div className='space-y-1.5'>
							<Label htmlFor='payment'>Conditions de paiement</Label>
							<Input
								id='payment'
								value={paymentConditions}
								onChange={(e) => setPaymentConditions(e.target.value)}
							/>
						</div>
						<div className='space-y-1.5'>
							<Label htmlFor='delivery'>Conditions de livraison</Label>
							<Input
								id='delivery'
								value={deliveryConditions}
								onChange={(e) => setDeliveryConditions(e.target.value)}
							/>
						</div>
						<div className='space-y-1.5 sm:col-span-2'>
							<Label htmlFor='notes'>Notes internes</Label>
							<Textarea
								id='notes'
								rows={2}
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								placeholder='Remarques, informations complémentaires…'
							/>
						</div>
					</section>

					{/* ── Totaux ─────────────────────────────────────────── */}
					<section className='p-5'>
						<div className='flex justify-end'>
							<dl className='w-full max-w-xs space-y-1.5 text-sm'>
								<div className='flex justify-between'>
									<dt className='text-muted-foreground'>Total HT</dt>
									<dd className='font-medium'>{formatAmount(total_ht)}</dd>
								</div>
								<div className='flex justify-between'>
									<dt className='text-muted-foreground'>TVA</dt>
									<dd className='font-medium'>{formatAmount(total_tva)}</dd>
								</div>
								<Separator />
								<div className='flex justify-between text-base font-semibold'>
									<dt>Total TTC</dt>
									<dd>{formatAmount(total_ttc)}</dd>
								</div>
							</dl>
						</div>
					</section>
				</div>

				{/* ── Actions ────────────────────────────────────────────── */}
				<div className='flex items-center justify-end gap-3'>
					<Button
						variant='outline'
						onClick={() => handleSave(true)}
						disabled={isPending || !selectedCustomer}
					>
						{isPending && <Loader2 className='h-4 w-4 mr-1.5 animate-spin' />}
						Enregistrer en brouillon
					</Button>
					<Button
						onClick={() => handleSave(false)}
						disabled={isPending || !selectedCustomer}
					>
						{isPending && <Loader2 className='h-4 w-4 mr-1.5 animate-spin' />}
						Confirmer le bon de commande
					</Button>
				</div>
			</div>

			{/* ── Dialog ajout de ligne ────────────────────────────────── */}
			<Dialog open={productPickerOpen} onOpenChange={setProductPickerOpen}>
				<DialogContent className='max-w-lg'>
					<DialogHeader>
						<DialogTitle>Ajouter une ligne</DialogTitle>
					</DialogHeader>

					{/* Tabs */}
					<div className='flex gap-1 p-1 bg-muted rounded-lg'>
						<button
							type='button'
							className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${
								productPickerTab === 'catalogue'
									? 'bg-background shadow-sm text-foreground'
									: 'text-muted-foreground hover:text-foreground'
							}`}
							onClick={() => setProductPickerTab('catalogue')}
						>
							<Package className='h-4 w-4' />
							Catalogue
						</button>
						<button
							type='button'
							className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${
								productPickerTab === 'libre'
									? 'bg-background shadow-sm text-foreground'
									: 'text-muted-foreground hover:text-foreground'
							}`}
							onClick={() => setProductPickerTab('libre')}
						>
							<PenLine className='h-4 w-4' />
							Ligne libre
						</button>
					</div>

					{/* ── Catalogue ────────────────────────────────────── */}
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
														{formatAmount(product.price_ht)} HT
													</p>
												)}
												{product.price_ttc != null && (
													<p className='text-xs text-muted-foreground'>
														{formatAmount(product.price_ttc)} TTC
													</p>
												)}
											</div>
										</button>
									))
								)}
							</div>
						</div>
					)}

					{/* ── Ligne libre ──────────────────────────────────── */}
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
										{formatAmount(freeLineQty * freeLinePriceHT)}
									</span>
									{' · '}
									TTC :{' '}
									<span className='font-medium text-foreground'>
										{formatAmount(
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
		</ModulePageShell>
	)
}
