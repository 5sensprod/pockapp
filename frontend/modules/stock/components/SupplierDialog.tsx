// frontend/modules/stock/components/SupplierDialog.tsx
//
// Le formulaire fournisseur, refait le 13 août 2026 sur les champs qui
// EXISTENT.
//
// Il décrivait jusque-là le schéma v1 : `email`, `phone`, `address`, `contact`,
// `notes`, `active`. Mesuré dans `_collections` de `pb_data/data.db`, la
// collection installée n'en porte aucun — elle porte `supplier_code`, `siren`,
// `contact_name`, `contact_email`, `contact_phone`, `contact_address`,
// `banking`, `payment_terms`, `brands`. Un enregistrement n'écrivait donc que
// le nom et les marques, en silence. §6bis.2 du rituel de migration AppStock.
//
// `banking` et `payment_terms` sont des champs JSON libres, sans forme
// contrainte au schéma : ils ne sont PAS dans ce formulaire, et c'est
// délibéré — saisir du JSON à la main dans une fiche fournisseur est un piège.
// Ils ne sont pas perdus pour autant : une mise à jour PocketBase est
// partielle, les champs absents du corps envoyé restent en place.
//
// ⚠️ Ne pas en conclure qu'ils sont sans effet sur ce formulaire : PocketBase
// valide TOUT l'enregistrement à chaque mise à jour, champs non envoyés
// compris. Déclarés sans `MaxSize`, donc à 0, ils faisaient échouer le moindre
// enregistrement — « The maximum allowed JSON size is 0 bytes ». Corrigé par
// `backend/migrations/fix_json_max_size.go`.

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
import { Textarea } from '@/components/ui/textarea'

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useBrands } from '@/lib/queries/brands'
import type { CatalogSupplierShape } from '@/lib/queries/catalog-shapes'
import { pocketbaseErrorMessage } from '@/lib/queries/pb-error'
import { useCreateSupplier, useUpdateSupplier } from '@/lib/queries/suppliers'
import { toast } from 'sonner'

const supplierSchema = z.object({
	name: z.string().min(1, 'Le nom est requis').max(255),
	supplier_code: z.string().max(50).optional(),
	// Le SIREN fait 9 chiffres. La règle est volontairement permissive sur le
	// vide — beaucoup de fiches héritées n'en ont pas — mais stricte dès qu'une
	// valeur est saisie : un SIREN à moitié tapé ne vaut pas mieux qu'absent.
	siren: z
		.string()
		.regex(/^\d{9}$/, 'Le SIREN fait 9 chiffres')
		.optional()
		.or(z.literal('')),
	contact_name: z.string().max(255).optional(),
	contact_email: z
		.string()
		.email('Email invalide')
		.optional()
		.or(z.literal('')),
	contact_phone: z.string().max(50).optional(),
	contact_address: z.string().max(500).optional(),
	brands: z.array(z.string()).optional(),
})

type SupplierFormValues = z.infer<typeof supplierSchema>

interface SupplierDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	supplier?: CatalogSupplierShape | null
}

const EMPTY: SupplierFormValues = {
	name: '',
	supplier_code: '',
	siren: '',
	contact_name: '',
	contact_email: '',
	contact_phone: '',
	contact_address: '',
	brands: [],
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
		defaultValues: EMPTY,
	})

	useEffect(() => {
		if (!open) return
		form.reset({
			name: supplier?.name ?? '',
			supplier_code: supplier?.supplier_code ?? '',
			siren: supplier?.siren ?? '',
			contact_name: supplier?.contact_name ?? '',
			contact_email: supplier?.contact_email ?? '',
			contact_phone: supplier?.contact_phone ?? '',
			contact_address: supplier?.contact_address ?? '',
			brands: supplier?.brands ?? [],
		})
	}, [open, supplier, form])

	const onSubmit = async (data: SupplierFormValues) => {
		// Les champs vides partent en chaîne vide, jamais en `undefined` : c'est
		// ainsi qu'on EFFACE une valeur côté PocketBase. `undefined` serait retiré
		// du corps JSON, et l'ancienne valeur resterait en base — un champ vidé à
		// l'écran qui se remplit tout seul au rechargement.
		const payload = {
			name: data.name.trim(),
			supplier_code: data.supplier_code ?? '',
			siren: data.siren ?? '',
			contact_name: data.contact_name ?? '',
			contact_email: data.contact_email ?? '',
			contact_phone: data.contact_phone ?? '',
			contact_address: data.contact_address ?? '',
			brands: data.brands ?? [],
		}

		try {
			if (isEdit && supplier) {
				await updateSupplier.mutateAsync({ id: supplier.id, data: payload })
				toast.success('Fournisseur modifié')
			} else {
				if (!activeCompanyId) {
					toast.error('Aucune entreprise active')
					return
				}
				await createSupplier.mutateAsync({
					...payload,
					company: activeCompanyId,
				})
				toast.success('Fournisseur créé')
			}
			onOpenChange(false)
		} catch (error) {
			// Le message de PocketBase nomme le champ fautif ; le jeter obligeait à
			// ouvrir la console pour savoir ce qui avait été refusé.
			const detail = pocketbaseErrorMessage(error)
			toast.error(`Enregistrement refusé : ${detail}`)
			console.error(error)
		}
	}

	const toggleBrand = (brandId: string) => {
		const current = form.getValues('brands') || []
		form.setValue(
			'brands',
			current.includes(brandId)
				? current.filter((id) => id !== brandId)
				: [...current, brandId],
		)
	}

	const selectedBrands = form.watch('brands') || []

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-h-[90vh] max-w-lg overflow-y-auto'>
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
										<Input placeholder='Yamaha Music Europe' {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className='grid grid-cols-2 gap-4'>
							<FormField
								control={form.control}
								name='supplier_code'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Code fournisseur</FormLabel>
										<FormControl>
											<Input placeholder='YAM01' {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name='siren'
								render={({ field }) => (
									<FormItem>
										<FormLabel>SIREN</FormLabel>
										<FormControl>
											<Input
												inputMode='numeric'
												placeholder='123456789'
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
							name='contact_name'
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

						<div className='grid grid-cols-2 gap-4'>
							<FormField
								control={form.control}
								name='contact_email'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Email</FormLabel>
										<FormControl>
											<Input
												type='email'
												placeholder='contact@yamaha.fr'
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name='contact_phone'
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
							name='contact_address'
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
									<div className='flex min-h-[42px] flex-wrap gap-2 rounded-md border p-3'>
										{brands?.map((brand) => {
											const isSelected = selectedBrands.includes(brand.id)
											return (
												<button
													key={brand.id}
													type='button'
													onClick={() => toggleBrand(brand.id)}
													className={`rounded-full px-2 py-1 text-xs transition-colors ${
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
											<span className='text-muted-foreground text-sm'>
												Aucune marque
											</span>
										)}
									</div>
									<FormMessage />
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
