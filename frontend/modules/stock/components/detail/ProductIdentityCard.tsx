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

import { DetailCard, HelpTooltip, ReadValue } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

// L'identité INTERNE du produit. Le nom de la fiche publique vit désormais avec
// sa description et l'assistant, dans la colonne « Fiche sur le site » : le
// laisser ici mélangeait ce qui sert au comptoir et ce qui part en ligne.
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
		<DetailCard title='Identité du produit'>
			{editing ? (
				<div className='grid gap-4 sm:grid-cols-3'>
					<TextField
						form={form}
						name='designation'
						label='Nom sur le ticket'
						help='Ce libellé s’imprime sur le ticket de caisse. Il ne part jamais vers le site.'
						placeholder='Libellé court, imprimé sur le ticket'
					/>
					<TextField form={form} name='sku' label='Référence' />
					<TextField form={form} name='barcode' label='Code-barres' />
				</div>
			) : (
				<div className='grid gap-4 sm:grid-cols-3'>
					<ReadValue label='Nom sur le ticket' value={product.designation} />
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
	help,
	hint,
	placeholder,
}: {
	form: UseFormReturn<ProductDetailValues>
	name: 'designation' | 'sku' | 'barcode'
	label: string
	help?: string
	hint?: string
	placeholder?: string
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
						<Input placeholder={placeholder} {...field} />
					</FormControl>
					{hint && <p className='text-muted-foreground text-xs'>{hint}</p>}
					<FormMessage />
				</FormItem>
			)}
		/>
	)
}
