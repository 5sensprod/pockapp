// frontend/modules/connect/components/InvoicePaymentDialog.tsx
// Dialog de paiement pour les factures B2B.
// Modes : paiement complet (PaymentDialogContent) | acompte (useCreateDeposit)

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { getAppPosToken } from '@/lib/apppos/apppos-api'
import { decrementStockFromCart } from '@/lib/apppos/stock-utils'
import { openCashDrawer } from '@/lib/pos/posPrint'
import { useOpenCashDrawerMutation } from '@/lib/pos/printerQueries'
import { loadPosPrinterSettings } from '@/lib/pos/printerSettings'
import { useCreateDeposit } from '@/lib/queries/deposits'
import { useRecordPayment } from '@/lib/queries/invoices'
import { canCreateDeposit } from '@/lib/types/invoice.types'
import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { CheckCircle2, ExternalLink, Info, Printer } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { PaymentDialogContent } from '../../cash/components/terminal/payment/PaymentDialog'
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

type PaymentTab = 'full' | 'deposit'
type DepositMode = 'percent' | 'amount'

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

	// Onglet actif : paiement complet ou acompte
	const [activeTab, setActiveTab] = React.useState<PaymentTab>('full')

	// Acompte
	const [depositMode, setDepositMode] = React.useState<DepositMode>('percent')
	const [depositPercentage, setDepositPercentage] = React.useState(30)
	const [depositAmount, setDepositAmount] = React.useState('')

	const recordPayment = useRecordPayment()
	const createDeposit = useCreateDeposit()
	const openDrawer = useOpenCashDrawerMutation()
	const pb = usePocketBase()

	// Reset à chaque ouverture
	React.useEffect(() => {
		if (open) {
			setPaymentEntries([])
			setIsProcessing(false)
			setIsPaid(false)
			setPaidInvoice(null)
			setActiveTab('full')
			setDepositMode('percent')
			setDepositPercentage(30)
			setDepositAmount('')
		}
	}, [open])

	if (!invoice) return null

	// Montant réel à encaisser (tient compte des acomptes déjà versés)
	const hasDeposits = (invoice.deposits_total_ttc ?? 0) > 0
	const totalTtc = hasDeposits
		? round2(invoice.balance_due ?? invoice.total_ttc)
		: invoice.total_ttc
	const depositsPaid = invoice.deposits_total_ttc ?? 0

	// Montant calculé pour l'acompte
	const depositAmountNum = round2(
		Number.parseFloat(depositAmount.replace(',', '.')) || 0,
	)
	const depositFromPercent = round2(
		(invoice.total_ttc * depositPercentage) / 100,
	)
	const isDepositValid =
		depositMode === 'percent'
			? depositPercentage > 0 && depositPercentage < 100
			: depositAmountNum > 0 && depositAmountNum < invoice.total_ttc

	// Peut-on proposer un acompte ?
	const showDepositTab = canCreateDeposit(invoice)

	// ── Paiement complet ──────────────────────────────────────────────────────
	const handleConfirmPayment = async (entries: PaymentEntry[]) => {
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

			// ── Décrément stock AppPOS + journalisation product_events ────────
			if (getAppPosToken() && invoice.items?.length) {
				const stockItems = invoice.items
					.filter((it: any) => !!it?.product_id)
					.map((it: any) => ({
						productId: it.product_id,
						productName: it.name ?? '',
						quantitySold: Math.abs(Number(it.quantity ?? 1)),
					}))
				if (stockItems.length > 0) {
					try {
						await decrementStockFromCart(stockItems, {
							pb,
							sourceId: invoice.id,
							operator: '',
						})
					} catch (err) {
						console.error('❌ Erreur synchro stock AppPOS:', err)
					}
				}
			}

			// Tiroir-caisse — ouverture auto si activé (tous moyens de paiement)
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
					/* non-fatal */
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

	// ── Acompte ───────────────────────────────────────────────────────────────
	const handleConfirmDeposit = async () => {
		if (!isDepositValid) return
		setIsProcessing(true)
		try {
			const input =
				depositMode === 'percent'
					? { parentId: invoice.id, percentage: depositPercentage }
					: { parentId: invoice.id, amount: depositAmountNum }

			await createDeposit.mutateAsync(input)
			const label =
				depositMode === 'percent'
					? `Acompte de ${depositPercentage}% créé (${formatCurrency(depositFromPercent)})`
					: `Acompte de ${formatCurrency(depositAmountNum)} créé`
			toast.success(label)
			onOpenChange(false)
			onSkip?.()
		} catch (error: any) {
			toast.error(error.message || "Erreur lors de la création de l'acompte")
		} finally {
			setIsProcessing(false)
		}
	}

	const handleSkip = () => {
		onOpenChange(false)
		onSkip?.()
	}

	// ── Écran de succès ───────────────────────────────────────────────────────
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
									onPaid?.(paidInvoice)
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

	// ── Dialog principal ──────────────────────────────────────────────────────
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
								{invoice.expand?.customer?.name ?? 'Client'} •{' '}
								{formatCurrency(invoice.total_ttc)}
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

				{/* Récap acomptes déjà versés */}
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

				{/* Onglets Paiement / Acompte */}
				{showDepositTab && (
					<div className='flex rounded-md overflow-hidden border border-border text-xs font-medium'>
						<button
							type='button'
							className={`flex-1 px-3 py-2 transition-colors ${
								activeTab === 'full'
									? 'bg-primary text-primary-foreground'
									: 'bg-background text-muted-foreground hover:bg-muted'
							}`}
							onClick={() => setActiveTab('full')}
						>
							Paiement complet
						</button>
						<button
							type='button'
							className={`flex-1 px-3 py-2 transition-colors ${
								activeTab === 'deposit'
									? 'bg-primary text-primary-foreground'
									: 'bg-background text-muted-foreground hover:bg-muted'
							}`}
							onClick={() => setActiveTab('deposit')}
						>
							Acompte
						</button>
					</div>
				)}

				{activeTab === 'full' ? (
					<>
						{/* Hint split */}
						<div className='flex items-start gap-2 rounded-md bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700'>
							<Info className='h-3.5 w-3.5 mt-0.5 flex-shrink-0' />
							<span>
								Sélectionnez un moyen et saisissez le montant.{' '}
								<strong>Pour un paiement fractionné</strong>, saisissez un
								montant partiel — le reste sera couvert par un second moyen.
							</span>
						</div>

						{/* Contenu paiement */}
						<PaymentDialogContent
							totalTtc={totalTtc}
							paymentEntries={paymentEntries}
							onPaymentEntriesChange={setPaymentEntries}
							isProcessing={isProcessing}
							onCancel={handleSkip}
							onConfirm={handleConfirmPayment}
						/>
					</>
				) : (
					/* ── Mode acompte ── */
					<>
						<div className='space-y-4 py-2'>
							{/* Toggle % / montant */}
							<div className='flex rounded-md overflow-hidden border border-border text-xs font-medium'>
								<button
									type='button'
									className={`flex-1 px-3 py-2 transition-colors ${
										depositMode === 'percent'
											? 'bg-primary text-primary-foreground'
											: 'bg-background text-muted-foreground hover:bg-muted'
									}`}
									onClick={() => setDepositMode('percent')}
								>
									En pourcentage
								</button>
								<button
									type='button'
									className={`flex-1 px-3 py-2 transition-colors ${
										depositMode === 'amount'
											? 'bg-primary text-primary-foreground'
											: 'bg-background text-muted-foreground hover:bg-muted'
									}`}
									onClick={() => setDepositMode('amount')}
								>
									Montant fixe
								</button>
							</div>

							{depositMode === 'percent' ? (
								<div className='space-y-2'>
									<Label>Pourcentage de l'acompte</Label>
									<div className='flex items-center gap-3'>
										<Input
											type='number'
											min={1}
											max={99}
											value={depositPercentage}
											onChange={(e) =>
												setDepositPercentage(
													Math.min(
														99,
														Math.max(1, Number.parseInt(e.target.value) || 30),
													),
												)
											}
											className='w-24 text-right'
										/>
										<span className='text-sm text-muted-foreground'>%</span>
										<span className='text-sm font-semibold'>
											= {formatCurrency(depositFromPercent)}
										</span>
									</div>
									{/* Raccourcis rapides */}
									<div className='flex gap-2'>
										{[20, 30, 40, 50].map((pct) => (
											<button
												key={pct}
												type='button'
												onClick={() => setDepositPercentage(pct)}
												className={`px-3 py-1 rounded text-xs border transition-colors ${
													depositPercentage === pct
														? 'bg-primary text-primary-foreground border-primary'
														: 'border-border hover:bg-muted'
												}`}
											>
												{pct}%
											</button>
										))}
									</div>
								</div>
							) : (
								<div className='space-y-2'>
									<Label>Montant de l'acompte (TTC)</Label>
									<div className='flex items-center gap-3'>
										<Input
											type='number'
											min={0.01}
											step={0.01}
											value={depositAmount}
											onChange={(e) => setDepositAmount(e.target.value)}
											placeholder='0.00'
											className='w-36 text-right'
										/>
										<span className='text-sm text-muted-foreground'>€</span>
									</div>
									{depositAmountNum > 0 && (
										<p className='text-xs text-muted-foreground'>
											Solde restant :{' '}
											<span className='font-medium'>
												{formatCurrency(
													round2(invoice.total_ttc - depositAmountNum),
												)}
											</span>
										</p>
									)}
								</div>
							)}

							{/* Récap */}
							<div className='bg-muted/50 rounded-lg p-3 text-sm flex justify-between'>
								<span className='text-muted-foreground'>Total facture</span>
								<span className='font-semibold'>
									{formatCurrency(invoice.total_ttc)}
								</span>
							</div>
						</div>

						<DialogFooter className='flex gap-2 sm:justify-between'>
							<Button
								variant='outline'
								onClick={handleSkip}
								disabled={isProcessing}
							>
								Annuler
							</Button>
							<Button
								onClick={handleConfirmDeposit}
								disabled={!isDepositValid || isProcessing}
								className='bg-amber-600 hover:bg-amber-700'
							>
								{isProcessing
									? 'Création...'
									: `Créer l'acompte${
											depositMode === 'percent'
												? ` (${depositPercentage}%)`
												: depositAmountNum > 0
													? ` (${formatCurrency(depositAmountNum)})`
													: ''
										}`}
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	)
}
