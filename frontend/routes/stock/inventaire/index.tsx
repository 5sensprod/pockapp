// frontend/routes/stock/inventaire/index.tsx
import { InventoryPage } from '@/modules/stock/InventoryPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/stock/inventaire/')({
	component: InventoryPage,
})
