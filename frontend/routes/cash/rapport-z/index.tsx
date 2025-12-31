// frontend/routes/cash/rapport-z/index.tsx
import { RapportZPage } from '@/modules/cash/components/reports/RapportZPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/cash/rapport-z/')({
	component: RapportZPage,
})
