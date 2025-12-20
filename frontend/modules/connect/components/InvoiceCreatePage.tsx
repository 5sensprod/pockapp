// frontend/modules/connect/components/InvoiceCreatePage.tsx

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { getAppPosToken, loginToAppPos, useAppPosProducts } from '@/lib/apppos'
import type {
	CustomersResponse,
	ProductsResponse,
} from '@/lib/pocketbase-types'
import { useCreateCustomer, useCustomers } from '@/lib/queries/customers'
import { useCreateInvoice } from '@/lib/queries/invoices'
import type { InvoiceItem } from '@/lib/types/invoice.types'
import { useNavigate } from '@tanstack/react-router'
import {
	ArrowLeft,
	ChevronsUpDown,
	FileText,
	Minus,
	Plus,
	Search,
	Trash2,
	UserPlus,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CustomerDialog } from './CustomerDialog'

// =====================
// TYPES + HELPERS
// =====================

type DiscountMode = 'percent' | 'amount'
type DisplayMode = 'name' | 'designation' | 'sku'

interface UiInvoiceItem extends InvoiceItem {
	id: string
	displayMode?: DisplayMode
	designation?: string
	sku?: string
	unit_price_ttc: number
	lineDiscountMode?: DiscountMode
	lineDiscountValue?: number
}

interface SelectedCustomer {
	id: string
	name: string
	email?: string
	phone?: string
	address?: string
	company?: string
}

type InvoiceCustomer = CustomersResponse
type InvoiceProduct = ProductsResponse

const clamp = (n: number, min: number, max: number) =>
	Math.min(max, Math.max(min, n))
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const getDisplayText = (it: UiInvoiceItem) => {
	const mode = it.displayMode ?? 'name'
	if (mode === 'designation') return it.designation || it.name
	if (mode === 'sku') return it.sku || it.name
	return it.name
}

const isDisplayModeAvailable = (it: UiInvoiceItem, mode: DisplayMode) => {
	switch (mode) {
		case 'name':
			return true
		case 'designation':
			return !!(it.designation && it.designation !== it.name)
		case 'sku':
			return !!(it.sku && it.sku !== it.name && it.sku !== '')
		default:
			return false
	}
}

const computeLineTotals = (it: UiInvoiceItem) => {
	const qty = Math.max(0, it.quantity)
	const rate = it.tva_rate ?? 20
	const coef = 1 + rate / 100

	const baseTtc = round2(it.unit_price_ttc * qty)
	const mode = it.lineDiscountMode ?? 'percent'
	const val = it.lineDiscountValue ?? 0

	const discountTtc =
		mode === 'percent'
			? round2(baseTtc * (clamp(val, 0, 100) / 100))
			: round2(clamp(val, 0, baseTtc))

	const finalTtc = round2(baseTtc - discountTtc)
	const finalHt = round2(finalTtc / coef)
	const unitHt = qty > 0 ? round2(finalHt / qty) : 0

	return {
		unit_price_ht: unitHt,
		total_ht: finalHt,
		total_ttc: finalTtc,
		line_discount_ttc: discountTtc,
		base_ttc: baseTtc,
	}
}

