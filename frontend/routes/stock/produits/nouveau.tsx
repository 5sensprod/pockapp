import { NewProductDetailPage } from '@/modules/stock/ProductDetailPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/stock/produits/nouveau')({
	validateSearch: (
		search: Record<string, unknown>,
	): { designation: string } => ({
		designation:
			typeof search.designation === 'string'
				? search.designation.trim().slice(0, 255)
				: '',
	}),
	component: NewProductDetailPage,
})
