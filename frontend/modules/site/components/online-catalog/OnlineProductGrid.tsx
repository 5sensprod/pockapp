// frontend/modules/site/components/online-catalog/OnlineProductGrid.tsx
//
// Les produits en cards, et non en table : l'objet de cette vue est de voir le
// catalogue **comme le site le montrera** — une image, un nom, un prix — pas
// d'en éplucher les colonnes. `ProductTable` reste l'outil de gestion.

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CatalogBrand, CatalogProduct } from '@/lib/queries/site-catalog'
import { usePocketBase } from '@/lib/use-pocketbase'
import { cn } from '@/lib/utils'
import { CloudUpload, ImageOff, Pencil, RefreshCw } from 'lucide-react'

import type { SyncState } from '../../lib/catalog-export'
import { catalogImageUrl } from '../../lib/catalog-image'

const euros = new Intl.NumberFormat('fr-FR', {
	style: 'currency',
	currency: 'EUR',
})

type Props = {
	products: CatalogProduct[]
	brandsById: Map<string, CatalogBrand>
	emptyLabel?: string
	/** legacy_id → état vis-à-vis de la base SQL. Absente tant que l'inventaire
	 *  n'a pas été lu : la grille s'affiche alors sans aucune pastille, plutôt
	 *  que de déclarer tout le monde absent. */
	syncStates?: Map<string, SyncState>
	onExport?: (product: CatalogProduct) => void
	exporting?: boolean
	/** Ouvre l'éditeur des textes du site. Disponible quel que soit l'état de
	 *  synchronisation : corriger un nom AVANT le premier export est le cas le
	 *  plus fréquent, puisque beaucoup de produits ont pour nom leur référence. */
	onEdit?: (product: CatalogProduct) => void
}

export function OnlineProductGrid({
	products,
	brandsById,
	emptyLabel = 'Aucun produit en ligne ici.',
	syncStates,
	onExport,
	exporting,
	onEdit,
}: Props) {
	const pb = usePocketBase() as any

	if (!products.length) {
		return (
			<p className='py-12 text-center text-muted-foreground text-sm'>
				{emptyLabel}
			</p>
		)
	}

	return (
		<div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
			{products.map((product) => {
				const url = catalogImageUrl(pb, product, '300x300')
				const brand = product.brand ? brandsById.get(product.brand) : undefined
				const state = syncStates?.get(product.legacy_id)

				// Grisé = pas encore dans la base SQL du site. La carte reste
				// lisible — c'est un état, pas une erreur — mais elle se distingue
				// au premier coup d'œil de ce qui est déjà en ligne.
				const absent = state === 'absent'

				return (
					<article
						key={product.id}
						className={cn(
							'group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md',
							absent && 'border-dashed bg-muted/30',
						)}
					>
						{/* Le crayon est posé SUR la carte, hors du bloc image : celui-ci
						    est grisé quand le produit est absent du site, et l'action
						    d'édition, elle, reste pleinement disponible — corriger un nom
						    avant le premier export est le cas le plus fréquent. */}
						{onEdit && (
							<button
								type='button'
								onClick={() => onEdit(product)}
								title='Modifier le nom et la description affichés sur le site'
								className='absolute top-1.5 right-1.5 z-10 rounded-md border bg-background/90 p-1.5 opacity-0 shadow-sm transition-opacity hover:bg-accent focus-visible:opacity-100 group-hover:opacity-100'
							>
								<Pencil className='h-3.5 w-3.5' />
							</button>
						)}

						<div
							className={cn(
								'relative flex aspect-square items-center justify-center bg-muted/40',
								absent && 'opacity-45 grayscale',
							)}
						>
							{url ? (
								<img
									src={url}
									alt={product.name}
									loading='lazy'
									className='h-full w-full object-contain'
								/>
							) : (
								// L'absence d'image se voit : 36 images n'existent que sur
								// WordPress et ne survivront pas à la bascule du site.
								<ImageOff className='h-8 w-8 text-muted-foreground/50' />
							)}
						</div>

						<div className='flex flex-1 flex-col gap-1 p-3'>
							<p
								className={cn(
									'line-clamp-2 font-medium text-sm leading-tight',
									absent && 'text-muted-foreground',
								)}
								title={product.name}
							>
								{product.name}
							</p>

							{brand && (
								<span className='text-muted-foreground text-xs'>
									{brand.name}
								</span>
							)}

							<div className='mt-auto flex items-center justify-between pt-2'>
								<span
									className={cn(
										'font-semibold text-sm tabular-nums',
										absent && 'text-muted-foreground',
									)}
								>
									{typeof product.price_ttc === 'number'
										? euros.format(product.price_ttc)
										: '—'}
								</span>
								{product.sku && (
									<Badge variant='outline' className='font-mono text-[10px]'>
										{product.sku}
									</Badge>
								)}
							</div>

							{/* L'action est la SEULE possible sur une carte grisée : le
							    produit n'existe pas encore côté site, il n'y a rien à
							    modifier tant qu'il n'y est pas. */}
							{absent && onExport && (
								<Button
									size='sm'
									variant='outline'
									className='mt-2 w-full'
									disabled={exporting}
									onClick={() => onExport(product)}
								>
									<CloudUpload className='mr-1.5 h-3.5 w-3.5' />
									Exporter
								</Button>
							)}

							{state === 'modified' && onExport && (
								<Button
									size='sm'
									variant='secondary'
									className='mt-2 w-full'
									disabled={exporting}
									onClick={() => onExport(product)}
									title='Le produit a changé depuis son dernier export'
								>
									<RefreshCw className='mr-1.5 h-3.5 w-3.5' />
									Mettre à jour
								</Button>
							)}
						</div>
					</article>
				)
			})}
		</div>
	)
}
