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

export function ProductIdentityCard({
	product,
	editing,
	form,
}: {
	product: CatalogProductShape
	editing: boolean
	form: UseFormReturn<ProductDetailValues>
}) {
	return (
		<DetailCard title='Identité et description'>
			{editing ? (
				<div className='grid gap-4 sm:grid-cols-2'>
					<TextField form={form} name='name' label='Nom *' />
					<TextField form={form} name='designation' label='Désignation' />
					<TextField form={form} name='sku' label='Référence' />
					<TextField form={form} name='barcode' label='Code-barres' />
				</div>
			) : (
				<div className='grid gap-4 sm:grid-cols-2'>
					<ReadValue label='Nom' value={product.name} />
					<ReadValue label='Désignation' value={product.designation} />
					<ReadValue label='Référence' value={product.sku} />
					<ReadValue label='Code-barres' value={product.barcode} />
				</div>
			)}
		</DetailCard>
	)
}

function TextField({
	form,
	name,
	label,
}: {
	form: UseFormReturn<ProductDetailValues>
	name: 'name' | 'designation' | 'sku' | 'barcode'
	label: string
}) {
	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FormItem>
					<FormLabel>{label}</FormLabel>
					<FormControl>
						<Input {...field} />
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	)
}
