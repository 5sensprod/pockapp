import type { UseFormReturn } from 'react-hook-form'

import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { prixPromoActif } from '@/lib/pricing/promo-price'

import { DetailCard, HelpTooltip } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

function marge(priceTtc = 0, purchaseHt = 0, taxRate = 0) {
	const priceHt = priceTtc / (1 + taxRate / 100)
	if (priceHt <= 0) return null
	return ((priceHt - purchaseHt) / priceHt) * 100
}

export function ProductPricingCard({
	form,
	embedded = false,
}: {
	form: UseFormReturn<ProductDetailValues>
	embedded?: boolean
}) {
	const [prix, achat, tva, promo, operation] = form.watch([
		'price_ttc',
		'purchase_price_ht',
		'tax_rate',
		'promo_price_ttc',
		'sale_state',
	])
	const margin = marge(prix, achat, tva)
	const promoActive = prixPromoActif({
		price_ttc: Number(prix),
		promo_price_ttc: Number(promo),
		sale_state: operation,
	})

	const content = (
		<div className='grid gap-5 sm:grid-cols-2 xl:grid-cols-5'>
			<NumberField
				form={form}
				name='purchase_price_ht'
				label='Achat HT'
				step='0.01'
			/>
			<NumberField form={form} name='price_ttc' label='Prix TTC' step='0.01' />
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
				{Number(promo) > 0 && (
					<p
						className={
							promoActive === null
								? 'mt-1 text-muted-foreground text-[10px]'
								: 'mt-1 text-emerald-700 text-[10px]'
						}
					>
						{promoActive === null
							? operation === ''
								? 'Inactif : opération « Plein tarif »'
								: 'Inactif : doit être inférieur au prix TTC'
							: `Actif : −${(Number(prix) - promoActive).toFixed(2)} € par unité`}
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
