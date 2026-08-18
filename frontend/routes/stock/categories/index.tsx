// frontend/routes/stock/categories/index.tsx
import { CategoriesPage } from '@/modules/stock/CategoriesPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/stock/categories/')({
	component: CategoriesPage,
})
