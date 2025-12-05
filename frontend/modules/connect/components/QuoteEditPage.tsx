// frontend/modules/connect/components/QuoteEditPage.tsx

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
import { useQuote, useUpdateQuote } from '@/lib/queries/quotes'
import type { InvoiceItem, QuoteStatus } from '@/lib/types/invoice.types'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
	ArrowLeft,
	ChevronsUpDown,
	FileText,
	Loader2,
	Minus,
	Plus,
	Search,
	Trash2,
	UserPlus,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CustomerDialog } from './CustomerDialog'

// ============================================================================
// TYPES
// ============================================================================

interface UiQuoteItem extends InvoiceItem {
	id: string
}

interface SelectedCustomer {
	id: string
	name: string
	email?: string
	phone?: string
	address?: string
	company?: string
}

type QuoteCustomer = CustomersResponse
type QuoteProduct = ProductsResponse

// ============================================================================
// COMPONENT
// ============================================================================

export function QuoteEditPage() {
	const navigate = useNavigate()
	const { quoteId } = useParams({ from: '/connect/quotes/$quoteId/edit' })
	const { activeCompanyId } = useActiveCompany()

	// Charger le devis existant
	const { data: quote, isLoading: isLoadingQuote } = useQuote(quoteId)

	// États du formulaire
	const [quoteNumber, setQuoteNumber] = useState('')
	const [quoteDate, setQuoteDate] = useState('')
	const [validUntil, setValidUntil] = useState('')
	const [selectedCustomer, setSelectedCustomer] =
		useState<SelectedCustomer | null>(null)
	const [items, setItems] = useState<UiQuoteItem[]>([])
	const [notes, setNotes] = useState('')
	const [currency] = useState('EUR')
	const [isInitialized, setIsInitialized] = useState(false)

	// Dialog states
	const [customerPickerOpen, setCustomerPickerOpen] = useState(false)
	const [customerSearch, setCustomerSearch] = useState('')
	const [productPickerOpen, setProductPickerOpen] = useState(false)
	const [productSearch, setProductSearch] = useState('')
	const [newCustomerDialogOpen, setNewCustomerDialogOpen] = useState(false)

	// Connexion AppPOS
	const [isAppPosConnected, setIsAppPosConnected] = useState(false)

	// Queries
	const { data: customersData } = useCustomers({
		companyId: activeCompanyId ?? undefined,
	})

	const { data: productsData } = useAppPosProducts({
		enabled: isAppPosConnected,
		searchTerm: productSearch || undefined,
	})

	// Mutations
	const updateQuote = useUpdateQuote()
	const createCustomer = useCreateCustomer()

	const customers: QuoteCustomer[] = (customersData?.items ??
		[]) as QuoteCustomer[]
	const products: QuoteProduct[] = (productsData?.items ?? []) as QuoteProduct[]

	// Filtrer les clients
	const filteredCustomers = customers.filter((c) => {
		const term = customerSearch.toLowerCase()
		return (
			c.name.toLowerCase().includes(term) ||
			(c.email ?? '').toLowerCase().includes(term) ||
			(c.phone ?? '').includes(customerSearch)
		)
	})

	// 🔐 Connexion automatique à AppPOS
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
				if (res.success && res.token) {
					setIsAppPosConnected(true)
				}
			} catch (err) {
				console.error('AppPOS: erreur de connexion', err)
			}
		}

		void connect()
	}, [isAppPosConnected])

	// 📝 Initialiser le formulaire avec les données du devis
	useEffect(() => {
		if (quote && !isInitialized) {
			setQuoteNumber(quote.number)
			setQuoteDate(quote.date?.split('T')[0] || '')
			setValidUntil(quote.valid_until?.split('T')[0] || '')
			setNotes(quote.notes || '')

			// Initialiser le client
			if (quote.expand?.customer) {
				const customer = quote.expand.customer
				setSelectedCustomer({
					id: customer.id,
					name: customer.name,
					email: customer.email,
					phone: customer.phone,
					address: customer.address,
					company: customer.company,
				})
			}

			// Initialiser les items avec des IDs temporaires
			if (quote.items && Array.isArray(quote.items)) {
				const uiItems: UiQuoteItem[] = quote.items.map((item, index) => ({
					...item,
					id: `existing-${index}-${Date.now()}`,
				}))
				setItems(uiItems)
			}

			setIsInitialized(true)
		}
	}, [quote, isInitialized])

	// Calculer les totaux
	const totals = items.reduce(
		(acc, item) => ({
			ht: acc.ht + item.total_ht,
			tva: acc.tva + (item.total_ttc - item.total_ht),
			ttc: acc.ttc + item.total_ttc,
		}),
		{ ht: 0, tva: 0, ttc: 0 },
	)

	// Ajouter un produit
	const addProduct = (product: QuoteProduct) => {
		const tvaRate = product.tva_rate ?? 20

		let priceHt = 0
		if (typeof product.price_ht === 'number') {
			priceHt = product.price_ht
		} else if (typeof product.price_ttc === 'number') {
			priceHt = product.price_ttc / (1 + tvaRate / 100)
		}

		const totalHt = priceHt
		const totalTtc = totalHt * (1 + tvaRate / 100)

		const newItem: UiQuoteItem = {
			id: `item-${Date.now()}-${Math.random().toString(16).slice(2)}`,
			product_id: product.id,
			name: product.name,
			quantity: 1,
			unit_price_ht: priceHt,
			tva_rate: tvaRate,
			total_ht: totalHt,
			total_ttc: totalTtc,
		}

		setItems((prev) => [...prev, newItem])
		setProductPickerOpen(false)
		setProductSearch('')
	}

	// Modifier la quantité
	const updateQuantity = (itemId: string, delta: number) => {
		setItems((prevItems) => {
			const updated: UiQuoteItem[] = []

			for (const item of prevItems) {
				if (item.id === itemId) {
					const newQty = Math.max(0, item.quantity + delta)
					if (newQty === 0) {
						continue
					}
					const totalHt = item.unit_price_ht * newQty
					const totalTtc = totalHt * (1 + item.tva_rate / 100)
					updated.push({
						...item,
						quantity: newQty,
						total_ht: totalHt,
						total_ttc: totalTtc,
					})
				} else {
					updated.push(item)
				}
			}

			return updated
		})
	}

	// Supprimer un item
	const removeItem = (itemId: string) => {
		setItems((prev) => prev.filter((item) => item.id !== itemId))
	}

	// Créer un nouveau client rapidement
	const handleQuickCreateCustomer = async () => {
		if (!customerSearch.trim() || !activeCompanyId) return

		try {
			const newCustomer = await createCustomer.mutateAsync({
				name: customerSearch,
				owner_company: activeCompanyId,
			})
			setSelectedCustomer({
				id: newCustomer.id,
				name: newCustomer.name,
			})
			setCustomerPickerOpen(false)
			setCustomerSearch('')
			toast.success(`Client "${customerSearch}" créé`)
		} catch (error) {
			console.error(error)
			toast.error('Erreur lors de la création du client')
		}
	}

	// Soumettre les modifications
	const handleSubmit = async (status: QuoteStatus = 'draft') => {
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
			const quoteItems: InvoiceItem[] = items.map(({ id, ...item }) => item)

			await updateQuote.mutateAsync({
				id: quoteId,
				data: {
					number: quoteNumber,
					date: quoteDate,
					valid_until: validUntil || undefined,
					customer: selectedCustomer.id,
					owner_company: activeCompanyId,
					status,
					items: quoteItems,
					total_ht: totals.ht,
					total_tva: totals.tva,
					total_ttc: totals.ttc,
					currency,
					notes: notes || undefined,
				},
			})

			toast.success('Devis mis à jour avec succès')
			navigate({
				to: '/connect/quotes/$quoteId',
				params: { quoteId },
			})
		} catch (error) {
			console.error('Erreur lors de la mise à jour du devis', error)
			toast.error('Erreur lors de la mise à jour du devis')
		}
	}

	// Loading state
	if (isLoadingQuote) {
		return (
			<div className='container mx-auto px-6 py-8 flex items-center justify-center'>
				<Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
			</div>
		)
	}

	// Not found
	if (!quote) {
		return (
			<div className='container mx-auto px-6 py-8'>
				<div className='text-muted-foreground'>Devis introuvable</div>
				<Button
					variant='outline'
					className='mt-4'
					onClick={() => navigate({ to: '/connect/quotes' })}
				>
					<ArrowLeft className='h-4 w-4 mr-2' />
					Retour aux devis
				</Button>
			</div>
		)
	}

	return (
		<div className='container mx-auto px-6 py-8 max-w-5xl'>
			{/* Header */}
			<div className='flex items-center gap-4 mb-6'>
				<Button
					variant='ghost'
					size='icon'
					onClick={() =>
						navigate({
							to: '/connect/quotes/$quoteId',
							params: { quoteId },
						})
					}
				>
					<ArrowLeft className='h-5 w-5' />
				</Button>
				<div className='flex-1'>
					<h1 className='text-2xl font-bold flex items-center gap-2'>
						<FileText className='h-6 w-6' />
						Modifier le devis {quote.number}
					</h1>
					<p className='text-muted-foreground'>
						Modifiez les informations du devis
					</p>
				</div>
			</div>

			<div className='grid lg:grid-cols-3 gap-6'>
				{/* Colonne principale */}
				<div className='lg:col-span-2 space-y-6'>
					{/* Infos devis */}
					<Card>
						<CardHeader>
							<CardTitle className='text-lg'>Informations</CardTitle>
						</CardHeader>
						<CardContent className='grid sm:grid-cols-3 gap-4'>
							<div>
								<Label>Numéro</Label>
								<Input
									value={quoteNumber}
									readOnly
									onChange={(e) => setQuoteNumber(e.target.value)}
									placeholder='DEV-2025-0001'
								/>
							</div>
							<div>
								<Label>Date</Label>
								<Input
									type='date'
									value={quoteDate}
									onChange={(e) => setQuoteDate(e.target.value)}
								/>
							</div>
							<div>
								<Label>Valide jusqu&apos;au</Label>
								<Input
									type='date'
									value={validUntil}
									onChange={(e) => setValidUntil(e.target.value)}
								/>
							</div>
						</CardContent>
					</Card>

					{/* Sélection client */}
					<Card>
						<CardHeader>
							<CardTitle className='text-lg'>Client</CardTitle>
						</CardHeader>
						<CardContent>
							{selectedCustomer ? (
								<div className='flex items-center justify-between p-3 border rounded-lg bg-muted/30'>
									<div>
										<p className='font-medium'>{selectedCustomer.name}</p>
										{selectedCustomer.email && (
											<p className='text-sm text-muted-foreground'>
												{selectedCustomer.email}
											</p>
										)}
										{selectedCustomer.address && (
											<p className='text-sm text-muted-foreground'>
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
															{(filteredCustomers as QuoteCustomer[]).map(
																(customer) => (
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
																			<div>
																				<p className='font-medium'>
																					{customer.name}
																				</p>
																				{customer.email && (
																					<p className='text-xs text-muted-foreground'>
																						{customer.email}
																					</p>
																				)}
																			</div>
																		</button>
																	</li>
																),
															)}
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

					{/* Produits */}
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
									<p className='text-sm'>
										Cliquez sur &quot;Ajouter&quot; pour rechercher des produits
									</p>
								</div>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Produit</TableHead>
											<TableHead className='text-center w-32'>Qté</TableHead>
											<TableHead className='text-right'>P.U. HT</TableHead>
											<TableHead className='text-right'>TVA</TableHead>
											<TableHead className='text-right'>Total TTC</TableHead>
											<TableHead className='w-10' />
										</TableRow>
									</TableHeader>
									<TableBody>
										{items.map((item) => (
											<TableRow key={item.id}>
												<TableCell className='font-medium'>
													{item.name}
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
													{item.unit_price_ht.toFixed(2)} €
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
										))}
									</TableBody>
									<TableFooter>
										<TableRow>
											<TableCell colSpan={4} className='text-right'>
												Total HT
											</TableCell>
											<TableCell className='text-right'>
												{totals.ht.toFixed(2)} €
											</TableCell>
											<TableCell />
										</TableRow>
										<TableRow>
											<TableCell colSpan={4} className='text-right'>
												TVA
											</TableCell>
											<TableCell className='text-right'>
												{totals.tva.toFixed(2)} €
											</TableCell>
											<TableCell />
										</TableRow>
										<TableRow className='font-bold'>
											<TableCell colSpan={4} className='text-right'>
												Total TTC
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

					{/* Notes */}
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

				{/* Sidebar - Récapitulatif */}
				<div className='space-y-6'>
					<Card className='sticky top-20'>
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
								<div className='flex justify-between text-sm'>
									<span className='text-muted-foreground'>Total HT</span>
									<span>{totals.ht.toFixed(2)} €</span>
								</div>
								<div className='flex justify-between text-sm'>
									<span className='text-muted-foreground'>TVA</span>
									<span>{totals.tva.toFixed(2)} €</span>
								</div>
								<div className='border-t pt-2 flex justify-between font-bold'>
									<span>Total TTC</span>
									<span className='text-lg'>{totals.ttc.toFixed(2)} €</span>
								</div>
							</div>

							<div className='space-y-2 pt-4'>
								<Button
									className='w-full'
									onClick={() => handleSubmit(quote.status)}
									disabled={updateQuote.isPending}
								>
									{updateQuote.isPending ? (
										<Loader2 className='h-4 w-4 animate-spin mr-2' />
									) : null}
									Enregistrer les modifications
								</Button>
								{quote.status === 'draft' && (
									<Button
										variant='outline'
										className='w-full'
										onClick={() => handleSubmit('sent')}
										disabled={updateQuote.isPending}
									>
										Enregistrer et envoyer
									</Button>
								)}
								<Button
									variant='ghost'
									className='w-full'
									onClick={() =>
										navigate({
											to: '/connect/quotes/$quoteId',
											params: { quoteId },
										})
									}
								>
									Annuler
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Dialog nouveau client */}
			<CustomerDialog
				open={newCustomerDialogOpen}
				onOpenChange={setNewCustomerDialogOpen}
			/>

			{/* Dialog choix produits */}
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
										: 'Connexion à AppPOS en cours ou échouée'}
								</div>
							) : (
								<ul className='divide-y'>
									{products.slice(0, 20).map((product) => (
										<li key={product.id}>
											<button
												type='button'
												className='w-full px-3 py-2 text-left hover:bg-muted flex items-center justify-between gap-2'
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
