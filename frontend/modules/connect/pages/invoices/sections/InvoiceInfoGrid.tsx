// frontend/modules/connect/pages/invoices/sections/InvoiceInfoGrid.tsx
//
// Date, echeance, vendeur, reglement, motif, notes. Extrait tel quel de
// InvoiceDetailPage : aucun changement de rendu.

import type { InvoiceResponse, PaymentMethod } from '@/lib/types/invoice.types'
import { formatDate, formatPaymentMethod } from '../../../utils/formatters'

interface Props {
	invoice: InvoiceResponse
	isCreditNote: boolean
	isTicket: boolean
	soldByLabel: string
}

export function InvoiceInfoGrid({
	invoice,
	isCreditNote,
	isTicket,
	soldByLabel,
}: Props) {
	return (
		<div className='grid grid-cols-2 gap-4'>
			<div>
				<p className='text-sm text-muted-foreground'>Date</p>
				<p className='font-medium'>{formatDate(invoice.date)}</p>
			</div>
			{!isCreditNote && (
				<div>
					<p className='text-sm text-muted-foreground'>
						{isTicket ? 'Vendeur / Caissier' : 'Vendeur'}
					</p>
					<p className='font-medium'>{soldByLabel}</p>
				</div>
			)}
			{invoice.due_date && (
				<div>
					<p className='text-sm text-muted-foreground'>Échéance</p>
					<p className='font-medium'>{formatDate(invoice.due_date)}</p>
				</div>
			)}
			{!isCreditNote && invoice.is_paid && (
				<>
					<div>
						<p className='text-sm text-muted-foreground'>Moyen de paiement</p>
						{/* 'multi' n'est pas dans l'union PaymentMethod, mais la base le
							    stocke : c'est le marqueur d'un règlement en plusieurs moyens. */}
							{String(invoice.payment_method) === 'multi' &&
						Array.isArray(invoice.split_payments) &&
						invoice.split_payments.length > 0 ? (
							<div className='space-y-0.5'>
								{invoice.split_payments.map((sp, i) => (
									<p key={`${sp.method}-${i}`} className='font-medium text-sm'>
										{sp.method_label ??
											formatPaymentMethod(sp.method as PaymentMethod)}{' '}
										— {sp.amount.toFixed(2)} €
									</p>
								))}
							</div>
						) : (
							<p className='font-medium'>
								{formatPaymentMethod(invoice.payment_method)}
							</p>
						)}
					</div>
					<div>
						<p className='text-sm text-muted-foreground'>Payée le</p>
						<p className='font-medium'>{formatDate(invoice.paid_at)}</p>
					</div>
				</>
			)}
			{isCreditNote && invoice.refund_method && (
				<div>
					<p className='text-sm text-muted-foreground'>
						Moyen de remboursement
					</p>
					<p className='font-medium'>
						{formatPaymentMethod(invoice.refund_method)}
					</p>
				</div>
			)}
			{isCreditNote && invoice.cancellation_reason && (
				<div className='col-span-2'>
					<p className='text-sm text-muted-foreground'>
						Motif du remboursement
					</p>
					<p className='font-medium text-destructive'>
						{invoice.cancellation_reason}
					</p>
				</div>
			)}
			{invoice.notes && (
				<div className='col-span-2'>
					<p className='text-sm text-muted-foreground'>Notes</p>
					<p className='font-medium'>{invoice.notes}</p>
				</div>
			)}
		</div>
	)
}