export function InvoiceCreatePage() {
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()

	// States de base
	const [invoiceDate, setInvoiceDate] = useState(
		new Date().toISOString().split('T')[0],
	)
	const [dueDate, setDueDate] = useState('')
	const [selectedCustomer, setSelectedCustomer] =
		useState<SelectedCustomer | null>(null)
	const [items, setItems] = useState<UiInvoiceItem[]>([])
	const [notes, setNotes] = useState('')
	const [currency] = useState('EUR')

	// States Promos
	const [cartDiscountMode, setCartDiscountMode] =
		useState<DiscountMode>('percent')
	const [cartDiscountValue, setCartDiscountValue] = useState<number>(0)

	// UI States
	const [customerPickerOpen, setCustomerPickerOpen] = useState(false)
	const [customerSearch, setCustomerSearch] = useState('')
	const [productPickerOpen, setProductPickerOpen] = useState(false)
	const [productSearch, setProductSearch] = useState('')
	const [newCustomerDialogOpen, setNewCustomerDialogOpen] = useState(false)
	const [isAppPosConnected, setIsAppPosConnected] = useState(false)

	// Queries
	const { data: customersData } = useCustomers({
		companyId: activeCompanyId ?? undefined,
	})
	const { data: productsData } = useAppPosProducts({
		enabled: isAppPosConnected,
		searchTerm: productSearch || undefined,
	})
	const createInvoice = useCreateInvoice()
	const createCustomer = useCreateCustomer()

	const customers = (customersData?.items ?? []) as InvoiceCustomer[]
	const products = (productsData?.items ?? []) as InvoiceProduct[]

	const filteredCustomers = customers.filter((c) => {
		const term = customerSearch.toLowerCase()
		return (
			c.name.toLowerCase().includes(term) ||
			(c.email ?? '').toLowerCase().includes(term) ||
			(c.phone ?? '').includes(customerSearch)
		)
	})

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
				console.error('AppPOS: erreur de connexion', err)
			}
		}
		void connect()
	}, [isAppPosConnected])

	// =====================
	// ACTIONS PRODUITS
	// =====================

	const setLineDisplayMode = (itemId: string, mode: DisplayMode) => {
		setItems((prev) =>
			prev.map((it) => (it.id === itemId ? { ...it, displayMode: mode } : it)),
		)
	}

	const addProduct = (product: InvoiceProduct) => {
		const tvaRate = product.tva_rate ?? 20
		const coef = 1 + tvaRate / 100

		let unitTtc = 0
		if (typeof product.price_ttc === 'number') unitTtc = product.price_ttc
		else if (typeof product.price_ht === 'number')
			unitTtc = product.price_ht * coef

		unitTtc = round2(unitTtc)
		const id = `item-${Date.now()}-${Math.random().toString(16).slice(2)}`

		const draft: UiInvoiceItem = {
			id,
			product_id: product.id,
			name: product.name,
			designation: (product as any).designation ?? product.name,
			sku: (product as any).sku ?? '',
			displayMode: 'name',
			quantity: 1,
			tva_rate: tvaRate,
			unit_price_ttc: unitTtc,
			lineDiscountMode: 'percent',
			lineDiscountValue: 0,
			unit_price_ht: 0,
			total_ht: 0,
			total_ttc: 0,
		}

		const totals = computeLineTotals(draft)
		setItems((prev) => [...prev, { ...draft, ...totals }])
		setProductPickerOpen(false)
		setProductSearch('')
	}

	const updateQuantity = (itemId: string, delta: number) => {
		setItems(
			(prev) =>
				prev
					.map((it) => {
						if (it.id !== itemId) return it
						const q = Math.max(0, it.quantity + delta)
						if (q === 0) return null
						const next = { ...it, quantity: q }
						return { ...next, ...computeLineTotals(next) }
					})
					.filter(Boolean) as UiInvoiceItem[],
		)
	}

	const updateUnitTtc = (itemId: string, unitTtc: number) => {
		setItems((prev) =>
			prev.map((it) => {
				if (it.id !== itemId) return it
				const next = { ...it, unit_price_ttc: round2(Math.max(0, unitTtc)) }
				return { ...next, ...computeLineTotals(next) }
			}),
		)
	}

	const updateLineDiscount = (
		itemId: string,
		mode: DiscountMode,
		value: number,
	) => {
		setItems((prev) =>
			prev.map((it) => {
				if (it.id !== itemId) return it
				const next: UiInvoiceItem = {
					...it,
					lineDiscountMode: mode,
					lineDiscountValue: Math.max(0, value),
				}
				return { ...next, ...computeLineTotals(next) }
			}),
		)
	}

	const removeItem = (itemId: string) => {
		setItems((prev) => prev.filter((it) => it.id !== itemId))
	}

	// =====================
	// CALCULS TOTAUX
	// =====================

	const subTotals = items.reduce(
		(acc, it) => {
			const computed = computeLineTotals(it)
			return {
				ht: round2(acc.ht + computed.total_ht),
				ttc: round2(acc.ttc + computed.total_ttc),
				lineDiscountTtc: round2(
					acc.lineDiscountTtc + computed.line_discount_ttc,
				),
			}
		},
		{ ht: 0, ttc: 0, lineDiscountTtc: 0 },
	)

	const cartDiscountTtc =
		cartDiscountMode === 'percent'
			? round2(subTotals.ttc * (clamp(cartDiscountValue, 0, 100) / 100))
			: round2(clamp(cartDiscountValue, 0, subTotals.ttc))

	const totals = {
		ht: round2(
			(subTotals.ttc - cartDiscountTtc) /
				(1 + (items[0]?.tva_rate ?? 20) / 100),
		),
		tva: round2(
			subTotals.ttc -
				cartDiscountTtc -
				(subTotals.ttc - cartDiscountTtc) /
					(1 + (items[0]?.tva_rate ?? 20) / 100),
		),
		ttc: round2(subTotals.ttc - cartDiscountTtc),
		subTtc: subTotals.ttc,
		lineDiscountTtc: subTotals.lineDiscountTtc,
		cartDiscountTtc,
	}

	// =====================
	// SUBMIT & PRO-RATA
	// =====================

	const applyCartDiscountProRata = (
		lines: UiInvoiceItem[],
		cartDiscountTtc: number,
	) => {
		const totalTtc = lines.reduce((s, it) => round2(s + it.total_ttc), 0)
		if (totalTtc <= 0 || cartDiscountTtc <= 0) return lines

		let remaining = cartDiscountTtc
		return lines.map((it, idx) => {
			const coef = 1 + (it.tva_rate ?? 20) / 100
			const share =
				idx === lines.length - 1
					? remaining
					: round2((it.total_ttc / totalTtc) * cartDiscountTtc)

			remaining = round2(remaining - share)
			const newTotalTtc = round2(Math.max(0, it.total_ttc - share))
			const newTotalHt = round2(newTotalTtc / coef)
			const newUnitHt = it.quantity > 0 ? round2(newTotalHt / it.quantity) : 0

			return {
				...it,
				unit_price_ht: newUnitHt,
				total_ht: newTotalHt,
				total_ttc: newTotalTtc,
			}
		})
	}

	const handleSubmit = async (status: 'draft' | 'validated') => {
		if (!activeCompanyId) {
			toast.error('Aucune entreprise sélectionnée')
			return
		}
		if (!selectedCustomer) {
			toast.error('Veuillez sélectionner un client')
			return
		}
		if (items.length === 0) {
			toast.error('Veuillez ajouter au moins un produit')
			return
		}

		try {
			const normalized: UiInvoiceItem[] = items.map((it) => ({
				...it,
				...computeLineTotals(it),
			}))
			const withCartDiscount = applyCartDiscountProRata(
				normalized,
				cartDiscountTtc,
			)

			const invoiceItems: InvoiceItem[] = withCartDiscount.map(
				({
					id,
					displayMode,
					designation,
					sku,
					unit_price_ttc,
					lineDiscountMode,
					lineDiscountValue,
					...rest
				}) => ({
					...rest,
					name: getDisplayText({
						id,
						displayMode,
						designation,
						sku,
						unit_price_ttc,
						...rest,
					} as UiInvoiceItem),
					line_discount_mode: lineDiscountMode,
					line_discount_value: lineDiscountValue,
					unit_price_ttc_before_discount: unit_price_ttc,
				}),
			)

			const finalTotals = invoiceItems.reduce(
				(acc, it) => ({
					ht: round2(acc.ht + it.total_ht),
					tva: round2(acc.tva + (it.total_ttc - it.total_ht)),
					ttc: round2(acc.ttc + it.total_ttc),
				}),
				{ ht: 0, tva: 0, ttc: 0 },
			)

			const result = await createInvoice.mutateAsync({
				invoice_type: 'invoice',
				date: invoiceDate,
				due_date: dueDate || undefined,
				customer: selectedCustomer.id,
				owner_company: activeCompanyId,
				status,
				items: invoiceItems,
				total_ht: finalTotals.ht,
				total_tva: finalTotals.tva,
				total_ttc: finalTotals.ttc,
				currency,
				notes: notes || undefined,
				cart_discount_mode: cartDiscountMode,
				cart_discount_value: cartDiscountValue,
				cart_discount_ttc: cartDiscountTtc,
				line_discounts_total_ttc: subTotals.lineDiscountTtc,
			})

			toast.success(`Facture ${result.number} créée avec succès`)
			navigate({ to: '/connect/invoices' })
		} catch (error) {
			console.error('Erreur lors de la création de la facture', error)
			toast.error('Erreur lors de la création de la facture')
		}
	}

	const handleQuickCreateCustomer = async () => {
		if (!customerSearch.trim() || !activeCompanyId) return
		try {
			const newCustomer = await createCustomer.mutateAsync({
				name: customerSearch,
				owner_company: activeCompanyId,
			})
			setSelectedCustomer({ id: newCustomer.id, name: newCustomer.name })
			setCustomerPickerOpen(false)
			setCustomerSearch('')
			toast.success(`Client "${customerSearch}" créé`)
		} catch (error) {
			console.error(error)
			toast.error('Erreur lors de la création du client')
		}
	}

	return (
		<div className='container mx-auto px-6 py-8 max-w-6xl'>
			<div className='flex items-center gap-4 mb-6'>
				<Button
					variant='ghost'
					size='icon'
					onClick={() => navigate({ to: '/connect/invoices' })}
				>
					<ArrowLeft className='h-5 w-5' />
				</Button>
				<div className='flex-1'>
					<h1 className='text-2xl font-bold flex items-center gap-2'>
						<FileText className='h-6 w-6' />
						Nouvelle facture
					</h1>
					<p className='text-muted-foreground'>
						Le numéro sera attribué automatiquement
					</p>
				</div>
			</div>

			<div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] items-stretch'>
				<div className='grid gap-6 grid-rows-[auto_auto]'>
					<Card>
						<CardHeader className='pb-3'>
							<CardTitle className='text-lg'>Informations</CardTitle>
						</CardHeader>
						<CardContent className='grid grid-cols-3 gap-4'>
							<div>
								<Label>Numéro</Label>
								<Input
									value='Auto-généré'
									disabled
									className='bg-muted text-muted-foreground'
								/>
							</div>
							<div>
								<Label>Date</Label>
								<Input
									type='date'
									value={invoiceDate}
									onChange={(e) => setInvoiceDate(e.target.value)}
								/>
							</div>
							<div>
								<Label>Échéance</Label>
								<Input
									type='date'
									value={dueDate}
									onChange={(e) => setDueDate(e.target.value)}
								/>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className='pb-3'>
							<CardTitle className='text-lg'>Client</CardTitle>
						</CardHeader>
						<CardContent className='space-y-3'>
							{selectedCustomer ? (
								<div className='flex items-start justify-between gap-4 p-3 border rounded-lg bg-muted/30'>
									<div className='min-w-0'>
										<p className='font-medium truncate'>
											{selectedCustomer.name}
										</p>
										{selectedCustomer.email && (
											<p className='text-sm text-muted-foreground truncate'>
												{selectedCustomer.email}
											</p>
										)}
										{selectedCustomer.address && (
											<p className='text-sm text-muted-foreground line-clamp-2'>
												{selectedCustomer.address}
											</p>
										)}
									</div>
									<Button
										variant='outline'
										size='sm'
										onClick={() => setSelectedCustomer(null)}
									>
										Changer
									</Button>
								</div>
							) : (
								<>
									<Button
										variant='outline'
										className='w-full justify-between'
										onClick={() => setCustomerPickerOpen(true)}
									>
										Sélectionner un client
										<ChevronsUpDown className='ml-2 h-4 w-4 opacity-50' />
									</Button>
									<Dialog
										open={customerPickerOpen}
										onOpenChange={setCustomerPickerOpen}
									>
										<DialogContent className='max-w-lg'>
											<DialogHeader>
												<DialogTitle>Choisir un client</DialogTitle>
												<DialogDescription>
													Recherchez un client ou créez-en un nouveau.
												</DialogDescription>
											</DialogHeader>
											<div className='space-y-3'>
												<Input
													placeholder='Rechercher un client...'
													value={customerSearch}
													onChange={(e) => setCustomerSearch(e.target.value)}
												/>
												<div className='max-h-64 overflow-y-auto border rounded-md'>
													{filteredCustomers.length === 0 ? (
														<div className='p-4 text-center text-sm text-muted-foreground'>
															<p className='mb-3'>Aucun client trouvé</p>
															{customerSearch && (
																<Button
																	size='sm'
																	onClick={handleQuickCreateCustomer}
																	className='gap-2'
																>
																	<UserPlus className='h-4 w-4' />
																	Créer &quot;{customerSearch}&quot;
																</Button>
															)}
														</div>
													) : (
														<ul className='divide-y'>
															{filteredCustomers.map((customer) => (
																<li key={customer.id}>
																	<button
																		type='button'
																		className='w-full px-3 py-2 text-left hover:bg-muted flex items-center justify-between gap-2'
																		onClick={() => {
																			setSelectedCustomer({
																				id: customer.id,
																				name: customer.name,
																				email: customer.email,
																				phone: customer.phone,
																				address: customer.address,
																				company: customer.company,
																			})
																			setCustomerPickerOpen(false)
																		}}
																	>
																		<div className='min-w-0'>
																			<p className='font-medium truncate'>
																				{customer.name}
																			</p>
																			{customer.email && (
																				<p className='text-xs text-muted-foreground truncate'>
																					{customer.email}
																				</p>
																			)}
																		</div>
																	</button>
																</li>
															))}
														</ul>
													)}
												</div>
												<div className='pt-2 border-t'>
													<Button
														variant='ghost'
														size='sm'
														className='w-full gap-2'
														onClick={() => {
															setCustomerPickerOpen(false)
															setNewCustomerDialogOpen(true)
														}}
													>
														<UserPlus className='h-4 w-4' />
														Nouveau client complet
													</Button>
												</div>
											</div>
										</DialogContent>
									</Dialog>
								</>
							)}
						</CardContent>
					</Card>
				</div>

				<Card className='h-full'>
					<CardHeader>
						<CardTitle className='text-lg'>Récapitulatif</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<div className='space-y-2'>
							<div className='flex justify-between text-sm'>
								<span className='text-muted-foreground'>Client</span>
								<span className='font-medium'>
									{selectedCustomer?.name || '-'}
								</span>
							</div>
							<div className='flex justify-between text-sm'>
								<span className='text-muted-foreground'>Articles</span>
								<span className='font-medium'>{items.length}</span>
							</div>
						</div>

						{/* Promotion globale */}
						<div className='space-y-2 pt-2 border-t'>
							<div className='text-sm font-medium'>Promotion globale</div>
							<div className='flex items-center gap-2'>
								<select
									className='h-9 rounded-md border bg-white px-2 text-sm'
									value={cartDiscountMode}
									onChange={(e) =>
										setCartDiscountMode(e.target.value as DiscountMode)
									}
								>
									<option value='percent'>%</option>
									<option value='amount'>€</option>
								</select>
								<Input
									type='number'
									inputMode='decimal'
									step='0.01'
									className='h-9'
									value={cartDiscountValue}
									onChange={(e) => setCartDiscountValue(Number(e.target.value))}
								/>
							</div>
						</div>

						<div className='border-t pt-3 space-y-2 text-sm'>
							<div className='flex justify-between'>
								<span className='text-muted-foreground'>Sous-total TTC</span>
								<span>{totals.subTtc.toFixed(2)} €</span>
							</div>
							<div className='flex justify-between'>
								<span className='text-muted-foreground'>Remises lignes</span>
								<span>-{totals.lineDiscountTtc.toFixed(2)} €</span>
							</div>
							<div className='flex justify-between'>
								<span className='text-muted-foreground'>Remise globale</span>
								<span>-{totals.cartDiscountTtc.toFixed(2)} €</span>
							</div>
							<div className='border-t pt-2 flex justify-between font-bold'>
								<span>Total TTC</span>
								<span className='text-lg'>{totals.ttc.toFixed(2)} €</span>
							</div>
						</div>

						<div className='space-y-2 pt-2'>
							<Button
								className='w-full'
								onClick={() => handleSubmit('validated')}
								disabled={createInvoice.isPending}
							>
								Créer la facture
							</Button>
							<Button
								variant='outline'
								className='w-full'
								onClick={() => handleSubmit('draft')}
								disabled={createInvoice.isPending}
							>
								Enregistrer en brouillon
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>

			<div className='mt-6 space-y-6'>
				<Card>
					<CardHeader className='flex flex-row items-center justify-between'>
						<CardTitle className='text-lg'>Produits</CardTitle>
						<Button
							size='sm'
							className='gap-2'
							onClick={() => setProductPickerOpen(true)}
						>
							<Plus className='h-4 w-4' />
							Ajouter
						</Button>
					</CardHeader>
					<CardContent>
						{items.length === 0 ? (
							<div className='text-center py-8 text-muted-foreground'>
								<Search className='h-8 w-8 mx-auto mb-2 opacity-50' />
								<p>Aucun produit ajouté</p>
							</div>
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Produit</TableHead>
										<TableHead className='text-center w-32'>Qté</TableHead>
										<TableHead className='text-right w-40'>P.U. TTC</TableHead>
										<TableHead className='w-52'>Promo</TableHead>
										<TableHead className='text-right'>TVA</TableHead>
										<TableHead className='text-right'>Total TTC</TableHead>
										<TableHead className='w-10' />
									</TableRow>
								</TableHeader>
								<TableBody>
									{items.map((item) => {
										const currentDisplayMode = item.displayMode ?? 'name'
										const showSelector =
											isDisplayModeAvailable(item, 'designation') ||
											isDisplayModeAvailable(item, 'sku')
										return (
											<TableRow key={item.id}>
												<TableCell className='font-medium'>
													<div className='flex items-center gap-2'>
														<div className='min-w-0 flex-1 truncate'>
															{getDisplayText(item)}
														</div>
														{showSelector && (
															<Select
																value={currentDisplayMode}
																onValueChange={(v) =>
																	setLineDisplayMode(item.id, v as DisplayMode)
																}
															>
																<SelectTrigger className='h-7 w-[110px] text-xs flex-shrink-0'>
																	<SelectValue />
																</SelectTrigger>
																<SelectContent>
																	<SelectItem value='name'>Nom</SelectItem>
																	{isDisplayModeAvailable(
																		item,
																		'designation',
																	) && (
																		<SelectItem value='designation'>
																			Désignation
																		</SelectItem>
																	)}
																	{isDisplayModeAvailable(item, 'sku') && (
																		<SelectItem value='sku'>SKU</SelectItem>
																	)}
																</SelectContent>
															</Select>
														)}
													</div>
												</TableCell>
												<TableCell>
													<div className='flex items-center justify-center gap-1'>
														<Button
															variant='outline'
															size='icon'
															className='h-7 w-7'
															onClick={() => updateQuantity(item.id, -1)}
														>
															<Minus className='h-3 w-3' />
														</Button>
														<span className='w-8 text-center'>
															{item.quantity}
														</span>
														<Button
															variant='outline'
															size='icon'
															className='h-7 w-7'
															onClick={() => updateQuantity(item.id, 1)}
														>
															<Plus className='h-3 w-3' />
														</Button>
													</div>
												</TableCell>
												<TableCell className='text-right'>
													<Input
														type='number'
														inputMode='decimal'
														step='0.01'
														className='h-8 w-28 ml-auto text-right'
														value={
															Number.isFinite(item.unit_price_ttc)
																? item.unit_price_ttc
																: 0
														}
														onChange={(e) =>
															updateUnitTtc(item.id, Number(e.target.value))
														}
													/>
												</TableCell>
												<TableCell>
													<div className='flex items-center gap-2'>
														<select
															className='h-8 rounded-md border bg-white px-1 text-xs'
															value={item.lineDiscountMode ?? 'percent'}
															onChange={(e) =>
																updateLineDiscount(
																	item.id,
																	e.target.value as DiscountMode,
																	item.lineDiscountValue ?? 0,
																)
															}
														>
															<option value='percent'>%</option>
															<option value='amount'>€</option>
														</select>
														<Input
															type='number'
															inputMode='decimal'
															step='0.01'
															className='h-8 w-20'
															value={item.lineDiscountValue ?? 0}
															onChange={(e) =>
																updateLineDiscount(
																	item.id,
																	(item.lineDiscountMode ??
																		'percent') as DiscountMode,
																	Number(e.target.value),
																)
															}
														/>
													</div>
												</TableCell>
												<TableCell className='text-right'>
													{item.tva_rate}%
												</TableCell>
												<TableCell className='text-right font-medium'>
													{item.total_ttc.toFixed(2)} €
												</TableCell>
												<TableCell>
													<Button
														variant='ghost'
														size='icon'
														className='h-7 w-7 text-red-500'
														onClick={() => removeItem(item.id)}
													>
														<Trash2 className='h-4 w-4' />
													</Button>
												</TableCell>
											</TableRow>
										)
									})}
								</TableBody>
								<TableFooter>
									<TableRow>
										<TableCell colSpan={5} className='text-right'>
											Total HT (estimé)
										</TableCell>
										<TableCell className='text-right'>
											{totals.ht.toFixed(2)} €
										</TableCell>
										<TableCell />
									</TableRow>
									<TableRow className='font-bold'>
										<TableCell colSpan={5} className='text-right'>
											Total TTC Final
										</TableCell>
										<TableCell className='text-right text-lg'>
											{totals.ttc.toFixed(2)} €
										</TableCell>
										<TableCell />
									</TableRow>
								</TableFooter>
							</Table>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className='text-lg'>Notes</CardTitle>
					</CardHeader>
					<CardContent>
						<Textarea
							placeholder='Notes ou conditions particulières...'
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							rows={3}
						/>
					</CardContent>
				</Card>
			</div>

			<CustomerDialog
				open={newCustomerDialogOpen}
				onOpenChange={setNewCustomerDialogOpen}
			/>
			<Dialog open={productPickerOpen} onOpenChange={setProductPickerOpen}>
				<DialogContent className='max-w-lg'>
					<DialogHeader>
						<DialogTitle>Ajouter un produit</DialogTitle>
						<DialogDescription>
							Recherchez un produit à partir d&apos;AppPOS.
						</DialogDescription>
					</DialogHeader>
					<div className='space-y-3'>
						<Input
							placeholder='Rechercher un produit...'
							value={productSearch}
							onChange={(e) => setProductSearch(e.target.value)}
						/>
						<div className='max-h-64 overflow-y-auto border rounded-md'>
							{products.length === 0 ? (
								<div className='p-4 text-center text-sm text-muted-foreground'>
									{isAppPosConnected
										? 'Aucun produit trouvé'
										: 'Connexion à AppPOS...'}
								</div>
							) : (
								<ul className='divide-y'>
									{products.slice(0, 20).map((product) => (
										<li key={product.id}>
											<button
												type='button'
												className='w-full px-3 py-2 text-left hover:bg-muted flex items-center justify-between'
												onClick={() => addProduct(product)}
											>
												<div>
													<p className='font-medium'>{product.name}</p>
													{product.price_ttc != null && (
														<p className='text-xs text-muted-foreground'>
															{product.price_ttc.toFixed(2)} € TTC
														</p>
													)}
												</div>
											</button>
										</li>
									))}
								</ul>
							)}
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
