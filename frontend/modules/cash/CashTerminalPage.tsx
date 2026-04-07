// frontend/modules/cash/CashTerminalPage.tsx
import { useNavigate, useParams } from '@tanstack/react-router'
import {
	Loader2,
	Monitor,
	Package,
	ShieldAlert,
	ShoppingCart,
	Vault,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/module-ui'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import {
	decrementAppPosProductsStock,
	getAppPosToken,
	loginToAppPos,
	useAppPosProducts,
	useAppPosStockUpdates,
} from '@/lib/apppos'
import { releaseControl, takeControl, useDisplay } from '@/lib/pos/display'
import { openReceiptPreviewWindow } from '@/lib/pos/posPreview'
import { openCashDrawer, printReceipt } from '@/lib/pos/posPrint'
import { loadPosPrinterSettings } from '@/lib/pos/printerSettings'
import { useScanner } from '@/lib/pos/scanner'
import { useCustomerDisplay } from '@/lib/pos/useCustomerDisplay'
import {
	getOrCreateDefaultCustomer,
	useActiveCashSession,
	useCashRegisters,
} from '@/lib/queries/cash'
import { type Company, getLogoUrl, useCompany } from '@/lib/queries/companies'
import { fetchAsDataUrl } from '@/lib/queries/logoToDataUrl'
import { cartItemToPosItem, useCreatePosTicket } from '@/lib/queries/pos'
import { clearLastRouteForModule } from '@/lib/stores/moduleNavigationStore'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useAuth } from '@/modules/auth/AuthProvider'
import { CreateProductDialog } from '@/modules/cash/CreateProductDialog'
import { CashModuleShell } from './CashModuleShell'

import { useOpenCashDrawerMutation } from '@/lib/pos/printerQueries'
import {
	type AppPosProduct,
	CartPanel,
	PaymentDialog,
	type PaymentEntry,
	type PaymentMethod,
	type PaymentStep,
	ProductsPanel,
	SuccessView,
	getEffectiveUnitTtc,
	getLineTotalTtc,
	getMainPaymentMethodCode,
	paymentEntriesToApiPayload,
	useBarcodeScanner,
	useCartCalculations,
	useCartManager,
} from './components/terminal'

// Bouton tiroir — isolé pour éviter re-render du terminal entier
function TerminalDrawerButton() {
	const openDrawer = useOpenCashDrawerMutation()
	return (
		<button
			type='button'
			onClick={() => openDrawer.mutate()}
			disabled={openDrawer.isPending}
			className='inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium
				border border-border/50 text-foreground hover:bg-muted/30 hover:border-border
				disabled:opacity-40 disabled:cursor-not-allowed transition-all'
		>
			{openDrawer.isPending ? (
				<Loader2 className='h-3 w-3 animate-spin' />
			) : (
				<Vault className='h-3 w-3' />
			)}
			Ouvrir tiroir
		</button>
	)
}

