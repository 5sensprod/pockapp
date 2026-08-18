// frontend/routes/stock/marques/index.tsx
import { BrandsPage } from '@/modules/stock/BrandsPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/stock/marques/')({
	component: BrandsPage,
})
