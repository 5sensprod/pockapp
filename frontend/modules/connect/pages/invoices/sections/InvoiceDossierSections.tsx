// frontend/modules/connect/pages/invoices/sections/InvoiceDossierSections.tsx
//
// Les documents du dossier : facture d'origine, avoirs, acomptes, facture de
// solde, ticket converti, bon de commande. Extrait tel quel de
// InvoiceDetailPage.
//
// Ces blocs sont aujourd'hui conditionnes au TYPE du document, et c'est ce qui
// laisse une facture de solde sans aucun lien de retour. Le corriger est le
// travail de la zone << Dossier >>, pas de cette extraction : ici on deplace,
// on ne change rien. Voir l'audit section 2 et section 13.

import { Button } from '@/components/ui/button'
import type { DepositsForInvoice } from '@/lib/queries/deposits'
import type { InvoiceResponse } from '@/lib/types/invoice.types'
import {
	Banknote,
	ClipboardList,
	CreditCard,
	FileText,
	RefreshCcw,
} from 'lucide-react'
import { formatCurrency, formatDate } from '../../../utils/formatters'

interface Props {
	invoice: InvoiceResponse
	isCreditNote: boolean
	isDeposit: boolean
	isTicket: boolean
	estParente: boolean
	originalId: string | undefined
	originalNumber: string | undefined
	linkedCreditNotes: readonly InvoiceResponse[]
	depositsData: DepositsForInvoice | undefined
	sourceOrderId: string | null
	sourceOrder: { number?: string } | undefined
	pushCurrentToStore: (label: string) => void
	onOpenInvoice: (invoiceId: string) => void
	onOpenOrder: (orderId: string) => void
}

