// frontend/routes/stock/fournisseurs/index.tsx
import { SuppliersPage } from '@/modules/stock/SuppliersPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/stock/fournisseurs/')({
	component: SuppliersPage,
})
