import type { UseFormReturn } from 'react-hook-form'

import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

import { DetailCard, HelpTooltip, ReadValue } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

// L'identité INTERNE du produit. Le nom de la fiche publique vit désormais avec
// sa description et l'assistant, dans la colonne « Fiche sur le site » : le
// laisser ici mélangeait ce qui sert au comptoir et ce qui part en ligne.
export function ProductIdentityCard({
	editing,
	form,
	embedded = false,
}: {
	editing: boolean
	form: UseFormReturn<ProductDetailValues>
	embedded?: boolean
}) {
	const values = form.watch(['designation', 'sku', 'barcode'])
	const content = (
		<>
			{editing ? (
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
				</div>
			) : (
				<div className={embedded ? 'contents' : 'grid gap-5 sm:grid-cols-3'}>
					<ReadValue
						label='Désignation'
						value={values[0]}
						valueClassName='font-semibold text-base text-primary/90'
						wide
					/>
					<ReadValue label='Référence' value={values[1]} />
					<ReadValue label='Code-barres' value={values[2]} />
				</div>
			)}
		</>
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
