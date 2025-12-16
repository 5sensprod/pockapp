// frontend/routes/connect/invoices/$invoiceId/edit.tsx
import { InvoiceEditPage } from '@/modules/connect/components/InvoiceEditPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/invoices/$invoiceId/edit')({
	component: InvoiceEditPage,
})
