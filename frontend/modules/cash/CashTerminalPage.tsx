// frontend/modules/cash/CashTerminalPage.tsx
// ✨ Version FINALE - Adaptée au flux AppPOS existant (comme InvoiceCreatePage)

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
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { getAppPosToken, loginToAppPos, useAppPosProducts } from '@/lib/apppos'
import { openCashDrawer, printReceipt } from '@/lib/pos/posPrint'
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

import { loadPosPrinterSettings } from '@/lib/pos/printerSettings'
// ============================================================================
// TYPES
// ============================================================================

interface CartItem {
	id: string
	productId: string
	name: string
	unitPrice: number
	quantity: number
}

type PaymentStep = 'cart' | 'payment' | 'success'

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

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// ÉTAT
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	const [cart, setCart] = React.useState<CartItem[]>([])
	const [productSearch, setProductSearch] = React.useState('')
	const [discountPercent, setDiscountPercent] = React.useState(0)

	// États paiement
	const [paymentStep, setPaymentStep] = React.useState<PaymentStep>('cart')
	const [selectedPaymentMethod, setSelectedPaymentMethod] =
		React.useState<PaymentMethod>('especes')
	const [amountReceived, setAmountReceived] = React.useState<string>('')
	const [isProcessing, setIsProcessing] = React.useState(false)

	// Connexion AppPOS (comme InvoiceCreatePage)
	const [isAppPosConnected, setIsAppPosConnected] = React.useState(false)

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// QUERIES
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	const { data: registers } = useCashRegisters(activeCompanyId ?? undefined)
	const { data: activeSession, isLoading: isSessionLoading } =
		useActiveCashSession(cashRegisterId)

	// 🎯 EXACTEMENT comme InvoiceCreatePage
	const { data: productsData } = useAppPosProducts({
		enabled: isAppPosConnected,
		searchTerm: productSearch || undefined,
	})

	const products = productsData?.items ?? []

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// MUTATIONS
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	const createInvoice = useCreateInvoice()
	const createCashMovement = useCreateCashMovement()

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// COMPUTED
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	const currentRegister = registers?.find((r) => r.id === cashRegisterId)
	const isSessionOpen = activeSession?.status === 'open'

	const today = new Date().toLocaleDateString('fr-FR', {
		weekday: 'long',
		day: '2-digit',
		month: 'long',
	})

	// Calcul totaux
	const { subtotalTtc, totalTtc, tax } = React.useMemo(() => {
		const subtotal = cart.reduce(
			(sum, item) => sum + item.unitPrice * item.quantity,
			0,
		)
		const discount = (subtotal * discountPercent) / 100
		const total = subtotal - discount
		const taxAmount = total * 0.2 // TVA 20%

		return {
			subtotalTtc: subtotal,
			discountAmount: discount,
			totalTtc: total,
			tax: taxAmount,
		}
	}, [cart, discountPercent])

	// Calcul monnaie
	const change = React.useMemo(() => {
		const received = Number.parseFloat(amountReceived) || 0
		return received - totalTtc
	}, [amountReceived, totalTtc])

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// EFFETS
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	// Connexion automatique AppPOS (comme InvoiceCreatePage)
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
				if (res.success && res.token) {
					setIsAppPosConnected(true)
				}
			} catch (err) {
				console.error('AppPOS: erreur de connexion', err)
			}
		}

		void connect()
	}, [isAppPosConnected])

	// Redirection si pas de session
	React.useEffect(() => {
		if (!isSessionLoading && !isSessionOpen) {
			toast.error('Aucune session ouverte pour cette caisse')
			navigate({ to: '/cash' })
		}
	}, [isSessionLoading, isSessionOpen, navigate])

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// HANDLERS : PANIER
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	const addToCart = (product: (typeof products)[0]) => {
		const existingIndex = cart.findIndex(
			(item) => item.productId === product.id,
		)

		if (existingIndex >= 0) {
			// Incrémenter quantité
			const newCart = [...cart]
			newCart[existingIndex].quantity += 1
			setCart(newCart)
		} else {
			// Nouveau produit
			const price = product.price_ttc || product.price_ht || 0
			const newItem: CartItem = {
				id: `cart-${Date.now()}-${Math.random().toString(16).slice(2)}`,
				productId: product.id,
				name: product.name,
				unitPrice: price,
				quantity: 1,
			}
			setCart([...cart, newItem])
		}
	}

	const updateQuantity = (itemId: string, newQuantity: number) => {
		if (newQuantity <= 0) {
			setCart(cart.filter((item) => item.id !== itemId))
		} else {
			setCart(
				cart.map((item) =>
					item.id === itemId ? { ...item, quantity: newQuantity } : item,
				),
			)
		}
	}

	const clearCart = () => {
		setCart([])
		setDiscountPercent(0)
		setPaymentStep('cart')
		setAmountReceived('')
	}

	const handleChangeDiscount = (e: React.ChangeEvent<HTMLInputElement>) => {
		const val = Number.parseFloat(e.target.value) || 0
		setDiscountPercent(Math.max(0, Math.min(100, val)))
	}

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// HANDLERS : PAIEMENT
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	const handlePaymentClick = (method: PaymentMethod) => {
		if (cart.length === 0) {
			toast.error('Le panier est vide')
			return
		}

		setSelectedPaymentMethod(method)
		setPaymentStep('payment')

		// Pré-remplir montant pour espèces
		if (method === 'especes') {
			setAmountReceived(totalTtc.toFixed(2))
		}
	}

	const handleConfirmPayment = async () => {
		if (!activeCompanyId || !activeSession) {
			toast.error('Session ou entreprise manquante')
			return
		}

		// Validation montant pour espèces
		if (selectedPaymentMethod === 'especes') {
			const received = Number.parseFloat(amountReceived) || 0
			if (received < totalTtc) {
				toast.error('Montant insuffisant')
				return
			}
		}

		// Charger les paramètres d'impression
		const printerSettings = loadPosPrinterSettings()

		setIsProcessing(true)

		try {
			// 🔑 Récupérer ou créer le client par défaut
			const defaultCustomerId = await getOrCreateDefaultCustomer(
				pb,
				activeCompanyId,
			)

			// Préparer les items
			const invoiceItems: InvoiceItem[] = cart.map((item) => ({
				product_id: item.productId,
				name: item.name,
				quantity: item.quantity,
				unit_price_ht: item.unitPrice / 1.2, // Prix HT approximatif
				tva_rate: 20,
				total_ht: (item.unitPrice * item.quantity) / 1.2,
				total_ttc: item.unitPrice * item.quantity,
			}))

			// Créer le ticket
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
				// 🔑 Liaison caisse + session
				cash_register: cashRegisterId,
				session: activeSession.id,
				sold_by: user?.id,
			})
			// 🆕 DEBUG
			console.log('Ticket créé:', {
				number: invoice.number,
				is_paid: invoice.is_paid,
				paid_at: invoice.paid_at,
				payment_method: invoice.payment_method,
			})

			// Si paiement espèces, créer mouvement de caisse
			if (selectedPaymentMethod === 'especes') {
				await createCashMovement.mutateAsync({
					sessionId: activeSession.id,
					movementType: 'cash_in',
					amount: totalTtc,
					reason: `Vente ticket ${invoice.number}`,
					meta: {
						invoice_id: invoice.id,
						invoice_number: invoice.number,
					},
					cashRegisterId,
				})
			}

			// =========================
			// PRINT + TIROIR
			// =========================

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
								unitTtc: it.unitPrice,
								totalTtc: it.unitPrice * it.quantity,
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
			} else {
				// optionnel: feedback si pas configuré
				// toast.message("Imprimante POS non configurée")
			}

			toast.success(`Ticket ${invoice.number} créé`)
			setPaymentStep('success')

			// Auto-reset après 3 secondes
			setTimeout(() => {
				clearCart()
			}, 3000)
		} catch (error: any) {
			console.error('Erreur création ticket:', error)
			toast.error(error.message || 'Erreur lors de la création du ticket')
		} finally {
			setIsProcessing(false)
		}
	}

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// RENDER : LOADING
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	if (isSessionLoading) {
		return (
			<div className='flex h-screen items-center justify-center'>
				<Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
			</div>
		)
	}

	if (!isSessionOpen) {
		return null // La redirection se fait dans l'useEffect
	}

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// RENDER : PANIER (cart)
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	if (paymentStep === 'cart') {
		return (
			<div className='container mx-auto flex flex-col gap-6 px-6 py-8'>
				<header className='flex items-center justify-between gap-4'>
					<div className='flex items-center gap-3'>
						<Button
							variant='ghost'
							size='sm'
							onClick={() => navigate({ to: '/cash' })}
						>
							<ArrowLeft className='h-4 w-4 mr-2' />
							Retour
						</Button>
						<div>
							<h1 className='text-2xl font-semibold tracking-tight'>
								{currentRegister?.name || 'Caisse'}
							</h1>
							<p className='text-sm text-muted-foreground'>
								Session {activeSession?.id.slice(0, 8)} — {today}
							</p>
						</div>
					</div>

					<div className='flex items-center gap-4 text-xs text-muted-foreground'>
						<div className='flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1'>
							<span className='h-2 w-2 rounded-full bg-emerald-500' />
							<span className='font-medium text-emerald-700'>
								Session ouverte
							</span>
						</div>
					</div>
				</header>

				<main className='flex min-h-[520px] flex-1 flex-col gap-4 lg:flex-row'>
					{/* GAUCHE : PRODUITS */}
					<section className='flex flex-1 flex-col gap-3'>
						<Card className='flex flex-1 flex-col'>
							{/* Recherche */}
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
										onChange={(e) => setProductSearch(e.target.value)}
										className='h-9 w-full bg-slate-50 pl-8 text-sm'
									/>
								</div>
							</div>

							{/* Header liste */}
							<div className='flex items-center border-b px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500'>
								<div className='flex-1'>Produit</div>
								<div className='w-24 text-right'>Prix TTC</div>
								<div className='w-24 text-right'>Stock</div>
							</div>

							{/* Liste produits */}
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
												onClick={() => addToCart(p)}
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
					</section>

					{/* DROITE : PANIER */}
					<aside className='flex flex-1 flex-col gap-3'>
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
									onClick={clearCart}
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
										{cart.map((item) => (
											<div
												key={item.id}
												className='flex items-center justify-between py-2'
											>
												<div className='flex-1'>
													<div className='font-medium'>{item.name}</div>
													<div className='flex items-center gap-2 text-xs text-slate-500'>
														<Button
															type='button'
															variant='ghost'
															size='sm'
															className='h-5 w-5 p-0'
															onClick={() =>
																updateQuantity(item.id, item.quantity - 1)
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
																updateQuantity(item.id, item.quantity + 1)
															}
														>
															+
														</Button>
													</div>
												</div>
												<span className='font-semibold'>
													{(item.unitPrice * item.quantity).toFixed(2)} €
												</span>
											</div>
										))}
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
											onChange={handleChangeDiscount}
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
										onClick={() => handlePaymentClick('cb')}
										disabled={cart.length === 0}
									>
										<CreditCard className='h-4 w-4 mr-1' />
										CB
									</Button>
									<Button
										type='button'
										variant='outline'
										className='h-10'
										onClick={() => handlePaymentClick('especes')}
										disabled={cart.length === 0}
									>
										<Banknote className='h-4 w-4 mr-1' />
										Espèces
									</Button>
									<Button
										type='button'
										variant='outline'
										className='h-10'
										onClick={() => handlePaymentClick('virement')}
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
									onClick={() => handlePaymentClick('cb')}
								>
									Encaisser {totalTtc > 0 ? `${totalTtc.toFixed(2)} €` : ''}
								</Button>
							</div>
						</Card>
					</aside>
				</main>
			</div>
		)
	}

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// RENDER : PAIEMENT (payment)
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	if (paymentStep === 'payment') {
		return (
			<Dialog open={true} onOpenChange={() => setPaymentStep('cart')}>
				<DialogContent className='sm:max-w-md'>
					<DialogHeader>
						<DialogTitle>Paiement</DialogTitle>
						<DialogDescription>
							Montant à encaisser : {totalTtc.toFixed(2)} €
						</DialogDescription>
					</DialogHeader>

					<div className='space-y-4'>
						{/* Sélection méthode */}
						<div>
							<Label>Méthode de paiement</Label>
							<div className='grid grid-cols-3 gap-2 mt-2'>
								<Button
									type='button'
									variant={
										selectedPaymentMethod === 'especes' ? 'default' : 'outline'
									}
									className='h-20'
									onClick={() => setSelectedPaymentMethod('especes')}
								>
									<div className='flex flex-col items-center gap-1'>
										<Banknote className='h-5 w-5' />
										<span className='text-xs'>Espèces</span>
									</div>
								</Button>
								<Button
									type='button'
									variant={
										selectedPaymentMethod === 'cb' ? 'default' : 'outline'
									}
									className='h-20'
									onClick={() => setSelectedPaymentMethod('cb')}
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
									onClick={() => setSelectedPaymentMethod('virement')}
								>
									<div className='flex flex-col items-center gap-1'>
										<DollarSign className='h-5 w-5' />
										<span className='text-xs'>Virement</span>
									</div>
								</Button>
							</div>
						</div>

						{/* Montant reçu (espèces uniquement) */}
						{selectedPaymentMethod === 'especes' && (
							<div>
								<Label htmlFor='amountReceived'>Montant reçu (€)</Label>
								<Input
									id='amountReceived'
									type='number'
									step='0.01'
									value={amountReceived}
									onChange={(e) => setAmountReceived(e.target.value)}
									className='text-xl h-14 text-right mt-2'
									placeholder='0.00'
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
						<Button
							variant='outline'
							onClick={() => setPaymentStep('cart')}
							disabled={isProcessing}
						>
							Annuler
						</Button>
						<Button
							onClick={handleConfirmPayment}
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

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// RENDER : SUCCÈS (success)
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
					<Button onClick={clearCart} className='w-full'>
						Nouvelle vente
					</Button>
				</CardContent>
			</Card>
		</div>
	)
}
