import { QuotesPage } from '@/modules/connect/components/QuotesPage'
// frontend/routes/connect/quotes/index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/quotes/')({
	component: QuotesPage,
})
