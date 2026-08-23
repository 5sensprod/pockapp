import { JournalDesVentesPage } from '@/modules/stats'
// frontend/routes/stats/index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/stats/')({
	component: JournalDesVentesPage,
})
