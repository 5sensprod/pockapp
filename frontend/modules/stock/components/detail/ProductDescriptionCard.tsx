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
import { Textarea } from '@/components/ui/textarea'
import type { CatalogProductShape } from '@/lib/queries/catalog-products'

import { DetailCard } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'
import { ProductOnlineEditorialDialog } from './ProductOnlineEditorialDialog'

export function ProductDescriptionCard({
	product,
	editing,
	form,
}: {
	product: CatalogProductShape
	editing: boolean
	form: UseFormReturn<ProductDetailValues>
}) {
	const [assistantOpen, setAssistantOpen] = useState(false)
	const [assistantDraft, setAssistantDraft] = useState({
		name: '',
		description: '',
	})

	const openAssistant = () => {
		setAssistantDraft({
			name: form.getValues('name'),
			description: form.getValues('description') ?? '',
		})
		setAssistantOpen(true)
	}

	return (
		<>
			<DetailCard title='Description'>
				{editing ? (
					<FormField
						control={form.control}
						name='description'
						render={({ field }) => (
							<FormItem>
								<FormLabel>Texte du produit</FormLabel>
								<FormControl>
									<Textarea rows={8} {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				) : product.description ? (
					<p className='whitespace-pre-wrap text-sm leading-relaxed'>
						{product.description}
					</p>
				) : (
					<p className='text-muted-foreground text-sm'>Aucune description.</p>
				)}
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
			</DetailCard>
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
