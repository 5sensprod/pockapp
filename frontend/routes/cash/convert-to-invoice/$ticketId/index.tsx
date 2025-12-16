// frontend/routes/cash/convert-to-invoice/$ticketId/index.tsx
// Route pour la page de conversion TIK → Facture

import { ConvertTicketToInvoicePage } from '@/modules/cash/ConvertTicketToInvoicePage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/cash/convert-to-invoice/$ticketId/')({
	component: ConvertTicketToInvoicePage,
})
