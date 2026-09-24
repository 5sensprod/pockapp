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

import { useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'

import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
	MAX_MESSAGE,
	MESSAGES_SUGGERES,
	MESSAGE_PAR_DEFAUT,
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

	// Simple affichage, rien n'est écrit en base : allumé quand un message est
	// déjà posé. Éteindre EFFACE le message (le site reprend son défaut).
	const [actif, setActif] = useState(
		() => (form.getValues('availability_label') ?? '').trim() !== '',
	)
	const basculer = (checked: boolean) => {
		setActif(checked)
		if (!checked) {
			form.setValue('availability_label', '', {
				shouldDirty: true,
				shouldTouch: true,
				shouldValidate: true,
			})
		}
	}

	const body = (
		<div className='grid gap-3'>
			<FormField
				control={form.control}
				name='availability_label'
				render={({ field }) => (
					<FormItem>
						<FormLabel className={embedded ? 'sr-only' : 'flex items-center'}>
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
		</div>
	)

	if (embedded) {
		if (!published) return null
		return (
			<section className='mt-4 border-t pt-4'>
				<div
					className={
						actif
							? 'mb-3 flex items-center justify-between gap-4'
							: 'flex items-center justify-between gap-4'
					}
				>
					<h3 className='flex items-center font-semibold text-primary/90 text-sm tracking-tight'>
						Message stock à 0
						<HelpTooltip text='Ce réglage ne concerne que le stock à 0. Désactivé, le site garde son message par défaut (« Réappro ») ; un produit en stock s’affiche toujours « En stock ». Activé, votre message remplace « Réappro » quand le stock neuf tombe à 0. Utile aussi pour un service : « Sur rendez-vous ».' />
					</h3>
					<Switch
						checked={actif}
						disabled={disabled}
						onCheckedChange={basculer}
						aria-label='Personnaliser le message de stock à 0'
					/>
				</div>
				{actif && body}
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
