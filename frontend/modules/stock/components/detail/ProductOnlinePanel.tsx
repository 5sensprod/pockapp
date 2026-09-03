import { Loader2, RefreshCw, ScanSearch } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { productHealth } from '@/lib/queries/catalog-health'
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

const NONE: never[] = []
type ImageState = 'checking' | 'modified' | 'synced' | 'unknown'

export function ProductOnlinePanel({
	product,
	form,
	embedded = false,
}: {
	product: CatalogProductShape
	form: UseFormReturn<ProductDetailValues>
	embedded?: boolean
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
	const editedHealthValues = form.watch([
		'name',
		'description',
		'categories',
		'price_ttc',
	])
	const health = productHealth({
		...product,
		name: editedHealthValues[0],
		description: editedHealthValues[1],
		categories: editedHealthValues[2],
		price_ttc: editedHealthValues[3],
	})
	const imageCount = (product.image ? 1 : 0) + (product.gallery?.length ?? 0)
	const dataState = inventory.data
		? syncStateOf(
				product.legacy_id,
				checksums.get(product.legacy_id),
				inventory.data.products,
			)
		: undefined

	// biome-ignore lint/correctness/useExhaustiveDependencies: une nouvelle fiche doit remettre cette vérification locale à zéro
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

	const content = (
		<div className='space-y-3 text-sm'>
			<div className='flex items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] p-3'>
				<div className='grid h-11 w-11 shrink-0 place-items-center rounded-full bg-background font-extrabold text-emerald-700 text-xs shadow-sm'>
					{health.score}/{health.max}
				</div>
				<div>
					<p className='font-semibold text-sm'>
						{health.missing.length ? 'Fiche à compléter' : 'Fiche complète'}
					</p>
					<p className='mt-0.5 text-emerald-900/65 text-[11px]'>
						{health.missing.length
							? `À compléter : ${health.missing.join(', ')}.`
							: 'Tous les éléments nécessaires au site sont présents.'}
					</p>
				</div>
			</div>
			<div className='flex items-center justify-between gap-3'>
				<span>Fiche</span>
				<span className='text-right text-muted-foreground'>{dataLabel}</span>
			</div>
			<div className='space-y-2'>
				<div className='flex items-start justify-between gap-3'>
					<span>Images</span>
					<span className='text-right text-muted-foreground'>{imageLabel}</span>
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
	)

	return embedded ? (
		content
	) : (
		<DetailCard title='En ligne'>{content}</DetailCard>
	)
}
