// frontend/modules/cash/CashTerminalPage.tsx
import { useNavigate, useParams } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

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
import { usePocketBase } from '@/lib/use-pocketbase'
import { useAuth } from '@/modules/auth/AuthProvider'
import { CreateProductDialog } from '@/modules/cash/CreateProductDialog'

import {
	type AppPosProduct,
	CartPanel,
	PaymentDialog,
	type PaymentEntry,
	type PaymentMethod,
	type PaymentStep,
	ProductsPanel,
	SuccessView,
	TerminalHeader,
	getEffectiveUnitTtc,
	getLineTotalTtc,
	getMainPaymentMethodCode,
	paymentEntriesToApiPayload,
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
	// ✅ MULTIPAIEMENT
	const [paymentEntries, setPaymentEntries] = React.useState<PaymentEntry[]>([])
	const [initialPaymentMethod, setInitialPaymentMethod] =
		React.useState<PaymentMethod | null>(null)
	const [isProcessing, setIsProcessing] = React.useState(false)

	const amountReceived = React.useMemo(() => {
		const cashEntry = paymentEntries.find(
			(e) => e.method.accounting_category === 'cash',
		)
		return cashEntry ? cashEntry.amount.toFixed(2) : ''
	}, [paymentEntries])

	const selectedPaymentMethod: PaymentMethod | null =
		paymentEntries[0]?.method ?? initialPaymentMethod ?? null

	const [isAppPosConnected, setIsAppPosConnected] = React.useState(false)

	const [isAppPosConnecting, setIsAppPosConnecting] = React.useState(true) // ✅ NOUVEAU
	const [appPosConnectionError, setAppPosConnectionError] = React.useState<
		string | null
	>(null) // ✅ NOUVEAU
	const [editingLineId, setEditingLineId] = React.useState<string | null>(null)

	const [showCreateProductDialog, setShowCreateProductDialog] =
		React.useState(false)
	const [productNotFoundBarcode, setProductNotFoundBarcode] = React.useState('')
	const [productInitialName, setProductInitialName] = React.useState('')

	const searchInputRef = React.useRef<HTMLInputElement>(null)

	const { data: registers } = useCashRegisters(activeCompanyId ?? undefined)
	const { data: activeSession, isLoading: isSessionLoading } =
		useActiveCashSession(cashRegisterId)

	const {
		data: productsData,
		refetch: refetchProducts, // ✅ EXTRAIRE refetch
	} = useAppPosProducts({
		enabled: isAppPosConnected,
		searchTerm: productSearch || undefined,
	})
	useAppPosStockUpdates({ enabled: true })
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

	const handleRefresh = React.useCallback(() => {
		console.log('🔄 Rafraîchissement des produits...')
		refetchProducts()
		toast.success('Données rafraîchies')
	}, [refetchProducts])

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
		paymentMethod: selectedPaymentMethod?.name,
		received: Number.parseFloat(amountReceived) || undefined,
		change: change > 0 ? change : undefined,
		phase: displayPhase,
		enabled: hasControl,
	})

	// ============================================
	// GESTION DES SCANS (local + distant)
	// ============================================

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

			if (isDuplicateScan(barcode)) return // ✅ FILTRE

			setProductSearch(barcode)
		},
		[isDuplicateScan],
	)

	useBarcodeScanner({
		enabled: paymentStep === 'cart',
		onScan: (barcode) => handleBarcodeScan(barcode, 'hid'), // ✅ SOURCE
	})

	useScanner((barcode) => {
		if (paymentStep === 'cart') {
			handleBarcodeScan(barcode, 'websocket') // ✅ SOURCE
		}
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
				console.log('[POS] Auto-add:', product.name)
				lastAutoAddRef.current = productSearch
				cartManager.addToCart(product)
				setProductSearch('')
				setTimeout(() => {
					searchInputRef.current?.focus()
				}, 0)
			}
		}
	}, [products, productSearch, cartManager])

	// Reset quand productSearch est vidé
	React.useEffect(() => {
		if (!productSearch) {
			lastAutoAddRef.current = null
		}
	}, [productSearch])
	React.useEffect(() => {
		const connectToAppPos = async () => {
			if (getAppPosToken()) {
				console.log('✅ Token AppPOS existant trouvé')
				setIsAppPosConnected(true)
				setIsAppPosConnecting(false)
				return
			}

			try {
				setIsAppPosConnecting(true)
				setAppPosConnectionError(null)

				console.log('🔐 Connexion à AppPOS...')
				const response = await loginToAppPos('admin', 'admin123')

				if (response.success && response.token) {
					setIsAppPosConnected(true)
					console.log('✅ Connecté à AppPOS:', response.user.username)
				} else {
					throw new Error('Login failed')
				}
			} catch (error) {
				console.error('❌ Erreur connexion AppPOS:', error)
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

			setInitialPaymentMethod(method)
			setPaymentEntries([])
			setPaymentStep('payment')
		},
		[cartManager.cart.length],
	)

	const clearAll = React.useCallback(() => {
		cartManager.clearCart()
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

	const handleConfirmPayment = React.useCallback(async () => {
		if (!activeCompanyId || !activeSession) {
			toast.error('Session ou entreprise manquante')
			return
		}

		// Validation multipaiement
		if (paymentEntries.length === 0) {
			toast.error('Aucun moyen de paiement sélectionné')
			return
		}
		const totalPaid = paymentEntries.reduce((sum, e) => sum + e.amount, 0)
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

			// ✅ 1. Créer le ticket dans PocketBase
			// Construire le payload multipaiement
			const apiPayments = paymentEntriesToApiPayload(paymentEntries)
			const mainMethodCode = getMainPaymentMethodCode(paymentEntries)
			const cashEntry = paymentEntries.find(
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
					paymentEntries.length > 1
						? paymentEntries.map((e) => e.method.name).join(' + ')
						: paymentEntries[0]?.method.type === 'custom'
							? paymentEntries[0].method.name
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

			// ✅ 2. 🆕 METTRE À JOUR LE STOCK DANS APPPOS
			if (isAppPosConnected && getAppPosToken()) {
				try {
					const stockItems = cartManager.cart.map((item) => ({
						productId: item.productId, // ✅ BON CHAMP (pas item.id)
						quantitySold: item.quantity,
					}))

					console.log(
						'📦 Mise à jour stock AppPOS pour',
						stockItems.length,
						'produit(s)',
					)
					await decrementAppPosProductsStock(stockItems)

					console.log('✅ Stock AppPOS mis à jour avec succès')
				} catch (stockError) {
					console.error('❌ Erreur MAJ stock:', stockError)
					toast.warning(
						'Vente enregistrée mais erreur de synchronisation du stock',
					)
				}
			} else {
				console.warn('⚠️ AppPOS non connecté, stock non synchronisé')
			}

			// ✅ 3. Impression (si activée)
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
					paymentEntries.some((e) => e.method.accounting_category === 'cash')
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
						onRefresh={handleRefresh}
					/>

					<div className='flex items-center gap-2 px-6 py-2 bg-muted/30 border-b'>
						{isAppPosConnecting ? (
							<div className='flex items-center gap-2 text-sm text-muted-foreground'>
								<Loader2 className='h-3 w-3 animate-spin' />
								<span>Connexion AppPOS...</span>
							</div>
						) : isAppPosConnected ? (
							<div className='flex items-center gap-2 text-sm'>
								<div className='w-2 h-2 rounded-full bg-green-500' />
								<span className='text-green-600 font-medium'>
									AppPOS connecté
								</span>
							</div>
						) : (
							<div className='flex items-center gap-2 text-sm'>
								<div className='w-2 h-2 rounded-full bg-red-500' />
								<span className='text-red-600'>AppPOS déconnecté</span>
								{appPosConnectionError && (
									<span className='text-xs text-muted-foreground'>
										({appPosConnectionError})
									</span>
								)}
							</div>
						)}
					</div>

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
								setUnitPrice={cartManager.setUnitPrice}
								clearUnitPrice={cartManager.clearUnitPrice}
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

	return <SuccessView onNewSale={clearAll} />
}
