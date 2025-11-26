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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import type { SuppliersResponse } from '@/lib/pocketbase-types'
import { useBrands } from '@/lib/queries/brands'
import { useCreateSupplier, useUpdateSupplier } from '@/lib/queries/suppliers'
import { toast } from 'sonner'

const supplierSchema = z.object({
	name: z.string().min(1, 'Le nom est requis').max(100),
	email: z.string().email('Email invalide').optional().or(z.literal('')),
	phone: z.string().max(30).optional(),
	address: z.string().max(500).optional(),
	contact: z.string().max(100).optional(),
	brands: z.array(z.string()).optional(),
	notes: z.string().max(1000).optional(),
	active: z.boolean().optional(),
})

type SupplierFormValues = z.infer<typeof supplierSchema>

interface SupplierDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	supplier?: SuppliersResponse | null
}

export function SupplierDialog({
	open,
	onOpenChange,
	supplier = null,
}: SupplierDialogProps) {
	const isEdit = !!supplier
	const { activeCompanyId } = useActiveCompany()
	const createSupplier = useCreateSupplier()
	const updateSupplier = useUpdateSupplier()
	const { data: brands } = useBrands({
		companyId: activeCompanyId ?? undefined,
	})

	const form = useForm<SupplierFormValues>({
		resolver: zodResolver(supplierSchema),
		defaultValues: {
			name: '',
			email: '',
			phone: '',
			address: '',
			contact: '',
			brands: [],
			notes: '',
			active: true,
		},
	})

	useEffect(() => {
		if (open) {
			form.reset({
				name: supplier?.name ?? '',
				email: supplier?.email ?? '',
				phone: supplier?.phone ?? '',
				address: supplier?.address ?? '',
				contact: supplier?.contact ?? '',
				brands: supplier?.brands ?? [],
				notes: supplier?.notes ?? '',
				active: supplier?.active ?? true,
			})
		}
	}, [open, supplier, form])

	const onSubmit = async (data: SupplierFormValues) => {
		try {
			if (isEdit && supplier) {
				const payload = {
					name: data.name,
					email: data.email || undefined,
					phone: data.phone || undefined,
					address: data.address || undefined,
					contact: data.contact || undefined,
					brands: data.brands?.length ? data.brands : undefined,
					notes: data.notes || undefined,
					active: data.active,
				}
				await updateSupplier.mutateAsync({ id: supplier.id, data: payload })
				toast.success('Fournisseur modifié')
			} else {
				if (!activeCompanyId) {
					toast.error('Aucune entreprise active')
					return
				}
				const payload = {
					name: data.name,
					email: data.email || undefined,
					phone: data.phone || undefined,
					address: data.address || undefined,
					contact: data.contact || undefined,
					brands: data.brands?.length ? data.brands : undefined,
					notes: data.notes || undefined,
					active: data.active,
					company: activeCompanyId,
				}
				await createSupplier.mutateAsync(payload)
				toast.success('Fournisseur créé')
			}
			onOpenChange(false)
		} catch (error) {
			toast.error('Une erreur est survenue')
			console.error(error)
		}
	}

	const toggleBrand = (brandId: string) => {
		const current = form.getValues('brands') || []
		if (current.includes(brandId)) {
			form.setValue(
				'brands',
				current.filter((id) => id !== brandId),
			)
		} else {
			form.setValue('brands', [...current, brandId])
		}
	}

	const selectedBrands = form.watch('brands') || []

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-lg max-h-[90vh] overflow-y-auto'>
				<DialogHeader>
					<DialogTitle>
						{isEdit ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}
					</DialogTitle>
					<DialogDescription>
						{isEdit
							? 'Modifiez les informations'
							: 'Ajoutez un nouveau fournisseur'}
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
										<Input placeholder='Metro Cash & Carry' {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className='grid grid-cols-2 gap-4'>
							<FormField
								control={form.control}
								name='email'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Email</FormLabel>
										<FormControl>
											<Input
												type='email'
												placeholder='contact@metro.fr'
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name='phone'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Téléphone</FormLabel>
										<FormControl>
											<Input placeholder='+33 1 23 45 67 89' {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<FormField
							control={form.control}
							name='contact'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Nom du contact</FormLabel>
									<FormControl>
										<Input placeholder='Jean Dupont' {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name='address'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Adresse</FormLabel>
									<FormControl>
										<Textarea
											placeholder='123 rue du Commerce, 75001 Paris'
											rows={2}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Marques distribuées */}
						<FormField
							control={form.control}
							name='brands'
							render={() => (
								<FormItem>
									<FormLabel>Marques distribuées</FormLabel>
									<div className='flex flex-wrap gap-2 p-3 border rounded-md min-h-[42px]'>
										{brands?.map((brand) => {
											const isSelected = selectedBrands.includes(brand.id)
											return (
												<button
													key={brand.id}
													type='button'
													onClick={() => toggleBrand(brand.id)}
													className={`px-2 py-1 text-xs rounded-full transition-colors ${
														isSelected
															? 'bg-primary text-primary-foreground'
															: 'bg-muted hover:bg-muted/80'
													}`}
												>
													{brand.name}
												</button>
											)
										})}
										{!brands?.length && (
											<span className='text-sm text-muted-foreground'>
												Aucune marque
											</span>
										)}
									</div>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name='notes'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Notes</FormLabel>
									<FormControl>
										<Textarea
											placeholder='Notes internes...'
											rows={2}
											{...field}
										/>
									</FormControl>
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
											Fournisseur actif
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
								disabled={createSupplier.isPending || updateSupplier.isPending}
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
