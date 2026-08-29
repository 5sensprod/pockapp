// frontend/routes/stats/especes.tsx
import { JournalDesEspecesPage } from '@/modules/stats'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/stats/especes')({
	component: JournalDesEspecesPage,
})
