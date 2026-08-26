import type { UseFormReturn } from 'react-hook-form'

import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { CatalogProductShape } from '@/lib/queries/catalog-products'

import { DetailCard, ReadValue } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

const euros = new Intl.NumberFormat('fr-FR', {
	style: 'currency',
	currency: 'EUR',
})

function marge(priceTtc = 0, purchaseHt = 0, taxRate = 0) {
	const priceHt = priceTtc / (1 + taxRate / 100)
	if (priceHt <= 0) return null
	return ((priceHt - purchaseHt) / priceHt) * 100
}

export function ProductPricingCard({
	product,
	editing,
	form,
}: {
	product: CatalogProductShape
	editing: boolean
	form: UseFormReturn<ProductDetailValues>
}) {
	const values = form.watch(['price_ttc', 'purchase_price_ht', 'tax_rate'])
	const margin = editing
		? marge(values[0], values[1], values[2])
		: marge(product.price_ttc, product.purchase_price_ht, product.tax_rate)

	return (
		<DetailCard title='Prix et marge'>
			{editing ? (
				<div className='grid gap-4 sm:grid-cols-3'>
					<NumberField
						form={form}
						name='price_ttc'
						label='Prix TTC'
						step='0.01'
					/>
					<NumberField
						form={form}
						name='purchase_price_ht'
						label='Achat HT'
						step='0.01'
					/>
					<NumberField form={form} name='tax_rate' label='TVA (%)' step='0.1' />
					<p className='text-muted-foreground text-sm sm:col-span-3'>
						Marge calculée : {margin === null ? '—' : `${margin.toFixed(1)} %`}
					</p>
				</div>
			) : (
				<div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
					<ReadValue
						label='Prix TTC'
						value={euros.format(product.price_ttc ?? 0)}
					/>
					<ReadValue
						label='Achat HT'
						value={euros.format(product.purchase_price_ht ?? 0)}
					/>
					<ReadValue label='TVA' value={`${product.tax_rate ?? 0} %`} />
					<ReadValue
						label='Marge'
						value={margin === null ? '—' : `${margin.toFixed(1)} %`}
					/>
				</div>
			)}
		</DetailCard>
	)
}

function NumberField({
	form,
	name,
	label,
	step,
}: {
	form: UseFormReturn<ProductDetailValues>
	name: 'price_ttc' | 'purchase_price_ht' | 'tax_rate'
	label: string
	step: string
}) {
	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FormItem>
					<FormLabel>{label}</FormLabel>
					<FormControl>
						<Input type='number' min='0' step={step} {...field} />
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	)
}
