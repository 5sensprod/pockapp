// frontend/modules/site/components/online-catalog/OnlineProductGrid.tsx
//
// Les produits en cards, et non en table : l'objet de cette vue est de voir le
// catalogue **comme le site le montrera** — une image, un nom, un prix — pas
// d'en éplucher les colonnes. `ProductTable` reste l'outil de gestion.

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { CatalogBrand, CatalogProduct } from '@/lib/queries/site-catalog'
import { usePocketBase } from '@/lib/use-pocketbase'
import { cn } from '@/lib/utils'
import { useNavigate } from '@tanstack/react-router'
import {
	CheckCircle2,
	CloudUpload,
	ImageOff,
	Images,
	Loader2,
	Pencil,
	RefreshCw,
	ScanSearch,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import type { SyncState } from '../../lib/catalog-export'
import { catalogImageUrl } from '../../lib/catalog-image'

const euros = new Intl.NumberFormat('fr-FR', {
	style: 'currency',
	currency: 'EUR',
})

// Une carte produit est un sous-arbre React conséquent (image, badges et
// actions). Les créer toutes dans le même commit peut retenir la navigation
// quand le cache rend immédiatement les quelque 2 400 produits publiés.
const PRODUCT_RENDER_BATCH = 40

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
	// ── Les PHOTOS, ici, sur la carte ───────────────────────────────────────
	// Ajoutées le 20 août 2026, et pour une raison mesurée : l'onglet « Images »
	// mêlait 2674 fiches — marques, catégories et produits confondus — et son
	// bouton unique proposait de comparer les 4394 images d'un coup. Vérifier
	// UN produit y était impossible.
	//
	// Ici, l'action porte sur la carte qu'on regarde. Vérifier ne lit que les
	// octets de ce produit ; envoyer n'envoie que ses images. C'est le même
	// couple « vérifier / mettre à jour » que le texte a déjà, appliqué aux
	// photos.
	//
	// `undefined` dans la carte veut dire **non mesuré** — un état à montrer,
	// pas un manque à combler en silence.
	/** legacy_id → état des PHOTOS vis-à-vis du miroir. Absente de la carte
	 *  tant que le produit n'a pas été vérifié. */
	imageStates?: Map<string, SyncState | undefined>
	/** Lit les octets de CE produit et calcule son empreinte d'images. */
	onCheckImages?: (product: CatalogProduct) => void
	/** Envoie toutes les images de CE produit. Exige une empreinte mesurée. */
	onSendImages?: (product: CatalogProduct) => void
	/** `legacy_id` du produit dont les images sont en cours de traitement. */
	imagesBusy?: string | null
}

/** Ce que dit le bouton photos une fois l'état connu. */
const PHOTOS: Record<SyncState, { texte: string; titre: string }> = {
	absent: {
		texte: 'Envoyer les photos',
		titre: 'Aucune image de ce produit n’est sur le site',
	},
	modified: {
		texte: 'Mettre à jour les photos',
		titre: 'Les images ont changé depuis leur dernier envoi',
	},
	synced: {
		texte: 'Photos à jour',
		titre: 'Renvoyer quand même — l’envoi est idempotent',
	},
}

