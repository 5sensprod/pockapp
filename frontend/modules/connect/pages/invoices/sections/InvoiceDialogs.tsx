// frontend/modules/connect/pages/invoices/sections/InvoiceDialogs.tsx
//
// Les huit dialogues de la page, montes SOUS CONDITION.
//
// Ils etaient jusqu'ici instancies a chaque rendu, y compris sur un avoir ou
// cinq d'entre eux sont inatteignables. InvoicePaymentDialog declenche a lui
// seul useHasAnyOpenCashSession : une requete caisse partait a chaque
// ouverture de facture, sans la moindre intention d'encaisser.
//
// Deux precautions, verifiees dans le code avant d'y toucher :
//
//  - le dialogue de paiement fait son reset a l'ouverture et porte son ecran
//    de succes en etat local. La garde etant `open === true`, il ne se demonte
//    jamais pendant qu'il sert ;
//  - son VERROUILLAGE DE FERMETURE vit a l'interieur du composant. Le montage
//    conditionnel ne le touche pas, et il ne faut pas le remonter ici : c'est
//    ce verrou qui protege d'une double facturation.

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { RefundInvoiceDialog } from '@/modules/common/RefundInvoiceDialog'
import { RefundTicketDialog } from '@/modules/common/RefundTicketDialog'
import { StockReclassificationDialog } from '@/modules/common/StockReclassificationDialog'
import { InvoicePaymentDialog } from '../../../components/InvoicePaymentDialog'
import { SendInvoiceEmailDialog } from '../../../dialogs/SendInvoiceEmailDialog'
import type { InvoiceActionsState } from '../../../hooks/useInvoiceActions'
import { formatCurrency } from '../../../utils/formatters'

interface Props {
	invoice: InvoiceResponse
	actions: InvoiceActionsState
}

export function InvoiceDialogs({ invoice, actions }: Props) {
	return (
		<>
			{actions.emailDialogOpen && (
				<SendInvoiceEmailDialog
					open={actions.emailDialogOpen}
					onOpenChange={actions.setEmailDialogOpen}
					invoice={invoice}
					onSuccess={() => actions.setEmailDialogOpen(false)}
				/>
			)}

			{actions.cancelDialogOpen && (
				<Dialog
					open={actions.cancelDialogOpen}
					onOpenChange={actions.setCancelDialogOpen}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Créer un avoir</DialogTitle>
							<DialogDescription>
								Un avoir sera créé pour annuler la facture{' '}
								<strong>{invoice.number}</strong>.
							</DialogDescription>
						</DialogHeader>
						<div className='space-y-2 py-4'>
							<Label>Motif d'annulation *</Label>
							<Textarea
								value={actions.cancelReason}
								onChange={(e) => actions.setCancelReason(e.target.value)}
								placeholder='Ex: Erreur de facturation, retour client...'
								rows={3}
							/>
						</div>
						<DialogFooter>
							<Button
								variant='outline'
								onClick={() => actions.setCancelDialogOpen(false)}
							>
								Annuler
							</Button>
							<Button
								variant='destructive'
								disabled={!actions.cancelReason.trim() || actions.isCancelling}
								onClick={actions.handleCancelInvoice}
							>
								{actions.isCancelling ? 'Création...' : "Créer l'avoir"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}

			{/* ✅ Composant partagé — même comportement que dans le flux de création
			    (fermeture verrouillée tant que le paiement n'est pas confirmé,
			    bouton "Payer plus tard" au lieu d'"Annuler") */}
			{actions.paymentDialogOpen && (
				<InvoicePaymentDialog
					invoice={invoice}
					open={actions.paymentDialogOpen}
					onOpenChange={actions.setPaymentDialogOpen}
					onPaid={() => actions.setPaymentDialogOpen(false)}
					onSkip={() => actions.setPaymentDialogOpen(false)}
				/>
			)}

			{actions.deleteDraftDialogOpen && (
				<Dialog
					open={actions.deleteDraftDialogOpen}
					onOpenChange={actions.setDeleteDraftDialogOpen}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Supprimer le brouillon</DialogTitle>
							<DialogDescription>
								Cette action va <strong>supprimer définitivement</strong> le
								brouillon <strong>{invoice.number}</strong>. Cette opération est
								irréversible.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button
								variant='outline'
								onClick={() => actions.setDeleteDraftDialogOpen(false)}
							>
								Annuler
							</Button>
							<Button
								variant='destructive'
								onClick={actions.handleConfirmDeleteDraft}
								disabled={actions.isDeletingDraft}
							>
								{actions.isDeletingDraft
									? 'Suppression...'
									: 'Supprimer le brouillon'}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}

			{actions.refundDepositOpen && (
				<Dialog
					open={actions.refundDepositOpen}
					onOpenChange={actions.setRefundDepositOpen}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Rembourser l'acompte</DialogTitle>
							<DialogDescription>
								Un avoir sera créé pour annuler l'acompte{' '}
								<strong>{invoice.number}</strong> de{' '}
								<strong>{formatCurrency(invoice.total_ttc)}</strong>.
							</DialogDescription>
						</DialogHeader>
						<div className='space-y-2 py-4'>
							<Label>Motif du remboursement *</Label>
							<Textarea
								value={actions.refundDepositReason}
								onChange={(e) => actions.setRefundDepositReason(e.target.value)}
								placeholder='Ex: Annulation de commande, litige client...'
								rows={3}
							/>
						</div>
						<DialogFooter>
							<Button
								variant='outline'
								onClick={() => {
									actions.setRefundDepositOpen(false)
									actions.setRefundDepositReason('')
								}}
							>
								Annuler
							</Button>
							<Button
								variant='destructive'
								disabled={
									!actions.refundDepositReason.trim() ||
									actions.isRefundingDeposit
								}
								onClick={actions.handleRefundDeposit}
							>
								{actions.isRefundingDeposit ? 'Création...' : "Créer l'avoir"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}

			{actions.refundTicketDialogOpen && (
				<RefundTicketDialog
					open={actions.refundTicketDialogOpen}
					onOpenChange={(o) => {
						if (!o) actions.setRefundTicketDialogOpen(false)
						else actions.setRefundTicketDialogOpen(true)
					}}
					ticket={invoice}
					onSuccess={(stockItems) => {
						actions.setRefundTicketDialogOpen(false)
						if (stockItems && stockItems.length > 0) {
							actions.setStockItemsToReclassify(stockItems)
							actions.setStockDocumentNumber(invoice.number)
							actions.setStockReclassifyOpen(true)
						}
					}}
				/>
			)}

			{actions.refundInvoiceOpen && (
				<RefundInvoiceDialog
					open={actions.refundInvoiceOpen}
					invoice={invoice}
					onClose={() => actions.setRefundInvoiceOpen(false)}
					onSuccess={(stockItems) => {
						if (stockItems && stockItems.length > 0) {
							actions.setStockItemsToReclassify(stockItems)
							actions.setStockDocumentNumber(invoice.number)
							actions.setStockReclassifyOpen(true)
						}
					}}
				/>
			)}

			{actions.stockReclassifyOpen && (
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
			)}
		</>
	)
}
