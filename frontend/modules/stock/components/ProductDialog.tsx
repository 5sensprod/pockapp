import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import type { ProductsResponse } from '@/lib/pocketbase-types'
import { useBrands } from '@/lib/queries/brands'
import { useCreateProduct, useUpdateProduct } from '@/lib/queries/products'
import { useSuppliers } from '@/lib/queries/suppliers'
import { toast } from 'sonner'
import { CategoryPicker } from './CategoryPicker'

const productSchema = z.object({
	name: z.string().min(1, 'Le nom est requis').max(200),
	barcode: z.string().max(50).optional(),
	price: z.coerce.number().min(0, 'Le prix doit être positif'),
	cost: z.coerce.number().min(0).optional(),
	stock: z.coerce.number().int().optional(),
	categories: z.array(z.string()).optional(),
	brand: z.string().optional(),
	supplier: z.string().optional(),
	active: z.boolean().optional(),
})

type ProductFormValues = z.infer<typeof productSchema>

interface ProductDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	product?: ProductsResponse | null
	defaultCategoryId?: string
}

export function ProductDialog({
	open,
	onOpenChange,
	product = null,
	defaultCategoryId,
}: ProductDialogProps) {
	const isEdit = !!product
	const createProduct = useCreateProduct()
	const updateProduct = useUpdateProduct()

	// ⭐ Récupérer l'entreprise active
	const { activeCompanyId } = useActiveCompany()

	// ⭐ Filtrer marques et fournisseurs par entreprise
	const { data: brands } = useBrands({
		companyId: activeCompanyId ?? undefined,
	})

	const { data: suppliers } = useSuppliers({
		companyId: activeCompanyId ?? undefined,
	})

	const form = useForm<ProductFormValues>({
		resolver: zodResolver(productSchema),
		defaultValues: {
			name: '',
			barcode: '',
			price: 0,
			cost: 0,
			stock: 0,
			categories: [],
			brand: '',
			supplier: '',
			active: true,
		},
	})

	useEffect(() => {
		if (open) {
			const defaultCategories = product?.categories?.length
				? product.categories
				: defaultCategoryId
					? [defaultCategoryId]
					: []

			form.reset({
				name: product?.name ?? '',
				barcode: product?.barcode ?? '',
				price: product?.price ?? 0,
				cost: product?.cost ?? 0,
				stock: product?.stock ?? 0,
				categories: defaultCategories,
				brand: product?.brand ?? '',
				supplier: product?.supplier ?? '',
				active: product?.active ?? true,
			})
		}
	}, [open, product, defaultCategoryId, form])

	const onSubmit = async (data: ProductFormValues) => {
		// ⭐ Vérifier qu'on a bien une entreprise active
		if (!activeCompanyId) {
			toast.error('Aucune entreprise active')
			return
		}

		try {
			const payload = {
				name: data.name,
				price: data.price,
				company: activeCompanyId, // ⭐ Ajouter l'ID de l'entreprise active
				barcode: data.barcode || undefined,
				cost: data.cost || undefined,
				stock: data.stock,
				categories: data.categories?.length ? data.categories : undefined,
				brand: data.brand || undefined,
				supplier: data.supplier || undefined,
				active: data.active,
			}

			if (isEdit && product) {
				await updateProduct.mutateAsync({ id: product.id, data: payload })
				toast.success('Produit modifié avec succès')
			} else {
				await createProduct.mutateAsync(payload)
				toast.success('Produit créé avec succès')
			}
			onOpenChange(false)
		} catch (error) {
			toast.error('Une erreur est survenue')
			console.error(error)
		}
	}

	// ⭐ Empêcher l'ouverture si aucune entreprise n'est active
	if (open && !activeCompanyId) {
		return (
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className='max-w-md'>
					<DialogHeader>
						<DialogTitle>Aucune entreprise active</DialogTitle>
						<DialogDescription>
							Veuillez sélectionner une entreprise avant de créer un produit.
						</DialogDescription>
					</DialogHeader>
					<div className='flex justify-end'>
						<Button onClick={() => onOpenChange(false)}>Fermer</Button>
					</div>
				</DialogContent>
			</Dialog>
		)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-lg max-h-[90vh] overflow-y-auto'>
				<DialogHeader>
					<DialogTitle>
						{isEdit ? 'Modifier le produit' : 'Nouveau produit'}
					</DialogTitle>
					<DialogDescription>
						{isEdit
							? 'Modifiez les informations du produit'
							: 'Ajoutez un nouveau produit au catalogue'}
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
						<FormField
							control={form.control}
							name='name'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Nom *</FormLabel>
									<FormControl>
										<Input placeholder='Coca-Cola 33cl' {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className='grid grid-cols-2 gap-4'>
							<FormField
								control={form.control}
								name='price'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Prix de vente (€) *</FormLabel>
										<FormControl>
											<Input
												type='number'
												step='0.01'
												min='0'
												placeholder='1.50'
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name='cost'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Prix d'achat (€)</FormLabel>
										<FormControl>
											<Input
												type='number'
												step='0.01'
												min='0'
												placeholder='0.80'
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className='grid grid-cols-2 gap-4'>
							<FormField
								control={form.control}
								name='stock'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Stock</FormLabel>
										<FormControl>
											<Input
												type='number'
												step='1'
												placeholder='100'
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name='barcode'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Code-barres</FormLabel>
										<FormControl>
											<Input placeholder='3760001234567' {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						{/* Catégories avec le nouveau picker */}
						<FormField
							control={form.control}
							name='categories'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Catégories</FormLabel>
									<CategoryPicker
										value={field.value ?? []}
										onChange={(val) => field.onChange(val)}
										multiple={true}
										showNone={false}
										searchPlaceholder='Rechercher une catégorie...'
										maxHeight='180px'
										companyId={activeCompanyId ?? undefined}
									/>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Marque */}
						<FormField
							control={form.control}
							name='brand'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Marque</FormLabel>
									<Select
										onValueChange={(value) =>
											field.onChange(value === '_none_' ? '' : value)
										}
										value={field.value || '_none_'}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder='Sélectionner une marque' />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value='_none_'>Aucune</SelectItem>
											{brands?.map((brand) => (
												<SelectItem key={brand.id} value={brand.id}>
													{brand.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Fournisseur */}
						<FormField
							control={form.control}
							name='supplier'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Fournisseur</FormLabel>
									<Select
										onValueChange={(value) =>
											field.onChange(value === '_none_' ? '' : value)
										}
										value={field.value || '_none_'}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder='Sélectionner un fournisseur' />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value='_none_'>Aucun</SelectItem>
											{suppliers?.map((supplier) => (
												<SelectItem key={supplier.id} value={supplier.id}>
													{supplier.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name='active'
							render={({ field }) => (
								<FormItem className='flex items-center justify-between rounded-lg border p-3'>
									<div>
										<FormLabel>Actif</FormLabel>
										<p className='text-sm text-muted-foreground'>
											Produit visible en caisse
										</p>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
								</FormItem>
							)}
						/>

						<div className='flex justify-end gap-3 pt-4'>
							<Button
								type='button'
								variant='outline'
								onClick={() => onOpenChange(false)}
							>
								Annuler
							</Button>
							<Button
								type='submit'
								disabled={createProduct.isPending || updateProduct.isPending}
							>
								{isEdit ? 'Modifier' : 'Créer'}
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