export function OnlineProductGrid({
	products,
	brandsById,
	emptyLabel = 'Aucun produit en ligne ici.',
	syncStates,
	onExport,
	exporting,
	imageStates,
	onCheckImages,
	onSendImages,
	imagesBusy,
}: Props) {
	const pb = usePocketBase() as any
	const navigate = useNavigate()
	const [visibleCount, setVisibleCount] = useState(() =>
		Math.min(PRODUCT_RENDER_BATCH, products.length),
	)

	useEffect(() => {
		if (visibleCount >= products.length) return
		const frame = window.requestAnimationFrame(() => {
			setVisibleCount((current) =>
				Math.min(current + PRODUCT_RENDER_BATCH, products.length),
			)
		})
		return () => window.cancelAnimationFrame(frame)
	}, [products.length, visibleCount])

	if (!products.length) {
		return (
			<p className='py-12 text-center text-muted-foreground text-sm'>
				{emptyLabel}
			</p>
		)
	}

	const visibleProducts = products.slice(0, visibleCount)
	const isRevealing = visibleProducts.length < products.length

	return (
		<div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
			{isRevealing && (
				<div
					className='col-span-full mb-3 space-y-1.5'
					role='status'
					aria-live='polite'
				>
					<div className='flex items-center justify-between text-muted-foreground text-xs'>
						<span>Affichage des produits…</span>
						<span className='tabular-nums'>
							{visibleProducts.length} / {products.length}
						</span>
					</div>
					<Progress
						value={(visibleProducts.length / products.length) * 100}
						className='h-2'
					/>
				</div>
			)}
			{visibleProducts.map((product) => {
				const openProduct = () =>
					navigate({
						to: '/stock/produits/$productId',
						params: { productId: product.id },
					})
				const url = catalogImageUrl(pb, product, '300x300')
				const brand = product.brand ? brandsById.get(product.brand) : undefined
				const state = syncStates?.get(product.legacy_id)

				// Le CHAMP fait foi, pas le répertoire de stockage : une entité a
				// déjà perdu son image en laissant son dossier derrière elle
				// (mesuré le 19 août 2026). Un produit sans image n'a rien à
				// envoyer, et la carte ne propose rien.
				const aDesImages = Boolean(
					product.image || (product.gallery?.length ?? 0) > 0,
				)
				const etatPhotos = imageStates?.get(product.legacy_id)
				const photosEnCours = imagesBusy === product.legacy_id

				// Grisé = pas encore dans la base SQL du site. La carte reste
				// lisible — c'est un état, pas une erreur — mais elle se distingue
				// au premier coup d'œil de ce qui est déjà en ligne.
				const absent = state === 'absent'

				return (
					<article
						key={product.id}
						role='link'
						tabIndex={0}
						onClick={(event) => {
							if ((event.target as HTMLElement).closest('button')) return
							void openProduct()
						}}
						onKeyDown={(event) => {
							if (event.key === 'Enter') void openProduct()
						}}
						className={cn(
							'group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md',
							absent && 'border-dashed bg-muted/30',
						)}
					>
						{/* La fiche complète est désormais l'unique point d'entrée produit.
						    L'assistant éditorial y reste monté depuis le module `site`. */}
						<button
							type='button'
							onClick={() => void openProduct()}
							title='Ouvrir la fiche complète du produit'
							className='absolute top-1.5 right-1.5 z-10 rounded-md border bg-background/90 p-1.5 opacity-0 shadow-sm transition-opacity hover:bg-accent focus-visible:opacity-100 group-hover:opacity-100'
						>
							<Pencil className='h-3.5 w-3.5' />
						</button>

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

							{/* ── Les photos ──────────────────────────────────────────
							    Deux temps, et ils sont honnêtes : le premier clic MESURE
							    (il lit les octets de ce produit, quelques centaines de
							    kilo-octets), le second ENVOIE. On n'envoie jamais une
							    empreinte qu'on n'a pas mesurée — elle est stockée telle
							    quelle côté SQL et sert ensuite de référence ; l'inventer
							    serait mentir au site.

							    Rien ne s'affiche tant que le produit n'est pas en ligne :
							    le miroir refuserait ses images en 409, les images étant un
							    ÉTAT de la ligne SQL, pas une entité à part. */}
							{aDesImages && !absent && onCheckImages && (
								<Button
									size='sm'
									variant={etatPhotos === 'modified' ? 'secondary' : 'outline'}
									className='mt-2 w-full'
									disabled={photosEnCours}
									title={
										etatPhotos === undefined
											? 'Lire les images de ce produit et les comparer au site'
											: PHOTOS[etatPhotos].titre
									}
									onClick={() =>
										etatPhotos === undefined || !onSendImages
											? onCheckImages(product)
											: onSendImages(product)
									}
								>
									{photosEnCours ? (
										<Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
									) : etatPhotos === undefined ? (
										<ScanSearch className='mr-1.5 h-3.5 w-3.5' />
									) : etatPhotos === 'synced' ? (
										<CheckCircle2 className='mr-1.5 h-3.5 w-3.5' />
									) : (
										<Images className='mr-1.5 h-3.5 w-3.5' />
									)}
									{etatPhotos === undefined
										? `Vérifier les photos (${(product.image ? 1 : 0) + (product.gallery?.length ?? 0)})`
										: PHOTOS[etatPhotos].texte}
								</Button>
							)}
						</div>
					</article>
				)
			})}
		</div>
	)
}
