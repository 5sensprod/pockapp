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
import type { CatalogCategoryShape } from '@/lib/queries/catalog-shapes'
import { useCreateCategory, useUpdateCategory } from '@/lib/queries/categories'
import { pocketbaseErrorMessage } from '@/lib/queries/pb-error'
import { toast } from 'sonner'
import { CategoryPicker } from './CategoryPicker'

// `order`, `icon` et `color` ont disparu du formulaire : aucun des trois
// n'existe dans la collection installée (§6bis.4 du rituel AppStock). Ils
// étaient saisis puis ignorés à l'écriture — et `order` prétendait un
// classement manuel que le modèle ne porte plus.
//
// `description` et `is_featured` les remplacent : ce sont les deux champs que
// le site consomme réellement. `slug` reste hors du formulaire — l'URL est
// figée au premier envoi, le serveur en est le gardien (§4.5 du contrat).
const categorySchema = z.object({
	name: z.string().min(1, 'Le nom est requis').max(255),
	parent: z.string().optional(),
	description: z.string().max(20000).optional(),
	is_featured: z.boolean().optional(),
})

type CategoryFormValues = z.infer<typeof categorySchema>

interface CategoryDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	category?: CatalogCategoryShape | null
	defaultParentId?: string
}

export function CategoryDialog({
	open,
	onOpenChange,
	category = null,
	defaultParentId,
}: CategoryDialogProps) {
	const isEdit = !!category
	const { activeCompanyId } = useActiveCompany()
	const createCategory = useCreateCategory()
	const updateCategory = useUpdateCategory()

	const form = useForm<CategoryFormValues>({
		resolver: zodResolver(categorySchema),
		defaultValues: {
			name: '',
			parent: undefined,
			description: '',
			is_featured: false,
		},
	})

	useEffect(() => {
		if (open) {
			form.reset({
				name: category?.name ?? '',
				parent: category?.parent || defaultParentId || undefined,
				description: category?.description ?? '',
				is_featured: category?.is_featured ?? false,
			})
		}
	}, [open, category, defaultParentId, form])

	const onSubmit = async (data: CategoryFormValues) => {
		// `parent` part en chaîne vide à la racine, jamais en `undefined` : côté
		// PocketBase, une relation vide EST la chaîne vide, et `undefined`
		// laisserait l'ancien parent en place — une catégorie qu'on remonte à la
		// racine y resterait accrochée.
		const payload = {
			name: data.name.trim(),
			parent: data.parent || '',
			description: data.description ?? '',
			is_featured: data.is_featured ?? false,
		}

		try {
			if (isEdit && category) {
				await updateCategory.mutateAsync({ id: category.id, data: payload })
				toast.success('Catégorie modifiée')
			} else {
				if (!activeCompanyId) {
					toast.error('Aucune entreprise active')
					return
				}
				await createCategory.mutateAsync({
					...payload,
					company: activeCompanyId,
				})
				toast.success('Catégorie créée')
			}
			onOpenChange(false)
		} catch (error) {
			const detail = pocketbaseErrorMessage(error)
			toast.error(`Enregistrement refusé : ${detail}`)
			console.error(error)
		}
	}

	// IDs à exclure : la catégorie en cours d'édition (pour éviter les boucles)
	const excludeIds = category ? [category.id] : []

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-md max-h-[90vh] overflow-y-auto'>
				<DialogHeader>
					<DialogTitle>
						{isEdit ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
					</DialogTitle>
					<DialogDescription>
						{isEdit
							? 'Modifiez les informations'
							: 'Ajoutez une nouvelle catégorie'}
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
										<Input placeholder='Boissons' {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name='parent'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Catégorie parente</FormLabel>
									<CategoryPicker
										value={field.value ?? ''}
										onChange={(val) => field.onChange(val || undefined)}
										multiple={false}
										showNone={true}
										noneLabel='Aucune (racine)'
										excludeIds={excludeIds}
										searchPlaceholder='Rechercher une catégorie...'
										maxHeight='180px'
										companyId={activeCompanyId ?? undefined}
									/>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name='description'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Description</FormLabel>
									<FormControl>
										<Textarea
											placeholder='Le texte lu par le visiteur sur la page de la catégorie.'
											rows={4}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name='is_featured'
							render={({ field }) => (
								<FormItem className='flex items-center justify-between rounded-lg border p-3'>
									<div>
										<FormLabel>Mise en avant</FormLabel>
										<p className='text-muted-foreground text-sm'>
											Signale la catégorie comme mise en avant sur le site.
										</p>
									</div>
									<FormControl>
										<Switch
											checked={field.value ?? false}
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
								disabled={createCategory.isPending || updateCategory.isPending}
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
