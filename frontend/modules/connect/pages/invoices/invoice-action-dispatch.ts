// frontend/modules/connect/pages/invoices/invoice-action-dispatch.ts
//
// Une action, un geste.
//
// `resolveNextAction` (frontend/lib/invoices/next-action.ts) decide QUOI
// proposer, sans jamais toucher au DOM ni a la navigation. Ce fichier dit
// COMMENT executer ce qu'elle a designe. La separation n'est pas cosmetique :
// c'est elle qui permet de tester les treize etats de la page sans rendu.
//
// Aucune regle metier ici. Si un identifiant n'a pas de geste, il ne se passe
// rien — plutot qu'un comportement invente.

import type { InvoiceActionId } from '@/lib/invoices/next-action'
import type { InvoiceResponse } from '@/lib/types/invoice.types'
import type { InvoiceActionsState } from '../../hooks/useInvoiceActions'

interface Contexte {
	invoice: InvoiceResponse
	invoiceId: string
	balanceInvoice: InvoiceResponse | null
	originalId: string | undefined
	actions: InvoiceActionsState
	navigate: (opts: any) => void
	search: Record<string, string>
	pushCurrentToStore: (label: string) => void
}

export function creerExecuteurAction({
	invoice,
	invoiceId,
	balanceInvoice,
	originalId,
	actions,
	navigate,
	search,
	pushCurrentToStore,
}: Contexte) {
	return (id: InvoiceActionId) => {
		switch (id) {
			case 'validate':
				return void actions.handleValidate()
			case 'collect':
			// « Demander un acompte » ouvre encore le dialogue d'encaissement,
			// sur son onglet Acompte. Lui donner son propre dialogue est un
			// travail à part (audit §11-5) ; l'action existe désormais au
			// premier rang, ce qu'elle n'avait jamais.
			case 'create_deposit':
				return actions.handleOpenPaymentDialog()
			case 'generate_balance':
				return void actions.handleCreateBalanceInvoice()
			case 'convert':
				return navigate({
					to: '/cash/convert-to-invoice/$ticketId',
					params: { ticketId: invoice.id },
				})
			case 'open_balance':
				if (balanceInvoice) {
					pushCurrentToStore(`Facture ${invoice.number}`)
					navigate({
						to: '/connect/invoices/$invoiceId',
						params: { invoiceId: balanceInvoice.id },
					})
				}
				return
			case 'open_parent':
				if (originalId) {
					pushCurrentToStore(`Document ${invoice.number}`)
					navigate({
						to: '/connect/invoices/$invoiceId',
						params: { invoiceId: originalId },
					})
				}
				return
			case 'open_converted':
				if (invoice.converted_invoice_id) {
					navigate({
						to: '/connect/invoices/$invoiceId',
						params: { invoiceId: invoice.converted_invoice_id },
					})
				}
				return
			case 'pdf':
				return void actions.handleDownloadPdf()
			case 'email':
				return actions.setEmailDialogOpen(true)
			case 'mark_sent':
				return void actions.handleMarkAsSent()
			case 'edit':
				return navigate({
					to: '/connect/invoices/$invoiceId/edit',
					params: { invoiceId },
					search: search as Record<string, string>,
				})
			case 'delete_draft':
				return actions.handleOpenDeleteDraft()
			case 'credit_note':
				return actions.handleOpenCancelDialog()
			case 'refund_invoice':
				return actions.setRefundInvoiceOpen(true)
			case 'refund_ticket':
				return actions.setRefundTicketDialogOpen(true)
			case 'refund_deposit':
				actions.setRefundDepositReason('')
				return actions.setRefundDepositOpen(true)
			default:
				return
		}
	}
}
