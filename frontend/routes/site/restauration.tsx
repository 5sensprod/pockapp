import { RestaurationSelectivePage } from '@/modules/site'
// frontend/routes/site/restauration.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/site/restauration')({
	component: RestaurationSelectivePage,
})
