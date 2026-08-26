import type { CatalogProductShape } from '@/lib/queries/catalog-products'
import {
	useCatalogBrands,
	useCatalogCategories,
} from '@/lib/queries/site-catalog'
import { EditorialDialog } from '@/modules/site/components/online-catalog/EditorialDialog'

export function ProductOnlineEditorialDialog({
	product,
	open,
	onClose,
}: {
	product: CatalogProductShape
	open: boolean
	onClose: () => void
}) {
	const brands = useCatalogBrands()
	const categories = useCatalogCategories()

	return (
		<EditorialDialog
			target={
				open
					? {
							kind: 'product',
							id: product.id,
							name: product.name,
							description: product.description,
							designation: product.designation,
							sku: product.sku,
							brand: brands.data?.find((item) => item.id === product.brand)
								?.name,
							categories: (product.categories ?? [])
								.map(
									(id) => categories.data?.find((item) => item.id === id)?.name,
								)
								.filter((name): name is string => Boolean(name)),
						}
					: null
			}
			onClose={onClose}
		/>
	)
}
