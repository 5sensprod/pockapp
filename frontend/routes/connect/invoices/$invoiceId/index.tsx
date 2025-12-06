// frontend/routes/connect/invoices/$invoiceId/index.tsx
import { InvoiceDetailPage } from '@/modules/connect/components/InvoiceDetailPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/invoices/$invoiceId/')({
	component: InvoiceDetailPage,
})
