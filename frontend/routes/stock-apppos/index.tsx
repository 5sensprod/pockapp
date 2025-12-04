import { StockPageAppPos } from '@/modules/stock/StockPageAppPos'
// frontend/routes/stock-apppos/index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/stock-apppos/')({
	component: StockPageAppPos,
})
