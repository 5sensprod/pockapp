// frontend/modules/cash/components/ticket-detail/TicketDialogs.tsx
//
// Regroupe tous les dialogues du détail ticket.
// Reçoit les états + handlers depuis useTicketActions.
// Aucune logique propre — simple wiring.

import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { RefundTicketDialog } from '@/modules/common/RefundTicketDialog'
import { StockReclassificationDialog } from '@/modules/common/StockReclassificationDialog'
import { SendInvoiceEmailDialog } from '@/modules/connect/dialogs/SendInvoiceEmailDialog'
import type { TicketActionsState } from './useTicketActions'

interface TicketDialogsProps {
	invoice: InvoiceResponse
	actions: TicketActionsState
}

export function TicketDialogs({ invoice, actions }: TicketDialogsProps) {
	return (
		<>
			<SendInvoiceEmailDialog
				open={actions.emailDialogOpen}
				onOpenChange={actions.setEmailDialogOpen}
				invoice={invoice}
				onSuccess={() => actions.setEmailDialogOpen(false)}
			/>

			<RefundTicketDialog
				open={actions.refundTicketDialogOpen}
				onOpenChange={(open) => actions.setRefundTicketDialogOpen(open)}
				ticket={invoice as any}
				onSuccess={(stockItems) => {
					actions.setRefundTicketDialogOpen(false)
					if (stockItems && stockItems.length > 0) {
						actions.setStockItemsToReclassify(stockItems)
						actions.setStockDocumentNumber(invoice.number)
						actions.setStockReclassifyOpen(true)
					}
				}}
			/>

			<StockReclassificationDialog
				open={actions.stockReclassifyOpen}
				onOpenChange={actions.setStockReclassifyOpen}
				items={actions.stockItemsToReclassify}
				documentNumber={actions.stockDocumentNumber}
				onComplete={() => {
					actions.setStockReclassifyOpen(false)
					actions.setStockItemsToReclassify([])
					actions.setStockDocumentNumber(undefined)
				}}
			/>
		</>
	)
}
