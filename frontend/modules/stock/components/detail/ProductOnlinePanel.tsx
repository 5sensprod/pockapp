import { Loader2, RefreshCw, ScanSearch } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import type { CatalogProductShape } from '@/lib/queries/catalog-products'
import {
	type CatalogProduct,
	useCatalogBrands,
	useCatalogCategories,
} from '@/lib/queries/site-catalog'
import { usePocketBase } from '@/lib/use-pocketbase'
import {
	useCatalogInventory,
	useProductChecksums,
} from '@/modules/site/hooks/use-catalog-sync'
import {
	computeEntityImageChecksum,
	toProductImageBearing,
	useImageInventory,
} from '@/modules/site/hooks/use-image-sync'
import { syncStateOf } from '@/modules/site/lib/catalog-export'

import { DetailCard } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'
import { ProductPublicationControl } from './ProductPublicationControl'

const NONE: never[] = []
type ImageState = 'checking' | 'modified' | 'synced' | 'unknown'

export function ProductOnlinePanel({
	product,
	editing,
	form,
}: {
	product: CatalogProductShape
	editing: boolean
	form: UseFormReturn<ProductDetailValues>
}) {
	const pb = usePocketBase()
	const inventory = useCatalogInventory(true)
	const imageInventory = useImageInventory(true)
	const categories = useCatalogCategories()
	const brands = useCatalogBrands()
	const siteProduct = product as CatalogProduct
	const checksums = useProductChecksums(
		[siteProduct],
		categories.data ?? NONE,
		brands.data ?? NONE,
		Boolean(inventory.data),
	)
	const [imageState, setImageState] = useState<ImageState>('unknown')
	const imageCount = (product.image ? 1 : 0) + (product.gallery?.length ?? 0)
	const dataState = inventory.data
		? syncStateOf(
				product.legacy_id,
				checksums.get(product.legacy_id),
				inventory.data.products,
			)
		: undefined

	useEffect(() => {
		setImageState('unknown')
	}, [product.id])

	const checkImages = async () => {
		if (imageCount === 0) {
			setImageState('synced')
			return
		}
		setImageState('checking')
		try {
			let remoteProducts = imageInventory.data?.products
			if (!remoteProducts) {
				remoteProducts = (await imageInventory.refetch()).data?.products
			}
			if (!remoteProducts) {
				setImageState('unknown')
				return
			}
			const local = await computeEntityImageChecksum(
				toProductImageBearing(pb, siteProduct),
			)
			const remote = remoteProducts[product.legacy_id]
			setImageState(local === remote ? 'synced' : 'modified')
		} catch {
			setImageState('unknown')
		}
	}

	const dataLabel = inventory.isLoading
		? 'Vérification…'
		: dataState === 'absent'
			? 'Jamais envoyé'
			: dataState === 'modified'
				? 'Modifié depuis le dernier envoi'
				: dataState === 'synced'
					? 'Déjà à jour'
					: 'État non mesuré'
	const imageLabel =
		imageCount === 0
			? 'Aucune image'
			: imageState === 'checking'
				? `${imageCount} image${imageCount > 1 ? 's' : ''} — vérification…`
				: imageState === 'modified'
					? `${imageCount} image${imageCount > 1 ? 's' : ''} — modifiées depuis le dernier envoi`
					: imageState === 'synced'
						? `${imageCount} image${imageCount > 1 ? 's' : ''} — déjà à jour en ligne`
						: `${imageCount} image${imageCount > 1 ? 's' : ''} — état non mesuré`

	return (
		<DetailCard title='En ligne'>
			<div className='space-y-4 text-sm'>
				<ProductPublicationControl
					product={product}
					editing={editing}
					form={form}
				/>
				<div className='flex items-center justify-between gap-3'>
					<span>Fiche</span>
					<span className='text-right text-muted-foreground'>{dataLabel}</span>
				</div>
				<div className='space-y-2'>
					<div className='flex items-start justify-between gap-3'>
						<span>Images</span>
						<span className='text-right text-muted-foreground'>
							{imageLabel}
						</span>
					</div>
					{imageCount > 0 && (
						<Button
							type='button'
							variant='outline'
							size='sm'
							className='w-full'
							onClick={checkImages}
							disabled={imageState === 'checking'}
						>
							{imageState === 'checking' ? (
								<Loader2 className='mr-2 h-4 w-4 animate-spin' />
							) : (
								<ScanSearch className='mr-2 h-4 w-4' />
							)}
							Vérifier les images
						</Button>
					)}
				</div>
				{inventory.error && (
					<p className='text-muted-foreground text-xs'>
						<RefreshCw className='mr-1 inline h-3 w-3' />
						État du site indisponible.
					</p>
				)}
			</div>
		</DetailCard>
	)
}
