// frontend/routes/connect/invoices/index.tsx
import { InvoicesPage } from '@/modules/connect/components/InvoicesPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/invoices/')({
	component: InvoicesPage,
})
