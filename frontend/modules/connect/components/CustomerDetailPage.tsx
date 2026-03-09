// frontend/modules/connect/components/CustomerDetailPage.tsx

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import {
	type ConsignmentItemDto,
	type UpdateConsignmentItemDto,
	useConsignmentItems,
	useCreateConsignmentItem,
	useDeleteConsignmentItem,
	useUpdateConsignmentItem,
} from '@/lib/queries/consignmentItems'
import { useCustomer } from '@/lib/queries/customers'
import { useInvoices } from '@/lib/queries/invoices'
import { useQuotes } from '@/lib/queries/quotes'
import type { InvoiceResponse, QuoteResponse } from '@/lib/types/invoice.types'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
	ArrowLeft,
	Building2,
	CheckCircle,
	Clock,
	FileText,
	Guitar,
	Landmark,
	Mail,
	MoreHorizontal,
	Pencil,
	Phone,
	Plus,
	Receipt,
	Trash2,
	User,
	Users,
	XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

// ============================================================================
// HELPERS
// ============================================================================

const formatDate = (dateString?: string) => {
	if (!dateString) return '-'
	return new Date(dateString).toLocaleDateString('fr-FR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	})
}

const formatCurrency = (amount?: number) => {
	if (amount === undefined || amount === null) return '-'
	return new Intl.NumberFormat('fr-FR', {
		style: 'currency',
		currency: 'EUR',
	}).format(amount)
}

const getCustomerTypeDisplay = (type?: string) => {
	const typeMap: Record<
		string,
		{ label: string; className: string; icon: any }
	> = {
		individual: {
			label: 'Particulier',
			className: 'bg-blue-100 text-blue-800',
			icon: User,
		},
		professional: {
			label: 'Professionnel',
			className: 'bg-purple-100 text-purple-800',
			icon: Building2,
		},
		administration: {
			label: 'Administration',
			className: 'bg-green-100 text-green-800',
			icon: Landmark,
		},
		association: {
			label: 'Association',
			className: 'bg-orange-100 text-orange-800',
			icon: Users,
		},
	}
	return typeMap[type || 'individual'] || typeMap.individual
}

const getPaymentTermsLabel = (terms?: string) => {
	const termsMap: Record<string, string> = {
		immediate: 'Immédiat',
		'30_days': '30 jours',
		'45_days': '45 jours',
		'60_days': '60 jours',
	}
	return termsMap[terms || 'immediate'] || 'Immédiat'
}

const invoiceStatusConfig: Record<
	string,
	{
		label: string
		variant: 'default' | 'secondary' | 'destructive' | 'outline'
	}
> = {
	draft: { label: 'Brouillon', variant: 'secondary' },
	validated: { label: 'Validée', variant: 'default' },
	sent: { label: 'Envoyée', variant: 'default' },
	cancelled: { label: 'Annulée', variant: 'destructive' },
}

const quoteStatusConfig: Record<
	string,
	{
		label: string
		variant: 'default' | 'secondary' | 'destructive' | 'outline'
	}
> = {
	draft: { label: 'Brouillon', variant: 'secondary' },
	sent: { label: 'Envoyé', variant: 'default' },
	accepted: { label: 'Accepté', variant: 'default' },
	rejected: { label: 'Refusé', variant: 'destructive' },
}

const consignmentStatusConfig: Record<
	string,
	{ label: string; className: string }
> = {
	available: { label: 'Disponible', className: 'bg-green-100 text-green-800' },
	sold: { label: 'Vendu', className: 'bg-blue-100 text-blue-800' },
	returned: { label: 'Rendu', className: 'bg-gray-100 text-gray-800' },
}

// ============================================================================
// SCHEMA — formulaire dépôt-vente
// ============================================================================

const consignmentSchema = z.object({
	description: z
		.string()
		.min(2, 'La description doit faire au moins 2 caractères')
		.max(1000),
	seller_price: z.coerce
		.number({ invalid_type_error: 'Prix invalide' })
		.min(0, 'Le prix doit être positif'),
	store_price: z.coerce
		.number({ invalid_type_error: 'Prix invalide' })
		.min(0, 'Le prix doit être positif'),
	notes: z.string().max(2000).optional(),
})

type ConsignmentFormValues = z.infer<typeof consignmentSchema>

// ============================================================================
// SUB-COMPONENT — onglet Produits d'occasion
// ============================================================================

interface ConsignmentTabProps {
	customerId: string
	ownerCompanyId: string
}

function ConsignmentTab({ customerId, ownerCompanyId }: ConsignmentTabProps) {
	const [dialogOpen, setDialogOpen] = useState(false)
	const [editItem, setEditItem] = useState<ConsignmentItemDto | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<ConsignmentItemDto | null>(
		null,
	)

	const { data, isLoading } = useConsignmentItems(customerId)
	const createItem = useCreateConsignmentItem()
	const updateItem = useUpdateConsignmentItem()
	const deleteItem = useDeleteConsignmentItem(customerId)

	const items = data?.items ?? []

	const form = useForm<ConsignmentFormValues>({
		resolver: zodResolver(consignmentSchema),
		defaultValues: {
			description: '',
			seller_price: 0,
			store_price: 0,
			notes: '',
		},
	})

	const openCreate = () => {
		setEditItem(null)
		form.reset({ description: '', seller_price: 0, store_price: 0, notes: '' })
		setDialogOpen(true)
	}

	const openEdit = (item: ConsignmentItemDto) => {
		setEditItem(item)
		form.reset({
			description: item.description,
			seller_price: item.seller_price,
			store_price: item.store_price,
			notes: item.notes ?? '',
		})
		setDialogOpen(true)
	}

	const onSubmit = async (data: ConsignmentFormValues) => {
		try {
			if (editItem) {
				const payload: UpdateConsignmentItemDto = {
					description: data.description,
					seller_price: data.seller_price,
					store_price: data.store_price,
					notes: data.notes,
				}
				await updateItem.mutateAsync({
					id: editItem.id,
					data: payload,
					customerId,
				})
				toast.success('Produit mis à jour')
			} else {
				await createItem.mutateAsync({
					...data,
					status: 'available',
					customer: customerId,
					owner_company: ownerCompanyId,
				})
				toast.success('Produit ajouté')
			}
			setDialogOpen(false)
		} catch (err) {
			console.error(err)
			toast.error('Une erreur est survenue')
		}
	}

	const handleChangeStatus = async (
		item: ConsignmentItemDto,
		status: ConsignmentItemDto['status'],
	) => {
		try {
			await updateItem.mutateAsync({
				id: item.id,
				data: { status },
				customerId,
			})
			toast.success('Statut mis à jour')
		} catch {
			toast.error('Erreur lors du changement de statut')
		}
	}

	const confirmDelete = async () => {
		if (!deleteTarget) return
		try {
			await deleteItem.mutateAsync(deleteTarget.id)
			toast.success(`Produit "${deleteTarget.description}" supprimé`)
		} catch {
			toast.error('Erreur lors de la suppression')
		} finally {
			setDeleteTarget(null)
		}
	}

	return (
		<Card>
			<CardHeader className='flex flex-row items-center justify-between'>
				<CardTitle className='flex items-center gap-2'>
					<Guitar className='h-5 w-5' />
					Produits d'occasion
				</CardTitle>
				<Button size='sm' className='gap-2' onClick={openCreate}>
					<Plus className='h-4 w-4' />
					Ajouter un produit d'occasion
				</Button>
			</CardHeader>

			<CardContent>
				{isLoading ? (
					<p className='text-muted-foreground py-4'>Chargement...</p>
				) : items.length === 0 ? (
					<div className='text-center py-10 text-muted-foreground'>
						<Guitar className='h-12 w-12 mx-auto mb-3 opacity-30' />
						<p className='mb-1 font-medium'>Aucun produit en dépôt-vente</p>
						<p className='text-sm mb-4'>
							Ce client n'a pas encore déposé d'instrument.
						</p>
						<Button
							variant='outline'
							size='sm'
							className='gap-2'
							onClick={openCreate}
						>
							<Plus className='h-4 w-4' />
							Ajouter un produit d'occasion
						</Button>
					</div>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Description</TableHead>
								<TableHead>Prix vendeur</TableHead>
								<TableHead>Prix magasin</TableHead>
								<TableHead>Statut</TableHead>
								<TableHead>Déposé le</TableHead>
								<TableHead className='w-10' />
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((item) => {
								const statusInfo =
									consignmentStatusConfig[item.status] ??
									consignmentStatusConfig.available
								return (
									<TableRow key={item.id}>
										<TableCell>
											<div className='font-medium'>{item.description}</div>
											{item.notes && (
												<div className='text-xs text-muted-foreground mt-0.5 max-w-xs truncate'>
													{item.notes}
												</div>
											)}
										</TableCell>
										<TableCell>{formatCurrency(item.seller_price)}</TableCell>
										<TableCell className='font-medium'>
											{formatCurrency(item.store_price)}
										</TableCell>
										<TableCell>
											<Badge
												variant='secondary'
												className={statusInfo.className}
											>
												{statusInfo.label}
											</Badge>
										</TableCell>
										<TableCell className='text-muted-foreground text-sm'>
											{formatDate(item.created)}
										</TableCell>
										<TableCell>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button variant='ghost' className='h-8 w-8 p-0'>
														<span className='sr-only'>Menu</span>
														<MoreHorizontal className='h-4 w-4' />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align='end'>
													<DropdownMenuItem onClick={() => openEdit(item)}>
														<Pencil className='h-4 w-4 mr-2' />
														Modifier
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													{item.status !== 'available' && (
														<DropdownMenuItem
															onClick={() =>
																handleChangeStatus(item, 'available')
															}
														>
															Marquer disponible
														</DropdownMenuItem>
													)}
													{item.status !== 'sold' && (
														<DropdownMenuItem
															onClick={() => handleChangeStatus(item, 'sold')}
														>
															Marquer vendu
														</DropdownMenuItem>
													)}
													{item.status !== 'returned' && (
														<DropdownMenuItem
															onClick={() =>
																handleChangeStatus(item, 'returned')
															}
														>
															Marquer rendu
														</DropdownMenuItem>
													)}
													<DropdownMenuSeparator />
													<DropdownMenuItem
														className='text-red-600'
														onClick={() => setDeleteTarget(item)}
													>
														<Trash2 className='h-4 w-4 mr-2' />
														Supprimer
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</TableCell>
									</TableRow>
								)
							})}
						</TableBody>
					</Table>
				)}
			</CardContent>

			{/* Dialog Création / Édition */}
			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className='max-w-lg'>
					<DialogHeader>
						<DialogTitle className='flex items-center gap-2'>
							<Guitar className='h-5 w-5' />
							{editItem
								? 'Modifier le produit'
								: "Ajouter un produit d'occasion"}
						</DialogTitle>
						<DialogDescription>
							{editItem
								? 'Mettez à jour les informations de ce produit en dépôt-vente.'
								: "Renseignez les informations de l'instrument déposé par ce client."}
						</DialogDescription>
					</DialogHeader>

					<Form {...form}>
						<form
							onSubmit={form.handleSubmit(onSubmit)}
							className='space-y-4 pt-2'
						>
							{/* Description */}
							<FormField
								control={form.control}
								name='description'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Description *</FormLabel>
										<FormControl>
											<Textarea
												placeholder='Ex : Guitare acoustique Yamaha F310, bon état, légères rayures...'
												rows={3}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Prix */}
							<div className='grid grid-cols-2 gap-4'>
								<FormField
									control={form.control}
									name='seller_price'
									render={({ field }) => (
										<FormItem>
											<FormLabel>Prix vendeur (€) *</FormLabel>
											<FormControl>
												<Input
													type='number'
													min='0'
													step='0.01'
													placeholder='150.00'
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name='store_price'
									render={({ field }) => (
										<FormItem>
											<FormLabel>Prix magasin (€) *</FormLabel>
											<FormControl>
												<Input
													type='number'
													min='0'
													step='0.01'
													placeholder='180.00'
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							{/* Notes */}
							<FormField
								control={form.control}
								name='notes'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Notes internes</FormLabel>
										<FormControl>
											<Textarea
												placeholder='Observations, conditions de reprise, etc.'
												rows={2}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div className='flex justify-end gap-3 pt-2'>
								<Button
									type='button'
									variant='outline'
									onClick={() => setDialogOpen(false)}
								>
									Annuler
								</Button>
								<Button
									type='submit'
									disabled={createItem.isPending || updateItem.isPending}
								>
									{editItem ? 'Enregistrer' : 'Ajouter'}
								</Button>
							</div>
						</form>
					</Form>
				</DialogContent>
			</Dialog>

			{/* Dialog Suppression */}
			<Dialog
				open={!!deleteTarget}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null)
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Supprimer ce produit ?</DialogTitle>
						<DialogDescription>
							{deleteTarget
								? `Vous allez supprimer "${deleteTarget.description}". Cette action est définitive.`
								: ''}
						</DialogDescription>
					</DialogHeader>
					<div className='flex justify-end gap-2 pt-4'>
						<Button variant='outline' onClick={() => setDeleteTarget(null)}>
							Annuler
						</Button>
						<Button variant='destructive' onClick={confirmDelete}>
							Supprimer
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</Card>
	)
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export function CustomerDetailPage() {
	const { customerId } = useParams({ from: '/connect/customers/$customerId/' })
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()

	const { data: customer, isLoading: isLoadingCustomer } =
		useCustomer(customerId)

	const { data: invoicesData, isLoading: isLoadingInvoices } = useInvoices({
		companyId: activeCompanyId ?? undefined,
		customerId,
		sort: '-date',
		perPage: 100,
	})

	const { data: quotesData, isLoading: isLoadingQuotes } = useQuotes({
		companyId: activeCompanyId ?? undefined,
		customerId,
		sort: '-date',
		perPage: 100,
	})

	const { data: consignmentData } = useConsignmentItems(customerId)

	const invoices = invoicesData?.items ?? []
	const quotes = quotesData?.items ?? []
	const consignmentCount = consignmentData?.items?.length ?? 0

	const stats = {
		totalInvoices: invoices.length,
		totalQuotes: quotes.length,
		totalInvoiced: invoices.reduce((sum, inv) => sum + (inv.total_ttc || 0), 0),
		totalPaid: invoices
			.filter((inv) => inv.is_paid)
			.reduce((sum, inv) => sum + (inv.total_ttc || 0), 0),
		unpaidCount: invoices.filter(
			(inv) => !inv.is_paid && inv.status !== 'draft',
		).length,
		acceptedQuotes: quotes.filter((q) => q.status === 'accepted').length,
	}

	const customerType = (customer as any)?.customer_type || 'individual'
	const typeDisplay = getCustomerTypeDisplay(customerType)
	const TypeIcon = typeDisplay.icon
	const paymentTerms = (customer as any)?.payment_terms
	const isIndividual = customerType === 'individual'

	if (isLoadingCustomer) {
		return (
			<div className='container mx-auto px-6 py-8'>
				<p className='text-muted-foreground'>Chargement du client...</p>
			</div>
		)
	}

	if (!customer) {
		return (
			<div className='container mx-auto px-6 py-8'>
				<p className='text-muted-foreground'>Client introuvable</p>
				<Button
					variant='outline'
					className='mt-4'
					onClick={() => navigate({ to: '/connect/customers' })}
				>
					<ArrowLeft className='h-4 w-4 mr-2' />
					Retour aux clients
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
					onClick={() => navigate({ to: '/connect/customers' })}
				>
					<ArrowLeft className='h-5 w-5' />
				</Button>
				<div className='flex-1'>
					<h1 className='text-2xl font-bold flex items-center gap-2'>
						<TypeIcon className='h-6 w-6' />
						{customer.name}
					</h1>
					<p className='text-muted-foreground'>Fiche détaillée du client</p>
				</div>
				<Button
					onClick={() =>
						navigate({
							to: '/connect/customers/$customerId/edit',
							params: () => ({ customerId }),
						})
					}
				>
					Modifier
				</Button>
			</div>

			{/* Stats rapides */}
			<div className='grid grid-cols-2 md:grid-cols-4 gap-4 mb-6'>
				<Card>
					<CardContent className='pt-4'>
						<div className='text-2xl font-bold'>{stats.totalInvoices}</div>
						<p className='text-sm text-muted-foreground'>Factures</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className='pt-4'>
						<div className='text-2xl font-bold'>{stats.totalQuotes}</div>
						<p className='text-sm text-muted-foreground'>Devis</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className='pt-4'>
						<div className='text-2xl font-bold text-green-600'>
							{formatCurrency(stats.totalPaid)}
						</div>
						<p className='text-sm text-muted-foreground'>Payé</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className='pt-4'>
						<div className='text-2xl font-bold text-orange-600'>
							{stats.unpaidCount}
						</div>
						<p className='text-sm text-muted-foreground'>En attente</p>
					</CardContent>
				</Card>
			</div>

			{/* Tabs */}
			<Tabs defaultValue='info' className='space-y-4'>
				<TabsList>
					<TabsTrigger value='info'>Informations</TabsTrigger>
					<TabsTrigger value='invoices' className='gap-2'>
						<Receipt className='h-4 w-4' />
						Factures ({stats.totalInvoices})
					</TabsTrigger>
					<TabsTrigger value='quotes' className='gap-2'>
						<FileText className='h-4 w-4' />
						Devis ({stats.totalQuotes})
					</TabsTrigger>
					<TabsTrigger value='consignment' className='gap-2'>
						<Guitar className='h-4 w-4' />
						Occasion {consignmentCount > 0 && `(${consignmentCount})`}
					</TabsTrigger>
				</TabsList>

				{/* ── Tab Informations ── */}
				<TabsContent value='info'>
					<Card>
						<CardHeader>
							<CardTitle>Informations</CardTitle>
						</CardHeader>
						<CardContent className='space-y-4'>
							<div className='space-y-1'>
								<p className='text-sm text-muted-foreground'>Type de client</p>
								<Badge variant='secondary' className={typeDisplay.className}>
									<TypeIcon className='h-3 w-3 mr-1' />
									{typeDisplay.label}
								</Badge>
							</div>

							<div className='space-y-1'>
								<p className='text-sm text-muted-foreground'>Nom</p>
								<p className='font-medium'>{customer.name}</p>
							</div>

							<div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
								<div className='space-y-1'>
									<p className='text-sm text-muted-foreground'>Email</p>
									{customer.email ? (
										<a
											href={`mailto:${customer.email}`}
											className='flex items-center gap-2 text-blue-600 hover:underline'
										>
											<Mail className='h-4 w-4' />
											{customer.email}
										</a>
									) : (
										<p className='text-muted-foreground'>-</p>
									)}
								</div>
								<div className='space-y-1'>
									<p className='text-sm text-muted-foreground'>Téléphone</p>
									{customer.phone ? (
										<a
											href={`tel:${customer.phone}`}
											className='flex items-center gap-2 text-blue-600 hover:underline'
										>
											<Phone className='h-4 w-4' />
											{customer.phone}
										</a>
									) : (
										<p className='text-muted-foreground'>-</p>
									)}
								</div>
							</div>

							{!isIndividual && (
								<div className='space-y-1'>
									<p className='text-sm text-muted-foreground'>
										Entreprise / Organisation
									</p>
									<p className='font-medium'>{customer.company || '-'}</p>
								</div>
							)}

							{!isIndividual && (
								<div className='space-y-1'>
									<p className='text-sm text-muted-foreground'>
										Délai de paiement
									</p>
									<Badge variant='outline'>
										{getPaymentTermsLabel(paymentTerms)}
									</Badge>
								</div>
							)}

							<div className='space-y-1'>
								<p className='text-sm text-muted-foreground'>Tags</p>
								<div className='flex gap-1 flex-wrap'>
									{(() => {
										const rawTags = (customer as any).tags
										const tags: string[] = Array.isArray(rawTags)
											? rawTags
											: rawTags
												? [rawTags as string]
												: []
										const tagColors: Record<string, string> = {
											vip: 'bg-yellow-100 text-yellow-800',
											prospect: 'bg-blue-100 text-blue-800',
											actif: 'bg-green-100 text-green-800',
											inactif: 'bg-gray-100 text-gray-800',
										}
										return tags.length > 0 ? (
											tags.map((tag) => (
												<Badge
													key={tag}
													variant='secondary'
													className={tagColors[tag] || ''}
												>
													{tag}
												</Badge>
											))
										) : (
											<span className='text-muted-foreground'>-</span>
										)
									})()}
								</div>
							</div>

							<div className='space-y-1'>
								<p className='text-sm text-muted-foreground'>Adresse</p>
								<p className='font-medium whitespace-pre-line'>
									{customer.address || '-'}
								</p>
							</div>

							<div className='space-y-1'>
								<p className='text-sm text-muted-foreground'>Notes</p>
								<p className='font-medium whitespace-pre-line'>
									{customer.notes || '-'}
								</p>
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				{/* ── Tab Factures ── */}
				<TabsContent value='invoices'>
					<Card>
						<CardHeader className='flex flex-row items-center justify-between'>
							<CardTitle className='flex items-center gap-2'>
								<Receipt className='h-5 w-5' />
								Factures
							</CardTitle>
							<Button
								size='sm'
								className='gap-2'
								onClick={() => navigate({ to: '/connect/invoices/new' })}
							>
								<Plus className='h-4 w-4' />
								Nouvelle facture
							</Button>
						</CardHeader>
						<CardContent>
							{isLoadingInvoices ? (
								<p className='text-muted-foreground py-4'>Chargement...</p>
							) : invoices.length === 0 ? (
								<div className='text-center py-8 text-muted-foreground'>
									<Receipt className='h-12 w-12 mx-auto mb-2 opacity-30' />
									<p>Aucune facture pour ce client</p>
									<Button
										variant='outline'
										size='sm'
										className='mt-4 gap-2'
										onClick={() => navigate({ to: '/connect/invoices/new' })}
									>
										<Plus className='h-4 w-4' />
										Créer une facture
									</Button>
								</div>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Numéro</TableHead>
											<TableHead>Date</TableHead>
											<TableHead>Montant TTC</TableHead>
											<TableHead>Statut</TableHead>
											<TableHead>Paiement</TableHead>
											<TableHead className='w-10' />
										</TableRow>
									</TableHeader>
									<TableBody>
										{invoices.map((invoice: InvoiceResponse) => {
											const statusInfo =
												invoiceStatusConfig[invoice.status] ||
												invoiceStatusConfig.draft
											return (
												<TableRow
													key={invoice.id}
													className='cursor-pointer hover:bg-muted/50'
													onClick={() =>
														navigate({
															to: '/connect/invoices/$invoiceId',
															params: { invoiceId: invoice.id },
														})
													}
												>
													<TableCell className='font-medium'>
														{invoice.number || '-'}
													</TableCell>
													<TableCell>{formatDate(invoice.date)}</TableCell>
													<TableCell className='font-medium'>
														{formatCurrency(invoice.total_ttc)}
													</TableCell>
													<TableCell>
														<Badge variant={statusInfo.variant}>
															{statusInfo.label}
														</Badge>
													</TableCell>
													<TableCell>
														{invoice.is_paid ? (
															<span className='flex items-center gap-1 text-green-600'>
																<CheckCircle className='h-4 w-4' />
																Payé
															</span>
														) : invoice.status !== 'draft' ? (
															<span className='flex items-center gap-1 text-orange-600'>
																<Clock className='h-4 w-4' />
																En attente
															</span>
														) : (
															<span className='text-muted-foreground'>-</span>
														)}
													</TableCell>
													<TableCell>
														<Button
															variant='ghost'
															size='icon'
															className='h-8 w-8'
															onClick={(e) => {
																e.stopPropagation()
																navigate({
																	to: '/connect/invoices/$invoiceId',
																	params: { invoiceId: invoice.id },
																})
															}}
														>
															<ArrowLeft className='h-4 w-4 rotate-180' />
														</Button>
													</TableCell>
												</TableRow>
											)
										})}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				{/* ── Tab Devis ── */}
				<TabsContent value='quotes'>
					<Card>
						<CardHeader className='flex flex-row items-center justify-between'>
							<CardTitle className='flex items-center gap-2'>
								<FileText className='h-5 w-5' />
								Devis
							</CardTitle>
							<Button
								size='sm'
								className='gap-2'
								onClick={() => navigate({ to: '/connect/quotes/new' })}
							>
								<Plus className='h-4 w-4' />
								Nouveau devis
							</Button>
						</CardHeader>
						<CardContent>
							{isLoadingQuotes ? (
								<p className='text-muted-foreground py-4'>Chargement...</p>
							) : quotes.length === 0 ? (
								<div className='text-center py-8 text-muted-foreground'>
									<FileText className='h-12 w-12 mx-auto mb-2 opacity-30' />
									<p>Aucun devis pour ce client</p>
									<Button
										variant='outline'
										size='sm'
										className='mt-4 gap-2'
										onClick={() => navigate({ to: '/connect/quotes/new' })}
									>
										<Plus className='h-4 w-4' />
										Créer un devis
									</Button>
								</div>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Numéro</TableHead>
											<TableHead>Date</TableHead>
											<TableHead>Validité</TableHead>
											<TableHead>Montant TTC</TableHead>
											<TableHead>Statut</TableHead>
											<TableHead className='w-10' />
										</TableRow>
									</TableHeader>
									<TableBody>
										{quotes.map((quote: QuoteResponse) => {
											const statusInfo =
												quoteStatusConfig[quote.status] ||
												quoteStatusConfig.draft
											const isExpired =
												quote.valid_until &&
												new Date(quote.valid_until) < new Date() &&
												quote.status !== 'accepted'
											return (
												<TableRow
													key={quote.id}
													className='cursor-pointer hover:bg-muted/50'
													onClick={() =>
														navigate({
															to: '/connect/quotes/$quoteId',
															params: { quoteId: quote.id },
														})
													}
												>
													<TableCell className='font-medium'>
														{quote.number || '-'}
													</TableCell>
													<TableCell>{formatDate(quote.date)}</TableCell>
													<TableCell>
														{isExpired ? (
															<span className='flex items-center gap-1 text-red-600'>
																<XCircle className='h-4 w-4' />
																Expiré
															</span>
														) : (
															formatDate(quote.valid_until)
														)}
													</TableCell>
													<TableCell className='font-medium'>
														{formatCurrency(quote.total_ttc)}
													</TableCell>
													<TableCell>
														<Badge variant={statusInfo.variant}>
															{statusInfo.label}
														</Badge>
														{quote.generated_invoice_id && (
															<Badge variant='outline' className='ml-1'>
																Facturé
															</Badge>
														)}
													</TableCell>
													<TableCell>
														<Button
															variant='ghost'
															size='icon'
															className='h-8 w-8'
															onClick={(e) => {
																e.stopPropagation()
																navigate({
																	to: '/connect/quotes/$quoteId',
																	params: { quoteId: quote.id },
																})
															}}
														>
															<ArrowLeft className='h-4 w-4 rotate-180' />
														</Button>
													</TableCell>
												</TableRow>
											)
										})}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				{/* ── Tab Produits d'occasion ── */}
				<TabsContent value='consignment'>
					<ConsignmentTab
						customerId={customerId}
						ownerCompanyId={activeCompanyId ?? ''}
					/>
				</TabsContent>
			</Tabs>
		</div>
	)
}
