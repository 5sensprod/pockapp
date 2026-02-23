// frontend/routes/inventory-apppos/index.tsx
import { InventoryPageAppPos } from '@/modules/stock/InventoryPageAppPos'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/inventory-apppos/')({
	component: InventoryPageAppPos,
})
