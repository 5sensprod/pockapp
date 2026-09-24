// frontend/modules/stock/components/detail/ProductAvailabilityCard.tsx
// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LE SITE DIT QUAND LE STOCK EST À ZÉRO
// ═══════════════════════════════════════════════════════════════════════════
// Écrit le 24 septembre 2026, à la place de l'interrupteur « Suivi du stock »
// (`manage_stock`) que personne ne lisait : le besoin réel n'était pas de savoir
// SI un stock se suit, mais CE QU'ON DIT quand il est vide — un réglage de
// vitrine, donc, et non de stock.
//
// Un seul champ, texte libre. Il n'y a rien à cocher : le message n'a de sens
// que stock à zéro, et c'est `catalog.php` qui juge ce moment à la lecture. Le
// vendeur peut donc écrire « Sur commande » sur une fiche encore en stock sans
// faire mentir la vitrine — et sans avoir à le retirer quand le stock revient.
//
// Vide, le site affiche SON défaut. Ce défaut ne s'écrit ni en base ni dans
// l'export (`lib/catalog/availability.ts`) ; l'indice sous le champ le dit,
// pour que « laisser vide » soit un choix et non un oubli.

import type { UseFormReturn } from 'react-hook-form'

import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
	MAX_MESSAGE,
	MESSAGES_SUGGERES,
	MESSAGE_PAR_DEFAUT,
	messageNormalise,
} from '@/lib/catalog/availability'

import { FormDetailCard, HelpTooltip } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

export function ProductAvailabilityCard({
	form,
	disabled: disabledProp = false,
	embedded = false,
}: {
	form: UseFormReturn<ProductDetailValues>
	disabled?: boolean
	/** Rendue DANS la carte Publication : le message n'a de sens que sur une
	 *  fiche publiée, verrouillé sinon. */
	embedded?: boolean
}) {
	const published = form.watch('status') === 'published'
	const disabled = disabledProp || (embedded && !published)
	const [message, stock] = form.watch(['availability_label', 'stock'])
	const enStock = Number(stock) > 0
	const affiche = messageNormalise(message) || MESSAGE_PAR_DEFAUT

	const body = (
		<div className='grid gap-3'>
			<FormField
				control={form.control}
				name='availability_label'
				render={({ field }) => (
					<FormItem>
						<FormLabel className='flex items-center'>
							Message quand le stock est à 0
							<HelpTooltip text='Affiché à la place de « Réappro » sur la carte et la fiche du site, uniquement quand le stock neuf est à 0. Laissez vide pour garder le message par défaut. Utile aussi pour un service : « Sur rendez-vous ».' />
						</FormLabel>
						<FormControl>
							<Input
								{...field}
								disabled={disabled}
								maxLength={MAX_MESSAGE}
								placeholder={MESSAGE_PAR_DEFAUT}
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>

			<div className='flex flex-wrap gap-1.5'>
				{MESSAGES_SUGGERES.map((suggestion) => (
					<button
						key={suggestion}
						type='button'
						disabled={disabled}
						className='rounded-full border px-2.5 py-1 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50'
						onClick={() =>
							form.setValue('availability_label', suggestion, {
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

			{/* L'aperçu reprend la forme de la pastille de stock du site
				    (`StockBadge.jsx`) sans en être le code : deux dépôts, et celui-ci
				    ne doit pas prétendre montrer le rendu exact. Il dit aussi ce que
				    le site affiche MAINTENANT, pas seulement à zéro. */}
			<div className='flex flex-wrap items-center gap-2'>
				<span className='text-muted-foreground text-xs'>
					{enStock ? 'Aujourd’hui, le site affiche :' : 'Le site affiche :'}
				</span>
				{enStock ? (
					<span className='inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-800 text-xs dark:bg-green-900/40 dark:text-green-200'>
						<span className='mr-1.5 h-1.5 w-1.5 rounded-full bg-green-500' />
						En stock
					</span>
				) : (
					<span className='inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 font-medium text-orange-800 text-xs dark:bg-orange-900/40 dark:text-orange-200'>
						<span className='mr-1.5 h-1.5 w-1.5 rounded-full bg-orange-500' />
						{affiche}
					</span>
				)}
			</div>
			{enStock && (
				<p className='text-muted-foreground text-xs'>
					Le message « {affiche} » s’affichera dès que le stock neuf tombera à
					0.
				</p>
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
				<h3 className='mb-3 font-semibold text-primary/90 text-sm tracking-tight'>
					Disponibilité en ligne
				</h3>
				{published && body}
			</section>
		)
	}

	return (
		<FormDetailCard
			title='Disponibilité en ligne'
			dirty={Boolean(form.formState.dirtyFields.availability_label)}
		>
			{body}
		</FormDetailCard>
	)
}
