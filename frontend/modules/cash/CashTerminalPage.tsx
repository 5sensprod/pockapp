// frontend/modules/cash/CashTerminalPage.tsx
// ✅ VERSION CORRIGÉE - Support multi-taux TVA + Ticket de caisse

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
import { useCustomerDisplay } from '@/lib/pos/useCustomerDisplay'
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
import { CreateProductDialog } from '@/modules/cash/CreateProductDialog'
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

const APPPOS_BASE_URL = 'http://localhost:3000'

const getImageUrl = (imagePath: string | undefined): string | null => {
	if (!imagePath) return null
	if (imagePath.startsWith('http')) return imagePath
	return `${APPPOS_BASE_URL}${imagePath}`
}

type LineDiscountMode = 'percent' | 'unit'
type DisplayMode = 'name' | 'designation' | 'sku'

interface CartItem {
	id: string
	productId: string
	name: string
	designation?: string
	sku?: string
	image?: string
	unitPrice: number
	quantity: number
	tvaRate: number

	lineDiscountMode?: LineDiscountMode
	lineDiscountValue?: number
	lineDiscountRaw?: string

	displayMode?: DisplayMode
}

type PaymentStep = 'cart' | 'payment' | 'success'

type AppPosProduct = {
	id: string
	name: string
	designation?: string | null
	sku?: string | null
	barcode?: string | null
	price_ttc?: number | null
	price_ht?: number | null
	stock_quantity?: number | null
	images?: string
	tva_rate?: number
}

