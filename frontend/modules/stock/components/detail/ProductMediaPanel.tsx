import { ImageOff, Images } from 'lucide-react'

import { GalleryField } from '@/components/ui/gallery-field'
import type { CatalogProductShape } from '@/lib/queries/catalog-products'
import type { GalleryEntry } from '@/lib/queries/gallery-order'
import { usePocketBase } from '@/lib/use-pocketbase'

import { DetailCard } from './detail-primitives'

type Props = {
	product: CatalogProductShape
	editing: boolean
	gallery: GalleryEntry[]
	onGalleryChange: (value: GalleryEntry[]) => void
	currentImage: string | null
	onPromote: (filename: string) => void
	onRemoveMain: () => void
	promoting: boolean
	removingMain: boolean
	disabled: boolean
}

export function ProductMediaPanel(props: Props) {
	const pb = usePocketBase()
	const urlOf = (filename: string) => pb.files.getUrl(props.product, filename)
	const mainName = props.currentImage ?? props.product.image ?? ''
	const mainUrl = mainName ? urlOf(mainName) : null

	return (
		<DetailCard title='Images'>
			{props.editing ? (
				<GalleryField
					mainUrl={mainUrl}
					value={props.gallery}
					onChange={props.onGalleryChange}
					urlDe={urlOf}
					onPromote={props.onPromote}
					promoting={props.promoting}
					onRemoveMain={props.onRemoveMain}
					removingMain={props.removingMain}
					disabled={props.disabled}
					optimize={{ maxSide: 1600 }}
				/>
			) : (
				<div className='space-y-3'>
					<div className='flex h-44 items-center justify-center overflow-hidden rounded-lg border bg-muted/30'>
						{mainUrl ? (
							<img
								src={mainUrl}
								alt={props.product.name}
								className='h-full w-full object-contain'
							/>
						) : (
							<ImageOff className='h-10 w-10 text-muted-foreground/50' />
						)}
					</div>
					<div>
						<p className='mb-2 flex items-center gap-2 text-muted-foreground text-xs'>
							<Images className='h-3.5 w-3.5' />
							{props.gallery.length} image{props.gallery.length > 1 ? 's' : ''}{' '}
							en galerie
						</p>
						<div className='grid grid-cols-4 gap-2'>
							{props.gallery.map(
								(entry) =>
									typeof entry === 'string' && (
										<img
											key={entry}
											src={urlOf(entry)}
											alt=''
											className='aspect-square w-full rounded-md border object-contain'
										/>
									),
							)}
						</div>
					</div>
				</div>
			)}
		</DetailCard>
	)
}
