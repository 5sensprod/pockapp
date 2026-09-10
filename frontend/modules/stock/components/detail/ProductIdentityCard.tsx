import type { UseFormReturn } from 'react-hook-form'

import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

import { DetailCard, HelpTooltip, NativeSelect } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

// L'identité INTERNE du produit. Le nom de la fiche publique vit désormais avec
// sa description et l'assistant, dans la colonne « Fiche sur le site » : le
// laisser ici mélangeait ce qui sert au comptoir et ce qui part en ligne.
export function ProductIdentityCard({
	form,
	embedded = false,
}: {
	form: UseFormReturn<ProductDetailValues>
	embedded?: boolean
}) {
	const content = (
		<div className={embedded ? 'contents' : 'grid gap-5 sm:grid-cols-3'}>
			<TextField
				form={form}
				name='designation'
				label='Désignation'
				wide
				emphasis
				help='Ce libellé apparaît sur le ticket de caisse et la facture.'
				placeholder='Libellé court pour le ticket et la facture'
			/>
			<TextField form={form} name='sku' label='Référence' />
			<TextField form={form} name='barcode' label='Code-barres' />
			{/* ⚠️ DEUX AXES, ET ILS NE FUSIONNENT PAS. `commercial_state` dit ce
			    que l'objet EST (neuf, occasion, location) ; `sale_state` dit
			    l'OPÉRATION en cours dessus (soldé, en promotion). Un instrument
			    d'occasion soldé est un cas ordinaire : un sélecteur unique à quatre
			    options le rendrait inexprimable. Ni l'un ni l'autre ne décide de la
			    publication — `status` en est la seule autorité
			    (`catalog-products.ts:69`). */}
			<FormField
				control={form.control}
				name='commercial_state'
				render={({ field }) => (
					<FormItem>
						<FormLabel className='flex items-center'>
							État commercial
							<HelpTooltip text='Occasion et location gardent leur rayon habituel : cet état dit comment le produit se vend.' />
						</FormLabel>
						<FormControl>
							<NativeSelect {...field}>
								<option value=''>Neuf</option>
								<option value='used'>Occasion</option>
								<option value='rental'>Location</option>
							</NativeSelect>
						</FormControl>
					</FormItem>
				)}
			/>
			<FormField
				control={form.control}
				name='sale_state'
				render={({ field }) => (
					<FormItem>
						<FormLabel className='flex items-center'>
							Opération commerciale
							<HelpTooltip text='Indépendante de l’état commercial : une occasion peut être soldée. Elle ne change ni le prix, ni la publication.' />
						</FormLabel>
						<FormControl>
							<NativeSelect {...field}>
								<option value=''>Plein tarif</option>
								<option value='sale'>Soldé</option>
								<option value='promo'>Promotion</option>
							</NativeSelect>
						</FormControl>
					</FormItem>
				)}
			/>
		</div>
	)

	return embedded ? (
		content
	) : (
		<DetailCard title='Identité du produit'>{content}</DetailCard>
	)
}

function TextField({
	form,
	name,
	label,
	help,
	hint,
	placeholder,
	wide,
	emphasis,
}: {
	form: UseFormReturn<ProductDetailValues>
	name: 'designation' | 'sku' | 'barcode'
	label: string
	help?: string
	hint?: string
	placeholder?: string
	wide?: boolean
	emphasis?: boolean
}) {
	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FormItem className={wide ? 'sm:col-span-2' : undefined}>
					<FormLabel className='flex items-center'>
						{label}
						{help && <HelpTooltip text={help} />}
					</FormLabel>
					<FormControl>
						<Input
							placeholder={placeholder}
							className={
								emphasis ? 'font-semibold text-base text-primary' : undefined
							}
							{...field}
						/>
					</FormControl>
					{hint && <p className='text-muted-foreground text-xs'>{hint}</p>}
					<FormMessage />
				</FormItem>
			)}
		/>
	)
}
