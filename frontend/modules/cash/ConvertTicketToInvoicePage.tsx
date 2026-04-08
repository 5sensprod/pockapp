// frontend/modules/cash/ConvertTicketToInvoicePage.tsx
// Page de conversion d'un ticket POS en facture légale
// ✅ Fix ISCA: ne PATCH plus le ticket (inaltérable). On déduit la conversion via original_invoice_id.

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
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import type {
	CustomersResponse,
	InvoicesResponse,
	TypedPocketBase,
} from '@/lib/pocketbase-types'
import { useCreateCustomer, useCustomers } from '@/lib/queries/customers'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
	AlertCircle,
	ArrowLeft,
	ArrowRight,
	CheckCircle2,
	ChevronsUpDown,
	FileText,
	Loader2,
	Receipt,
	User,
	UserPlus,
} from 'lucide-react'
import { ClientResponseError } from 'pocketbase'
import * as React from 'react'
import { toast } from 'sonner'
import { CustomerDialog } from '../connect/features/customers/CustomerDialog'
import { CashModuleShell } from './CashModuleShell'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
	if (!dateStr) return '-'
	return new Date(dateStr).toLocaleDateString('fr-FR')
}

function formatCurrency(amount: number) {
	return new Intl.NumberFormat('fr-FR', {
		style: 'currency',
		currency: 'EUR',
	}).format(amount)
}

// ── Composant principal ───────────────────────────────────────────────────────