export function InvoiceDossierSections({
	invoice,
	isCreditNote,
	isDeposit,
	isTicket,
	estParente,
	originalId,
	originalNumber,
	linkedCreditNotes,
	depositsData,
	sourceOrderId,
	sourceOrder,
	pushCurrentToStore,
	onOpenInvoice,
	onOpenOrder,
}: Props) {
	return (
		<>
			{/* ── Documents Originaux (Avoirs / Acomptes) ──────────────── */}
			{isCreditNote && originalId && (
				<div className='border-t pt-4 space-y-2'>
					<p className='text-sm text-muted-foreground mb-2'>
						Document original
					</p>
					<div className='flex items-center justify-between bg-muted/50 rounded-lg p-3'>
						<div className='flex items-center gap-2'>
							<FileText className='h-4 w-4 text-muted-foreground' />
							<span className='font-medium text-sm'>
								{originalNumber || 'Document'}
							</span>
						</div>
						<Button
							variant='outline'
							size='sm'
							onClick={() => {
								pushCurrentToStore(`Avoir ${invoice.number}`)
								onOpenInvoice(originalId)
							}}
						>
							Voir
						</Button>
					</div>
				</div>
			)}

			{isDeposit && originalId && (
				<div className='border-t pt-4 space-y-2'>
					<p className='text-sm text-muted-foreground mb-2'>
						Facture principale
					</p>
					<div className='flex items-center justify-between bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 border border-blue-200 dark:border-blue-900'>
						<div className='flex items-center gap-2'>
							<FileText className='h-4 w-4 text-blue-600' />
							<span className='font-medium text-sm'>
								{originalNumber || 'Document'}
							</span>
						</div>
						<Button
							variant='outline'
							size='sm'
							onClick={() => {
								pushCurrentToStore(`Acompte ${invoice.number}`)
								onOpenInvoice(originalId)
							}}
						>
							Voir
						</Button>
					</div>
				</div>
			)}

			{/* ── Avoirs associés ────────────────────────────────────────── */}
			{!isCreditNote && linkedCreditNotes && linkedCreditNotes.length > 0 && (
				<div className='border-t pt-4 space-y-2'>
					<p className='text-sm text-muted-foreground mb-2'>
						{linkedCreditNotes.length === 1
							? 'Avoir associé'
							: 'Avoirs associés'}
					</p>
					<div className='space-y-2'>
						{linkedCreditNotes.map((cn) => (
							<div
								key={cn.id}
								className='flex items-center justify-between bg-red-50 dark:bg-red-950/20 rounded-lg p-3 border border-red-200 dark:border-red-900'
							>
								<div className='flex items-center gap-2'>
									<RefreshCcw className='h-4 w-4 text-red-600' />
									<div className='flex flex-col'>
										<span className='font-medium text-sm text-red-700 dark:text-red-400'>
											{cn.number}
										</span>
										<span className='text-xs text-muted-foreground'>
											{formatDate(cn.date)} • {formatCurrency(cn.total_ttc)}
										</span>
									</div>
								</div>
								<Button
									variant='outline'
									size='sm'
									onClick={() => {
										pushCurrentToStore(`Facture ${invoice.number}`)
										onOpenInvoice(cn.id)
									}}
								>
									Voir
								</Button>
							</div>
						))}
					</div>
				</div>
			)}

			{/* ── Ticket converti ────────────────────────────────────────── */}
			{isTicket &&
				invoice.converted_to_invoice &&
				invoice.converted_invoice_id && (
					<div className='border-t pt-4 space-y-2'>
						<p className='text-sm text-muted-foreground mb-2'>
							Facture associée
						</p>
						<div className='flex items-center justify-between bg-muted/50 rounded-lg p-3'>
							<div className='flex items-center gap-2'>
								<FileText className='h-4 w-4 text-muted-foreground' />
								<span className='font-medium text-sm'>Converti en facture</span>
							</div>
							<Button
								variant='outline'
								size='sm'
								onClick={() => {
									const id = invoice.converted_invoice_id
									if (id) onOpenInvoice(id)
								}}
							>
								Voir
							</Button>
						</div>
					</div>
				)}

			{/* ── Acomptes liés (Facture B2B) ────────────────────────────── */}
			{!isCreditNote && !isDeposit && !isTicket && (
				<div className='border-t pt-4 space-y-3'>
					{/* Les montants du dossier — total, acomptes encaissés, avoirs,
					    reste à payer — sont rendus par la SYNTHÈSE, en haut de page.
					    Le bloc qui vivait ici disait « Versés » pour des acomptes
					    seulement émis, et son « Solde restant » ignorait les avoirs. */}
					{/* La liste vient du dossier, désormais résolu sur la
					    PARENTE : sur une facture de solde elle porterait les
					    acomptes du dossier, alors qu'elle était vide jusqu'ici.
					    On la réserve au rôle 'parent' pour ne rien changer à
					    l'écran à cette étape. */}
					{estParente && depositsData && depositsData.depositsCount > 0 && (
						<div className='space-y-2'>
							{depositsData.deposits.map((dep) => (
								<div
									key={dep.id}
									className='flex items-center justify-between bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 border border-blue-200 dark:border-blue-900'
								>
									<div className='flex items-center gap-2'>
										<Banknote className='h-4 w-4 text-blue-600' />
										<div className='flex flex-col'>
											<span className='font-medium text-sm text-blue-700 dark:text-blue-400'>
												{dep.number}
											</span>
											<span className='text-xs text-muted-foreground'>
												{formatDate(dep.date)} • {formatCurrency(dep.total_ttc)}{' '}
												•{' '}
												{dep.is_paid ? (
													<span className='text-emerald-600'>Réglé</span>
												) : (
													<span className='text-amber-600'>En attente</span>
												)}
											</span>
										</div>
									</div>
									<Button
										variant='outline'
										size='sm'
										onClick={() => {
											pushCurrentToStore(`Facture ${invoice.number}`)
											onOpenInvoice(dep.id)
										}}
									>
										Voir
									</Button>
								</div>
							))}
							{depositsData.balanceInvoice && (
								<div className='flex items-center justify-between bg-muted/50 rounded-lg p-3 border'>
									<div className='flex items-center gap-2'>
										<CreditCard className='h-4 w-4 text-muted-foreground' />
										<div className='flex flex-col'>
											<span className='font-medium text-sm'>
												{depositsData.balanceInvoice.number}
											</span>
											<span className='text-xs text-muted-foreground'>
												Facture de solde •{' '}
												{formatDate(depositsData.balanceInvoice.date)} •{' '}
												{formatCurrency(depositsData.balanceInvoice.total_ttc)}{' '}
												•{' '}
												{depositsData.balanceInvoice.is_paid ? (
													<span className='text-emerald-600'>Réglé</span>
												) : (
													<span className='text-amber-600'>En attente</span>
												)}
											</span>
										</div>
									</div>
									<Button
										variant='outline'
										size='sm'
										onClick={() => {
											if (depositsData.balanceInvoice) {
												pushCurrentToStore(`Facture ${invoice.number}`)
												onOpenInvoice(depositsData.balanceInvoice.id)
											}
										}}
									>
										Voir
									</Button>
								</div>
							)}
						</div>
					)}
				</div>
			)}

			{/* ── Bon de commande source ─────────────────────────────────── */}
			{sourceOrderId && (
				<div className='border-t pt-4 space-y-2'>
					<p className='text-sm text-muted-foreground mb-2'>
						Bon de commande source
					</p>
					<div className='flex items-center justify-between bg-muted/50 rounded-lg p-3'>
						<div className='flex items-center gap-2'>
							<ClipboardList className='h-4 w-4 text-muted-foreground' />
							<span className='font-medium text-sm'>
								{sourceOrder?.number ?? '…'}
							</span>
						</div>
						<Button
							variant='outline'
							size='sm'
							onClick={() => {
								pushCurrentToStore(`Facture ${invoice.number}`)
								onOpenOrder(sourceOrderId)
							}}
						>
							Voir
						</Button>
					</div>
				</div>
			)}
		</>
	)
}
