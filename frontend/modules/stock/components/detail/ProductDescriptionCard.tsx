import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import {
	HtmlContentEditor,
	HtmlContentPreview,
} from '@/components/ui/html-content'
import { Input } from '@/components/ui/input'
import type { CatalogProductShape } from '@/lib/queries/catalog-products'
import { useCategories } from '@/lib/queries/categories'
import { ProductSheetStudio } from '@/modules/site/components/online-catalog/ProductSheetStudio'

import { DetailCard, HelpTooltip, ReadValue } from './detail-primitives'
import {
	type ProductDetailValues,
	nomFicheParDefaut,
} from './product-detail-form'

export function ProductDescriptionCard({
	product,
	editing,
	form,
	embedded = false,
	brandName,
	onSaveNow,
	saving,
}: {
	product: CatalogProductShape
	editing: boolean
	form: UseFormReturn<ProductDetailValues>
	embedded?: boolean
	brandName?: string
	/** Enregistre la fiche entière. Le studio s'en sert pour tenir sa promesse
	 *  d'un seul geste final ; sans lui, il n'ouvrirait qu'un brouillon. */
	onSaveNow?: () => Promise<unknown>
	saving?: boolean
}) {
	const [studioOpen, setStudioOpen] = useState(false)
	const categories = useCategories()
	const nomFicheRepris =
		nomFicheParDefaut(product) !== (product.name ?? '').trim()
	const draftName = form.watch('name')
	const draftDescription = form.watch('description')

	const content = (
		<>
			<div className='space-y-4'>
				{editing ? (
					<FormField
						control={form.control}
						name='name'
						render={({ field }) => (
							<FormItem>
								<FormLabel className='flex items-center'>
									Nom de la fiche en ligne *
									<HelpTooltip text='Nom qui figure sur le site' />
								</FormLabel>
								<FormControl>
									<Input placeholder='Guitare folk Alvarez' {...field} />
								</FormControl>
								{nomFicheRepris && (
									<p className='text-muted-foreground text-xs'>
										Le nom du ticket a été repris car l’ancien nom en ligne
										était vide ou identique à la référence. Enregistrer fixera
										ce titre pour le site.
									</p>
								)}
								<FormMessage />
							</FormItem>
						)}
					/>
				) : (
					<ReadValue label='Nom de la fiche en ligne' value={draftName} />
				)}

				{editing ? (
					<FormField
						control={form.control}
						name='description'
						render={({ field }) => (
							<FormItem>
								<FormLabel>Description affichée sur le site</FormLabel>
								<HtmlContentEditor
									value={field.value ?? ''}
									onChange={field.onChange}
									onBlur={field.onBlur}
									maxLength={20000}
									maxHeight={280}
									ariaLabel='Description affichée sur le site'
									placeholder='Saisissez la description visible sur le site…'
								/>
								<p className='text-muted-foreground text-xs'>
									La mise en forme HTML est conservée pour le site ; les balises
									restent invisibles ici.
								</p>
								<FormMessage />
							</FormItem>
						)}
					/>
				) : draftDescription ? (
					<HtmlContentPreview
						value={draftDescription}
						collapsible
						collapsedHeight={150}
					/>
				) : (
					<p className='text-muted-foreground text-sm'>Aucune description.</p>
				)}
			</div>
			{/* Le studio EST l'éditeur : il n'a pas à attendre qu'on ait ouvert la
			    carte, et il enregistre lui-même. C'est ce qui fait tomber le
			    parcours de sept gestes à trois. */}
			<Button
				type='button'
				variant='outline'
				className='mt-4 w-full'
				onClick={() => setStudioOpen(true)}
			>
				<Sparkles className='mr-2 h-4 w-4' />
				Rédiger la fiche du site
			</Button>
		</>
	)

	return (
		<>
			{embedded ? (
				content
			) : (
				<DetailCard title='Fiche sur le site'>{content}</DetailCard>
			)}
			<ProductSheetStudio
				open={studioOpen}
				onClose={() => setStudioOpen(false)}
				product={product}
				brandName={brandName}
				categoryNames={(categories.data ?? [])
					.filter((categorie: { id: string }) =>
						(form.getValues('categories') ?? []).includes(categorie.id),
					)
					.map((categorie: { name: string }) => categorie.name)}
				draft={{
					name: form.getValues('name'),
					description: form.getValues('description') ?? '',
				}}
				saving={saving}
				onSave={async ({ name, description }) => {
					// Les valeurs entrent dans le formulaire — chemin d'écriture
					// unique — puis on déclenche l'enregistrement de la fiche.
					form.setValue('name', name, {
						shouldDirty: true,
						shouldTouch: true,
						shouldValidate: true,
					})
					form.setValue('description', description, {
						shouldDirty: true,
						shouldTouch: true,
						shouldValidate: true,
					})
					await onSaveNow?.()
					setStudioOpen(false)
				}}
			/>
		</>
	)
}