interface VatBreakdown {
	rate: number
	base_ht: number
	vat: number
	total_ttc: number
}

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

	const [cartDiscountMode, setCartDiscountMode] = React.useState<
		'percent' | 'amount'
	>('percent')

	const [cartDiscountValue, setCartDiscountValue] = React.useState<number>(0)
	const [cartDiscountRaw, setCartDiscountRaw] = React.useState<string>('')

	const [paymentStep, setPaymentStep] = React.useState<PaymentStep>('cart')
	const [selectedPaymentMethod, setSelectedPaymentMethod] =
		React.useState<PaymentMethod>('especes')
	const [amountReceived, setAmountReceived] = React.useState<string>('')
	const [isProcessing, setIsProcessing] = React.useState(false)

	const [isAppPosConnected, setIsAppPosConnected] = React.useState(false)

	const [editingLineId, setEditingLineId] = React.useState<string | null>(null)

	const searchInputRef = React.useRef<HTMLInputElement>(null)

	const [showCreateProductDialog, setShowCreateProductDialog] =
		React.useState(false)
	const [productNotFoundBarcode, setProductNotFoundBarcode] =
		React.useState<string>('')
	const [productInitialName, setProductInitialName] = React.useState<string>('')

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

			return +clamp(val, 0, base).toFixed(2)
		},
		[clamp],
	)

	const getLineTotalTtc = React.useCallback(
		(item: CartItem) => +(getEffectiveUnitTtc(item) * item.quantity).toFixed(2),
		[getEffectiveUnitTtc],
	)

	const getLineAmounts = React.useCallback(
		(item: CartItem) => {
			const ttc = getLineTotalTtc(item)
			const coef = 1 + item.tvaRate / 100
			const ht = ttc / coef
			const vat = ttc - ht
			return { ttc, ht, vat }
		},
		[getLineTotalTtc],
	)

	const applyCartDiscountProRata = React.useCallback(
		(items: CartItem[], discountTtc: number) => {
			if (discountTtc <= 0) return items.map((it) => getLineAmounts(it))

			const subtotal = items.reduce((sum, it) => sum + getLineTotalTtc(it), 0)
			if (subtotal <= 0) return items.map((it) => getLineAmounts(it))

			return items.map((it) => {
				const lineTtc = getLineTotalTtc(it)
				const ratio = lineTtc / subtotal
				const lineDiscount = discountTtc * ratio

				const finalTtc = lineTtc - lineDiscount
				const coef = 1 + it.tvaRate / 100
				const finalHt = finalTtc / coef
				const finalVat = finalTtc - finalHt

				return { ttc: finalTtc, ht: finalHt, vat: finalVat }
			})
		},
		[getLineTotalTtc, getLineAmounts],
	)

	const {
		subtotalTtc,
		totalTtc,
		totalHt,
		totalVat,
		discountAmount,
		vatBreakdown,
	} = React.useMemo(() => {
		const subtotal = cart.reduce((sum, item) => sum + getLineTotalTtc(item), 0)

		let discount = 0
		if (cartDiscountMode === 'percent') {
			discount = (subtotal * cartDiscountValue) / 100
		} else {
			discount = Math.min(cartDiscountValue, subtotal)
		}

		const finalLines = applyCartDiscountProRata(cart, discount)

		const total_ttc = finalLines.reduce((sum, line) => sum + line.ttc, 0)
		const total_ht = finalLines.reduce((sum, line) => sum + line.ht, 0)
		const total_vat = finalLines.reduce((sum, line) => sum + line.vat, 0)

		const breakdownMap = new Map<number, VatBreakdown>()

		for (const [index, item] of cart.entries()) {
			const rate = item.tvaRate
			const amounts = finalLines[index]

			let entry = breakdownMap.get(rate)

			if (!entry) {
				entry = {
					rate,
					base_ht: 0,
					vat: 0,
					total_ttc: 0,
				}
				breakdownMap.set(rate, entry)
			}

			entry.base_ht += amounts.ht
			entry.vat += amounts.vat
			entry.total_ttc += amounts.ttc
		}

		const breakdown = Array.from(breakdownMap.values())
			.map((entry) => ({
				rate: entry.rate,
				base_ht: +entry.base_ht.toFixed(2),
				vat: +entry.vat.toFixed(2),
				total_ttc: +entry.total_ttc.toFixed(2),
			}))
			.sort((a, b) => a.rate - b.rate)

		return {
			subtotalTtc: +subtotal.toFixed(2),
			discountAmount: +discount.toFixed(2),
			totalTtc: +total_ttc.toFixed(2),
			totalHt: +total_ht.toFixed(2),
			totalVat: +total_vat.toFixed(2),
			vatBreakdown: breakdown,
		}
	}, [
		cart,
		cartDiscountMode,
		cartDiscountValue,
		getLineTotalTtc,
		applyCartDiscountProRata,
	])

	const change = React.useMemo(() => {
		const received = Number.parseFloat(amountReceived) || 0
		return received - totalTtc
	}, [amountReceived, totalTtc])

	const customerDisplay = useCustomerDisplay({
		total: totalTtc,
		itemCount: cart.length,
		currentItem: cart[cart.length - 1] || null,
		paymentMethod:
			paymentStep === 'payment' ? selectedPaymentMethod : undefined,
		received:
			paymentStep === 'payment'
				? Number.parseFloat(amountReceived) || undefined
				: undefined,
		change: paymentStep === 'payment' && change > 0 ? change : undefined,
	})

	React.useEffect(() => {
		if (paymentStep === 'cart' && searchInputRef.current) {
			searchInputRef.current.focus()
		}
	}, [paymentStep])

	React.useEffect(() => {
		if (products.length === 1 && productSearch.length > 2) {
			const product = products[0]
			const isExactMatch =
				product.barcode === productSearch || product.sku === productSearch

			if (isExactMatch) {
				addToCart(product)
				setProductSearch('')
				setTimeout(() => {
					searchInputRef.current?.focus()
				}, 0)
			}
		}
	}, [products, productSearch])

	React.useEffect(() => {
		if (paymentStep !== 'cart') return

		let scanBuffer = ''
		let scanTimeout: NodeJS.Timeout | null = null

		const handleKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target.getAttribute('contenteditable') === 'true'
			) {
				return
			}

			if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
				e.preventDefault()
				scanBuffer += e.key

				if (scanTimeout) clearTimeout(scanTimeout)

				scanTimeout = setTimeout(() => {
					scanBuffer = ''
				}, 100)
			}

			if (e.key === 'Enter' && scanBuffer.length > 0) {
				e.preventDefault()
				setProductSearch(scanBuffer)
				searchInputRef.current?.focus()
				scanBuffer = ''
			}

			if (e.key === 'Escape') {
				e.preventDefault()
				setProductSearch('')
				searchInputRef.current?.focus()
			}
		}

		document.addEventListener('keydown', handleKeyDown)

		return () => {
			document.removeEventListener('keydown', handleKeyDown)
			if (scanTimeout) clearTimeout(scanTimeout)
		}
	}, [paymentStep])

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
			const imageUrl = getImageUrl(product.images)

			const tvaRate = product.tva_rate ?? 20

			const newItem: CartItem = {
				id: `cart-${Date.now()}-${Math.random().toString(16).slice(2)}`,
				productId: product.id,
				name: product.name,
				designation: product.designation || product.name,
				sku: product.sku || '',
				image: imageUrl || '',
				unitPrice: price,
				quantity: 1,
				tvaRate,
				displayMode: 'name',
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
		setCartDiscountMode('percent')
		setCartDiscountValue(0)
		setCartDiscountRaw('')
		setPaymentStep('cart')
		setAmountReceived('')
		setEditingLineId(null)
	}, [])

	const handleProductCreated = React.useCallback(
		(product: any) => {
			addToCart(product)
			toast.success(`${product.name} ajouté au panier`)
			setTimeout(() => {
				searchInputRef.current?.focus()
			}, 100)
		},
		[addToCart],
	)

	const handleCreateProductClick = React.useCallback(() => {
		if (productSearch.trim()) {
			const isBarcode = /^\d{8,}$/.test(productSearch.trim())
			if (isBarcode) {
				setProductNotFoundBarcode(productSearch.trim())
				setProductInitialName('')
			} else {
				setProductInitialName(productSearch.trim())
				setProductNotFoundBarcode('')
			}
		} else {
			setProductInitialName('')
			setProductNotFoundBarcode('')
		}

		setShowCreateProductDialog(true)
		setProductSearch('')
	}, [productSearch])

	const handleChangeCartDiscount = React.useCallback(
		(raw: string) => {
			setCartDiscountRaw(raw)

			if (raw.trim() === '') {
				setCartDiscountValue(0)
				return
			}

			const normalized = raw.replace(',', '.')
			const v = Number.parseFloat(normalized)

			if (Number.isNaN(v)) {
				return
			}

			if (cartDiscountMode === 'percent') {
				setCartDiscountValue(clamp(v, 0, 100))
			} else {
				setCartDiscountValue(Math.max(0, v))
			}
		},
		[cartDiscountMode, clamp],
	)

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

					return {
						...it,
						lineDiscountMode: mode,
						lineDiscountValue: nextValue,
						lineDiscountRaw: String(nextValue),
					}
				}),
			)
		},
		[clamp],
	)

	const setLineDiscountValue = React.useCallback(
		(itemId: string, raw: string) => {
			setCart((prev) =>
				prev.map((it) => {
					if (it.id !== itemId) return it

					const mode = it.lineDiscountMode ?? 'percent'

					if (raw.trim() === '') {
						return {
							...it,
							lineDiscountMode: mode,
							lineDiscountValue: undefined,
							lineDiscountRaw: '',
						}
					}

					const normalized = raw.replace(',', '.')
					const v = Number.parseFloat(normalized)

					if (Number.isNaN(v)) {
						return {
							...it,
							lineDiscountMode: mode,
							lineDiscountValue: undefined,
							lineDiscountRaw: raw,
						}
					}

					const next =
						mode === 'percent' ? clamp(v, 0, 100) : clamp(v, 0, it.unitPrice)

					return {
						...it,
						lineDiscountMode: mode,
						lineDiscountValue: next,
						lineDiscountRaw: raw,
					}
				}),
			)
		},
		[clamp],
	)

	const clearLineDiscount = React.useCallback((itemId: string) => {
		setCart((prev) =>
			prev.map((it) =>
				it.id === itemId
					? {
							...it,
							lineDiscountMode: undefined,
							lineDiscountValue: undefined,
							lineDiscountRaw: undefined,
						}
					: it,
			),
		)
	}, [])

	const setLineDisplayMode = React.useCallback(
		(itemId: string, mode: DisplayMode) => {
			setCart((prev) => {
				const updated = prev.map((it) =>
					it.id === itemId ? { ...it, displayMode: mode } : it,
				)
				return updated
			})
		},
		[],
	)

	const handlePaymentClick = React.useCallback(
		(method: PaymentMethod) => {
			if (cart.length === 0) {
				toast.error('Le panier est vide')
				return
			}

			customerDisplay.displayTotal(totalTtc, cart.length)

			setSelectedPaymentMethod(method)
			setPaymentStep('payment')
			if (method === 'especes') setAmountReceived(totalTtc.toFixed(2))
		},
		[cart.length, totalTtc, customerDisplay],
	)

	const handleConfirmPayment = React.useCallback(async () => {
		customerDisplay.displayThankYou()
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

			const finalLines = applyCartDiscountProRata(cart, discountAmount)

			const invoiceItems: InvoiceItem[] = cart.map((item, index) => {
				const amounts = finalLines[index]
				const displayMode = item.displayMode || 'name'
				let displayName = item.name
				if (displayMode === 'designation') {
					displayName = item.designation || item.name
				} else if (displayMode === 'sku') {
					displayName = item.sku || item.name
				}

				const unitHt = amounts.ht / item.quantity
				// const unitTtc = amounts.ttc / item.quantity

				return {
					product_id: item.productId,
					name: displayName,
					quantity: item.quantity,
					unit_price_ht: unitHt,
					tva_rate: item.tvaRate,
					total_ht: amounts.ht,
					total_ttc: amounts.ttc,
					line_discount_mode:
						item.lineDiscountMode === 'unit' ? 'amount' : item.lineDiscountMode,
					line_discount_value: item.lineDiscountValue,
					unit_price_ttc_before_discount: item.unitPrice,
				}
			})

			const lineDiscountsTotalTtc = cart.reduce((sum, item) => {
				const baseTtc = item.unitPrice * item.quantity
				const effectiveTtc = getLineTotalTtc(item)
				return sum + (baseTtc - effectiveTtc)
			}, 0)

			const cartDiscountTtc = discountAmount

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
				total_ht: totalHt,
				total_tva: totalVat,
				total_ttc: totalTtc,
				currency: 'EUR',

				cash_register: cashRegisterId,
				session: activeSession.id,
				is_pos_ticket: true,
				sold_by: user?.id,

				cart_discount_mode:
					cartDiscountValue > 0 ? cartDiscountMode : undefined,
				cart_discount_value:
					cartDiscountValue > 0 ? cartDiscountValue : undefined,
				cart_discount_ttc: cartDiscountTtc > 0 ? cartDiscountTtc : undefined,
				line_discounts_total_ttc:
					lineDiscountsTotalTtc > 0 ? lineDiscountsTotalTtc : undefined,
			})

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

			if (!activeCompanyId) {
				toast.error('Entreprise active introuvable')
				return
			}

			if (printerSettings.enabled && printerSettings.printerName) {
				if (printerSettings.autoPrint) {
					const lineDiscountsTotalTtc = cart.reduce((sum, item) => {
						const baseTtc = item.unitPrice * item.quantity
						const effectiveTtc = getLineTotalTtc(item)
						return sum + (baseTtc - effectiveTtc)
					}, 0)

					const cartDiscountAmount = discountAmount
					const grandSubtotal = subtotalTtc + lineDiscountsTotalTtc

					await printReceipt({
						printerName: printerSettings.printerName,
						width: printerSettings.width,
						companyId: activeCompanyId,
						receipt: {
							invoiceNumber: invoice.number,
							dateLabel: new Date().toLocaleString('fr-FR'),
							sellerName: user?.name || user?.username || '',

							items: cart.map((it) => {
								const displayMode = it.displayMode || 'name'
								let displayName = it.name
								if (displayMode === 'designation')
									displayName = it.designation || it.name
								else if (displayMode === 'sku') displayName = it.sku || it.name

								const hasDiscount =
									it.lineDiscountValue && it.lineDiscountValue > 0
								const baseUnitTtc = it.unitPrice
								const effectiveUnitTtc = getEffectiveUnitTtc(it)

								let discountText = null
								if (hasDiscount) {
									if (it.lineDiscountMode === 'percent') {
										discountText = `-${it.lineDiscountValue}%`
									} else {
										const discount = baseUnitTtc - effectiveUnitTtc
										discountText = `-${discount.toFixed(2)}€`
									}
								}

								return {
									name: displayName,
									qty: it.quantity,
									unitTtc: effectiveUnitTtc,
									totalTtc: getLineTotalTtc(it),
									tvaRate: it.tvaRate,
									hasDiscount,
									baseUnitTtc: hasDiscount ? baseUnitTtc : undefined,
									discountText,
								}
							}),

							grandSubtotal,
							lineDiscountsTotal:
								lineDiscountsTotalTtc > 0 ? lineDiscountsTotalTtc : undefined,
							subtotalTtc,
							discountAmount:
								cartDiscountAmount > 0 ? cartDiscountAmount : undefined,
							discountPercent:
								cartDiscountMode === 'percent' && cartDiscountValue > 0
									? cartDiscountValue
									: undefined,
							totalTtc,
							taxAmount: totalVat,
							totalSavings: lineDiscountsTotalTtc + cartDiscountAmount,
							paymentMethod: selectedPaymentMethod,
							vatBreakdown: vatBreakdown.map((vb) => ({
								rate: vb.rate,
								baseHt: vb.base_ht,
								vat: vb.vat,
								totalTtc: vb.total_ttc,
							})),
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
		cartDiscountMode,
		cartDiscountValue,
		discountAmount,
		getEffectiveUnitTtc,
		getLineTotalTtc,
		applyCartDiscountProRata,
		pb,
		selectedPaymentMethod,
		subtotalTtc,
		totalVat,
		totalTtc,
		totalHt,
		vatBreakdown,
		user,
		customerDisplay,
	])

	if (isSessionLoading) return <LoadingView />
	if (!isSessionOpen) return null

	if (paymentStep === 'cart') {
		return (
			<>
				<CartStepView
					currentRegisterName={currentRegister?.name || 'Caisse'}
					sessionIdShort={activeSession?.id.slice(0, 8) ?? ''}
					today={today}
					onBack={() => navigate({ to: '/cash' })}
					productSearch={productSearch}
					onProductSearchChange={setProductSearch}
					searchInputRef={searchInputRef}
					isAppPosConnected={isAppPosConnected}
					products={products}
					onAddToCart={addToCart}
					onCreateProductClick={handleCreateProductClick}
					cart={cart}
					onClearCart={clearCart}
					onUpdateQuantity={updateQuantity}
					subtotalTtc={subtotalTtc}
					totalVat={totalVat}
					totalTtc={totalTtc}
					vatBreakdown={vatBreakdown}
					cartDiscountMode={cartDiscountMode}
					cartDiscountRaw={cartDiscountRaw}
					discountAmount={discountAmount}
					onCartDiscountModeChange={setCartDiscountMode}
					onCartDiscountChange={handleChangeCartDiscount}
					onPaymentClick={handlePaymentClick}
					getEffectiveUnitTtc={getEffectiveUnitTtc}
					getLineTotalTtc={getLineTotalTtc}
					setLineDiscountMode={setLineDiscountMode}
					setLineDiscountValue={setLineDiscountValue}
					clearLineDiscount={clearLineDiscount}
					setLineDisplayMode={setLineDisplayMode}
					editingLineId={editingLineId}
					setEditingLineId={setEditingLineId}
				/>

				<CreateProductDialog
					open={showCreateProductDialog}
					onOpenChange={setShowCreateProductDialog}
					initialBarcode={productNotFoundBarcode}
					initialName={productInitialName}
					onProductCreated={handleProductCreated}
				/>
			</>
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
	searchInputRef: React.RefObject<HTMLInputElement>
	isAppPosConnected: boolean
	products: AppPosProduct[]
	onAddToCart: (p: AppPosProduct) => void
	onCreateProductClick: () => void

	cart: CartItem[]
	onClearCart: () => void
	onUpdateQuantity: (itemId: string, newQuantity: number) => void

	subtotalTtc: number
	totalVat: number
	totalTtc: number
	vatBreakdown: VatBreakdown[]
	cartDiscountMode: 'percent' | 'amount'
	cartDiscountRaw: string
	discountAmount: number
	onCartDiscountModeChange: (mode: 'percent' | 'amount') => void
	onCartDiscountChange: (raw: string) => void

	onPaymentClick: (method: PaymentMethod) => void

	getEffectiveUnitTtc: (item: CartItem) => number
	getLineTotalTtc: (item: CartItem) => number
	setLineDiscountMode: (itemId: string, mode: LineDiscountMode) => void
	setLineDiscountValue: (itemId: string, raw: string) => void
	clearLineDiscount: (itemId: string) => void
	setLineDisplayMode: (itemId: string, mode: DisplayMode) => void

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
		searchInputRef,
		isAppPosConnected,
		products,
		onAddToCart,
		onCreateProductClick,
		cart,
		onClearCart,
		onUpdateQuantity,
		subtotalTtc,
		totalVat,
		totalTtc,
		vatBreakdown,
		cartDiscountMode,
		cartDiscountRaw,
		discountAmount,
		onCartDiscountModeChange,
		onCartDiscountChange,
		onPaymentClick,
		getEffectiveUnitTtc,
		getLineTotalTtc,
		setLineDiscountMode,
		setLineDiscountValue,
		clearLineDiscount,
		setLineDisplayMode,
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
						searchInputRef={searchInputRef}
						isAppPosConnected={isAppPosConnected}
						products={products}
						onAddToCart={onAddToCart}
						onCreateProductClick={onCreateProductClick}
					/>
				</section>

				<aside className='flex flex-1 flex-col gap-3'>
					<CartPanel
						cart={cart}
						onClearCart={onClearCart}
						onUpdateQuantity={onUpdateQuantity}
						subtotalTtc={subtotalTtc}
						totalVat={totalVat}
						totalTtc={totalTtc}
						vatBreakdown={vatBreakdown}
						cartDiscountMode={cartDiscountMode}
						cartDiscountRaw={cartDiscountRaw}
						discountAmount={discountAmount}
						onCartDiscountModeChange={onCartDiscountModeChange}
						onCartDiscountChange={onCartDiscountChange}
						onPaymentClick={onPaymentClick}
						getEffectiveUnitTtc={getEffectiveUnitTtc}
						getLineTotalTtc={getLineTotalTtc}
						setLineDiscountMode={setLineDiscountMode}
						setLineDiscountValue={setLineDiscountValue}
						clearLineDiscount={clearLineDiscount}
						setLineDisplayMode={setLineDisplayMode}
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
	searchInputRef: React.RefObject<HTMLInputElement>
	isAppPosConnected: boolean
	products: AppPosProduct[]
	onAddToCart: (p: AppPosProduct) => void
	onCreateProductClick: () => void
}) {
	const {
		productSearch,
		onProductSearchChange,
		searchInputRef,
		isAppPosConnected,
		products,
		onAddToCart,
		onCreateProductClick,
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
						ref={searchInputRef}
						type='text'
						placeholder='Rechercher un produit ou scanner un code-barres…'
						value={productSearch}
						onChange={(e) => onProductSearchChange(e.target.value)}
						className='h-9 w-full bg-slate-50 pl-8 text-sm'
						autoFocus
					/>
				</div>
				<div className='flex items-center gap-2 text-xs text-muted-foreground'>
					<div className='h-2 w-2 rounded-full bg-emerald-500' />
					<span>Scanette active</span>
				</div>
			</div>

			<div className='flex items-center border-b px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500'>
				<div className='flex-1'>Produit</div>
				<div className='w-24 text-right'>Prix TTC</div>
				<div className='w-24 text-right'>Stock</div>
			</div>

			<div className='h-[340px] overflow-auto text-sm'>
				{products.length === 0 ? (
					<div className='flex h-full flex-col items-center justify-center gap-4 px-4 py-6'>
						{isAppPosConnected ? (
							productSearch.length > 0 ? (
								<>
									<div className='text-center'>
										<div className='mb-2 text-sm font-medium text-slate-700'>
											Aucun produit trouvé
										</div>
										<div className='text-xs text-slate-500'>
											Recherche : "{productSearch}"
										</div>
									</div>

									<Button
										type='button'
										variant='outline'
										size='sm'
										onClick={onCreateProductClick}
										className='gap-2'
									>
										<span className='text-lg'>+</span>
										Créer ce produit
									</Button>
								</>
							) : (
								<div className='text-center text-xs text-slate-400'>
									Scannez un code-barres ou recherchez un produit
								</div>
							)
						) : (
							<div className='text-center text-xs text-slate-400'>
								Connexion à AppPOS en cours ou échouée
							</div>
						)}
					</div>
				) : (
					<>
						{products.slice(0, 50).map((p) => {
							const imageUrl = getImageUrl(p.images)

							return (
								<button
									key={p.id}
									type='button'
									onClick={() => onAddToCart(p)}
									className='flex w-full cursor-pointer items-center gap-3 border-b px-4 py-2 text-left hover:bg-slate-50'
								>
									{imageUrl ? (
										<img
											src={imageUrl}
											alt={p.name}
											className='h-10 w-10 rounded-md object-cover border border-slate-200'
											onError={(e) => {
												e.currentTarget.style.display = 'none'
											}}
										/>
									) : (
										<div className='h-10 w-10 rounded-md bg-slate-100 flex items-center justify-center'>
											<span className='text-xs text-slate-400'>?</span>
										</div>
									)}

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
							)
						})}
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
	totalVat: number
	totalTtc: number
	vatBreakdown: VatBreakdown[]
	cartDiscountMode: 'percent' | 'amount'
	cartDiscountRaw: string
	discountAmount: number
	onCartDiscountModeChange: (mode: 'percent' | 'amount') => void
	onCartDiscountChange: (raw: string) => void
	onPaymentClick: (method: PaymentMethod) => void

	getEffectiveUnitTtc: (item: CartItem) => number
	getLineTotalTtc: (item: CartItem) => number
	setLineDiscountMode: (itemId: string, mode: LineDiscountMode) => void
	setLineDiscountValue: (itemId: string, raw: string) => void
	clearLineDiscount: (itemId: string) => void
	setLineDisplayMode: (itemId: string, mode: DisplayMode) => void

	editingLineId: string | null
	setEditingLineId: (id: string | null) => void
}) {
	const {
		cart,
		onClearCart,
		onUpdateQuantity,
		subtotalTtc,
		totalVat,
		totalTtc,
		vatBreakdown,
		cartDiscountMode,
		cartDiscountRaw,
		discountAmount,
		onCartDiscountModeChange,
		onCartDiscountChange,
		onPaymentClick,
		getEffectiveUnitTtc,
		getLineTotalTtc,
		setLineDiscountMode,
		setLineDiscountValue,
		clearLineDiscount,
		setLineDisplayMode,
		editingLineId,
		setEditingLineId,
	} = props

	const hasActiveLineDiscount = React.useCallback((item: CartItem) => {
		if (!item.lineDiscountMode || item.lineDiscountValue == null) return false
		if (item.lineDiscountMode === 'percent') return item.lineDiscountValue > 0
		return item.lineDiscountValue < item.unitPrice
	}, [])

	const getDisplayText = React.useCallback((item: CartItem) => {
		const mode = item.displayMode

		if (mode === 'designation') {
			return item.designation || item.name
		}

		if (mode === 'sku') {
			return item.sku || item.name
		}

		return item.name
	}, [])

	const isDisplayModeAvailable = React.useCallback(
		(item: CartItem, mode: DisplayMode) => {
			switch (mode) {
				case 'name':
					return true
				case 'designation':
					return !!(item.designation && item.designation !== item.name)
				case 'sku':
					return !!(item.sku && item.sku !== item.name && item.sku !== '')
				default:
					return false
			}
		},
		[],
	)

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
							const value = item.lineDiscountRaw || ''
							const currentDisplayMode = item.displayMode || 'name'

							return (
								<div key={item.id} className='py-2'>
									<div className='flex items-start gap-3'>
										{item.image ? (
											<img
												src={item.image}
												alt={getDisplayText(item)}
												className='h-12 w-12 rounded-md object-cover border border-slate-200 flex-shrink-0'
												onError={(e) => {
													e.currentTarget.style.display = 'none'
													const placeholder = e.currentTarget
														.nextElementSibling as HTMLElement
													if (placeholder) placeholder.style.display = 'flex'
												}}
											/>
										) : null}
										<div
											className='h-12 w-12 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0'
											style={{ display: item.image ? 'none' : 'flex' }}
										>
											<span className='text-xs text-slate-400'>?</span>
										</div>

										<div className='flex-1 min-w-0'>
											<div className='flex items-center gap-2'>
												<div className='flex-1 font-medium truncate'>
													{getDisplayText(item)}
												</div>

												{(isDisplayModeAvailable(item, 'designation') ||
													isDisplayModeAvailable(item, 'sku')) && (
													<Select
														value={currentDisplayMode}
														onValueChange={(v) =>
															setLineDisplayMode(item.id, v as DisplayMode)
														}
													>
														<SelectTrigger className='h-6 w-[120px] text-xs flex-shrink-0'>
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value='name'>Nom</SelectItem>

															{isDisplayModeAvailable(item, 'designation') && (
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
															: `-${(item.unitPrice - getEffectiveUnitTtc(item)).toFixed(2)}€`}
													</span>
												)}
											</div>

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
														type='text'
														inputMode='decimal'
														className='h-8 flex-1'
														placeholder={mode === 'unit' ? 'Prix TTC' : '%'}
														value={value}
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

				<div className='mt-2 flex items-center justify-between gap-2'>
					<span>Remise</span>
					<div className='flex items-center gap-1'>
						<Select
							value={cartDiscountMode}
							onValueChange={onCartDiscountModeChange}
						>
							<SelectTrigger className='h-8 w-20'>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='percent'>%</SelectItem>
								<SelectItem value='amount'>€</SelectItem>
							</SelectContent>
						</Select>

						<Input
							type='text'
							inputMode='decimal'
							className='h-8 w-20 bg-slate-50 text-right text-sm'
							value={cartDiscountRaw}
							onChange={(e) => onCartDiscountChange(e.target.value)}
							placeholder='0'
						/>
					</div>
				</div>

				{discountAmount > 0 && (
					<div className='mt-1 flex items-center justify-between text-xs text-slate-500'>
						<span>Montant remise</span>
						<span>-{discountAmount.toFixed(2)} €</span>
					</div>
				)}

				<div className='mt-3 space-y-1'>
					<div className='flex items-center justify-between text-xs font-medium text-slate-600'>
						<span>TVA totale</span>
						<span>{totalVat.toFixed(2)} €</span>
					</div>
					{vatBreakdown.map((vb) => (
						<div
							key={vb.rate}
							className='flex items-center justify-between text-xs text-slate-500 pl-4'
						>
							<span>
								Dont TVA {vb.rate}% sur {vb.base_ht.toFixed(2)} € HT
							</span>
							<span>{vb.vat.toFixed(2)} €</span>
						</div>
					))}
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
