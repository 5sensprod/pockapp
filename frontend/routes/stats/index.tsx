// frontend/routes/stock/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { StatsPage } from '@/modules/stats'

export const Route = createFileRoute('/stats/')({
  component: StatsPage,
})