// frontend/modules/cash/CashTerminalPage.tsx
import { useNavigate, useParams } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { getAppPosToken, loginToAppPos, useAppPosProducts } from '@/lib/apppos'
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
import { usePocketBase } from '@/lib/use-pocketbase'
import { useAuth } from '@/modules/auth/AuthProvider'
import { CreateProductDialog } from '@/modules/cash/CreateProductDialog'

import {
	type AppPosProduct,
	CartPanel,
	PaymentDialog,
	type PaymentMethod,
	type PaymentStep,
	ProductsPanel,
	SuccessView,
	TerminalHeader,
	getEffectiveUnitTtc,
	getLineTotalTtc,
	useBarcodeScanner,
	useCartCalculations,
	useCartManager,
} from './components/terminal'

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
	const [selectedPaymentMethod, setSelectedPaymentMethod] =
		React.useState<PaymentMethod>('especes')
	const [amountReceived, setAmountReceived] = React.useState('')
	const [isProcessing, setIsProcessing] = React.useState(false)

	const [isAppPosConnected, setIsAppPosConnected] = React.useState(false)
	const [editingLineId, setEditingLineId] = React.useState<string | null>(null)

	const [showCreateProductDialog, setShowCreateProductDialog] =
		React.useState(false)
	const [productNotFoundBarcode, setProductNotFoundBarcode] = React.useState('')
	const [productInitialName, setProductInitialName] = React.useState('')

	const searchInputRef = React.useRef<HTMLInputElement>(null)

	const { data: registers } = useCashRegisters(activeCompanyId ?? undefined)
	const { data: activeSession, isLoading: isSessionLoading } =
		useActiveCashSession(cashRegisterId)

	const { data: productsData } = useAppPosProducts({
		enabled: isAppPosConnected,
		searchTerm: productSearch || undefined,
	})
	const products = (productsData?.items ?? []) as AppPosProduct[]

	const createPosTicket = useCreatePosTicket()

	const currentRegister = registers?.find((r) => r.id === cashRegisterId)
	const isSessionOpen = activeSession?.status === 'open'

	const today = new Date().toLocaleDateString('fr-FR', {
		weekday: 'long',
		day: '2-digit',
		month: 'long',
	})

	// ✅ Charge l’entreprise active (pour URL logo)
	const { data: activeCompany } = useCompany(activeCompanyId ?? undefined)

	const getCompanyLogoBase64 = React.useCallback(async (): Promise<
		string | undefined
	> => {
		if (!activeCompany) return undefined
		const url = getLogoUrl(pb, activeCompany as Company)
		if (!url) return undefined
		return await fetchAsDataUrl(url) // data:image/...;base64,...
	}, [activeCompany, pb])

	// ✅ NOUVEAU : Hook pour gérer le contrôle de l'affichage client
	const { hasControl } = useDisplay()

	// ✅ NOUVEAU : Prendre le contrôle de l'affichage au montage
	React.useEffect(() => {
		takeControl().catch(() => {
			toast.warning('Affichage client contrôlé par un autre appareil')
		})

		return () => {
			releaseControl().catch(() => {})
		}
	}, [])

	const cartManager = useCartManager()
	const { subtotalTtc, totalTtc, totalVat, discountAmount, vatBreakdown } =
		useCartCalculations({
			cart: cartManager.cart,
			cartDiscountMode,
			cartDiscountValue,
		})

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
		paymentMethod: selectedPaymentMethod,
		received: Number.parseFloat(amountReceived) || undefined,
		change: change > 0 ? change : undefined,
		phase: displayPhase,
		enabled: hasControl,
	})

	// ============================================
	// GESTION DES SCANS (local + distant)
	// ============================================

	const handleBarcodeScan = React.useCallback(
		(barcode: string) => {
			console.log('[POS] Scan reçu:', barcode)

			const product = products.find((p) => p.barcode === barcode)

			if (product) {
				cartManager.addToCart(product)
				toast.success(`${product.name} ajouté`, { duration: 1500 })
				setProductSearch('')
			} else {
				setProductSearch(barcode)
				searchInputRef.current?.focus()
			}
		},
		[products, cartManager],
	)
	useBarcodeScanner({
		enabled: paymentStep === 'cart',
		onScan: handleBarcodeScan,
		onEscape: () => {
			setProductSearch('')
			searchInputRef.current?.focus()
		},
	})

	useScanner((barcode) => {
		if (paymentStep === 'cart') {
			handleBarcodeScan(barcode)
		}
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
				cartManager.addToCart(product)
				setProductSearch('')
				setTimeout(() => {
					searchInputRef.current?.focus()
				}, 0)
			}
		}
	}, [products, productSearch, cartManager])

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
			} catch {
				// mode dégradé
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

			setSelectedPaymentMethod(method)
			setPaymentStep('payment')
			if (method === 'especes') setAmountReceived(totalTtc.toFixed(2))
		},
		[cartManager.cart.length, totalTtc],
	)

	const clearAll = React.useCallback(() => {
		cartManager.clearCart()
		setCartDiscountMode('percent')
		setCartDiscountValue(0)
		setCartDiscountRaw('')
		setPaymentStep('cart')
		setAmountReceived('')
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
				paymentMethod: selectedPaymentMethod,
				received:
					selectedPaymentMethod === 'especes'
						? Number.parseFloat(amountReceived) || 0
						: undefined,
				change:
					selectedPaymentMethod === 'especes' && change > 0
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
			amountReceived,
			cartDiscountMode,
			cartDiscountValue,
			cartManager.cart,
			change,
			discountAmount,
			getCompanyLogoBase64,
			selectedPaymentMethod,
			subtotalTtc,
			user,
			vatBreakdown,
		],
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

			const result = await createPosTicket.mutateAsync({
				owner_company: activeCompanyId,
				cash_register: cashRegisterId,
				session_id: activeSession.id,
				customer_id: defaultCustomerId,
				items: cartManager.cart.map(cartItemToPosItem),
				payment_method: selectedPaymentMethod,
				amount_paid:
					selectedPaymentMethod === 'especes'
						? Number.parseFloat(amountReceived)
						: undefined,
				cart_discount_mode:
					cartDiscountValue > 0 ? cartDiscountMode : undefined,
				cart_discount_value:
					cartDiscountValue > 0 ? cartDiscountValue : undefined,
			})

			const ticket = result.ticket
			const backendTotals = result.totals

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
					selectedPaymentMethod === 'especes'
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
	}, [
		activeCompanyId,
		activeSession,
		amountReceived,
		buildReceiptPayload,
		cartDiscountMode,
		cartDiscountValue,
		cartManager.cart,
		cashRegisterId,
		clearAll,
		createPosTicket,
		pb,
		selectedPaymentMethod,
		totalTtc,
	])

	if (isSessionLoading) {
		return (
			<div className='flex h-screen items-center justify-center'>
				<Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
			</div>
		)
	}

	if (!isSessionOpen) return null

	if (paymentStep === 'cart') {
		return (
			<>
				<div className='container mx-auto flex flex-col gap-6 px-6 py-8'>
					<TerminalHeader
						registerName={currentRegister?.name || 'Caisse'}
						sessionIdShort={activeSession?.id.slice(0, 8) ?? ''}
						today={today}
						onBack={() => navigate({ to: '/cash' })}
					/>

					<main className='flex min-h-[520px] flex-1 flex-col gap-4 lg:flex-row'>
						<section className='flex flex-1 flex-col gap-3'>
							<ProductsPanel
								productSearch={productSearch}
								onProductSearchChange={setProductSearch}
								searchInputRef={searchInputRef}
								isAppPosConnected={isAppPosConnected}
								products={products}
								onAddToCart={cartManager.addToCart}
								onCreateProductClick={handleCreateProductClick}
							/>
						</section>

						<aside className='flex flex-1 flex-col gap-3'>
							{cartManager.parkedCarts.length > 0 && (
								<div className='rounded-lg border bg-card p-3'>
									<div className='mb-2 text-sm font-medium'>
										Paniers en attente ({cartManager.parkedCarts.length})
									</div>
									<div className='flex flex-wrap gap-2'>
										{cartManager.parkedCarts.map((parked) => (
											<button
												key={parked.id}
												type='button' // 👈 AJOUTER
												onClick={() => cartManager.unparkCart(parked.id)}
												className='rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90'
											>
												{parked.items.length} article
												{parked.items.length > 1 ? 's' : ''}
												<span className='ml-2 opacity-70'>
													{new Date(parked.parkedAt).toLocaleTimeString(
														'fr-FR',
														{
															hour: '2-digit',
															minute: '2-digit',
														},
													)}
												</span>
											</button>
										))}
									</div>
								</div>
							)}

							<CartPanel
								cart={cartManager.cart}
								onParkCart={() => cartManager.parkCart()}
								onClearCart={clearAll}
								onUpdateQuantity={cartManager.updateQuantity}
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
								setLineDiscountMode={cartManager.setLineDiscountMode}
								setLineDiscountValue={cartManager.setLineDiscountValue}
								clearLineDiscount={(id) => {
									cartManager.setLineDiscountMode(id, 'percent')
									cartManager.setLineDiscountValue(id, '')
								}}
								toggleItemDisplayMode={cartManager.toggleItemDisplayMode}
								editingLineId={editingLineId}
								setEditingLineId={setEditingLineId}
							/>
						</aside>
					</main>
				</div>

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

	return <SuccessView onNewSale={clearAll} />
}
