import type { UseFormReturn } from 'react-hook-form'

import { Badge } from '@/components/ui/badge'
import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
} from '@/components/ui/form'
import type { CatalogProductShape } from '@/lib/queries/catalog-products'

import { HelpTooltip, NativeSelect } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

export function ProductPublicationControl({
	product,
	editing,
	form,
}: {
	product: CatalogProductShape
	editing: boolean
	form: UseFormReturn<ProductDetailValues>
}) {
	if (!editing) {
		return (
			<div className='flex items-center justify-between'>
				<span>Publication</span>
				<Badge
					variant={product.status === 'published' ? 'default' : 'secondary'}
				>
					{product.status === 'published' ? 'Publié' : 'Brouillon'}
				</Badge>
			</div>
		)
	}

	return (
		<FormField
			control={form.control}
			name='status'
			render={({ field }) => (
				<FormItem>
					<FormLabel className='flex items-center'>
						Publication
						<HelpTooltip text='Seuls les produits publiés partent vers axemusique.shop.' />
					</FormLabel>
					<FormControl>
						<NativeSelect {...field}>
							<option value='draft'>Brouillon</option>
							<option value='published'>Publié sur le site</option>
						</NativeSelect>
					</FormControl>
				</FormItem>
			)}
		/>
	)
}
