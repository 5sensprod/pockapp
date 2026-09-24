import { Globe2, Images, PlaySquare } from 'lucide-react'
import { useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'

import { Switch } from '@/components/ui/switch'
import {
	dire,
	manquesPourPublier,
} from '@/lib/catalog/publication-requirements'
import type { CatalogProductShape } from '@/lib/queries/catalog-products'
import type { GalleryEntry } from '@/lib/queries/gallery-order'

import { ProductAvailabilityCard } from './ProductAvailabilityCard'
import { ProductDescriptionCard } from './ProductDescriptionCard'
import { ProductFeaturedCard } from './ProductFeaturedCard'
import { ProductMediaPanel } from './ProductMediaPanel'
import { ProductOnlinePanel } from './ProductOnlinePanel'
import { ProductWebLinksCard } from './ProductWebLinksCard'
import {
	DetailStatusCard,
	EditableDetailCard,
	FormDetailCard,
	HelpTooltip,
} from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'
import type { ProductDetailSection } from './useProductDetailEditor'

type Props = {
	product: CatalogProductShape
	activeSection: ProductDetailSection | null
	dirtySections: Record<ProductDetailSection, boolean>
	onEdit: (section: ProductDetailSection) => void
	form: UseFormReturn<ProductDetailValues>
	webLinksDirty: boolean
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
	// Simple affichage : allumé quand des liens existent déjà. Éteindre les
	// EFFACE du formulaire (rien n'est perdu tant qu'on n'enregistre pas).
	const [liensActifs, setLiensActifs] = useState(
		() => (props.form.getValues('web_links') ?? []).length > 0,
	)
	const basculerLiens = (checked: boolean) => {
		setLiensActifs(checked)
		if (!checked) {
			props.form.setValue('web_links', [], {
				shouldDirty: true,
				shouldTouch: true,
				shouldValidate: true,
			})
		}
	}
	const status = props.form.watch('status')
	const published = status === 'published'

	// Même calcul que `useProductDetailEditor.hasMainImage`, sans plomberie
	// supplémentaire : `currentImage`, `pendingMain` et `product` sont déjà des
	// props de ce panneau. Un produit déjà publié n'a pas à repasser ce test —
	// le frein ne retient que la PREMIÈRE publication, jamais une fiche en
	// ligne dont l'image aurait disparu depuis (elle reste publiée, à corriger
	// à son rythme).
	//
	// La règle elle-même est partagée avec le lot « Publier la sélection » de la
	// page produits (`lib/catalog/publication-requirements.ts`) : ce qui bloque
	// ici bloque là-bas.
	const manques = published
		? []
		: manquesPourPublier({
				image: props.currentImage ?? props.product.image,
				categories: props.form.watch('categories'),
				imageEnAttente: !!props.pendingMain,
			})
	const publicationBloquee = manques.length > 0

	return (
		<div className='rounded-xl border border-purple-300 bg-purple-50/50 p-3 shadow-sm dark:border-purple-800 dark:bg-purple-950/15'>
			<div className='mb-3 flex items-center gap-3 border-purple-300 border-b px-1 pb-3 dark:border-purple-800'>
				<span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400'>
					<Globe2 className='h-5 w-5' />
				</span>
				<div>
					<h2 className='font-semibold text-purple-700 text-sm dark:text-purple-300'>
						Publication AppSite
					</h2>
					<p className='text-muted-foreground text-xs'>
						Contenu visible sur axemusique.shop
					</p>
				</div>
			</div>
			<div className='grid gap-3'>
				<FormDetailCard title='Médias' dirty={props.dirtySections.visuals}>
					<div className='grid gap-4'>
						<section>
							<div className='mb-3 flex items-center justify-between gap-3'>
								<h3 className='flex items-center gap-2 font-semibold text-sm'>
									<Images className='h-4 w-4 text-purple-600 dark:text-purple-400' />
									Photos
									<HelpTooltip text='Sur une image déjà enregistrée, « principale » et la suppression s’appliquent tout de suite. Promouvoir ne supprime rien ; supprimer est définitif après confirmation. Les imports, retraits et déplacements attendent « Enregistrer ».' />
								</h3>
								<span className='text-muted-foreground text-[10px]'>
									Image principale et galerie
								</span>
							</div>
							<ProductMediaPanel
								product={props.product}
								editing
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
						</section>
					</div>
				</FormDetailCard>
				<EditableDetailCard
					title='Contenu éditorial'
					banner='Vous pouvez maintenant modifier les contenus visibles en ligne.'
					editing={props.activeSection === 'content'}
					dirty={props.dirtySections.content || props.webLinksDirty}
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
					<section className='border-t pt-4'>
						<div
							className={
								liensActifs
									? 'mb-3 flex items-center justify-between gap-3'
									: 'flex items-center justify-between gap-3'
							}
						>
							<h3 className='flex items-center gap-2 font-semibold text-sm'>
								<PlaySquare className='h-4 w-4 text-purple-600 dark:text-purple-400' />
								Liens et vidéos
								<HelpTooltip text='Documentation, tests et démonstrations, affichés sur la page du site. Désactiver retire tous les liens de la fiche.' />
							</h3>
							<Switch
								checked={liensActifs}
								disabled={props.disabled}
								onCheckedChange={basculerLiens}
								aria-label='Activer les liens et vidéos'
							/>
						</div>
						{liensActifs && <ProductWebLinksCard form={props.form} />}
					</section>
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
								{published ? 'Publié' : 'Non publié'}
							</span>
							<Switch
								checked={published}
								disabled={publicationBloquee}
								onCheckedChange={(checked) =>
									props.form.setValue(
										'status',
										checked ? 'published' : 'draft',
										{
											shouldDirty: true,
											shouldTouch: true,
											shouldValidate: true,
										},
									)
								}
								aria-label={
									published ? 'Passer en non publié' : 'Publier la fiche'
								}
								title={
									publicationBloquee
										? `Manque ${dire(manques)} pour publier`
										: undefined
								}
							/>
						</div>
					}
				>
					{publicationBloquee && (
						<p className='mb-3 rounded-md bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-400'>
							Publication impossible : {dire(manques)}{' '}
							{manques.length > 1 ? 'manquent' : 'manque'}.
						</p>
					)}
					{published && (
						<>
							{props.product.id ? (
								<ProductOnlinePanel
									product={props.product}
									form={props.form}
									embedded
								/>
							) : (
								<p className='text-muted-foreground text-sm'>
									L’adresse sera attribuée lors du premier enregistrement en
									statut publié.
								</p>
							)}
							{/* La vitrine vit DANS la publication : une fiche non publiée
					    n'a pas de page où porter sa pastille. */}
							<ProductFeaturedCard
								form={props.form}
								disabled={props.disabled}
								embedded
							/>
							<ProductAvailabilityCard
								form={props.form}
								disabled={props.disabled}
								embedded
							/>
						</>
					)}
				</DetailStatusCard>
			</div>
		</div>
	)
}