export function ConvertTicketToInvoicePage() {
	const navigate = useNavigate()
	const { ticketId } = useParams({
		from: '/cash/convert-to-invoice/$ticketId/',
	})

	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as TypedPocketBase
	const queryClient = useQueryClient()

	// ── État ──────────────────────────────────────────────────────────────────
	const [selectedCustomer, setSelectedCustomer] =
		React.useState<CustomersResponse | null>(null)
	const [additionalNotes, setAdditionalNotes] = React.useState('')
	const [customerPickerOpen, setCustomerPickerOpen] = React.useState(false)
	const [customerSearch, setCustomerSearch] = React.useState('')
	const [newCustomerDialogOpen, setNewCustomerDialogOpen] =
		React.useState(false)

	// ── Queries ───────────────────────────────────────────────────────────────

	const { data: ticket, isLoading: isLoadingTicket } = useQuery({
		queryKey: ['invoice', ticketId],
		queryFn: async () =>
			pb.collection('invoices').getOne<InvoicesResponse>(ticketId, {
				expand: 'customer,owner_company',
			}),
		enabled: !!ticketId,
	})

	// ✅ Déduire la conversion via la présence d'une facture liée
	const { data: convertedInvoice, isLoading: isLoadingConvertedInvoice } =
		useQuery({
			queryKey: ['converted-invoice-for-ticket', ticketId],
			queryFn: async () => {
				const res = await pb
					.collection('invoices')
					.getList<InvoicesResponse>(1, 1, {
						filter: `original_invoice_id="${ticketId}" && invoice_type="invoice"`,
					})
				return res.items[0] ?? null
			},
			enabled: !!ticketId,
		})

	const isConverted = !!convertedInvoice

	const { data: customersData } = useCustomers({
		companyId: activeCompanyId ?? undefined,
	})
	const customers: CustomersResponse[] = (customersData?.items ??
		[]) as CustomersResponse[]

	const filteredCustomers = React.useMemo(() => {
		if (!customerSearch) return customers.slice(0, 10)
		const term = customerSearch.toLowerCase()
		return customers
			.filter(
				(c) =>
					(c.name ?? '').toLowerCase().includes(term) ||
					(c.email ?? '').toLowerCase().includes(term) ||
					(c.phone ?? '').includes(customerSearch) ||
					(c.company ?? '').toLowerCase().includes(term),
			)
			.slice(0, 20)
	}, [customers, customerSearch])

	// ── Mutations ─────────────────────────────────────────────────────────────

	const createCustomer = useCreateCustomer()

	const handleQuickCreateCustomer = async () => {
		if (!activeCompanyId) {
			toast.error('Aucune entreprise sélectionnée')
			return
		}
		if (!customerSearch.trim()) return
		try {
			const newCustomer = await createCustomer.mutateAsync({
				name: customerSearch.trim(),
				owner_company: activeCompanyId,
			})
			setSelectedCustomer(newCustomer as CustomersResponse)
			setCustomerPickerOpen(false)
			setCustomerSearch('')
			toast.success(`Client "${newCustomer.name}" créé`)
		} catch (error) {
			console.error(error)
			toast.error('Erreur lors de la création du client')
		}
	}

	const convertMutation = useMutation({
		mutationFn: async () => {
			if (!selectedCustomer) throw new Error('Veuillez sélectionner un client')
			if (!ticket) throw new Error('Ticket introuvable')
			if (!activeCompanyId) throw new Error('Entreprise manquante')

			// ✅ Empêcher la double conversion
			{
				const res = await pb
					.collection('invoices')
					.getList<InvoicesResponse>(1, 1, {
						filter: `original_invoice_id="${ticketId}" && invoice_type="invoice"`,
					})
				if (res.items[0]) {
					throw new Error('Ce ticket a déjà été converti en facture.')
				}
			}

			// 🔧 FIX split payment: seules ces valeurs sont acceptées par PocketBase.
			const PB_VALID_PAYMENT_METHODS = new Set([
				'virement',
				'cb',
				'especes',
				'cheque',
				'autre',
			])
			const rawMethod = ticket.payment_method as string | undefined
			const safePaymentMethod =
				rawMethod && PB_VALID_PAYMENT_METHODS.has(rawMethod)
					? rawMethod
					: 'autre'

			const invoice = await pb.collection('invoices').create<InvoicesResponse>({
				invoice_type: 'invoice',
				date: new Date().toISOString().split('T')[0],
				customer: selectedCustomer.id,
				owner_company: activeCompanyId,
				status: 'validated',
				is_paid: ticket.is_paid ?? true,
				paid_at: ticket.paid_at ?? new Date().toISOString(),
				payment_method: safePaymentMethod as any,
				items: ticket.items,
				total_ht: ticket.total_ht,
				total_tva: ticket.total_tva,
				total_ttc: ticket.total_ttc,
				currency: ticket.currency ?? 'EUR',
				original_invoice_id: ticketId,
				is_pos_ticket: false,
				// ✅ FIX: forcer à null pour éviter la double comptabilisation
				session: null,
				cash_register: null,
				notes: [
					`Facture issue du ticket ${ticket.number}`,
					rawMethod === 'multi' && (ticket as any).split_payments
						? `Paiements multiples : ${(
								(ticket as any).split_payments as Array<{
									method: string
									amount: number
								}>
							)
								.map((p) => `${p.method} ${p.amount.toFixed(2)} €`)
								.join(', ')}`
						: '',
					ticket.notes || '',
					additionalNotes,
				]
					.filter(Boolean)
					.join('\n\n'),
			})

			return invoice
		},
		onSuccess: (invoice) => {
			toast.success(`Facture ${invoice.number} créée avec succès`)
			queryClient.invalidateQueries({ queryKey: ['invoices'] })
			queryClient.invalidateQueries({ queryKey: ['invoice', ticketId] })
			queryClient.invalidateQueries({
				queryKey: ['converted-invoice-for-ticket', ticketId],
			})
			navigate({
				to: '/connect/invoices/$invoiceId',
				params: { invoiceId: invoice.id },
			})
		},
		onError: (error: unknown) => {
			console.error('Erreur conversion (raw):', error)
			if (error instanceof ClientResponseError) {
				console.error('PB status:', error.status)
				console.error('PB message:', error.message)
				console.error('PB data (pretty):', JSON.stringify(error.data, null, 2))
			}
			toast.error(
				error instanceof Error ? error.message : 'Erreur lors de la conversion',
			)
		},
	})

	// ── Header left : retour + numéro ticket ─────────────────────────────────

	const headerLeft = ticket ? (
		<div className='flex items-center gap-3'>
			<Button
				variant='ghost'
				size='sm'
				className='-ml-2 text-muted-foreground hover:text-foreground'
				onClick={() => navigate({ to: '/cash/tickets' })}
			>
				<ArrowLeft className='h-4 w-4 mr-1.5' />
				Retour
			</Button>
			<div className='h-4 w-px bg-border/60 shrink-0' />
			<span className='text-[13px] text-muted-foreground'>
				Ticket{' '}
				<span className='font-mono font-medium text-foreground'>
					{ticket.number}
				</span>
			</span>
		</div>
	) : null

	// ── Header right : bouton de confirmation ─────────────────────────────────

	const headerRight = (
		<Button
			size='sm'
			onClick={() => convertMutation.mutate()}
			disabled={!selectedCustomer || convertMutation.isPending}
		>
			{convertMutation.isPending ? (
				<Loader2 className='h-4 w-4 animate-spin mr-2' />
			) : (
				<ArrowRight className='h-4 w-4 mr-2' />
			)}
			Créer la facture
		</Button>
	)

	// ── États intermédiaires ──────────────────────────────────────────────────

	if (isLoadingTicket || isLoadingConvertedInvoice) {
		return (
			<CashModuleShell
				pageTitle='Convertir en facture'
				pageIcon={FileText}
				hideSessionActions
				hideBadge
			>
				<div className='flex flex-1 items-center justify-center py-24'>
					<Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
				</div>
			</CashModuleShell>
		)
	}

	if (!ticket) {
		return (
			<CashModuleShell
				pageTitle='Convertir en facture'
				pageIcon={FileText}
				hideSessionActions
				hideBadge
				headerLeft={
					<Button
						variant='ghost'
						size='sm'
						className='-ml-2 text-muted-foreground hover:text-foreground'
						onClick={() => navigate({ to: '/cash/tickets' })}
					>
						<ArrowLeft className='h-4 w-4 mr-1.5' />
						Retour
					</Button>
				}
			>
				<div className='container mx-auto px-6 py-8 max-w-5xl'>
					<Card>
						<CardContent className='flex flex-col items-center justify-center p-8 space-y-4'>
							<AlertCircle className='h-12 w-12 text-red-500' />
							<div className='text-center'>
								<h3 className='text-lg font-bold'>Ticket introuvable</h3>
								<p className='text-muted-foreground'>
									Le ticket demandé n&apos;existe pas ou a été supprimé.
								</p>
							</div>
							<Button onClick={() => navigate({ to: '/cash/tickets' })}>
								Retour aux tickets
							</Button>
						</CardContent>
					</Card>
				</div>
			</CashModuleShell>
		)
	}

	if (isConverted) {
		return (
			<CashModuleShell
				pageTitle='Convertir en facture'
				pageIcon={FileText}
				hideSessionActions
				hideBadge
				headerLeft={headerLeft}
			>
				<div className='container mx-auto px-6 py-8 max-w-5xl'>
					<Card>
						<CardContent className='flex flex-col items-center justify-center p-8 space-y-4'>
							<CheckCircle2 className='h-12 w-12 text-emerald-500' />
							<div className='text-center'>
								<h3 className='text-lg font-bold'>Ticket déjà converti</h3>
								<p className='text-muted-foreground'>
									Ce ticket a déjà été converti en facture.
								</p>
							</div>
							<div className='flex gap-2'>
								<Button
									variant='outline'
									onClick={() => navigate({ to: '/cash/tickets' })}
								>
									Retour aux tickets
								</Button>
								{convertedInvoice && (
									<Button
										onClick={() =>
											navigate({
												to: '/connect/invoices/$invoiceId',
												params: { invoiceId: convertedInvoice.id },
											})
										}
									>
										Voir la facture
									</Button>
								)}
							</div>
						</CardContent>
					</Card>
				</div>
			</CashModuleShell>
		)
	}

	// ── Rendu principal ───────────────────────────────────────────────────────

	return (
		<CashModuleShell
			pageTitle='Convertir en facture'
			pageIcon={FileText}
			hideSessionActions
			hideBadge
			headerLeft={headerLeft}
			headerRight={headerRight}
		>
			<div className='container mx-auto px-6 py-6 max-w-5xl'>
				<div className='grid lg:grid-cols-3 gap-6'>
					{/* ── Colonne principale ────────────────────────────────── */}
					<div className='lg:col-span-2 space-y-6'>
						{/* Résumé ticket */}
						<Card>
							<CardHeader>
								<CardTitle className='text-lg flex items-center gap-2'>
									<Receipt className='h-5 w-5' />
									Ticket original
								</CardTitle>
								<CardDescription>
									Les données du ticket seront copiées dans la facture
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className='bg-muted/50 rounded-lg p-4 space-y-2'>
									<div className='flex justify-between'>
										<span className='text-sm text-muted-foreground'>
											Numéro
										</span>
										<span className='font-mono font-medium'>
											{ticket.number}
										</span>
									</div>
									<div className='flex justify-between'>
										<span className='text-sm text-muted-foreground'>Date</span>
										<span className='font-medium'>
											{formatDate(ticket.date)}
										</span>
									</div>
									<div className='flex justify-between'>
										<span className='text-sm text-muted-foreground'>
											Montant
										</span>
										<span className='font-bold text-lg'>
											{formatCurrency(ticket.total_ttc)}
										</span>
									</div>
									<div className='flex justify-between'>
										<span className='text-sm text-muted-foreground'>
											Paiement
										</span>
										<span className='font-medium'>
											{ticket.payment_method || 'especes'}
										</span>
									</div>
									{ticket.is_paid && (
										<div className='flex justify-between'>
											<span className='text-sm text-muted-foreground'>
												Payé le
											</span>
											<span className='font-medium'>
												{formatDate(ticket.paid_at || '')}
											</span>
										</div>
									)}
								</div>
							</CardContent>
						</Card>

						{/* Sélection client */}
						<Card>
							<CardHeader>
								<CardTitle className='text-lg flex items-center gap-2'>
									<User className='h-5 w-5' />
									Client *
								</CardTitle>
								<CardDescription>
									Sélectionnez un client existant ou créez-en un nouveau.
								</CardDescription>
							</CardHeader>
							<CardContent>
								{selectedCustomer ? (
									<div className='flex items-center justify-between p-3 border rounded-lg bg-muted/30'>
										<div>
											<p className='font-medium'>{selectedCustomer.name}</p>
											{selectedCustomer.company && (
												<p className='text-sm text-muted-foreground'>
													{selectedCustomer.company}
												</p>
											)}
											{selectedCustomer.email && (
												<p className='text-sm text-muted-foreground'>
													{selectedCustomer.email}
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
																		disabled={createCustomer.isPending}
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
																				setSelectedCustomer(customer)
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

						{/* Articles */}
						<Card>
							<CardHeader>
								<CardTitle className='text-lg'>Articles</CardTitle>
								<CardDescription>
									{ticket.items?.length || 0} ligne(s) dans ce ticket
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Article</TableHead>
											<TableHead className='text-center w-20'>Qté</TableHead>
											<TableHead className='text-right'>P.U. HT</TableHead>
											<TableHead className='text-right'>TVA</TableHead>
											<TableHead className='text-right'>Total TTC</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{ticket.items?.map((item: any, idx: number) => (
											<TableRow key={`${item.name}-${idx}`}>
												<TableCell className='font-medium'>
													{item.name}
												</TableCell>
												<TableCell className='text-center'>
													{item.quantity}
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
											</TableRow>
										))}
									</TableBody>
								</Table>

								<div className='mt-4 flex justify-end'>
									<div className='w-64 space-y-2 text-sm'>
										<div className='flex justify-between'>
											<span className='text-muted-foreground'>Total HT</span>
											<span>{formatCurrency(ticket.total_ht)}</span>
										</div>
										<div className='flex justify-between'>
											<span className='text-muted-foreground'>TVA</span>
											<span>{formatCurrency(ticket.total_tva)}</span>
										</div>
										<div className='flex justify-between font-bold text-lg border-t pt-2'>
											<span>Total TTC</span>
											<span>{formatCurrency(ticket.total_ttc)}</span>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Notes additionnelles */}
						<Card>
							<CardHeader>
								<CardTitle className='text-lg'>Notes complémentaires</CardTitle>
								<CardDescription>
									Notes à ajouter à la facture (optionnel)
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Textarea
									value={additionalNotes}
									onChange={(e) => setAdditionalNotes(e.target.value)}
									placeholder='Notes complémentaires pour la facture...'
									rows={3}
								/>
							</CardContent>
						</Card>
					</div>

					{/* ── Sidebar récapitulatif ─────────────────────────────── */}
					<div className='space-y-6'>
						<Card className='sticky top-[140px]'>
							<CardHeader>
								<CardTitle className='text-lg'>Récapitulatif</CardTitle>
							</CardHeader>
							<CardContent className='space-y-4'>
								<div className='space-y-2 text-sm'>
									<div className='flex justify-between'>
										<span className='text-muted-foreground'>Ticket</span>
										<span className='font-mono font-medium'>
											{ticket.number}
										</span>
									</div>
									<div className='flex justify-between'>
										<span className='text-muted-foreground'>Montant</span>
										<span className='font-bold'>
											{formatCurrency(ticket.total_ttc)}
										</span>
									</div>
									<div className='flex justify-between'>
										<span className='text-muted-foreground'>Client</span>
										<span
											className={
												selectedCustomer
													? 'font-medium'
													: 'text-muted-foreground italic'
											}
										>
											{selectedCustomer?.name ?? 'Non sélectionné'}
										</span>
									</div>
								</div>

								<div className='pt-2 border-t space-y-2'>
									<Button
										className='w-full'
										onClick={() => convertMutation.mutate()}
										disabled={!selectedCustomer || convertMutation.isPending}
									>
										{convertMutation.isPending ? (
											<>
												<Loader2 className='h-4 w-4 mr-2 animate-spin' />
												Conversion...
											</>
										) : (
											<>
												<ArrowRight className='h-4 w-4 mr-2' />
												Créer la facture
											</>
										)}
									</Button>
									<Button
										variant='outline'
										className='w-full'
										onClick={() => navigate({ to: '/cash/tickets' })}
										disabled={convertMutation.isPending}
									>
										Annuler
									</Button>
								</div>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>

			{/* Dialog nouveau client (complet) */}
			<CustomerDialog
				open={newCustomerDialogOpen}
				onOpenChange={setNewCustomerDialogOpen}
			/>
		</CashModuleShell>
	)
}
