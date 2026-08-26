import { ProductDetailPage } from '@/modules/stock/ProductDetailPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/stock/produits/$productId')({
	component: ProductDetailPage,
})
