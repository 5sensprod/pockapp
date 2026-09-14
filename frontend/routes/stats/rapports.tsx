// frontend/routes/stats/rapports.tsx
import { ReportsPage } from '@/modules/stats'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/stats/rapports')({
	component: ReportsPage,
})
