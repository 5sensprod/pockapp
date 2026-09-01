import type { UseFormReturn } from 'react-hook-form'

import type { CatalogProductShape } from '@/lib/queries/catalog-products'
import type { GalleryEntry } from '@/lib/queries/gallery-order'

import { ProductDescriptionCard } from './ProductDescriptionCard'
import { ProductMediaPanel } from './ProductMediaPanel'
import { ProductOnlinePanel } from './ProductOnlinePanel'
import { DetailCard, DetailSection } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

type Props = {
	product: CatalogProductShape
	editing: boolean
	form: UseFormReturn<ProductDetailValues>
	gallery: GalleryEntry[]
	onGalleryChange: (value: GalleryEntry[]) => void
	currentImage: string | null
	onPromote: (filename: string) => void
	onRemoveMain: () => void
	promoting: boolean
	removingMain: boolean
	disabled: boolean
}

export function ProductSitePanel(props: Props) {
	return (
		<DetailCard title='Fiche sur le site' contentClassName='divide-y p-0'>
			<DetailSection title='Publication et qualité'>
				<ProductOnlinePanel
					product={props.product}
					editing={props.editing}
					form={props.form}
					embedded
				/>
			</DetailSection>

			<DetailSection title='Contenu éditorial'>
				<ProductDescriptionCard
					product={props.product}
					editing={props.editing}
					form={props.form}
					embedded
				/>
			</DetailSection>

			<DetailSection title='Visuels'>
				<ProductMediaPanel
					product={props.product}
					editing={props.editing}
					gallery={props.gallery}
					onGalleryChange={props.onGalleryChange}
					currentImage={props.currentImage}
					onPromote={props.onPromote}
					onRemoveMain={props.onRemoveMain}
					promoting={props.promoting}
					removingMain={props.removingMain}
					disabled={props.disabled}
					embedded
				/>
			</DetailSection>
		</DetailCard>
	)
}
