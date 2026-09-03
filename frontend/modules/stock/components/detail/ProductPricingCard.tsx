import type { UseFormReturn } from 'react-hook-form'

import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

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
	editing,
	form,
	embedded = false,
}: {
	editing: boolean
	form: UseFormReturn<ProductDetailValues>
	embedded?: boolean
}) {
	const values = form.watch(['price_ttc', 'purchase_price_ht', 'tax_rate'])
	const margin = marge(values[0], values[1], values[2])

	const content = (
		<>
			{editing ? (
				<div className='grid gap-5 sm:grid-cols-2 xl:grid-cols-4'>
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
					<div>
						<p className='mb-2 font-medium text-muted-foreground text-xs'>
							Marge calculée
						</p>
						<p className='font-semibold text-emerald-700 text-lg leading-10'>
							{margin === null ? '—' : `${margin.toFixed(1)} %`}
						</p>
						<p className='text-muted-foreground text-[10px]'>
							Recalculée automatiquement
						</p>
					</div>
				</div>
			) : (
				<div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
					<ReadValue
						label='Prix TTC'
						value={euros.format(values[0] ?? 0)}
						valueClassName='font-semibold text-primary/90 text-base'
					/>
					<ReadValue label='Achat HT' value={euros.format(values[1] ?? 0)} />
					<ReadValue label='TVA' value={`${values[2] ?? 0} %`} />
					<ReadValue
						label='Marge'
						value={margin === null ? '—' : `${margin.toFixed(1)} %`}
						valueClassName='font-semibold text-emerald-700 text-lg'
					/>
				</div>
			)}
		</>
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
