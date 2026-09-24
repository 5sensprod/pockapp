// frontend/modules/stock/components/detail/ProductFeaturedCard.tsx
// ═══════════════════════════════════════════════════════════════════════════
// LA PASTILLE « MIS EN AVANT », ET SON TEXTE
// ═══════════════════════════════════════════════════════════════════════════
// Écrit le 15 septembre 2026. Deux champs — `featured` dit SI la pastille
// s'affiche sur le site, `featured_label` CE QU'ELLE porte.
//
// La carte est bâtie comme celle de la publication, et pour la même raison :
// c'est un interrupteur, pas une section à ouvrir en édition. Un vendeur qui
// veut mettre une guitare en vitrine ne doit pas avoir à cliquer « Modifier »
// d'abord.
//
// ⚠️ Cocher NE PUBLIE PAS. `status` reste la seule autorité sur ce qui part
// vers le site (`catalog-products.ts`) : une fiche mise en avant mais non
// publiée n'a simplement pas de page.
//
// Le libellé VIDE est le cas normal — le site affiche alors son défaut, qui ne
// s'écrit ni ici, ni en base, ni dans le serveur (`lib/catalog/featured.ts`).
// L'indice sous le champ le dit, pour que « laisser vide » soit un choix et non
// un oubli.

import type { UseFormReturn } from 'react-hook-form'

import { Sparkles } from 'lucide-react'

import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { LIBELLE_PAR_DEFAUT, MAX_LIBELLE } from '@/lib/catalog/featured'

import { DetailStatusCard, HelpTooltip } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

/** Des libellés prêts à poser. Ce ne sont QUE des raccourcis de saisie : rien
 *  ici n'est une valeur du schéma, le champ reste un texte libre. */
const SUGGESTIONS = [
	LIBELLE_PAR_DEFAUT,
	'Notre sélection',
	'Produit vedette',
	'À découvrir',
]

export function ProductFeaturedCard({
	form,
	disabled = false,
	embedded = false,
}: {
	form: UseFormReturn<ProductDetailValues>
	disabled?: boolean
	/** Rendue DANS la carte Publication (sans carte propre). La mise en avant
	 *  dépend de la publication : tant que la fiche n'est pas publiée, elle
	 *  n'a pas de page où porter sa pastille, l'interrupteur est verrouillé. */
	embedded?: boolean
}) {
	const featured = form.watch('featured')
	const libelle = form.watch('featured_label')
	const published = form.watch('status') === 'published'
	const locked = disabled || (embedded && !published)

	const dirty = Boolean(
		form.formState.dirtyFields.featured ||
			form.formState.dirtyFields.featured_label,
	)

	const headerRight = (
		<div className='flex items-center gap-2.5'>
			<span
				className={
					featured
						? 'font-semibold text-amber-700 text-xs dark:text-amber-300'
						: 'font-semibold text-muted-foreground text-xs'
				}
			>
				{featured ? 'En vitrine' : 'Non mis en avant'}
			</span>
			<Switch
				checked={featured}
				disabled={locked}
				onCheckedChange={(checked) =>
					form.setValue('featured', checked, {
						shouldDirty: true,
						shouldTouch: true,
						shouldValidate: true,
					})
				}
				aria-label={
					featured ? 'Retirer de la vitrine' : 'Mettre le produit en avant'
				}
				title={
					embedded && !published
						? 'Publiez la fiche pour la mettre en avant'
						: undefined
				}
			/>
		</div>
	)

	const body = (
		<div className='grid gap-3'>
			<FormField
				control={form.control}
				name='featured_label'
				render={({ field }) => (
					<FormItem>
						<FormLabel className='flex items-center'>
							Texte de la pastille
							<HelpTooltip text='Laissez vide pour afficher le libellé par défaut du site. La pastille n’apparaît que si la mise en avant est active.' />
						</FormLabel>
						<FormControl>
							<Input
								{...field}
								disabled={locked || !featured}
								maxLength={MAX_LIBELLE}
								placeholder={LIBELLE_PAR_DEFAUT}
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>

			{/* L'aperçu. Il reprend la forme de la pastille du site
				    (`AxeFeaturedBadge.jsx`) sans en être le code : deux dépôts,
				    et celui-ci ne doit pas prétendre montrer le rendu exact. */}
			<div className='flex flex-wrap items-center gap-2'>
				<span className='text-muted-foreground text-xs'>Aperçu :</span>
				<span className='inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 text-xs dark:bg-amber-900/40 dark:text-amber-200'>
					<Sparkles className='mr-1 h-3 w-3' aria-hidden='true' />
					{libelle.trim() === '' ? LIBELLE_PAR_DEFAUT : libelle.trim()}
				</span>
			</div>

			{featured && (
				<div className='flex flex-wrap gap-1.5'>
					{SUGGESTIONS.map((suggestion) => (
						<button
							key={suggestion}
							type='button'
							disabled={locked}
							className='rounded-full border px-2.5 py-1 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50'
							onClick={() =>
								form.setValue('featured_label', suggestion, {
									shouldDirty: true,
									shouldTouch: true,
									shouldValidate: true,
								})
							}
						>
							{suggestion}
						</button>
					))}
				</div>
			)}
		</div>
	)

	if (embedded) {
		if (!published) return null
		return (
			<section
				className={
					published ? 'mt-4 border-t pt-4' : 'mt-4 border-t pt-4 opacity-55'
				}
			>
				<div className='mb-3 flex items-center justify-between gap-4'>
					<h3 className='font-semibold text-sm text-primary/90 tracking-tight'>
						Mise en avant
					</h3>
					{headerRight}
				</div>
				{published && body}
			</section>
		)
	}

	return (
		<DetailStatusCard
			title='Mise en avant'
			dirty={dirty}
			muted={!featured}
			headerRight={headerRight}
		>
			{body}
		</DetailStatusCard>
	)
}
