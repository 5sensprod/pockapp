import { ArrowLeft, ImageOff, Save } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip'
import { prixPromoActif } from '@/lib/pricing/promo-price'
import { useJourServeur } from '@/lib/pricing/use-jour-serveur'
import type { CatalogProductShape } from '@/lib/queries/catalog-products'

const euros = new Intl.NumberFormat('fr-FR', {
	style: 'currency',
	currency: 'EUR',
})

type Props = {
	product: CatalogProductShape
	designation?: string
	status: 'draft' | 'published'
	brandName?: string
	imageUrl: string | null
	canSave: boolean
	pending: boolean
	onBack: () => void
	// Création : « Valider » au lieu d'« Enregistrer », grisé tant que le prix
	// TTC manque (même règle que `productCreationSchema`), et « Annuler » dès
	// qu'il est actif — le vendeur qui découvre, à l'avertissement de doublon,
	// que la fiche existe déjà doit pouvoir renoncer sans rien écrire.
	isCreation?: boolean
	priceMissing?: boolean
	onCancel?: () => void
}

export function ProductDetailHeader(props: Props) {
	const jour = useJourServeur()
	const promo = prixPromoActif(props.product, jour)
	// DEUX BADGES, JAMAIS UN SEUL. L'état commercial dit ce que l'objet EST,
	// l'opération dit ce qui se passe SUR son prix : « Occasion » et « Soldé »
	// se cumulent, et les fondre en une étiquette perdrait l'un des deux.
	const commercial =
		props.product.commercial_state === 'used'
			? 'Occasion'
			: props.product.commercial_state === 'rental'
				? 'Location'
				: null

	const operation =
		props.product.sale_state === 'sale'
			? 'Soldé'
			: props.product.sale_state === 'promo'
				? 'Promotion'
				: null

	return (
		<header className='sticky top-header z-40 border-b bg-background/95 backdrop-blur'>
			<div className='container mx-auto flex items-center gap-3 px-6 py-2.5'>
				<Button
					type='button'
					variant='ghost'
					size='icon'
					onClick={props.onBack}
					aria-label='Retour aux produits'
				>
					<ArrowLeft className='h-5 w-5' />
				</Button>
				<div className='flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30'>
					{props.imageUrl ? (
						<img
							src={props.imageUrl}
							alt=''
							className='h-full w-full object-contain'
						/>
					) : (
						<ImageOff className='h-6 w-6 text-muted-foreground/50' />
					)}
				</div>
				<div className='min-w-0 flex-1'>
					<h1 className='truncate font-bold text-xl'>
						{props.designation?.trim() || 'Sans désignation'}
					</h1>
					<p className='truncate text-muted-foreground text-sm'>
						{[props.product.sku, props.brandName].filter(Boolean).join(' · ') ||
							'Sans référence ni marque'}
					</p>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<span className='cursor-help font-mono text-muted-foreground text-xs'>
									/produit/{props.product.slug || '—'}
								</span>
							</TooltipTrigger>
							<TooltipContent className='max-w-80'>
								L’adresse est attribuée au premier enregistrement en statut
								publié. Elle reste ensuite inchangée, même si le nom change.
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
					<div className='mt-1 flex flex-wrap items-center gap-2 text-sm'>
						{promo === null ? (
							<strong>{euros.format(props.product.price_ttc ?? 0)}</strong>
						) : (
							<>
								<span className='text-muted-foreground line-through'>
									{euros.format(props.product.price_ttc ?? 0)}
								</span>
								<strong className='text-emerald-700'>
									{euros.format(promo)}
								</strong>
							</>
						)}
						<span>
							Stock {props.product.stock ?? 0}
							{(props.product.stock_b ?? 0) > 0 &&
								` · B ${props.product.stock_b}`}
						</span>
						<Badge
							variant={props.status === 'published' ? 'default' : 'secondary'}
						>
							{props.status === 'published' ? 'Publié' : 'Non publié'}
						</Badge>
						{commercial && <Badge variant='outline'>{commercial}</Badge>}
						{operation && <Badge variant='destructive'>{operation}</Badge>}
					</div>
				</div>
				{props.isCreation ? (
					<div className='flex shrink-0 flex-col items-end gap-1'>
						<div className='flex items-center gap-2'>
							{!props.priceMissing && props.onCancel && (
								<Button
									type='button'
									variant='outline'
									disabled={props.pending}
									onClick={props.onCancel}
								>
									Annuler
								</Button>
							)}
							<Button
								type='submit'
								disabled={props.pending || !props.canSave || props.priceMissing}
							>
								<Save className='mr-2 h-4 w-4' />
								Valider
							</Button>
						</div>
						{props.priceMissing && (
							<p className='text-muted-foreground text-xs'>
								Saisissez un prix de vente TTC pour valider.
							</p>
						)}
					</div>
				) : (
					<Button type='submit' disabled={props.pending || !props.canSave}>
						<Save className='mr-2 h-4 w-4' />
						Enregistrer
					</Button>
				)}
			</div>
		</header>
	)
}
