// frontend/modules/connect/components/InvoicePaymentDialog.tsx
// Dialog de paiement pour les factures B2B.
// Réutilise PaymentDialog (terminal) + useRecordPayment + tiroir-caisse.
// Gère les acomptes (balance_due) et affiche un hint split paiement.

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { openCashDrawer } from '@/lib/pos/posPrint'
import { useOpenCashDrawerMutation } from '@/lib/pos/printerQueries'
import { loadPosPrinterSettings } from '@/lib/pos/printerSettings'
import { useRecordPayment } from '@/lib/queries/invoices'
import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { CheckCircle2, ExternalLink, Info, Printer } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { PaymentDialog } from '../../cash/components/terminal/payment/PaymentDialog'
import {
	type PaymentEntry,
	getMainPaymentMethodCode,
	getPaymentMethodLabel,
} from '../../cash/components/terminal/types/payment'

interface InvoicePaymentDialogProps {
	invoice: InvoiceResponse | null
	open: boolean
	onOpenChange: (open: boolean) => void
	onPaid?: (invoice: InvoiceResponse) => void
	onSkip?: () => void
}

function round2(v: number) {
	return Math.round(v * 100) / 100
}

function formatCurrency(amount: number) {
	return new Intl.NumberFormat('fr-FR', {
		style: 'currency',
		currency: 'EUR',
	}).format(amount)
}

