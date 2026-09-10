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
import { useSuppliers } from '@/lib/queries/suppliers'

import { CategoryPicker } from '../CategoryPicker'
import { DetailCard, NativeSelect } from './detail-primitives'
import type { ProductDetailValues } from './product-detail-form'

// Marque, fournisseur, catégories. L'état commercial et l'opération vivent dans
// la carte identité (`ProductIdentityCard`).

export function ProductLinksCard({
	form,
	embedded = false,
}: {
	form: UseFormReturn<ProductDetailValues>
	embedded?: boolean
}) {
	const { activeCompanyId } = useActiveCompany()
	const brands = useBrands({ companyId: activeCompanyId ?? undefined })
	const suppliers = useSuppliers({ companyId: activeCompanyId ?? undefined })
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
		(supplier) =>
			Boolean(brandId) && supplier.brands?.includes(brandId as string),
	)

	const supplierOptions = (suppliers.data ?? []).filter((supplier) => {
		if (!brandId) return true
		if (!suppliersDistributingBrand.length) return true
		return (
			supplier.brands?.includes(brandId as string) || supplier.id === supplierId
		)
	})

	const suppliersFilteredByBrand =
		Boolean(brandId) && suppliersDistributingBrand.length > 0

	const brandWithoutSupplier =
		Boolean(brandId) && suppliersDistributingBrand.length === 0

	// Un seul fournisseur distribue cette marque : le poser. Uniquement si le
	// champ est VIDE — remplacer un fournisseur déjà choisi serait écraser une
	// décision prise —, et seulement quand la MARQUE vient d'être changée.
	// ⚠️ Les champs sont toujours saisissables : sans cette condition, ouvrir une
	// fiche sans fournisseur la marquait « modifiée », et le bloqueur de
	// navigation retenait l'utilisateur sur une fiche qu'il n'avait pas touchée.
	const soleSupplierId =
		suppliersDistributingBrand.length === 1
			? suppliersDistributingBrand[0].id
			: undefined
	const brandChanged = Boolean(form.formState.dirtyFields.brand)

	useEffect(() => {
		if (!brandChanged) return
		if (!soleSupplierId) return
		if (supplierId) return
		form.setValue('supplier', soleSupplierId, { shouldDirty: true })
	}, [brandChanged, soleSupplierId, supplierId, form])

	const content = (
		<div className={embedded ? 'contents' : 'grid gap-5 sm:grid-cols-3'}>
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
				name='categories'
				render={({ field }) => (
					<FormItem className='md:col-span-2'>
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
	)

	return embedded ? (
		content
	) : (
		<DetailCard title='Rattachements'>{content}</DetailCard>
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
