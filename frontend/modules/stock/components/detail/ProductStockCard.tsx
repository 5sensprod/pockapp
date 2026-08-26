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
import type { CatalogProductShape } from '@/lib/queries/catalog-products'

import {
	DetailCard,
	HelpTooltip,
	NativeSelect,
	ReadValue,
} from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

export function ProductStockCard({
	product,
	editing,
	form,
}: {
	product: CatalogProductShape
	editing: boolean
	form: UseFormReturn<ProductDetailValues>
}) {
	return (
		<DetailCard title='Stock'>
			{editing ? (
				<div className='grid gap-4 sm:grid-cols-2'>
					<NumberField form={form} name='stock' label='Stock' />
					<NumberField
						form={form}
						name='min_stock'
						label='Stock minimum'
						min='0'
					/>
					<FormField
						control={form.control}
						name='type'
						render={({ field }) => (
							<FormItem>
								<FormLabel>Type</FormLabel>
								<FormControl>
									<NativeSelect {...field}>
										<option value='simple'>Article</option>
										<option value='service'>Service</option>
									</NativeSelect>
								</FormControl>
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name='manage_stock'
						render={({ field }) => (
							<FormItem className='flex items-center justify-between rounded-lg border p-3'>
								<FormLabel className='flex items-center'>
									Suivi du stock
									<HelpTooltip text='À désactiver pour un service dont la quantité ne doit pas être suivie.' />
								</FormLabel>
								<FormControl>
									<Switch
										checked={field.value}
										onCheckedChange={field.onChange}
									/>
								</FormControl>
							</FormItem>
						)}
					/>
				</div>
			) : (
				<div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
					<ReadValue label='Stock' value={product.stock ?? 0} />
					<ReadValue label='Minimum' value={product.min_stock ?? 0} />
					<ReadValue
						label='Type'
						value={product.type === 'service' ? 'Service' : 'Article'}
					/>
					<ReadValue
						label='Suivi'
						value={product.manage_stock ? 'Activé' : 'Désactivé'}
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
	min,
}: {
	form: UseFormReturn<ProductDetailValues>
	name: 'stock' | 'min_stock'
	label: string
	min?: string
}) {
	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FormItem>
					<FormLabel>{label}</FormLabel>
					<FormControl>
						<Input type='number' step='1' min={min} {...field} />
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	)
}
