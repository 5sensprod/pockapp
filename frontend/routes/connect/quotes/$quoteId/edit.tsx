// frontend/routes/connect/quotes/$quoteId/edit.tsx
import { QuoteEditPage } from '@/modules/connect/pages/quotes/QuoteEditPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/quotes/$quoteId/edit')({
	component: QuoteEditPage,
})
