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
	type JourServeur,
	periodePromo,
	prixPromoActif,
} from '@/lib/pricing/promo-price'
import { useJourServeur } from '@/lib/pricing/use-jour-serveur'

import { DetailCard, HelpTooltip } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

function marge(priceTtc = 0, purchaseHt = 0, taxRate = 0) {
	const priceHt = priceTtc / (1 + taxRate / 100)
	if (priceHt <= 0) return null
	return ((priceHt - purchaseHt) / priceHt) * 100
}

/** « AAAA-MM-JJ » → « JJ/MM/AAAA ». */
function dateFr(jour: string) {
	const [a, m, j] = jour.split('-')
	return `${j}/${m}/${a}`
}

/**
 * Ce que la fiche dit de la promo, dans l'ordre où la règle la refuse
 * (`prixPromoActif`) : l'écran ne recalcule rien, il nomme la condition qui
 * manque.
 */
function mentionPromo(produit: {
	price_ttc: number
	promo_price_ttc: number
	sale_state: string
	promo_start: string
	promo_end: string
	jour: JourServeur
}): { texte: string; actif: boolean } | null {
	const { jour, ...prix } = produit
	if (!(prix.promo_price_ttc > 0) && prix.sale_state === '') return null

	const actif = prixPromoActif(prix, jour)
	if (actif !== null) {
		const jusquau = prix.promo_end ? ` jusqu’au ${dateFr(prix.promo_end)}` : ''
		return {
			texte: `Actif : −${(prix.price_ttc - actif).toFixed(2)} € par unité${jusquau}`,
			actif: true,
		}
	}
	if (prix.sale_state === '') {
		return { texte: 'Inactif : opération « Plein tarif »', actif: false }
	}
	if (!(prix.promo_price_ttc > 0)) {
		return { texte: 'Prix promo requis', actif: false }
	}
	if (prix.promo_price_ttc >= prix.price_ttc) {
		return { texte: 'Inactif : doit être inférieur au prix TTC', actif: false }
	}
	switch (periodePromo(prix, jour)) {
		case 'programmee':
			return {
				texte: `Programmé : à partir du ${dateFr(prix.promo_start)}`,
				actif: false,
			}
		case 'expiree':
			return {
				texte: `Expiré le ${dateFr(prix.promo_end)} : la fiche repasse en plein tarif`,
				actif: false,
			}
		case 'jour-inconnu':
			return {
				texte: 'Période non vérifiée : jour du serveur indisponible',
				actif: false,
			}
		default:
			return null
	}
}

export function ProductPricingCard({
	form,
	embedded = false,
}: {
	form: UseFormReturn<ProductDetailValues>
	embedded?: boolean
}) {
	const jour = useJourServeur()
	const [prix, achat, tva, promo, operation, debut, fin] = form.watch([
		'price_ttc',
		'purchase_price_ht',
		'tax_rate',
		'promo_price_ttc',
		'sale_state',
		'promo_start',
		'promo_end',
	])
	const margin = marge(prix, achat, tva)
	const mention = mentionPromo({
		price_ttc: Number(prix),
		promo_price_ttc: Number(promo),
		sale_state: operation,
		promo_start: debut,
		promo_end: fin,
		jour,
	})
	// La période n'a de sens qu'avec une promo : on ne l'affiche pas sur une
	// fiche au plein tarif sans prix promo, qui est le cas de tout le catalogue.
	const avecPromo = operation !== '' || Number(promo) > 0

	const content = (
		<div className='space-y-5'>
			<div className='grid gap-5 sm:grid-cols-2 xl:grid-cols-5'>
				<NumberField
					form={form}
					name='purchase_price_ht'
					label='Achat HT'
					step='0.01'
				/>
				<NumberField
					form={form}
					name='price_ttc'
					label='Prix TTC'
					step='0.01'
				/>
				<div>
					<NumberField
						form={form}
						name='promo_price_ttc'
						label='Prix promo TTC'
						step='0.01'
						help='Appliqué en remise sur le ticket et la facture, le prix TTC restant affiché. Saisir un prix promo passe l’opération commerciale en « Promotion » si elle était « Plein tarif ».'
						// Un prix promo saisi sur une fiche « Plein tarif » restait inerte,
						// et passait pour une panne (10 septembre 2026). On bascule À LA
						// SAISIE — pas dans un effet, qui marquerait « modifiée » une fiche
						// simplement ouverte — et seulement depuis « Plein tarif » : un
						// « Soldé » déjà choisi n'est pas écrasé.
						onSaisie={(valeur) => {
							if (Number(valeur) > 0 && form.getValues('sale_state') === '') {
								form.setValue('sale_state', 'promo', {
									shouldDirty: true,
									shouldTouch: true,
								})
							}
						}}
					/>
					{mention && (
						<p
							className={
								mention.actif
									? 'mt-1 text-emerald-700 text-[10px]'
									: 'mt-1 text-muted-foreground text-[10px]'
							}
						>
							{mention.texte}
						</p>
					)}
				</div>
				<NumberField form={form} name='tax_rate' label='TVA (%)' step='0.1' />
				<div>
					<p className='mb-2 font-medium text-muted-foreground text-xs'>
						Marge calculée
					</p>
					<p className='font-semibold text-emerald-700 text-lg leading-10'>
						{margin === null ? '—' : `${margin.toFixed(1)} %`}
					</p>
					<p className='text-muted-foreground text-[10px]'>
						Sur le prix TTC, hors promo
					</p>
				</div>
			</div>
			{avecPromo && (
				<div className='grid gap-5 sm:grid-cols-2 xl:grid-cols-5'>
					<DateField
						form={form}
						name='promo_start'
						label='Promo à partir du'
						help='Vide : dès maintenant. Le jour est celui du serveur, à Paris.'
					/>
					<DateField
						form={form}
						name='promo_end'
						label='Promo jusqu’au'
						help='Inclus. Vide : sans fin. Le lendemain, la fiche repasse seule en « Plein tarif » en caisse, en facture et sur le site.'
					/>
				</div>
			)}
		</div>
	)

	return embedded ? (
		content
	) : (
		<DetailCard title='Prix et marge'>{content}</DetailCard>
	)
}

function NumberField({
	form,
	name,
	label,
	step,
	help,
	onSaisie,
}: {
	form: UseFormReturn<ProductDetailValues>
	name: 'price_ttc' | 'promo_price_ttc' | 'purchase_price_ht' | 'tax_rate'
	label: string
	step: string
	help?: string
	/** Appelé après une saisie de l'utilisateur — jamais au chargement. */
	onSaisie?: (valeur: string) => void
}) {
	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FormItem>
					<FormLabel className='flex items-center'>
						{label}
						{help && <HelpTooltip text={help} />}
					</FormLabel>
					<FormControl>
						<Input
							type='number'
							min='0'
							step={step}
							{...field}
							onChange={(event) => {
								field.onChange(event)
								onSaisie?.(event.target.value)
							}}
						/>
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	)
}

function DateField({
	form,
	name,
	label,
	help,
}: {
	form: UseFormReturn<ProductDetailValues>
	name: 'promo_start' | 'promo_end'
	label: string
	help: string
}) {
	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FormItem>
					<FormLabel className='flex items-center'>
						{label}
						<HelpTooltip text={help} />
					</FormLabel>
					<FormControl>
						{/* `type="date"` rend « AAAA-MM-JJ », exactement la forme du
						    schéma : aucune conversion de fuseau, nulle part. */}
						<Input type='date' {...field} />
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	)
}
