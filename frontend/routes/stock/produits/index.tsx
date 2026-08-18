// frontend/routes/stock/produits/index.tsx
import { ProductsPage } from '@/modules/stock/ProductsPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/stock/produits/')({
	component: ProductsPage,
})
