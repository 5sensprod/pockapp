// frontend/modules/cash/CashTerminalPage.tsx

import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { getAppPosToken, loginToAppPos, useAppPosProducts } from '@/lib/apppos'
import { openCashDrawer, printReceipt } from '@/lib/pos/posPrint'
import { loadPosPrinterSettings } from '@/lib/pos/printerSettings'
import {
	getOrCreateDefaultCustomer,
	useActiveCashSession,
	useCashRegisters,
	useCreateCashMovement,
} from '@/lib/queries/cash'
import { useCreateInvoice } from '@/lib/queries/invoices'
import type { InvoiceItem, PaymentMethod } from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
	ArrowLeft,
	Banknote,
	CheckCircle2,
	CreditCard,
	DollarSign,
	Loader2,
	Receipt,
	Search,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

// ============================================================================
// TYPES
// ============================================================================

type LineDiscountMode = 'percent' | 'unit'

interface CartItem {
	id: string
	productId: string
	name: string
	unitPrice: number // prix catalogue TTC
	quantity: number

	lineDiscountMode?: LineDiscountMode // 'percent' | 'unit'
	lineDiscountValue?: number // percent (0-100) OU prix unitaire TTC
}

type PaymentStep = 'cart' | 'payment' | 'success'

type AppPosProduct = {
	id: string
	name: string
	sku?: string | null
	barcode?: string | null
	price_ttc?: number | null
	price_ht?: number | null
	stock_quantity?: number | null
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export function CashTerminalPage() {
	const navigate = useNavigate()
	const { cashRegisterId } = useParams({
		from: '/cash/terminal/$cashRegisterId/',
	})
	const { activeCompanyId } = useActiveCompany()
	const { user } = useAuth()
	const pb = usePocketBase()

	const [cart, setCart] = React.useState<CartItem[]>([])
	const [productSearch, setProductSearch] = React.useState('')
	const [discountPercent, setDiscountPercent] = React.useState(0)

	const [paymentStep, setPaymentStep] = React.useState<PaymentStep>('cart')
	const [selectedPaymentMethod, setSelectedPaymentMethod] =
		React.useState<PaymentMethod>('especes')
	const [amountReceived, setAmountReceived] = React.useState<string>('')
	const [isProcessing, setIsProcessing] = React.useState(false)

	const [isAppPosConnected, setIsAppPosConnected] = React.useState(false)

	// NEW: ligne en édition (pour la remise)
	const [editingLineId, setEditingLineId] = React.useState<string | null>(null)

	const { data: registers } = useCashRegisters(activeCompanyId ?? undefined)
	const { data: activeSession, isLoading: isSessionLoading } =
		useActiveCashSession(cashRegisterId)

	const { data: productsData } = useAppPosProducts({
		enabled: isAppPosConnected,
		searchTerm: productSearch || undefined,
	})
	const products = (productsData?.items ?? []) as AppPosProduct[]

	const createInvoice = useCreateInvoice()
	const createCashMovement = useCreateCashMovement()

	const currentRegister = registers?.find((r) => r.id === cashRegisterId)
	const isSessionOpen = activeSession?.status === 'open'

	const today = new Date().toLocaleDateString('fr-FR', {
		weekday: 'long',
		day: '2-digit',
		month: 'long',
	})

	const clamp = React.useCallback((n: number, min: number, max: number) => {
		return Math.max(min, Math.min(max, n))
	}, [])

	const getEffectiveUnitTtc = React.useCallback(
		(item: CartItem) => {
			const base = item.unitPrice
			const mode = item.lineDiscountMode
			const val = item.lineDiscountValue

			if (!mode || val == null) return base

			if (mode === 'percent') {
				const p = clamp(val, 0, 100)
				return +(base * (1 - p / 100)).toFixed(2)
			}

			// mode === 'unit' : prix unitaire TTC saisi
			return +clamp(val, 0, base).toFixed(2)
		},
		[clamp],
	)

	const getLineTotalTtc = React.useCallback(
		(item: CartItem) => +(getEffectiveUnitTtc(item) * item.quantity).toFixed(2),
		[getEffectiveUnitTtc],
	)

	const { subtotalTtc, totalTtc, tax } = React.useMemo(() => {
		const subtotal = cart.reduce((sum, item) => sum + getLineTotalTtc(item), 0)
		const discount = (subtotal * discountPercent) / 100
		const total = subtotal - discount
		const taxAmount = total * 0.2
		return {
			subtotalTtc: subtotal,
			discountAmount: discount,
			totalTtc: total,
			tax: taxAmount,
		}
	}, [cart, discountPercent, getLineTotalTtc])

	const change = React.useMemo(() => {
		const received = Number.parseFloat(amountReceived) || 0
		return received - totalTtc
	}, [amountReceived, totalTtc])

	React.useEffect(() => {
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

	React.useEffect(() => {
		if (!isSessionLoading && !isSessionOpen) {
			toast.error('Aucune session ouverte pour cette caisse')
			navigate({ to: '/cash' })
		}
	}, [isSessionLoading, isSessionOpen, navigate])

	const addToCart = React.useCallback((product: AppPosProduct) => {
		setCart((prev) => {
			const existingIndex = prev.findIndex(
				(item) => item.productId === product.id,
			)
			if (existingIndex >= 0) {
				const next = [...prev]
				next[existingIndex] = {
					...next[existingIndex],
					quantity: next[existingIndex].quantity + 1,
				}
				return next
			}

			const price = product.price_ttc || product.price_ht || 0
			const newItem: CartItem = {
				id: `cart-${Date.now()}-${Math.random().toString(16).slice(2)}`,
				productId: product.id,
				name: product.name,
				unitPrice: price,
				quantity: 1,
			}
			return [...prev, newItem]
		})
	}, [])

	const updateQuantity = React.useCallback(
		(itemId: string, newQuantity: number) => {
			setCart((prev) => {
				if (newQuantity <= 0) return prev.filter((item) => item.id !== itemId)
				return prev.map((item) =>
					item.id === itemId ? { ...item, quantity: newQuantity } : item,
				)
			})
		},
		[],
	)

	const clearCart = React.useCallback(() => {
		setCart([])
		setDiscountPercent(0)
		setPaymentStep('cart')
		setAmountReceived('')
		setEditingLineId(null)
	}, [])

	const handleChangeDiscount = React.useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const val = Number.parseFloat(e.target.value) || 0
			setDiscountPercent(Math.max(0, Math.min(100, val)))
		},
		[],
	)

	// Remise par ligne (logic)
	const setLineDiscountMode = React.useCallback(
		(itemId: string, mode: LineDiscountMode) => {
			setCart((prev) =>
				prev.map((it) => {
					if (it.id !== itemId) return it

					const currentVal = it.lineDiscountValue
					const nextValue =
						mode === 'percent'
							? clamp(currentVal ?? 0, 0, 100)
							: clamp(currentVal ?? it.unitPrice, 0, it.unitPrice)

					return { ...it, lineDiscountMode: mode, lineDiscountValue: nextValue }
				}),
			)
		},
		[clamp],
	)

	const setLineDiscountValue = React.useCallback(
		(itemId: string, raw: string) => {
			const v = Number.parseFloat(raw)

			setCart((prev) =>
				prev.map((it) => {
					if (it.id !== itemId) return it

					const mode = it.lineDiscountMode ?? 'percent'
					if (Number.isNaN(v)) {
						return {
							...it,
							lineDiscountMode: mode,
							lineDiscountValue: mode === 'unit' ? it.unitPrice : 0,
						}
					}

					const next =
						mode === 'percent' ? clamp(v, 0, 100) : clamp(v, 0, it.unitPrice)
					return { ...it, lineDiscountMode: mode, lineDiscountValue: next }
				}),
			)
		},
		[clamp],
	)

	const clearLineDiscount = React.useCallback((itemId: string) => {
		setCart((prev) =>
			prev.map((it) =>
				it.id === itemId
					? { ...it, lineDiscountMode: undefined, lineDiscountValue: undefined }
					: it,
			),
		)
	}, [])

	const handlePaymentClick = React.useCallback(
		(method: PaymentMethod) => {
			if (cart.length === 0) {
				toast.error('Le panier est vide')
				return
			}
			setSelectedPaymentMethod(method)
			setPaymentStep('payment')
			if (method === 'especes') setAmountReceived(totalTtc.toFixed(2))
		},
		[cart.length, totalTtc],
	)

	const handleConfirmPayment = React.useCallback(async () => {
		if (!activeCompanyId || !activeSession) {
			toast.error('Session ou entreprise manquante')
			return
		}

		if (selectedPaymentMethod === 'especes') {
			const received = Number.parseFloat(amountReceived) || 0
			if (received < totalTtc) {
				toast.error('Montant insuffisant')
				return
			}
		}

		const printerSettings = loadPosPrinterSettings()
		setIsProcessing(true)

		try {
			const defaultCustomerId = await getOrCreateDefaultCustomer(
				pb,
				activeCompanyId,
			)

			const invoiceItems: InvoiceItem[] = cart.map((item) => {
				const unitTtc = getEffectiveUnitTtc(item)
				const totalLineTtc = unitTtc * item.quantity
				const unitHt = unitTtc / 1.2
				const totalHt = totalLineTtc / 1.2

				return {
					product_id: item.productId,
					name: item.name,
					quantity: item.quantity,
					unit_price_ht: unitHt,
					tva_rate: 20,
					total_ht: totalHt,
					total_ttc: totalLineTtc,
				}
			})

			// ✅ FIX: Ajout de is_pos_ticket: true
			const invoice = await createInvoice.mutateAsync({
				invoice_type: 'invoice',
				date: new Date().toISOString().split('T')[0],
				customer: defaultCustomerId,
				owner_company: activeCompanyId,
				status: 'validated',
				is_paid: true,
				paid_at: new Date().toISOString(),
				payment_method: selectedPaymentMethod,
				items: invoiceItems,
				total_ht: totalTtc / 1.2,
				total_tva: totalTtc - totalTtc / 1.2,
				total_ttc: totalTtc,
				currency: 'EUR',

				// 🎯 CHAMPS DE CAISSE
				cash_register: cashRegisterId,
				session: activeSession.id,
				is_pos_ticket: true, // ✅ FIX: Force le marquage comme ticket POS
				sold_by: user?.id,
			})

			// Mouvement de caisse si espèces
			if (selectedPaymentMethod === 'especes') {
				await createCashMovement.mutateAsync({
					sessionId: activeSession.id,
					movementType: 'cash_in',
					amount: totalTtc,
					reason: `Vente ticket ${invoice.number}`,
					meta: { invoice_id: invoice.id, invoice_number: invoice.number },
					cashRegisterId,
				})
			}

			// Impression ticket
			if (printerSettings.enabled && printerSettings.printerName) {
				if (printerSettings.autoPrint) {
					await printReceipt({
						printerName: printerSettings.printerName,
						width: printerSettings.width,
						receipt: {
							invoiceNumber: invoice.number,
							dateLabel: new Date().toLocaleString('fr-FR'),
							items: cart.map((it) => ({
								name: it.name,
								qty: it.quantity,
								unitTtc: getEffectiveUnitTtc(it),
								totalTtc: getLineTotalTtc(it),
							})),
							subtotalTtc,
							discountAmount: (subtotalTtc * discountPercent) / 100,
							totalTtc,
							taxAmount: tax,
							paymentMethod: selectedPaymentMethod,
						},
					})
				}

				if (
					printerSettings.autoOpenDrawer &&
					selectedPaymentMethod === 'especes'
				) {
					await openCashDrawer({
						printerName: printerSettings.printerName,
						width: printerSettings.width,
					})
				}
			}

			toast.success(`Ticket ${invoice.number} créé`)
			setPaymentStep('success')
			setTimeout(() => clearCart(), 3000)
		} catch (error: any) {
			console.error('Erreur création ticket:', error)
			toast.error(error.message || 'Erreur lors de la création du ticket')
		} finally {
			setIsProcessing(false)
		}
	}, [
		activeCompanyId,
		activeSession,
		amountReceived,
		cart,
		cashRegisterId,
		clearCart,
		createCashMovement,
		createInvoice,
		discountPercent,
		getEffectiveUnitTtc,
		getLineTotalTtc,
		pb,
		selectedPaymentMethod,
		subtotalTtc,
		tax,
		totalTtc,
		user?.id,
	])

	if (isSessionLoading) return <LoadingView />
	if (!isSessionOpen) return null

	if (paymentStep === 'cart') {
		return (
			<CartStepView
				currentRegisterName={currentRegister?.name || 'Caisse'}
				sessionIdShort={activeSession?.id.slice(0, 8) ?? ''}
				today={today}
				onBack={() => navigate({ to: '/cash' })}
				productSearch={productSearch}
				onProductSearchChange={setProductSearch}
				isAppPosConnected={isAppPosConnected}
				products={products}
				onAddToCart={addToCart}
				cart={cart}
				onClearCart={clearCart}
				onUpdateQuantity={updateQuantity}
				subtotalTtc={subtotalTtc}
				tax={tax}
				totalTtc={totalTtc}
				discountPercent={discountPercent}
				onDiscountChange={handleChangeDiscount}
				onPaymentClick={handlePaymentClick}
				getEffectiveUnitTtc={getEffectiveUnitTtc}
				getLineTotalTtc={getLineTotalTtc}
				setLineDiscountMode={setLineDiscountMode}
				setLineDiscountValue={setLineDiscountValue}
				clearLineDiscount={clearLineDiscount}
				editingLineId={editingLineId}
				setEditingLineId={setEditingLineId}
			/>
		)
	}

	if (paymentStep === 'payment') {
		return (
			<PaymentDialog
				totalTtc={totalTtc}
				selectedPaymentMethod={selectedPaymentMethod}
				onSelectedPaymentMethodChange={setSelectedPaymentMethod}
				amountReceived={amountReceived}
				onAmountReceivedChange={setAmountReceived}
				change={change}
				isProcessing={isProcessing}
				onCancel={() => setPaymentStep('cart')}
				onConfirm={handleConfirmPayment}
			/>
		)
	}

	return <SuccessView onNewSale={clearCart} />
}

// ============================================================================
// COMPOSANTS (en bas du fichier)
// ============================================================================

function LoadingView() {
	return (
		<div className='flex h-screen items-center justify-center'>
			<Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
		</div>
	)
}

function CartStepView(props: {
	currentRegisterName: string
	sessionIdShort: string
	today: string
	onBack: () => void

	productSearch: string
	onProductSearchChange: (v: string) => void
	isAppPosConnected: boolean
	products: AppPosProduct[]
	onAddToCart: (p: AppPosProduct) => void

	cart: CartItem[]
	onClearCart: () => void
	onUpdateQuantity: (itemId: string, newQuantity: number) => void

	subtotalTtc: number
	tax: number
	totalTtc: number
	discountPercent: number
	onDiscountChange: (e: React.ChangeEvent<HTMLInputElement>) => void

	onPaymentClick: (method: PaymentMethod) => void

	getEffectiveUnitTtc: (item: CartItem) => number
	getLineTotalTtc: (item: CartItem) => number
	setLineDiscountMode: (itemId: string, mode: LineDiscountMode) => void
	setLineDiscountValue: (itemId: string, raw: string) => void
	clearLineDiscount: (itemId: string) => void

	editingLineId: string | null
	setEditingLineId: (id: string | null) => void
}) {
	const {
		currentRegisterName,
		sessionIdShort,
		today,
		onBack,
		productSearch,
		onProductSearchChange,
		isAppPosConnected,
		products,
		onAddToCart,
		cart,
		onClearCart,
		onUpdateQuantity,
		subtotalTtc,
		tax,
		totalTtc,
		discountPercent,
		onDiscountChange,
		onPaymentClick,
		getEffectiveUnitTtc,
		getLineTotalTtc,
		setLineDiscountMode,
		setLineDiscountValue,
		clearLineDiscount,
		editingLineId,
		setEditingLineId,
	} = props

	return (
		<div className='container mx-auto flex flex-col gap-6 px-6 py-8'>
			<TerminalHeader
				registerName={currentRegisterName}
				sessionIdShort={sessionIdShort}
				today={today}
				onBack={onBack}
			/>

			<main className='flex min-h-[520px] flex-1 flex-col gap-4 lg:flex-row'>
				<section className='flex flex-1 flex-col gap-3'>
					<ProductsPanel
						productSearch={productSearch}
						onProductSearchChange={onProductSearchChange}
						isAppPosConnected={isAppPosConnected}
						products={products}
						onAddToCart={onAddToCart}
					/>
				</section>

				<aside className='flex flex-1 flex-col gap-3'>
					<CartPanel
						cart={cart}
						onClearCart={onClearCart}
						onUpdateQuantity={onUpdateQuantity}
						subtotalTtc={subtotalTtc}
						tax={tax}
						totalTtc={totalTtc}
						discountPercent={discountPercent}
						onDiscountChange={onDiscountChange}
						onPaymentClick={onPaymentClick}
						getEffectiveUnitTtc={getEffectiveUnitTtc}
						getLineTotalTtc={getLineTotalTtc}
						setLineDiscountMode={setLineDiscountMode}
						setLineDiscountValue={setLineDiscountValue}
						clearLineDiscount={clearLineDiscount}
						editingLineId={editingLineId}
						setEditingLineId={setEditingLineId}
					/>
				</aside>
			</main>
		</div>
	)
}

function TerminalHeader(props: {
	registerName: string
	sessionIdShort: string
	today: string
	onBack: () => void
}) {
	const { registerName, sessionIdShort, today, onBack } = props

	return (
		<header className='flex items-center justify-between gap-4'>
			<div className='flex items-center gap-3'>
				<Button variant='ghost' size='sm' onClick={onBack}>
					<ArrowLeft className='h-4 w-4 mr-2' />
					Retour
				</Button>
				<div>
					<h1 className='text-2xl font-semibold tracking-tight'>
						{registerName}
					</h1>
					<p className='text-sm text-muted-foreground'>
						Session {sessionIdShort} — {today}
					</p>
				</div>
			</div>

			<div className='flex items-center gap-4 text-xs text-muted-foreground'>
				<div className='flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1'>
					<span className='h-2 w-2 rounded-full bg-emerald-500' />
					<span className='font-medium text-emerald-700'>Session ouverte</span>
				</div>
			</div>
		</header>
	)
}

function ProductsPanel(props: {
	productSearch: string
	onProductSearchChange: (v: string) => void
	isAppPosConnected: boolean
	products: AppPosProduct[]
	onAddToCart: (p: AppPosProduct) => void
}) {
	const {
		productSearch,
		onProductSearchChange,
		isAppPosConnected,
		products,
		onAddToCart,
	} = props

	return (
		<Card className='flex flex-1 flex-col'>
			<div className='flex flex-wrap items-center gap-3 border-b px-4 py-3'>
				<div className='relative min-w-[220px] flex-1'>
					<Search
						className='absolute left-3 top-1/2 -translate-y-1/2 text-slate-400'
						size={16}
					/>
					<Input
						type='text'
						placeholder='Rechercher un produit…'
						value={productSearch}
						onChange={(e) => onProductSearchChange(e.target.value)}
						className='h-9 w-full bg-slate-50 pl-8 text-sm'
					/>
				</div>
			</div>

			<div className='flex items-center border-b px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500'>
				<div className='flex-1'>Produit</div>
				<div className='w-24 text-right'>Prix TTC</div>
				<div className='w-24 text-right'>Stock</div>
			</div>

			<div className='h-[340px] overflow-auto text-sm'>
				{products.length === 0 ? (
					<div className='px-4 py-6 text-center text-xs text-slate-400'>
						{isAppPosConnected
							? 'Aucun produit ne correspond à la recherche'
							: 'Connexion à AppPOS en cours ou échouée'}
					</div>
				) : (
					<>
						{products.slice(0, 50).map((p) => (
							<button
								key={p.id}
								type='button'
								onClick={() => onAddToCart(p)}
								className='flex w-full cursor-pointer items-center border-b px-4 py-2 text-left hover:bg-slate-50'
							>
								<div className='flex-1'>
									<div className='font-medium'>{p.name}</div>
									<div className='text-xs text-slate-500'>
										{p.sku || p.barcode || 'N/A'}
									</div>
								</div>
								<div className='w-24 text-right text-sm font-semibold'>
									{(p.price_ttc ?? 0).toFixed(2)} €
								</div>
								<div className='w-24 text-right text-xs text-slate-500'>
									{p.stock_quantity ?? '?'} en stock
								</div>
							</button>
						))}
					</>
				)}
			</div>
		</Card>
	)
}

function CartPanel(props: {
	cart: CartItem[]
	onClearCart: () => void
	onUpdateQuantity: (itemId: string, newQuantity: number) => void
	subtotalTtc: number
	tax: number
	totalTtc: number
	discountPercent: number
	onDiscountChange: (e: React.ChangeEvent<HTMLInputElement>) => void
	onPaymentClick: (method: PaymentMethod) => void

	getEffectiveUnitTtc: (item: CartItem) => number
	getLineTotalTtc: (item: CartItem) => number
	setLineDiscountMode: (itemId: string, mode: LineDiscountMode) => void
	setLineDiscountValue: (itemId: string, raw: string) => void
	clearLineDiscount: (itemId: string) => void

	editingLineId: string | null
	setEditingLineId: (id: string | null) => void
}) {
	const {
		cart,
		onClearCart,
		onUpdateQuantity,
		subtotalTtc,
		tax,
		totalTtc,
		discountPercent,
		onDiscountChange,
		onPaymentClick,
		getEffectiveUnitTtc,
		getLineTotalTtc,
		setLineDiscountMode,
		setLineDiscountValue,
		clearLineDiscount,
		editingLineId,
		setEditingLineId,
	} = props

	const hasActiveLineDiscount = React.useCallback((item: CartItem) => {
		if (!item.lineDiscountMode || item.lineDiscountValue == null) return false
		if (item.lineDiscountMode === 'percent') return item.lineDiscountValue > 0
		return item.lineDiscountValue < item.unitPrice
	}, [])

	return (
		<Card className='flex h-full flex-col'>
			<CardHeader className='flex flex-row items-center justify-between border-b px-4 py-3'>
				<div>
					<CardTitle className='text-base'>Ticket</CardTitle>
					<CardDescription className='text-xs'>
						Lignes en cours d&apos;encaissement.
					</CardDescription>
				</div>
				<Button
					type='button'
					variant='ghost'
					size='sm'
					className='h-7 px-2 text-xs text-red-500 hover:text-red-600'
					onClick={onClearCart}
				>
					Vider
				</Button>
			</CardHeader>

			<CardContent className='flex-1 overflow-auto px-4 py-2 text-sm'>
				{cart.length === 0 ? (
					<div className='flex h-full items-center justify-center text-xs text-slate-400'>
						Aucun article pour le moment.
					</div>
				) : (
					<div className='divide-y'>
						{cart.map((item) => {
							const open = editingLineId === item.id
							const mode: LineDiscountMode = item.lineDiscountMode ?? 'percent'
							const value =
								item.lineDiscountValue ?? (mode === 'unit' ? item.unitPrice : 0)

							return (
								<div key={item.id} className='py-2'>
									<div className='flex items-start justify-between gap-3'>
										<div className='flex-1'>
											<div className='font-medium'>{item.name}</div>

											<div className='mt-1 flex items-center gap-2 text-xs text-slate-500'>
												<Button
													type='button'
													variant='ghost'
													size='sm'
													className='h-5 w-5 p-0'
													onClick={() =>
														onUpdateQuantity(item.id, item.quantity - 1)
													}
												>
													−
												</Button>
												<span>
													{item.quantity} × {item.unitPrice.toFixed(2)} €
												</span>
												<Button
													type='button'
													variant='ghost'
													size='sm'
													className='h-5 w-5 p-0'
													onClick={() =>
														onUpdateQuantity(item.id, item.quantity + 1)
													}
												>
													+
												</Button>

												<Button
													type='button'
													variant='ghost'
													size='sm'
													className='h-6 px-2 text-[11px]'
													onClick={() =>
														setEditingLineId(open ? null : item.id)
													}
												>
													Remise
												</Button>

												{hasActiveLineDiscount(item) && (
													<span className='inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700'>
														<span className='h-1.5 w-1.5 rounded-full bg-emerald-500' />
														{item.lineDiscountMode === 'percent'
															? `-${item.lineDiscountValue}%`
															: `${getEffectiveUnitTtc(item).toFixed(2)}€`}
													</span>
												)}
											</div>

											{/* NEW: panel ultra-compact (une seule ligne) */}
											{open && (
												<div className='mt-2 flex items-center gap-2 rounded-lg bg-slate-50 p-2'>
													<div className='w-28'>
														<Select
															value={mode}
															onValueChange={(v) =>
																setLineDiscountMode(
																	item.id,
																	v as LineDiscountMode,
																)
															}
														>
															<SelectTrigger className='h-8'>
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value='percent'>%</SelectItem>
																<SelectItem value='unit'>Prix unit.</SelectItem>
															</SelectContent>
														</Select>
													</div>

													<Input
														type='number'
														step='0.01'
														className='h-8 flex-1'
														placeholder={mode === 'unit' ? 'Prix TTC' : '%'}
														value={String(value)}
														onChange={(e) =>
															setLineDiscountValue(item.id, e.target.value)
														}
													/>

													<div className='text-xs text-slate-600 w-28 text-right'>
														{getEffectiveUnitTtc(item).toFixed(2)} €
													</div>

													<Button
														type='button'
														variant='ghost'
														size='sm'
														className='h-8 px-2 text-[11px]'
														onClick={() => clearLineDiscount(item.id)}
													>
														Reset
													</Button>
												</div>
											)}
										</div>

										<span className='font-semibold'>
											{getLineTotalTtc(item).toFixed(2)} €
										</span>
									</div>
								</div>
							)
						})}
					</div>
				)}
			</CardContent>

			<div className='border-t px-4 py-4 text-sm'>
				<div className='flex items-center justify-between'>
					<span>Sous-total</span>
					<span>{subtotalTtc.toFixed(2)} €</span>
				</div>

				<div className='mt-2 flex items-center justify-between'>
					<span>Remise</span>
					<div className='flex items-center gap-1'>
						<Input
							type='number'
							className='h-8 w-20 bg-slate-50 text-right text-sm'
							value={discountPercent.toString()}
							onChange={onDiscountChange}
							placeholder='0'
						/>
						<span className='text-xs text-slate-500'>%</span>
					</div>
				</div>

				<div className='mt-2 flex items-center justify-between text-xs text-slate-500'>
					<span>TVA (20 %)</span>
					<span>{tax.toFixed(2)} €</span>
				</div>

				<Separator className='my-2' />

				<div className='flex items-center justify-between pt-1 text-base font-semibold'>
					<span>Total TTC</span>
					<span>{totalTtc.toFixed(2)} €</span>
				</div>
			</div>

			<div className='border-t px-4 py-4'>
				<div className='mb-3 grid grid-cols-3 gap-2 text-xs'>
					<Button
						type='button'
						variant='outline'
						className='h-10'
						onClick={() => onPaymentClick('cb')}
						disabled={cart.length === 0}
					>
						<CreditCard className='h-4 w-4 mr-1' />
						CB
					</Button>
					<Button
						type='button'
						variant='outline'
						className='h-10'
						onClick={() => onPaymentClick('especes')}
						disabled={cart.length === 0}
					>
						<Banknote className='h-4 w-4 mr-1' />
						Espèces
					</Button>
					<Button
						type='button'
						variant='outline'
						className='h-10'
						onClick={() => onPaymentClick('virement')}
						disabled={cart.length === 0}
					>
						<DollarSign className='h-4 w-4 mr-1' />
						Autre
					</Button>
				</div>

				<Button
					type='button'
					className='h-11 w-full text-sm font-semibold'
					disabled={totalTtc <= 0 || cart.length === 0}
					onClick={() => onPaymentClick('cb')}
				>
					Encaisser {totalTtc > 0 ? `${totalTtc.toFixed(2)} €` : ''}
				</Button>
			</div>
		</Card>
	)
}

function PaymentDialog(props: {
	totalTtc: number
	selectedPaymentMethod: PaymentMethod
	onSelectedPaymentMethodChange: (m: PaymentMethod) => void
	amountReceived: string
	onAmountReceivedChange: (v: string) => void
	change: number
	isProcessing: boolean
	onCancel: () => void
	onConfirm: () => void | Promise<void>
}) {
	const {
		totalTtc,
		selectedPaymentMethod,
		onSelectedPaymentMethodChange,
		amountReceived,
		onAmountReceivedChange,
		change,
		isProcessing,
		onCancel,
		onConfirm,
	} = props

	return (
		<Dialog open={true} onOpenChange={onCancel}>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>Paiement</DialogTitle>
					<DialogDescription>
						Montant à encaisser : {totalTtc.toFixed(2)} €
					</DialogDescription>
				</DialogHeader>

				<div className='space-y-4'>
					<div>
						<div className='grid grid-cols-3 gap-2 mt-2'>
							<Button
								type='button'
								variant={
									selectedPaymentMethod === 'especes' ? 'default' : 'outline'
								}
								className='h-20'
								onClick={() => onSelectedPaymentMethodChange('especes')}
							>
								<div className='flex flex-col items-center gap-1'>
									<Banknote className='h-5 w-5' />
									<span className='text-xs'>Espèces</span>
								</div>
							</Button>
							<Button
								type='button'
								variant={selectedPaymentMethod === 'cb' ? 'default' : 'outline'}
								className='h-20'
								onClick={() => onSelectedPaymentMethodChange('cb')}
							>
								<div className='flex flex-col items-center gap-1'>
									<CreditCard className='h-5 w-5' />
									<span className='text-xs'>CB</span>
								</div>
							</Button>
							<Button
								type='button'
								variant={
									selectedPaymentMethod === 'virement' ? 'default' : 'outline'
								}
								className='h-20'
								onClick={() => onSelectedPaymentMethodChange('virement')}
							>
								<div className='flex flex-col items-center gap-1'>
									<DollarSign className='h-5 w-5' />
									<span className='text-xs'>Virement</span>
								</div>
							</Button>
						</div>
					</div>

					{selectedPaymentMethod === 'especes' && (
						<div>
							<Input
								type='number'
								step='0.01'
								value={amountReceived}
								onChange={(e) => onAmountReceivedChange(e.target.value)}
								className='text-xl h-14 text-right'
								placeholder='Montant reçu'
								autoFocus
							/>

							{change >= 0 && amountReceived !== '' && (
								<div className='mt-3 p-3 bg-slate-100 rounded-lg'>
									<p className='text-sm text-muted-foreground'>
										Monnaie à rendre
									</p>
									<p className='text-2xl font-bold text-primary'>
										{change.toFixed(2)} €
									</p>
								</div>
							)}
						</div>
					)}
				</div>

				<DialogFooter>
					<Button variant='outline' onClick={onCancel} disabled={isProcessing}>
						Annuler
					</Button>
					<Button
						onClick={onConfirm}
						disabled={
							isProcessing ||
							(selectedPaymentMethod === 'especes' &&
								(Number.parseFloat(amountReceived) || 0) < totalTtc)
						}
					>
						{isProcessing ? (
							<>
								<Loader2 className='h-4 w-4 mr-2 animate-spin' />
								Traitement...
							</>
						) : (
							<>
								<Receipt className='h-4 w-4 mr-2' />
								Confirmer
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function SuccessView(props: { onNewSale: () => void }) {
	const { onNewSale } = props
	return (
		<div className='flex h-screen items-center justify-center'>
			<Card className='w-96'>
				<CardContent className='flex flex-col items-center justify-center p-8 space-y-4'>
					<div className='h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center'>
						<CheckCircle2 className='h-8 w-8 text-emerald-600' />
					</div>
					<div className='text-center space-y-2'>
						<h3 className='text-xl font-bold'>Paiement effectué !</h3>
						<p className='text-muted-foreground'>
							Le ticket a été créé avec succès
						</p>
					</div>
					<Button onClick={onNewSale} className='w-full'>
						Nouvelle vente
					</Button>
				</CardContent>
			</Card>
		</div>
	)
}
