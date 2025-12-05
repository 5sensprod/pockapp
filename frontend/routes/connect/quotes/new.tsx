import { QuoteCreatePage } from '@/modules/connect/components/QuoteCreatePage'
// frontend/routes/connect/quotes/new.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/quotes/new')({
	component: QuoteCreatePage,
})
