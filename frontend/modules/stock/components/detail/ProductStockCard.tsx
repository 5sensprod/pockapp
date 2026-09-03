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
	DetailCard,
	HelpTooltip,
	NativeSelect,
	ReadValue,
} from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

export function ProductStockCard({
	editing,
	form,
	embedded = false,
}: {
	editing: boolean
	form: UseFormReturn<ProductDetailValues>
	embedded?: boolean
}) {
	const values = form.watch(['stock', 'min_stock', 'type', 'manage_stock'])
	const content = (
		<>
			{editing ? (
				<div className='grid items-end gap-5 sm:grid-cols-2 xl:grid-cols-[150px_150px_180px_minmax(0,1fr)]'>
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
										<option value='simple'>Produit</option>
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
							<FormItem className='flex min-h-10 items-center justify-between gap-4 xl:justify-end'>
								<div>
									<FormLabel className='flex items-center text-foreground'>
										Suivi du stock
										<HelpTooltip text='À désactiver pour un service dont la quantité ne doit pas être suivie.' />
									</FormLabel>
									<p className='mt-1 text-muted-foreground text-[10px]'>
										Met à jour automatiquement la disponibilité.
									</p>
								</div>
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
				<div className='grid grid-cols-2 items-start gap-5 sm:grid-cols-4'>
					<ReadValue
						label='Stock'
						value={values[0] ?? 0}
						valueClassName='font-semibold text-primary/90 text-lg'
					/>
					<ReadValue
						label='Minimum'
						value={values[1] ?? 0}
						valueClassName='font-semibold text-primary/90 text-lg'
					/>
					<ReadValue
						label='Type'
						value={values[2] === 'service' ? 'Service' : 'Produit'}
					/>
					<ReadValue label='Suivi' value={values[3] ? 'Activé' : 'Désactivé'} />
				</div>
			)}
		</>
	)

	return embedded ? content : <DetailCard title='Stock'>{content}</DetailCard>
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
