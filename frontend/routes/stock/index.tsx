// frontend/routes/stock/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { StockPage } from '@/modules/stock'

export const Route = createFileRoute('/stock/')({
  component: StockPage,
})