export function InvoicePaymentDialog({
	invoice,
	open,
	onOpenChange,
	onPaid,
	onSkip,
}: InvoicePaymentDialogProps) {
	const [paymentEntries, setPaymentEntries] = React.useState<PaymentEntry[]>([])
	const [isProcessing, setIsProcessing] = React.useState(false)
	const [isPaid, setIsPaid] = React.useState(false)
	const [paidInvoice, setPaidInvoice] = React.useState<InvoiceResponse | null>(
		null,
	)

	const recordPayment = useRecordPayment()
	const openDrawer = useOpenCashDrawerMutation()

	// Reset à chaque ouverture
	React.useEffect(() => {
		if (open) {
			setPaymentEntries([])
			setIsProcessing(false)
			setIsPaid(false)
			setPaidInvoice(null)
		}
	}, [open])

	if (!invoice) return null

	// ─── Montant réel à encaisser (tient compte des acomptes déjà versés) ──────
	const hasDeposits = (invoice.deposits_total_ttc ?? 0) > 0
	const totalTtc = hasDeposits
		? round2(invoice.balance_due ?? invoice.total_ttc)
		: invoice.total_ttc
	const depositsPaid = invoice.deposits_total_ttc ?? 0

	const handleConfirm = async (entries: PaymentEntry[]) => {
		if (entries.length === 0) {
			toast.error('Aucun moyen de paiement sélectionné')
			return
		}
		const totalPaid = round2(entries.reduce((sum, e) => sum + e.amount, 0))
		if (totalPaid < totalTtc - 0.005) {
			toast.error('Montant insuffisant')
			return
		}

		setIsProcessing(true)
		try {
			const isSplit = entries.length > 1
			const mainCode = getMainPaymentMethodCode(entries)
			const methodLabel = isSplit
				? entries.map((e) => e.method.name).join(' + ')
				: getPaymentMethodLabel(entries[0].method)
			const splitPayments = isSplit
				? entries.map((e) => ({
						method: e.method.code,
						methodLabel: e.method.name,
						amount: e.amount,
					}))
				: undefined

			const result = await recordPayment.mutateAsync({
				invoiceId: invoice.id,
				paymentMethod: mainCode,
				paymentMethodLabel: methodLabel,
				paidAt: new Date().toISOString(),
				splitPayments,
			})

			// Tiroir-caisse si paiement espèces et settings activés
			const hasCash = entries.some(
				(e) => e.method.accounting_category === 'cash',
			)
			if (hasCash) {
				const printerSettings = loadPosPrinterSettings()
				if (
					printerSettings.enabled &&
					printerSettings.printerName &&
					printerSettings.autoOpenDrawer
				) {
					try {
						await openCashDrawer({
							printerName: printerSettings.printerName,
							width: printerSettings.width,
						})
					} catch {
						// Non-fatal
					}
				}
			}

			setPaidInvoice(result.invoice)
			setIsPaid(true)
			toast.success(`Facture ${invoice.number} — paiement enregistré`)
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors du paiement')
		} finally {
			setIsProcessing(false)
		}
	}

	const handleSkip = () => {
		onOpenChange(false)
		onSkip?.()
	}

	// ─── Écran de succès ────────────────────────────────────────────────────────
	if (isPaid && paidInvoice) {
		return (
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className='sm:max-w-md'>
					<DialogHeader>
						<DialogTitle className='flex items-center gap-2 text-emerald-700'>
							<CheckCircle2 className='h-5 w-5' />
							Paiement enregistré
						</DialogTitle>
						<DialogDescription>
							Facture {paidInvoice.number} —{' '}
							{formatCurrency(paidInvoice.total_ttc)}
						</DialogDescription>
					</DialogHeader>
					<div className='space-y-3 pt-2'>
						<div className='flex items-center justify-between p-3 bg-slate-50 rounded-lg'>
							<span className='text-sm text-muted-foreground'>
								Tiroir-caisse
							</span>
							<Button
								variant='outline'
								size='sm'
								onClick={() => openDrawer.mutate()}
								disabled={openDrawer.isPending}
							>
								<Printer className='h-4 w-4 mr-2' />
								Ouvrir le tiroir
							</Button>
						</div>
						<div className='flex gap-2 pt-2'>
							<Button variant='outline' className='flex-1' onClick={handleSkip}>
								Nouvelle facture
							</Button>
							<Button
								className='flex-1'
								onClick={() => {
									onOpenChange(false)
									if (paidInvoice) onPaid?.(paidInvoice)
								}}
							>
								<ExternalLink className='h-4 w-4 mr-2' />
								Voir la facture
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		)
	}

	// ─── Dialog de paiement principal ───────────────────────────────────────────
	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				if (!isProcessing) onOpenChange(v)
			}}
		>
			<DialogContent className='sm:max-w-lg'>
				{/* Header */}
				<DialogHeader>
					<div className='flex items-center justify-between'>
						<div>
							<DialogTitle className='text-base'>
								Encaissement — {invoice.number}
							</DialogTitle>
							<DialogDescription>
								{invoice.expand?.customer?.name ?? 'Client'}
							</DialogDescription>
						</div>
						<Button
							variant='outline'
							size='sm'
							onClick={() => openDrawer.mutate()}
							disabled={openDrawer.isPending}
						>
							<Printer className='h-4 w-4 mr-2' />
							Tiroir
						</Button>
					</div>
				</DialogHeader>

				{/* Récap acomptes si applicable */}
				{hasDeposits && (
					<div className='rounded-lg border bg-amber-50 border-amber-200 px-4 py-3 space-y-2'>
						<p className='text-xs font-medium text-amber-900'>
							Acomptes déjà versés
						</p>
						<div className='flex justify-between text-sm'>
							<span className='text-muted-foreground'>Total facture</span>
							<span className='font-medium'>
								{formatCurrency(invoice.total_ttc)}
							</span>
						</div>
						<div className='flex justify-between text-sm'>
							<span className='text-muted-foreground'>Acomptes encaissés</span>
							<span className='font-medium text-amber-700'>
								-{formatCurrency(depositsPaid)}
							</span>
						</div>
						<Separator className='border-amber-200' />
						<div className='flex justify-between text-sm font-semibold'>
							<span>Solde à régler</span>
							<Badge
								variant='outline'
								className='text-amber-800 border-amber-300 font-semibold'
							>
								{formatCurrency(totalTtc)}
							</Badge>
						</div>
					</div>
				)}

				{/* Hint split paiement */}
				<div className='flex items-start gap-2 rounded-md bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700'>
					<Info className='h-3.5 w-3.5 mt-0.5 flex-shrink-0' />
					<span>
						Sélectionnez un moyen et saisissez le montant.{' '}
						<strong>Pour un paiement fractionné</strong>, saisissez un montant
						partiel — le reste sera à couvrir par un second moyen.
					</span>
				</div>

				{/* PaymentDialog du terminal */}
				<PaymentDialog
					totalTtc={totalTtc}
					paymentEntries={paymentEntries}
					onPaymentEntriesChange={setPaymentEntries}
					isProcessing={isProcessing}
					onCancel={handleSkip}
					onConfirm={handleConfirm}
				/>
			</DialogContent>
		</Dialog>
	)
}