export function CashTerminalPage() {
	const navigate = useNavigate()
	const { cashRegisterId } = useParams({
		from: '/cash/terminal/$cashRegisterId/',
	})
	const { activeCompanyId } = useActiveCompany()
	const { user } = useAuth()
	const pb = usePocketBase()

	const [productSearch, setProductSearch] = React.useState('')
	const [cartDiscountMode, setCartDiscountMode] = React.useState<
		'percent' | 'amount'
	>('percent')
	const [cartDiscountValue, setCartDiscountValue] = React.useState(0)
	const [cartDiscountRaw, setCartDiscountRaw] = React.useState('')
	const [paymentStep, setPaymentStep] = React.useState<PaymentStep>('cart')
	const [paymentEntries, setPaymentEntries] = React.useState<PaymentEntry[]>([])
	const [initialPaymentMethod, setInitialPaymentMethod] =
		React.useState<PaymentMethod | null>(null)
	const [isProcessing, setIsProcessing] = React.useState(false)
	const [isAppPosConnected, setIsAppPosConnected] = React.useState(false)
	const [isAppPosConnecting, setIsAppPosConnecting] = React.useState(true)
	const [, setAppPosConnectionError] = React.useState<string | null>(null)
	const [editingLineId, setEditingLineId] = React.useState<string | null>(null)
	const [showCreateProductDialog, setShowCreateProductDialog] =
		React.useState(false)
	const [productNotFoundBarcode, setProductNotFoundBarcode] = React.useState('')
	const [productInitialName, setProductInitialName] = React.useState('')
	// ── Onglet mobile — AU NIVEAU RACINE (règle des hooks React) ──────────────
	const [mobileTab, setMobileTab] = React.useState<
		'products' | 'cart' | 'payment'
	>('products')

	const searchInputRef = React.useRef<HTMLInputElement>(null)

	const { data: registers } = useCashRegisters(activeCompanyId ?? undefined)
	const { data: activeSession, isLoading: isSessionLoading } =
		useActiveCashSession(cashRegisterId)

	const { data: productsData } = useAppPosProducts({
		enabled: isAppPosConnected,
		searchTerm: productSearch || undefined,
	})
	useAppPosStockUpdates({ enabled: true })
	const products = (productsData?.items ?? []) as AppPosProduct[]

	const createPosTicket = useCreatePosTicket()
	const currentRegister = registers?.find((r) => r.id === cashRegisterId)
	const isSessionOpen = activeSession?.status === 'open'

	const { data: activeCompany } = useCompany(activeCompanyId ?? undefined)

	const getCompanyLogoBase64 = React.useCallback(async (): Promise<
		string | undefined
	> => {
		if (!activeCompany) return undefined
		const url = getLogoUrl(pb, activeCompany as Company)
		if (!url) return undefined
		return await fetchAsDataUrl(url)
	}, [activeCompany, pb])

	const { hasControl } = useDisplay()

	React.useEffect(() => {
		takeControl().catch(() => {
			toast.warning('Affichage client contrôlé par un autre appareil')
		})
		return () => {
			releaseControl().catch(() => {})
		}
	}, [])

	const cartManager = useCartManager(cashRegisterId)
	const { subtotalTtc, totalTtc, totalVat, discountAmount, vatBreakdown } =
		useCartCalculations({
			cart: cartManager.cart,
			cartDiscountMode,
			cartDiscountValue,
		})

	const amountReceived = React.useMemo(() => {
		const cashEntry = paymentEntries.find(
			(e) => e.method.accounting_category === 'cash',
		)
		return cashEntry ? cashEntry.amount.toFixed(2) : ''
	}, [paymentEntries])

	const selectedPaymentMethod: PaymentMethod | null =
		paymentEntries[0]?.method ?? initialPaymentMethod ?? null

	const change = React.useMemo(() => {
		const received = Number.parseFloat(amountReceived) || 0
		return received - totalTtc
	}, [amountReceived, totalTtc])

	const displayPhase = React.useMemo(() => {
		if (paymentStep === 'success') return 'success'
		if (paymentStep === 'payment') {
			if (change > 0) return 'change'
			return 'payment'
		}
		if (cartManager.lastAddedItem) return 'item'
		if (cartManager.cart.length > 0) return 'total'
		return 'idle'
	}, [paymentStep, change, cartManager.lastAddedItem, cartManager.cart.length])

	useCustomerDisplay({
		total: totalTtc,
		itemCount: cartManager.cart.length,
		currentItem: cartManager.lastAddedItem,
		paymentMethod: selectedPaymentMethod?.name,
		received: Number.parseFloat(amountReceived) || undefined,
		change: change > 0 ? change : undefined,
		phase: displayPhase,
		enabled: hasControl,
	})

	const recentScansRef = React.useRef<Map<string, number>>(new Map())

	const isDuplicateScan = React.useCallback((barcode: string): boolean => {
		const now = Date.now()
		const lastScanTime = recentScansRef.current.get(barcode)
		if (lastScanTime && now - lastScanTime < 2000) return true
		recentScansRef.current.set(barcode, now)
		return false
	}, [])

	const handleBarcodeScan = React.useCallback(
		(barcode: string, source: 'hid' | 'websocket' = 'hid') => {
			console.log(`[POS] Scan reçu (${source}):`, barcode)
			if (isDuplicateScan(barcode)) return
			setProductSearch(barcode)
		},
		[isDuplicateScan],
	)

	useBarcodeScanner({
		enabled: paymentStep === 'cart',
		onScan: (barcode) => handleBarcodeScan(barcode, 'hid'),
	})

	useScanner((barcode) => {
		if (paymentStep === 'cart') handleBarcodeScan(barcode, 'websocket')
	})

	React.useEffect(() => {
		if (paymentStep === 'cart' && searchInputRef.current) {
			searchInputRef.current.focus()
		}
	}, [paymentStep])

	const lastAutoAddRef = React.useRef<string | null>(null)

	React.useEffect(() => {
		if (
			products.length === 1 &&
			productSearch.length > 2 &&
			lastAutoAddRef.current !== productSearch
		) {
			const product = products[0]
			const isExactMatch =
				product.barcode === productSearch || product.sku === productSearch
			if (isExactMatch) {
				lastAutoAddRef.current = productSearch
				cartManager.addToCart(product)
				setProductSearch('')
				setTimeout(() => {
					searchInputRef.current?.focus()
				}, 0)
			}
		}
	}, [products, productSearch, cartManager])

	React.useEffect(() => {
		if (!productSearch) lastAutoAddRef.current = null
	}, [productSearch])

	React.useEffect(() => {
		const connectToAppPos = async () => {
			if (getAppPosToken()) {
				setIsAppPosConnected(true)
				setIsAppPosConnecting(false)
				return
			}
			try {
				setIsAppPosConnecting(true)
				setAppPosConnectionError(null)
				const response = await loginToAppPos('admin', 'admin123')
				if (response.success && response.token) {
					setIsAppPosConnected(true)
				} else {
					throw new Error('Login failed')
				}
			} catch (error) {
				setAppPosConnectionError(
					error instanceof Error
						? error.message
						: 'Impossible de se connecter à AppPOS',
				)
				setIsAppPosConnected(false)
			} finally {
				setIsAppPosConnecting(false)
			}
		}
		connectToAppPos()
	}, [])

	const handleProductCreated = React.useCallback(
		(product: any) => {
			cartManager.addToCart(product)
			toast.success(`${product.name} ajouté au panier`)
			setTimeout(() => {
				searchInputRef.current?.focus()
			}, 100)
		},
		[cartManager],
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
			if (Number.isNaN(v)) return
			if (cartDiscountMode === 'percent') {
				setCartDiscountValue(Math.max(0, Math.min(100, v)))
			} else {
				setCartDiscountValue(Math.max(0, v))
			}
		},
		[cartDiscountMode],
	)

	const handlePaymentClick = React.useCallback(
		(method: PaymentMethod) => {
			if (cartManager.cart.length === 0) {
				toast.error('Le panier est vide')
				return
			}
			setInitialPaymentMethod(method)
			setPaymentEntries([])
			setPaymentStep('payment')
		},
		[cartManager.cart.length],
	)

	const clearAll = React.useCallback(() => {
		cartManager.clearCartAndStore()
		setCartDiscountMode('percent')
		setCartDiscountValue(0)
		setCartDiscountRaw('')
		setPaymentStep('cart')
		setPaymentEntries([])
		setInitialPaymentMethod(null)
		setEditingLineId(null)
	}, [cartManager])

	const buildReceiptPayload = React.useCallback(
		async (args: {
			invoiceNumber: string
			dateLabel: string
			totalTtcValue: number
			taxAmountValue: number
			totalSavingsValue?: number
		}) => {
			const lineDiscountsTotalTtc = cartManager.cart.reduce((sum, item) => {
				const baseTtc = item.unitPrice * item.quantity
				const effectiveTtc = getLineTotalTtc(item)
				return sum + (baseTtc - effectiveTtc)
			}, 0)
			const cartDiscountAmount = discountAmount
			const grandSubtotal = subtotalTtc + lineDiscountsTotalTtc
			const companyLogoBase64 = await getCompanyLogoBase64().catch(
				() => undefined,
			)

			return {
				companyLogoBase64,
				invoiceNumber: args.invoiceNumber,
				dateLabel: args.dateLabel,
				sellerName: user?.name || user?.username || '',
				items: cartManager.cart.map((it) => {
					const displayMode = it.displayMode || 'name'
					let displayName = it.name
					if (displayMode === 'designation')
						displayName = it.designation || it.name
					else if (displayMode === 'sku') displayName = it.sku || it.name
					const hasDiscount = it.lineDiscountValue && it.lineDiscountValue > 0
					const baseUnitTtc = it.unitPrice
					const effectiveUnitTtc = getEffectiveUnitTtc(it)
					let discountText = null
					if (hasDiscount) {
						if (it.lineDiscountMode === 'percent')
							discountText = `-${it.lineDiscountValue}%`
						else {
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
				discountAmount: cartDiscountAmount > 0 ? cartDiscountAmount : undefined,
				discountPercent:
					cartDiscountMode === 'percent' && cartDiscountValue > 0
						? cartDiscountValue
						: undefined,
				totalTtc: args.totalTtcValue,
				taxAmount: args.taxAmountValue,
				totalSavings:
					(args.totalSavingsValue ?? 0) > 0
						? args.totalSavingsValue
						: undefined,
				paymentMethod:
					paymentEntries.length > 0
						? paymentEntries.length === 1
							? paymentEntries[0].method.name
							: paymentEntries.map((e) => e.method.name).join(' + ')
						: 'Autre',
				received: paymentEntries.some(
					(e) => e.method.accounting_category === 'cash',
				)
					? paymentEntries
							.filter((e) => e.method.accounting_category === 'cash')
							.reduce((s, e) => s + e.amount, 0)
					: undefined,
				change: paymentEntries.some(
					(e) => e.method.accounting_category === 'cash',
				)
					? change
					: undefined,
				vatBreakdown: vatBreakdown.map((vb) => ({
					rate: vb.rate,
					baseHt: vb.base_ht,
					vat: vb.vat,
					totalTtc: vb.total_ttc,
				})),
			}
		},
		[
			cartDiscountMode,
			cartDiscountValue,
			cartManager.cart,
			change,
			discountAmount,
			getCompanyLogoBase64,
			paymentEntries,
			subtotalTtc,
			user,
			vatBreakdown,
		],
	)

	const handleConfirmPayment = React.useCallback(
		async (finalEntries?: PaymentEntry[]) => {
			if (!activeCompanyId || !activeSession) {
				toast.error('Session ou entreprise manquante')
				return
			}
			const entries = finalEntries ?? paymentEntries
			if (entries.length === 0) {
				toast.error('Aucun moyen de paiement sélectionné')
				return
			}
			const totalPaid = entries.reduce((sum, e) => sum + e.amount, 0)
			if (totalPaid < totalTtc - 0.005) {
				toast.error('Paiements insuffisants')
				return
			}

			const printerSettings = loadPosPrinterSettings()
			setIsProcessing(true)
			try {
				const defaultCustomerId = await getOrCreateDefaultCustomer(
					pb,
					activeCompanyId,
				)
				const apiPayments = paymentEntriesToApiPayload(entries)
				const mainMethodCode = getMainPaymentMethodCode(entries)
				const cashEntry = entries.find(
					(e) => e.method.accounting_category === 'cash',
				)

				const result = await createPosTicket.mutateAsync({
					owner_company: activeCompanyId,
					cash_register: cashRegisterId,
					session_id: activeSession.id,
					customer_id: defaultCustomerId,
					items: cartManager.cart.map(cartItemToPosItem),
					payment_method: mainMethodCode,
					payment_method_label:
						entries.length > 1
							? entries.map((e) => e.method.name).join(' + ')
							: entries[0]?.method.type === 'custom'
								? entries[0].method.name
								: undefined,
					amount_paid: cashEntry ? cashEntry.amount : undefined,
					payments: apiPayments,
					cart_discount_mode:
						cartDiscountValue > 0 ? cartDiscountMode : undefined,
					cart_discount_value:
						cartDiscountValue > 0 ? cartDiscountValue : undefined,
				})

				const ticket = result.ticket
				const backendTotals = result.totals

				if (isAppPosConnected && getAppPosToken()) {
					try {
						const stockItems = cartManager.cart.map((item) => ({
							productId: item.productId,
							quantitySold: item.quantity,
						}))
						await decrementAppPosProductsStock(stockItems)
					} catch (stockError) {
						toast.warning(
							'Vente enregistrée mais erreur de synchronisation du stock',
						)
					}
				}

				if (printerSettings.enabled && printerSettings.printerName) {
					if (printerSettings.autoPrint) {
						const receiptPayload = await buildReceiptPayload({
							invoiceNumber: ticket.number,
							dateLabel: new Date().toLocaleString('fr-FR'),
							totalTtcValue: backendTotals.total_ttc,
							taxAmountValue: backendTotals.total_tva,
							totalSavingsValue:
								backendTotals.line_discounts_ttc +
								backendTotals.cart_discount_ttc,
						})
						await printReceipt({
							printerName: printerSettings.printerName,
							width: printerSettings.width,
							companyId: activeCompanyId,
							receipt: receiptPayload,
						})
					}
					if (
						printerSettings.autoOpenDrawer &&
						entries.some((e) => e.method.accounting_category === 'cash')
					) {
						await openCashDrawer({
							printerName: printerSettings.printerName,
							width: printerSettings.width,
						})
					}
				}

				toast.success(`Ticket ${ticket.number} créé`)
				setPaymentStep('success')
				setTimeout(() => clearAll(), 500)
			} catch (error: any) {
				toast.error(error.message || 'Erreur lors de la création du ticket')
			} finally {
				setIsProcessing(false)
			}
		},
		[
			activeCompanyId,
			activeSession,
			buildReceiptPayload,
			cartDiscountMode,
			cartDiscountValue,
			cartManager.cart,
			cashRegisterId,
			clearAll,
			createPosTicket,
			isAppPosConnected,
			paymentEntries,
			pb,
			totalTtc,
		],
	)

	// ── Early returns APRÈS tous les hooks ────────────────────────────────────
	if (isSessionLoading) {
		return (
			<CashModuleShell
				forcedRegisterId={cashRegisterId}
				pageTitle='Terminal'
				pageIcon={Monitor}
			>
				<div className='flex flex-1 items-center justify-center py-24'>
					<Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
				</div>
			</CashModuleShell>
		)
	}

	if (!isSessionOpen) {
		return (
			<CashModuleShell
				forcedRegisterId={cashRegisterId}
				pageTitle='Terminal'
				pageIcon={Monitor}
			>
				<EmptyState
					icon={ShieldAlert}
					title='Aucune session ouverte'
					description={`La caisse "${currentRegister?.name ?? cashRegisterId}" n'a pas de session active. Ouvrez une session avant d'accéder au terminal.`}
					fullPage
					actions={[
						{
							label: 'Configurer la caisse',
							variant: 'secondary' as const,
							onClick: () => {
								clearLastRouteForModule('cash')
								navigate({ to: '/cash' })
							},
						},
					]}
				/>
			</CashModuleShell>
		)
	}

	if (paymentStep === 'payment') {
		return (
			<PaymentDialog
				totalTtc={totalTtc}
				paymentEntries={paymentEntries}
				onPaymentEntriesChange={setPaymentEntries}
				initialMethod={initialPaymentMethod}
				isProcessing={isProcessing}
				onCancel={() => setPaymentStep('cart')}
				onConfirm={handleConfirmPayment}
				onPreviewReceipt={async () => {
					try {
						if (!activeCompanyId) throw new Error('Entreprise manquante')
						const printerSettings = loadPosPrinterSettings()
						const width = (printerSettings.width === 80 ? 80 : 58) as 58 | 80
						const previewReceipt = await buildReceiptPayload({
							invoiceNumber: 'PREVIEW',
							dateLabel: new Date().toLocaleString('fr-FR'),
							totalTtcValue: totalTtc,
							taxAmountValue: totalVat,
							totalSavingsValue: undefined,
						})
						await openReceiptPreviewWindow({
							width,
							companyId: activeCompanyId,
							receipt: previewReceipt,
						})
					} catch (e: any) {
						toast.error(e?.message || "Impossible d'afficher l'aperçu")
					}
				}}
			/>
		)
	}

	if (paymentStep === 'success') {
		return <SuccessView onNewSale={clearAll} />
	}

	// ── paymentStep === 'cart' — rendu principal ───────────────────────────────
	const headerRight = (
		<div className='flex items-center gap-2'>
			<div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
				{isAppPosConnecting ? (
					<Loader2 className='h-3 w-3 animate-spin' />
				) : isAppPosConnected ? (
					<span className='h-2 w-2 rounded-full bg-emerald-500 shrink-0' />
				) : (
					<span className='h-2 w-2 rounded-full bg-destructive shrink-0' />
				)}
				<span className='hidden tablet:inline'>
					{isAppPosConnecting ? 'API...' : 'API'}
				</span>
			</div>
			<TerminalDrawerButton />
		</div>
	)

	const cartProps = {
		cart: cartManager.cart,
		onParkCart: () => cartManager.parkCart(),
		onClearCart: clearAll,
		onUpdateQuantity: cartManager.updateQuantity,
		subtotalTtc,
		totalVat,
		totalTtc,
		vatBreakdown,
		cartDiscountMode,
		cartDiscountRaw,
		discountAmount,
		onCartDiscountModeChange: setCartDiscountMode,
		onCartDiscountChange: handleChangeCartDiscount,
		onPaymentClick: handlePaymentClick,
		getEffectiveUnitTtc,
		getLineTotalTtc,
		setLineDiscountMode: cartManager.setLineDiscountMode,
		setLineDiscountValue: cartManager.setLineDiscountValue,
		clearLineDiscount: (id: string) => {
			cartManager.setLineDiscountMode(id, 'percent')
			cartManager.setLineDiscountValue(id, '')
		},
		toggleItemDisplayMode: cartManager.toggleItemDisplayMode,
		editingLineId,
		setEditingLineId,
		setUnitPrice: cartManager.setUnitPrice,
		clearUnitPrice: cartManager.clearUnitPrice,
	}

	const productsPanel = (
		<ProductsPanel
			productSearch={productSearch}
			onProductSearchChange={setProductSearch}
			searchInputRef={searchInputRef}
			isAppPosConnected={isAppPosConnected}
			products={products}
			onAddToCart={(p) => {
				cartManager.addToCart(p)
				setMobileTab('cart')
			}}
			onCreateProductClick={handleCreateProductClick}
		/>
	)

	const parkedCartsBar = cartManager.parkedCarts.length > 0 && (
		<div className='rounded-lg border bg-card p-3 shrink-0'>
			<div className='mb-2 text-sm font-medium'>
				Paniers en attente ({cartManager.parkedCarts.length})
			</div>
			<div className='flex flex-wrap gap-2'>
				{cartManager.parkedCarts.map((parked) => (
					<button
						key={parked.id}
						type='button'
						onClick={() => cartManager.unparkCart(parked.id)}
						className='rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90'
					>
						{parked.items.length} article{parked.items.length > 1 ? 's' : ''}
						<span className='ml-2 opacity-70'>
							{new Date(parked.parkedAt).toLocaleTimeString('fr-FR', {
								hour: '2-digit',
								minute: '2-digit',
							})}
						</span>
					</button>
				))}
			</div>
		</div>
	)

	return (
		<CashModuleShell
			forcedRegisterId={cashRegisterId}
			pageTitle='Terminal'
			pageIcon={Monitor}
			headerRight={headerRight}
		>
			{/* ── DESKTOP : layout côte à côte ──────────────────────── */}
			<div className='hidden desktop:block container mx-auto px-6 py-2'>
				<main
					className='flex gap-4'
					style={{
						height: 'calc(100vh - var(--header-h) - var(--subheader-h) - 2rem)',
					}}
				>
					{/* ProductsPanel — prend l'espace restant, scroll interne */}
					<section
						className='flex flex-col gap-3 min-w-0 overflow-hidden'
						style={{ flex: '1 1 0' }}
					>
						{productsPanel}
					</section>
					{/* CartPanel — largeur fixe plus généreuse, hauteur complète */}
					<aside
						className='flex flex-col gap-3 shrink-0 overflow-hidden'
						style={{ width: '460px' }}
					>
						{parkedCartsBar}
						<CartPanel {...cartProps} />
					</aside>
				</main>
			</div>

			{/* ── MOBILE : 2 onglets ────────────────────────────────── */}
			<div className='desktop:hidden flex flex-col h-full'>
				{/* Barre d'onglets sticky en haut */}
				<div className='shrink-0 border-b bg-background/95 backdrop-blur-sm sticky top-subheader z-30'>
					<div className='grid grid-cols-2'>
						<button
							type='button'
							onClick={() => setMobileTab('products')}
							className={`flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors ${
								mobileTab === 'products'
									? 'text-primary border-b-2 border-primary'
									: 'text-muted-foreground'
							}`}
						>
							<Package className='h-5 w-5' />
							Produits
						</button>

						<button
							type='button'
							onClick={() => setMobileTab('cart')}
							className={`relative flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors ${
								mobileTab === 'cart'
									? 'text-primary border-b-2 border-primary'
									: 'text-muted-foreground'
							}`}
						>
							<div className='relative'>
								<ShoppingCart className='h-5 w-5' />
								{cartManager.cart.length > 0 && (
									<span className='absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center'>
										{cartManager.cart.length > 9
											? '9+'
											: cartManager.cart.length}
									</span>
								)}
							</div>
							Panier
						</button>
					</div>
				</div>

				{/* Contenu de l'onglet actif */}
				<div className='flex-1 overflow-auto p-3'>
					{mobileTab === 'products' && (
						<div className='h-full flex flex-col gap-3'>{productsPanel}</div>
					)}
					{mobileTab === 'cart' && (
						<div className='h-full flex flex-col gap-3'>
							{parkedCartsBar}
							<CartPanel {...cartProps} />
						</div>
					)}
				</div>
			</div>

			<CreateProductDialog
				open={showCreateProductDialog}
				onOpenChange={setShowCreateProductDialog}
				initialBarcode={productNotFoundBarcode}
				initialName={productInitialName}
				onProductCreated={handleProductCreated}
			/>
		</CashModuleShell>
	)
}
