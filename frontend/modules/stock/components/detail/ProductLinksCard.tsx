import type { UseFormReturn } from 'react-hook-form'

import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useBrands } from '@/lib/queries/brands'
import type { CatalogProductShape } from '@/lib/queries/catalog-products'
import { useCategories } from '@/lib/queries/categories'
import { useSuppliers } from '@/lib/queries/suppliers'

import { CategoryPicker } from '../CategoryPicker'
import {
	DetailCard,
	HelpTooltip,
	NativeSelect,
	ReadValue,
} from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

const commercial = { '': 'Neuf', used: 'Occasion', rental: 'Location' } as const

export function ProductLinksCard({
	product,
	editing,
	form,
}: {
	product: CatalogProductShape
	editing: boolean
	form: UseFormReturn<ProductDetailValues>
}) {
	const { activeCompanyId } = useActiveCompany()
	const brands = useBrands({ companyId: activeCompanyId ?? undefined })
	const suppliers = useSuppliers({ companyId: activeCompanyId ?? undefined })
	const categories = useCategories({ companyId: activeCompanyId ?? undefined })
	const supplierId = form.watch('supplier')
	const brandId = form.watch('brand')
	const supplierBrandIds = suppliers.data?.find(
		(item) => item.id === supplierId,
	)?.brands
	const brandOptions = (brands.data ?? []).filter(
		(brand) =>
			!supplierId ||
			!supplierBrandIds?.length ||
			supplierBrandIds.includes(brand.id) ||
			brand.id === brandId,
	)
	const names = {
		brand: brands.data?.find((item) => item.id === product.brand)?.name,
		supplier: suppliers.data?.find((item) => item.id === product.supplier)
			?.name,
		categories: (product.categories ?? [])
			.map((id) => categories.data?.find((item) => item.id === id)?.name)
			.filter(Boolean)
			.join(', '),
	}

	return (
		<DetailCard title='Rattachements'>
			{editing ? (
				<div className='grid gap-4 sm:grid-cols-2'>
					<SelectField form={form} name='brand' label='Marque'>
						<option value=''>— Aucune —</option>
						{brandOptions.map((brand) => (
							<option key={brand.id} value={brand.id}>
								{brand.name}
							</option>
						))}
					</SelectField>
					<SelectField form={form} name='supplier' label='Fournisseur'>
						<option value=''>— Aucun —</option>
						{(suppliers.data ?? []).map((supplier) => (
							<option key={supplier.id} value={supplier.id}>
								{supplier.name}
							</option>
						))}
					</SelectField>
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
						name='categories'
						render={({ field }) => (
							<FormItem className='sm:col-span-2'>
								<FormLabel>Catégories</FormLabel>
								<CategoryPicker
									value={field.value}
									onChange={(value) =>
										field.onChange(Array.isArray(value) ? value : [value])
									}
									multiple
									searchPlaceholder='Rechercher une catégorie…'
									maxHeight='200px'
									companyId={activeCompanyId ?? undefined}
								/>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>
			) : (
				<div className='grid gap-4 sm:grid-cols-2'>
					<ReadValue label='Marque' value={names.brand} />
					<ReadValue label='Fournisseur' value={names.supplier} />
					<ReadValue
						label='État commercial'
						value={commercial[product.commercial_state ?? '']}
					/>
					<ReadValue label='Catégories' value={names.categories} wide />
				</div>
			)}
		</DetailCard>
	)
}

function SelectField({
	form,
	name,
	label,
	children,
}: {
	form: UseFormReturn<ProductDetailValues>
	name: 'brand' | 'supplier'
	label: string
	children: React.ReactNode
}) {
	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FormItem>
					<FormLabel>{label}</FormLabel>
					<FormControl>
						<NativeSelect {...field}>{children}</NativeSelect>
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	)
}
