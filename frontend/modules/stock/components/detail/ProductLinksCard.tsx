import { useEffect } from 'react'
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

// ⚠️ DEUX AXES, ET ILS NE FUSIONNENT PAS. `commercial_state` dit ce que l'objet
// EST (neuf, occasion, location) ; `sale_state` dit l'OPÉRATION en cours dessus
// (soldé, en promotion). Un instrument d'occasion soldé est un cas ordinaire :
// un sélecteur unique à quatre options le rendrait inexprimable.
// Ni l'un ni l'autre ne décide de la publication — `status` en est la seule
// autorité (`catalog-products.ts:69`).
const operation = {
	'': 'Plein tarif',
	sale: 'Soldé',
	promo: 'Promotion',
} as const

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

	/** Vrai quand la liste des marques est effectivement restreinte : une liste
	 *  silencieusement raccourcie ferait chercher une marque absente. */
	const brandsFilteredBySupplier =
		Boolean(supplierId) && Boolean(supplierBrandIds?.length)

	// ── ... et le fournisseur suit la marque ─────────────────────────────────
	// Même règle que dans `CatalogProductDialog` — ces deux écrans éditent les
	// mêmes champs, ils ne doivent pas proposer des couples différents. Le lien
	// `suppliers.brands` (backend/migrations/catalog.go:234) est le SEUL sens de
	// la relation ; on le lit dans les deux.
	//
	// Garde-fous, symétriques de ceux du filtre ci-dessus :
	//
	//  • aucun fournisseur ne déclare cette marque — et tous ne renseignent pas
	//    `brands` — la liste entière revient plutôt qu'un champ vide, et ça se
	//    DIT, sinon le filtre passe pour cassé alors que c'est la donnée qui est
	//    muette ;
	//  • le fournisseur DÉJÀ enregistré reste proposé même s'il ne déclare pas
	//    la marque, pour qu'un enregistrement ne l'efface pas en silence.
	const suppliersDistributingBrand = (suppliers.data ?? []).filter(
		(supplier) => Boolean(brandId) && supplier.brands?.includes(brandId as string),
	)

	const supplierOptions = (suppliers.data ?? []).filter((supplier) => {
		if (!brandId) return true
		if (!suppliersDistributingBrand.length) return true
		return (
			supplier.brands?.includes(brandId as string) ||
			supplier.id === supplierId
		)
	})

	const suppliersFilteredByBrand =
		Boolean(brandId) && suppliersDistributingBrand.length > 0

	const brandWithoutSupplier =
		Boolean(brandId) && suppliersDistributingBrand.length === 0

	// Un seul fournisseur distribue cette marque : le poser. Uniquement si le
	// champ est VIDE — remplacer un fournisseur déjà choisi serait écraser une
	// décision prise —, et seulement en édition, pour ne rien salir en lecture.
	const soleSupplierId =
		suppliersDistributingBrand.length === 1
			? suppliersDistributingBrand[0].id
			: undefined

	useEffect(() => {
		if (!editing) return
		if (!soleSupplierId) return
		if (supplierId) return
		form.setValue('supplier', soleSupplierId, { shouldDirty: true })
	}, [editing, soleSupplierId, supplierId, form])
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
					<SelectField
						form={form}
						name='brand'
						label='Marque'
						hint={
							brandsFilteredBySupplier
								? `${brandOptions.length} marque(s) distribuée(s) par ce fournisseur. Retirez le fournisseur pour voir tout le catalogue.`
								: undefined
						}
					>
						<option value=''>— Aucune —</option>
						{brandOptions.map((brand) => (
							<option key={brand.id} value={brand.id}>
								{brand.name}
							</option>
						))}
					</SelectField>
					<SelectField
						form={form}
						name='supplier'
						label='Fournisseur'
						hint={
							suppliersFilteredByBrand
								? `${supplierOptions.length} fournisseur(s) distribuant cette marque. Retirez la marque pour voir toute la liste.`
								: brandWithoutSupplier
									? 'Aucun fournisseur ne déclare cette marque : toute la liste reste proposée.'
									: undefined
						}
					>
						<option value=''>— Aucun —</option>
						{supplierOptions.map((supplier) => (
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
					<ReadValue
						label='Opération commerciale'
						value={operation[product.sale_state ?? '']}
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
	hint,
}: {
	form: UseFormReturn<ProductDetailValues>
	name: 'brand' | 'supplier'
	label: string
	children: React.ReactNode
	hint?: string
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
					{hint && <p className='text-muted-foreground text-xs'>{hint}</p>}
					<FormMessage />
				</FormItem>
			)}
		/>
	)
}
