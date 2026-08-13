// frontend/modules/site/components/online-catalog/OnlineBrandGrid.tsx
//
// Les marques qui partent vers le site, avec leur logo et le nombre de
// produits publiés qu'elles portent.
//
// Le logo compte plus qu'il n'y paraît : le champ image des marques avait été
// supprimé du modèle sur une mesure « 0 logo sur 224 » faite sur la base
// périmée. La base de référence en porte 225 sur 287 — 199 auraient disparu
// sans que personne le voie (docs/DECISIONS.md, 2026-08-11). Les montrer, ici,
// c'est aussi les surveiller.

import type { CatalogBrand } from '@/lib/queries/site-catalog'
import { usePocketBase } from '@/lib/use-pocketbase'
import { cn } from '@/lib/utils'
import { Pencil } from 'lucide-react'

import { catalogImageUrl } from '../../lib/catalog-image'
import type { OnlineBrand } from '../../lib/online-catalog'

type Props = {
	brands: OnlineBrand[]
	selectedId: string | null
	onSelect: (brand: CatalogBrand | null) => void
	/** Ouvre l'éditeur de description. Seule retouche prévue sur une marque :
	 *  son nom n'est pas éditable ici, et son logo relève des images, reportées. */
	onEdit?: (brand: CatalogBrand) => void
}

export function OnlineBrandGrid({
	brands,
	selectedId,
	onSelect,
	onEdit,
}: Props) {
	const pb = usePocketBase() as any

	if (!brands.length) {
		return (
			<p className='py-12 text-center text-muted-foreground text-sm'>
				Aucune marque en ligne.
			</p>
		)
	}

	return (
		<div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'>
			{brands.map(({ brand, productCount }) => {
				const url = catalogImageUrl(pb, brand, '200x200')
				const isSelected = selectedId === brand.id

				return (
					// Le crayon est un FRÈRE du bouton de sélection, jamais son enfant :
					// un bouton dans un bouton est invalide, et le clic d'édition
					// déclencherait aussi le filtre de marque.
					<div key={brand.id} className='group relative'>
						{onEdit && (
							<button
								type='button'
								onClick={() => onEdit(brand)}
								title='Modifier la description affichée sur le site'
								className='absolute top-1.5 right-1.5 z-10 rounded-md border bg-background/90 p-1.5 opacity-0 shadow-sm transition-opacity hover:bg-accent focus-visible:opacity-100 group-hover:opacity-100'
							>
								<Pencil className='h-3.5 w-3.5' />
							</button>
						)}

						<button
							type='button'
							onClick={() => onSelect(isSelected ? null : brand)}
							className={cn(
								'flex w-full flex-col items-center gap-2 rounded-lg border bg-card p-3 transition-colors',
								isSelected
									? 'border-primary bg-accent'
									: 'hover:border-primary/40 hover:bg-accent/40',
							)}
						>
							<div className='flex h-16 w-full items-center justify-center'>
								{url ? (
									<img
										src={url}
										alt={brand.name}
										loading='lazy'
										className='max-h-16 max-w-full object-contain'
									/>
								) : (
									<span className='font-semibold text-muted-foreground text-sm'>
										{brand.name}
									</span>
								)}
							</div>

							<div className='text-center'>
								<p className='truncate font-medium text-xs' title={brand.name}>
									{brand.name}
								</p>
								<p className='text-muted-foreground text-xs tabular-nums'>
									{productCount} produit{productCount > 1 ? 's' : ''}
								</p>
							</div>
						</button>
					</div>
				)
			})}
		</div>
	)
}
