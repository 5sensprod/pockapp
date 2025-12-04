import { InvoiceCreatePage } from '@/modules/connect/components/InvoiceCreatePage'
// frontend/routes/connect/invoices/new.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/invoices/new')({
	component: InvoiceCreatePage,
})
