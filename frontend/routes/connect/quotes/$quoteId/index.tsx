// frontend/routes/connect/quotes/$quoteId/index.tsx
import { QuoteDetailPage } from '@/modules/connect/pages/quotes/QuoteDetailPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/quotes/$quoteId/')({
	component: QuoteDetailPage,
})
