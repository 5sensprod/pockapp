import { Pencil, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'

import { useBrands } from '@/lib/queries/brands'
import type { CatalogProductShape } from '@/lib/queries/catalog-products'
import { useCategories } from '@/lib/queries/categories'
import { cn } from '@/lib/utils'
import { ProductSheetStudio } from '@/modules/site/components/online-catalog/ProductSheetStudio'

import { ProductWebLinksSection } from './ProductWebLinksSection'
import { DetailStatusCard } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

/** Le texte brut d'une description HTML, blocs séparés par une espace : c'est
 *  un aperçu, jamais du HTML injecté dans la page. */
function texteBrut(html: string): string {
	const separe = html.replace(/<\/(p|div|li|h[1-6]|tr)>|<br\s*\/?>/gi, ' ')
	const doc = new DOMParser().parseFromString(separe, 'text/html')
	return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

// « Contenu éditorial » : la carte est réduite à son titre et à une icône. Le
// nom de la fiche en ligne, la description ET les liens et vidéos s'écrivent
// tous dans la modale « Fiche du site » (`ProductSheetStudio`) — un seul endroit
// pour la fiche web, qui enregistre elle-même.
export function ProductDescriptionCard({
	product,
	form,
	onSaveNow,
	saving,
	dirty = false,
	webLinksDirty = false,
}: {
	product: CatalogProductShape
	form: UseFormReturn<ProductDetailValues>
	/** Enregistre la fiche entière. Le studio s'en sert pour tenir sa promesse
	 *  d'un seul geste final ; sans lui, il n'ouvrirait qu'un brouillon. */
	onSaveNow?: () => Promise<boolean>
	saving?: boolean
	dirty?: boolean
	webLinksDirty?: boolean
}) {
	const [studioOpen, setStudioOpen] = useState(false)
	const categories = useCategories()
	const brands = useBrands()

	// ── LE BROUILLON COMPLET, POUR L'ASSISTANT ──────────────────────────────
	// `watch` et non `getValues` : une désignation ou une marque tout juste
	// choisie doit atteindre le studio SANS enregistrement préalable, et
	// `getValues` ne redéclenche aucun rendu. Le formulaire est déjà la source
	// de ce qui sera écrit — « Enregistrer la fiche » l'enregistre en entier —,
	// il doit donc être aussi la source de ce que l'assistant lit.
	const brouillon = form.watch()
	const apercu = useMemo(
		() => texteBrut(brouillon.description ?? ''),
		[brouillon.description],
	)
	const titre = (brouillon.name ?? '').trim()
	// Du contenu existe déjà : on le montre, et l'icône devient un stylo.
	const rempli = apercu !== ''
	const marqueDuBrouillon = (brands.data ?? []).find(
		(marque: { id: string }) => marque.id === brouillon.brand,
	) as { name?: string } | undefined
	const categoriesDuBrouillon = (categories.data ?? [])
		.filter((categorie: { id: string }) =>
			(brouillon.categories ?? []).includes(categorie.id),
		)
		.map((categorie: { name: string }) => categorie.name)

	return (
		<>
			<DetailStatusCard
				title='Contenu éditorial'
				dirty={dirty}
				headerRight={
					// Même gabarit que l'interrupteur des cartes voisines : la piste, et
					// une pastille qui porte l'icône. Pleine (contenu présent) ou vide.
					<button
						type='button'
						title={
							rempli ? 'Modifier la fiche du site' : 'Rédiger la fiche du site'
						}
						aria-pressed={studioOpen}
						aria-label={
							rempli ? 'Modifier la fiche du site' : 'Rédiger la fiche du site'
						}
						onClick={() => setStudioOpen(true)}
						className={cn(
							'inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
							rempli || studioOpen
								? 'justify-end bg-primary'
								: 'justify-start bg-input',
						)}
					>
						<span className='flex h-5 w-5 items-center justify-center rounded-full bg-background text-foreground shadow-lg'>
							{rempli ? (
								<Pencil className='h-3 w-3' />
							) : (
								<Sparkles className='h-3 w-3' />
							)}
						</span>
					</button>
				}
			>
				{rempli && (
					<div className='space-y-1'>
						<p className='truncate font-semibold text-sm'>{titre}</p>
						<p className='line-clamp-3 text-muted-foreground text-sm'>
							{apercu}
						</p>
					</div>
				)}
			</DetailStatusCard>
			<ProductSheetStudio
				open={studioOpen}
				onClose={() => setStudioOpen(false)}
				product={product}
				draft={{
					name: brouillon.name,
					description: brouillon.description ?? '',
					designation: brouillon.designation,
					sku: brouillon.sku,
					barcode: brouillon.barcode,
					brandName: marqueDuBrouillon?.name,
					categoryNames: categoriesDuBrouillon,
					priceTTC: brouillon.price_ttc,
					stock: brouillon.stock,
				}}
				extraDirty={webLinksDirty}
				extra={<ProductWebLinksSection form={form} />}
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
					// Un refus PocketBase laisse la modale OUVERTE, avec son texte :
					// la refermer sur un échec perdrait la génération.
					const enregistre = await onSaveNow?.()
					if (enregistre !== false) setStudioOpen(false)
				}}
			/>
		</>
	)
}
