// frontend/modules/connect/pages/customers/ConsignmentTab.tsx
//
// Onglet Produits d'occasion (dépôt-vente), extrait de CustomerDetailPage.

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
import { Textarea } from '@/components/ui/textarea'
import type {
	CompaniesResponse,
	CustomersResponse,
} from '@/lib/pocketbase-types'
import {
	type ConsignmentItemDto,
	type UpdateConsignmentItemDto,
	useConsignmentItems,
	useCreateConsignmentItem,
	useDeleteConsignmentItem,
	useUpdateConsignmentItem,
} from '@/lib/queries/consignmentItems'
import { zodResolver } from '@hookform/resolvers/zod'
import { PDFDownloadLink } from '@react-pdf/renderer'
import {
	FileDown,
	Guitar,
	Mail,
	MoreHorizontal,
	Pencil,
	Plus,
	Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import * as z from 'zod'
import { SendConsignmentEmailDialog } from '../../dialogs/SendConsignmentEmailDialog'
import { ConsignmentPdfDocument } from '../../pdf/ConsignmentPdf'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { getConsignmentStatus } from '../../utils/statusConfig'

// ============================================================================
// SCHEMA
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
// PROPS
// ============================================================================

export interface ConsignmentTabProps {
	customerId: string
	ownerCompanyId: string
	customer: CustomersResponse
	company?: CompaniesResponse
	companyLogoUrl?: string | null
	commissionRate?: number
	tabsList?: React.ReactNode // 👈 L'interface accepte maintenant tabsList
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ConsignmentTab({
	customerId,
	ownerCompanyId,
	customer,
	company,
	companyLogoUrl,
	commissionRate = 20,
	tabsList, // 👈 On récupère la prop ici
}: ConsignmentTabProps) {
	const [dialogOpen, setDialogOpen] = useState(false)
	const [editItem, setEditItem] = useState<ConsignmentItemDto | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<ConsignmentItemDto | null>(
		null,
	)
	const [emailItem, setEmailItem] = useState<ConsignmentItemDto | null>(null)

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
			{/* 🎯 Injection conditionnelle des onglets ou du titre classique */}
			<CardHeader className='flex flex-row items-center justify-between pb-4 border-b border-border/40'>
				{tabsList ? (
					tabsList
				) : (
					<CardTitle className='flex items-center gap-2'>
						<Guitar className='h-5 w-5' />
						Produits d'occasion
					</CardTitle>
				)}
				<Button size='sm' className='gap-2' onClick={openCreate}>
					<Plus className='h-4 w-4' />
					Ajouter un produit d'occasion
				</Button>
			</CardHeader>

			<CardContent className='pt-6'>
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
								const statusInfo = getConsignmentStatus(item.status)
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
													{company && (
														<DropdownMenuItem asChild>
															<PDFDownloadLink
																document={
																	<ConsignmentPdfDocument
																		item={item}
																		customer={customer}
																		company={company}
																		companyLogoUrl={companyLogoUrl}
																		commissionRate={commissionRate}
																	/>
																}
																fileName={`depot-vente-${item.id.slice(0, 6)}.pdf`}
																className='flex items-center w-full px-2 py-1.5 text-sm cursor-pointer'
															>
																{({ loading }) => (
																	<>
																		<FileDown className='h-4 w-4 mr-2' />
																		{loading
																			? 'Génération...'
																			: 'Bordereau PDF'}
																	</>
																)}
															</PDFDownloadLink>
														</DropdownMenuItem>
													)}
													<DropdownMenuSeparator />
													<DropdownMenuItem onClick={() => setEmailItem(item)}>
														<Mail className='h-4 w-4 mr-2' />
														Envoyer par email
													</DropdownMenuItem>
													<DropdownMenuSeparator />
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

			{/* Dialog Email bordereau */}
			{company && emailItem && (
				<SendConsignmentEmailDialog
					open={!!emailItem}
					onOpenChange={(open) => {
						if (!open) setEmailItem(null)
					}}
					item={emailItem}
					customer={customer}
					company={company}
					companyLogoUrl={companyLogoUrl}
					commissionRate={commissionRate}
				/>
			)}

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
