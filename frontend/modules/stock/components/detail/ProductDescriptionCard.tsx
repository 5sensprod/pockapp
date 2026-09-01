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

import { ProductOnlineEditorialDialog } from './ProductOnlineEditorialDialog'
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
}: {
	product: CatalogProductShape
	editing: boolean
	form: UseFormReturn<ProductDetailValues>
	embedded?: boolean
}) {
	const [assistantOpen, setAssistantOpen] = useState(false)
	const [assistantDraft, setAssistantDraft] = useState({
		name: '',
		description: '',
	})
	const nomFicheRepris =
		nomFicheParDefaut(product) !== (product.name ?? '').trim()

	const openAssistant = () => {
		setAssistantDraft({
			name: form.getValues('name'),
			description: form.getValues('description') ?? '',
		})
		setAssistantOpen(true)
	}

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
					<ReadValue label='Nom de la fiche en ligne' value={product.name} />
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
				) : product.description ? (
					<HtmlContentPreview
						value={product.description}
						collapsible
						collapsedHeight={150}
					/>
				) : (
					<p className='text-muted-foreground text-sm'>Aucune description.</p>
				)}
			</div>
			<span
				className='mt-4 block'
				title={
					!editing
						? 'Activez « Modifier » pour utiliser l’assistant'
						: undefined
				}
			>
				<Button
					type='button'
					variant='outline'
					className='w-full'
					onClick={openAssistant}
					disabled={!editing}
				>
					<Sparkles className='mr-2 h-4 w-4' />
					Assistant Gemini
				</Button>
			</span>
		</>
	)

	return (
		<>
			{embedded ? (
				content
			) : (
				<DetailCard title='Fiche sur le site'>{content}</DetailCard>
			)}
			<ProductOnlineEditorialDialog
				product={product}
				draft={assistantDraft}
				open={assistantOpen && editing}
				onClose={() => setAssistantOpen(false)}
				onApply={({ name, description }) => {
					form.setValue('name', name ?? form.getValues('name'), {
						shouldDirty: true,
						shouldTouch: true,
						shouldValidate: true,
					})
					form.setValue('description', description, {
						shouldDirty: true,
						shouldTouch: true,
						shouldValidate: true,
					})
				}}
			/>
		</>
	)
}
