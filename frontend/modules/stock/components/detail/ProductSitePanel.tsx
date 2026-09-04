import type { UseFormReturn } from 'react-hook-form'

import { Switch } from '@/components/ui/switch'
import type { CatalogProductShape } from '@/lib/queries/catalog-products'
import type { GalleryEntry } from '@/lib/queries/gallery-order'

import { ProductDescriptionCard } from './ProductDescriptionCard'
import { ProductMediaPanel } from './ProductMediaPanel'
import { ProductOnlinePanel } from './ProductOnlinePanel'
import { DetailStatusCard, EditableDetailCard } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'
import type { ProductDetailSection } from './useProductDetailEditor'

type Props = {
	product: CatalogProductShape
	activeSection: ProductDetailSection | null
	dirtySections: Record<ProductDetailSection, boolean>
	onEdit: (section: ProductDetailSection) => void
	form: UseFormReturn<ProductDetailValues>
	gallery: GalleryEntry[]
	onGalleryChange: (value: GalleryEntry[]) => void
	currentImage: string | null
	onPromote: (filename: string) => void
	onDesignateMain: (entry: GalleryEntry) => void
	pendingMain: File | null
	onSaveNow?: () => Promise<boolean>
	saving?: boolean
	onRemoveMain: () => void
	promoting: boolean
	removingMain: boolean
	disabled: boolean
}

export function ProductSitePanel(props: Props) {
	const status = props.form.watch('status')
	const published = status === 'published'

	return (
		<div className='grid gap-4'>
			<EditableDetailCard
				title='Visuels'
				banner='Vous pouvez maintenant ajouter ou réorganiser les images.'
				editing={props.activeSection === 'visuals'}
				dirty={props.dirtySections.visuals}
				onEdit={() => props.onEdit('visuals')}
			>
				<ProductMediaPanel
					product={props.product}
					editing={props.activeSection === 'visuals'}
					gallery={props.gallery}
					onGalleryChange={props.onGalleryChange}
					currentImage={props.currentImage}
					onPromote={props.onPromote}
					onDesignateMain={props.onDesignateMain}
					pendingMain={props.pendingMain}
					onRemoveMain={props.onRemoveMain}
					promoting={props.promoting}
					removingMain={props.removingMain}
					disabled={props.disabled}
					embedded
				/>
			</EditableDetailCard>
			<DetailStatusCard
				title='Publication'
				dirty={Boolean(props.form.formState.dirtyFields.status)}
				muted={!published}
				headerRight={
					<div className='flex items-center gap-2.5'>
						<span
							className={
								published
									? 'font-semibold text-emerald-700 text-xs dark:text-emerald-300'
									: 'font-semibold text-muted-foreground text-xs'
							}
						>
							{published ? 'Publié' : 'Brouillon'}
						</span>
						<Switch
							checked={published}
							onCheckedChange={(checked) =>
								props.form.setValue('status', checked ? 'published' : 'draft', {
									shouldDirty: true,
									shouldTouch: true,
									shouldValidate: true,
								})
							}
							aria-label={
								published ? 'Passer en brouillon' : 'Publier la fiche'
							}
						/>
					</div>
				}
			>
				<ProductOnlinePanel
					product={props.product}
					form={props.form}
					embedded
				/>
			</DetailStatusCard>

			<EditableDetailCard
				title='Contenu éditorial'
				banner='Vous pouvez maintenant modifier les contenus visibles en ligne.'
				editing={props.activeSection === 'content'}
				dirty={props.dirtySections.content}
				onEdit={() => props.onEdit('content')}
			>
				<ProductDescriptionCard
					product={props.product}
					editing={props.activeSection === 'content'}
					form={props.form}
					embedded
					onSaveNow={props.onSaveNow}
					saving={props.saving}
				/>
			</EditableDetailCard>
		</div>
	)
}
