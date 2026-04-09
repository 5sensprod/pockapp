// frontend/modules/connect/pages/invoices/InvoiceDetailPage.tsx

import { EmptyState } from '@/components/module-ui'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import type { CompaniesResponse } from '@/lib/pocketbase-types'
import {
	useCreateBalanceInvoice,
	useCreateDeposit,
	useDepositsForInvoice,
} from '@/lib/queries/deposits'
import { useCreditNotesForInvoice, useInvoice } from '@/lib/queries/invoices'
import {
	canCreateBalanceInvoice,
	canCreateDeposit,
	getDisplayStatus,
	isOverdue,
} from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
	AlertTriangle,
	ArrowLeft,
	Banknote,
	CheckCircle,
	CreditCard,
	Download,
	FileText,
	Loader2,
	Mail,
	Pencil,
	Plus,
	RefreshCcw,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ConnectModuleShell } from '../../ConnectModuleShell'
import { SendInvoiceEmailDialog } from '../../dialogs/SendInvoiceEmailDialog'
import { InvoicePdfDocument } from '../../pdf/InvoicePdf'
import { downloadInvoicePdf } from '../../utils/downloadPdf'
import {
	formatCurrency,
	formatDate,
	formatPaymentMethod,
	round2,
} from '../../utils/formatters'

// ── Types locaux ─────────────────────────────────────────────────────────────

type VatBreakdown = {
	rate: number
	base_ht: number
	vat: number
	total_ttc: number
}

// ── Helpers locaux (spécifiques à cette page) ────────────────────────────────

function getLineDiscountLabel(item: any): {
	label: string
	hasDiscount: boolean
} {
	const mode = item?.line_discount_mode
	const value = item?.line_discount_value
	if (!mode || value == null) return { label: '-', hasDiscount: false }

	if (mode === 'percent') {
		const p = Math.max(0, Math.min(100, Number(value) || 0))
		if (p <= 0) return { label: '-', hasDiscount: false }
		return { label: `-${p}%`, hasDiscount: true }
	}

	const beforeUnitTtc = Number(item?.unit_price_ttc_before_discount)
	const unitHt = Number(item?.unit_price_ht ?? 0)
	const tvaRate = Number(item?.tva_rate ?? 20)
	const effectiveUnitTtc = round2(unitHt * (1 + tvaRate / 100))

	if (Number.isFinite(beforeUnitTtc) && beforeUnitTtc > 0) {
		const diff = round2(Math.max(0, beforeUnitTtc - effectiveUnitTtc))
		if (diff <= 0) return { label: '-', hasDiscount: false }
		return { label: `-${diff.toFixed(2)} €/u`, hasDiscount: true }
	}

	const v = round2(Math.max(0, Number(value) || 0))
	if (v <= 0) return { label: '-', hasDiscount: false }
	return { label: `-${v.toFixed(2)} €`, hasDiscount: true }
}

function getSoldByLabel(invoice: any): string {
	const soldBy = invoice?.expand?.sold_by
	return (
		soldBy?.name ||
		soldBy?.username ||
		soldBy?.email ||
		(invoice?.sold_by ? String(invoice.sold_by) : '-')
	)
}

// ── Composant ────────────────────────────────────────────────────────────────

export function InvoiceDetailPage() {
	const navigate = useNavigate()
	const { invoiceId } = useParams({ from: '/connect/invoices/$invoiceId/' })
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as any

	const { data: invoice, isLoading } = useInvoice(invoiceId)
	const [company, setCompany] = useState<CompaniesResponse | null>(null)
	const [isDownloading, setIsDownloading] = useState(false)
	const [emailDialogOpen, setEmailDialogOpen] = useState(false)

	const isCreditNote = invoice?.invoice_type === 'credit_note'
	const isDeposit = invoice?.invoice_type === 'deposit'
	const originalId = (invoice as any)?.original_invoice_id

	const { data: depositsData } = useDepositsForInvoice(
		!isCreditNote && !isDeposit ? invoiceId : undefined,
	)
	const { data: linkedCreditNotes } = useCreditNotesForInvoice(
		!isCreditNote ? invoiceId : undefined,
	)

	const createDeposit = useCreateDeposit()
	const createBalanceInvoice = useCreateBalanceInvoice()

	const [depositDialogOpen, setDepositDialogOpen] = useState(false)
	const [depositPercentage, setDepositPercentage] = useState<number>(30)
	const [depositMode, setDepositMode] = useState<'percent' | 'amount'>(
		'percent',
	)
	const [depositAmount, setDepositAmount] = useState<string>('')

	const originalDocument = (invoice as any)?.expand?.original_invoice_id
	const originalNumber = originalDocument?.number

	// Charger l'entreprise au montage (nécessaire pour le PDF)
	useEffect(() => {
		const loadCompany = async () => {
			if (!activeCompanyId) return
			try {
				const c = await pb.collection('companies').getOne(activeCompanyId)
				setCompany(c)
			} catch (err) {
				console.error(err)
			}
		}
		void loadCompany()
	}, [activeCompanyId, pb])

	// ── Calculs ───────────────────────────────────────────────────────────────

	const vatBreakdown = useMemo<VatBreakdown[]>(() => {
		const inv = invoice as any
		const items = Array.isArray(inv?.items) ? inv.items : []
		const map = new Map<number, VatBreakdown>()
		for (const it of items) {
			const rate = Number(it?.tva_rate ?? 20)
			const ht = Number(it?.total_ht ?? 0)
			const ttc = Number(it?.total_ttc ?? 0)
			const vat = ttc - ht
			let entry = map.get(rate)
			if (!entry) {
				entry = { rate, base_ht: 0, vat: 0, total_ttc: 0 }
				map.set(rate, entry)
			}
			entry.base_ht = round2(entry.base_ht + ht)
			entry.vat = round2(entry.vat + vat)
			entry.total_ttc = round2(entry.total_ttc + ttc)
		}
		return Array.from(map.values()).sort((a, b) => a.rate - b.rate)
	}, [invoice])

	const discounts = useMemo(() => {
		const inv: any = invoice as any
		const totalTtc = Number(inv?.total_ttc ?? 0)
		const lineDiscountsTtc = Number(inv?.line_discounts_total_ttc ?? 0)
		const cartDiscountTtc = Number(inv?.cart_discount_ttc ?? 0)
		const subtotalAfterLine = round2(totalTtc + cartDiscountTtc)
		const grandSubtotal = round2(subtotalAfterLine + lineDiscountsTtc)
		const hasAnyDiscount = lineDiscountsTtc > 0 || cartDiscountTtc > 0
		let cartDiscountLabel = ''
		const mode = inv?.cart_discount_mode
		const value = inv?.cart_discount_value
		if (cartDiscountTtc > 0 && mode && value != null) {
			if (mode === 'percent') cartDiscountLabel = `(${Number(value) || 0}%)`
			else cartDiscountLabel = `(${round2(Number(value) || 0).toFixed(2)} €)`
		}
		return {
			hasAnyDiscount,
			totalTtc: round2(totalTtc),
			grandSubtotal,
			lineDiscountsTtc: round2(lineDiscountsTtc),
			cartDiscountTtc: round2(cartDiscountTtc),
			cartDiscountLabel,
		}
	}, [invoice])

	// ── Guards ────────────────────────────────────────────────────────────────

	const backButton = (
		<Button
			variant='ghost'
			size='icon'
			onClick={() => navigate({ to: '/connect/invoices' })}
		>
			<ArrowLeft className='h-4 w-4' />
		</Button>
	)

	if (isLoading) {
		return (
			<ConnectModuleShell
				pageTitle='Facture'
				headerLeft={backButton}
				primaryAction={null}
				hideBadge
			>
				<EmptyState icon={FileText} title='Chargement...' fullPage />
			</ConnectModuleShell>
		)
	}

	if (!invoice) {
		return (
			<ConnectModuleShell
				pageTitle='Facture'
				headerLeft={backButton}
				primaryAction={null}
				hideBadge
			>
				<EmptyState
					icon={FileText}
					title='Facture introuvable'
					description="Cette facture n'existe pas ou a été supprimée."
					actions={[
						{
							label: 'Retour aux factures',
							onClick: () => navigate({ to: '/connect/invoices' }),
							variant: 'secondary',
						},
					]}
					fullPage
				/>
			</ConnectModuleShell>
		)
	}

	// ── Données dérivées ──────────────────────────────────────────────────────

	const customer = (invoice as any)?.expand?.customer ?? null
	const displayStatus = getDisplayStatus(invoice)
	const badgeVariant = (displayStatus.variant ??
		'outline') as BadgeProps['variant']
	const overdue = isOverdue(invoice)
	const soldByLabel = getSoldByLabel(invoice as any)

	// ── Actions ───────────────────────────────────────────────────────────────

	const handleDownloadPdf = async () => {
		if (!activeCompanyId) {
			toast.error('Aucune entreprise sélectionnée')
			return
		}
		setIsDownloading(true)
		const result = await downloadInvoicePdf({
			pb,
			invoice,
			activeCompanyId,
			cachedCompany: company,
			PdfDocument: InvoicePdfDocument,
		})
		if (!result.ok) toast.error('Erreur lors de la génération du PDF')
		else toast.success('Facture téléchargée')
		setIsDownloading(false)
	}

	const handleCreateDeposit = async () => {
		if (!invoice) return
		const baseAmount = invoice.deposits_total_ttc
			? (invoice.balance_due ?? invoice.total_ttc)
			: invoice.total_ttc
		let percentage: number
		if (depositMode === 'amount') {
			const amountVal = Number.parseFloat(depositAmount.replace(',', '.'))
			if (!amountVal || amountVal <= 0 || amountVal >= baseAmount) {
				toast.error('Montant invalide')
				return
			}
			percentage = round2((amountVal / baseAmount) * 100)
		} else {
			percentage = depositPercentage
		}
		try {
			await createDeposit.mutateAsync({ parentId: invoice.id, percentage })
			const label =
				depositMode === 'amount'
					? `${Number.parseFloat(depositAmount.replace(',', '.')).toFixed(2)} €`
					: `${percentage}%`
			toast.success(`Acompte de ${label} créé`)
			setDepositDialogOpen(false)
			setDepositAmount('')
		} catch (err: any) {
			toast.error(err?.message || "Erreur lors de la création de l'acompte")
		}
	}

	const handleCreateBalanceInvoice = async () => {
		if (!invoice) return
		try {
			await createBalanceInvoice.mutateAsync(invoice.id)
			toast.success('Facture de solde créée')
		} catch (err: any) {
			toast.error(
				err?.message || 'Erreur lors de la création de la facture de solde',
			)
		}
	}

	// ── Badge statut ──────────────────────────────────────────────────────────

	const renderStatusBadges = () => {
		if (isCreditNote) {
			return (
				<>
					<Badge variant={badgeVariant}>{displayStatus.label}</Badge>
					<Badge className='bg-blue-600 hover:bg-blue-600'>
						<RefreshCcw className='h-3 w-3 mr-1' />
						Remboursé
					</Badge>
				</>
			)
		}
		if (isDeposit) {
			return (
				<>
					<Badge variant={badgeVariant}>{displayStatus.label}</Badge>
					{invoice.is_paid && (
						<Badge className='bg-emerald-600 hover:bg-emerald-600'>
							<CheckCircle className='h-3 w-3 mr-1' />
							Réglé
						</Badge>
					)}
					{(invoice as any).has_credit_note && (
						<Badge className='bg-red-600 hover:bg-red-600'>
							<RefreshCcw className='h-3 w-3 mr-1' />
							Remboursé
						</Badge>
					)}
				</>
			)
		}
		const showStatusBadge =
			displayStatus.label && displayStatus.label !== 'Payée'
		return (
			<>
				{showStatusBadge && (
					<Badge variant={badgeVariant}>{displayStatus.label}</Badge>
				)}
				{invoice.is_paid || displayStatus.isPaid ? (
					<Badge className='bg-emerald-600 hover:bg-emerald-600'>
						<CheckCircle className='h-3 w-3 mr-1' />
						Payée
					</Badge>
				) : overdue ? (
					<Badge className='bg-amber-600 hover:bg-amber-600'>
						<AlertTriangle className='h-3 w-3 mr-1' />
						En retard
					</Badge>
				) : (
					<Badge variant='secondary'>Non payée</Badge>
				)}
			</>
		)
	}

	// ── Titre contextuel ──────────────────────────────────────────────────────

	const pageTitle = isCreditNote
		? `Avoir ${invoice.number || ''}`
		: invoice.is_pos_ticket
			? `Ticket ${invoice.number || ''}`
			: `Facture ${invoice.number || ''}`

	// ── Actions header droite ─────────────────────────────────────────────────

	const headerActions = (
		<div className='flex items-center gap-2'>
			<Button
				variant='outline'
				size='sm'
				onClick={() => setEmailDialogOpen(true)}
			>
				<Mail className='h-4 w-4 mr-2' />
				Envoyer
			</Button>
			<Button
				variant='outline'
				size='sm'
				onClick={handleDownloadPdf}
				disabled={isDownloading}
			>
				{isDownloading ? (
					<Loader2 className='h-4 w-4 animate-spin mr-2' />
				) : (
					<Download className='h-4 w-4 mr-2' />
				)}
				PDF
			</Button>
		</div>
	)

	return (
		<ConnectModuleShell
			pageTitle={pageTitle}
			pageIcon={FileText}
			headerLeft={
				<Button
					variant='ghost'
					size='icon'
					onClick={() => navigate({ to: '/connect/invoices' })}
				>
					<ArrowLeft className='h-4 w-4' />
				</Button>
			}
			headerRight={headerActions}
			primaryAction={
				invoice.status === 'draft' ? (
					<Button
						size='sm'
						onClick={() =>
							navigate({
								to: '/connect/invoices/$invoiceId/edit',
								params: { invoiceId },
							})
						}
					>
						<Pencil className='h-4 w-4 mr-1.5' />
						Modifier
					</Button>
				) : null
			}
			hideBadge
		>
			<div className='grid grid-cols-1 lg:grid-cols-4 gap-6'>
				{/* ── Colonne gauche : détails généraux ── */}
				<Card className='lg:col-span-1'>
					<CardHeader>
						<CardTitle>
							{isCreditNote
								? 'Avoir'
								: invoice.is_pos_ticket
									? 'Ticket'
									: 'Facture'}
						</CardTitle>
						<CardDescription>Détails généraux</CardDescription>
					</CardHeader>
					<CardContent className='space-y-4'>
						<div>
							<p className='text-sm text-muted-foreground'>Numéro</p>
							<p className='font-medium'>{invoice.number || '-'}</p>
						</div>
						<div>
							<p className='text-sm text-muted-foreground'>Date</p>
							<p className='text-sm'>{formatDate(invoice.date)}</p>
						</div>
						{invoice.due_date && (
							<div>
								<p className='text-sm text-muted-foreground'>Échéance</p>
								<p className='text-sm'>{formatDate(invoice.due_date)}</p>
							</div>
						)}
						{!isCreditNote && (
							<div>
								<p className='text-sm text-muted-foreground'>
									{invoice.is_pos_ticket ? 'Vendeur / Caissier' : 'Vendeur'}
								</p>
								<p className='text-sm font-medium'>{soldByLabel}</p>
							</div>
						)}
						{!isCreditNote && invoice.is_paid && (
							<>
								<div>
									<p className='text-sm text-muted-foreground'>
										Moyen de paiement
									</p>
									<p className='text-sm font-medium'>
										{formatPaymentMethod((invoice as any).payment_method)}
									</p>
								</div>
								<div>
									<p className='text-sm text-muted-foreground'>Payée le</p>
									<p className='text-sm'>
										{formatDate((invoice as any).paid_at)}
									</p>
								</div>
							</>
						)}
						<div className='flex items-center gap-2 flex-wrap'>
							{renderStatusBadges()}
						</div>

						{/* ── Avoir : remboursement + document original ── */}
						{isCreditNote && (
							<>
								{(invoice as any).refund_method && (
									<div>
										<p className='text-sm text-muted-foreground'>
											Moyen de remboursement
										</p>
										<p className='text-sm font-medium'>
											{formatPaymentMethod((invoice as any).refund_method)}
										</p>
									</div>
								)}
								{(invoice as any).cancellation_reason && (
									<div>
										<p className='text-sm text-muted-foreground'>
											Motif du remboursement
										</p>
										<p className='text-sm'>
											{(invoice as any).cancellation_reason}
										</p>
									</div>
								)}
								{originalId && (
									<div className='border-t pt-4'>
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
												onClick={() =>
													navigate({
														to: '/connect/invoices/$invoiceId',
														params: { invoiceId: originalId },
													})
												}
											>
												Voir
											</Button>
										</div>
									</div>
								)}
							</>
						)}

						{/* ── Avoirs liés (ticket/facture) ── */}
						{!isCreditNote &&
							linkedCreditNotes &&
							linkedCreditNotes.length > 0 && (
								<div className='border-t pt-4'>
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
															{formatDate(cn.date)} •{' '}
															{formatCurrency(cn.total_ttc)}
														</span>
													</div>
												</div>
												<Button
													variant='outline'
													size='sm'
													onClick={() =>
														navigate({
															to: '/connect/invoices/$invoiceId',
															params: { invoiceId: cn.id },
														})
													}
												>
													Voir
												</Button>
											</div>
										))}
									</div>
								</div>
							)}

						{/* ── Ticket converti en facture ── */}
						{invoice.is_pos_ticket &&
							invoice.converted_to_invoice &&
							invoice.converted_invoice_id && (
								<div className='border-t pt-4'>
									<p className='text-sm text-muted-foreground mb-2'>
										Facture associée
									</p>
									<div className='flex items-center justify-between bg-muted/50 rounded-lg p-3'>
										<div className='flex items-center gap-2'>
											<FileText className='h-4 w-4 text-muted-foreground' />
											<span className='font-medium'>Converti en facture</span>
										</div>
										<Button
											variant='outline'
											size='sm'
											onClick={() => {
												const id = invoice.converted_invoice_id
												if (id)
													navigate({
														to: '/connect/invoices/$invoiceId',
														params: { invoiceId: id },
													})
											}}
										>
											Voir la facture
										</Button>
									</div>
								</div>
							)}

						{/* ── Acomptes (facture B2B) ── */}
						{!isCreditNote && !isDeposit && !invoice.is_pos_ticket && (
							<div className='border-t pt-4 space-y-3'>
								{(invoice.deposits_total_ttc ?? 0) > 0 && (
									<div className='space-y-1'>
										<p className='text-sm font-medium text-muted-foreground'>
											Acomptes
										</p>
										<div className='flex justify-between text-sm'>
											<span className='text-muted-foreground'>Versés</span>
											<span className='font-medium text-emerald-600'>
												{formatCurrency(
													invoice.deposits_total_ttc ?? 0,
													invoice.currency,
												)}
											</span>
										</div>
										<div className='flex justify-between text-sm'>
											<span className='text-muted-foreground'>
												Solde restant
											</span>
											<span className='font-semibold'>
												{formatCurrency(
													invoice.balance_due ?? invoice.total_ttc,
													invoice.currency,
												)}
											</span>
										</div>
									</div>
								)}
								{depositsData && depositsData.depositsCount > 0 && (
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
															{formatDate(dep.date)} •{' '}
															{formatCurrency(dep.total_ttc)} •{' '}
															{dep.is_paid ? (
																<span className='text-emerald-600'>Réglé</span>
															) : (
																<span className='text-amber-600'>
																	En attente
																</span>
															)}
														</span>
													</div>
												</div>
												<Button
													variant='outline'
													size='sm'
													onClick={() =>
														navigate({
															to: '/connect/invoices/$invoiceId',
															params: { invoiceId: dep.id },
														})
													}
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
															Facture de solde
														</span>
													</div>
												</div>
												<Button
													variant='outline'
													size='sm'
													onClick={() => {
														if (depositsData.balanceInvoice)
															navigate({
																to: '/connect/invoices/$invoiceId',
																params: {
																	invoiceId: depositsData.balanceInvoice.id,
																},
															})
													}}
												>
													Voir
												</Button>
											</div>
										)}
									</div>
								)}

								{/* Créer un acompte */}
								<div className='flex flex-col gap-2'>
									{invoice &&
										canCreateDeposit(invoice) &&
										(depositDialogOpen ? (
											<div className='space-y-2 bg-muted/50 rounded-lg p-3'>
												<p className='text-sm font-medium'>Nouvel acompte</p>
												<div className='flex rounded-md overflow-hidden border border-border text-xs font-medium'>
													<button
														type='button'
														className={`flex-1 px-2 py-1.5 transition-colors ${depositMode === 'percent' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
														onClick={() => setDepositMode('percent')}
													>
														%
													</button>
													<button
														type='button'
														className={`flex-1 px-2 py-1.5 transition-colors ${depositMode === 'amount' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
														onClick={() => setDepositMode('amount')}
													>
														€
													</button>
												</div>
												{depositMode === 'percent' ? (
													<>
														<div className='flex items-center gap-2'>
															<input
																type='range'
																min={10}
																max={90}
																step={5}
																value={depositPercentage}
																onChange={(e) =>
																	setDepositPercentage(Number(e.target.value))
																}
																className='flex-1'
															/>
															<span className='text-sm font-semibold w-10'>
																{depositPercentage}%
															</span>
														</div>
														<p className='text-xs text-muted-foreground'>
															≈{' '}
															{formatCurrency(
																((invoice.deposits_total_ttc
																	? (invoice.balance_due ?? invoice.total_ttc)
																	: invoice.total_ttc) *
																	depositPercentage) /
																	100,
																invoice.currency,
															)}
														</p>
													</>
												) : (
													<>
														<div className='flex items-center gap-2'>
															<input
																type='number'
																min={0.01}
																step={0.01}
																placeholder='Montant en €'
																value={depositAmount}
																onChange={(e) =>
																	setDepositAmount(e.target.value)
																}
																className='flex-1 text-sm border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring'
															/>
															<span className='text-sm font-semibold'>€</span>
														</div>
														{depositAmount &&
															Number.parseFloat(
																depositAmount.replace(',', '.'),
															) > 0 && (
																<p className='text-xs text-muted-foreground'>
																	≈{' '}
																	{round2(
																		(Number.parseFloat(
																			depositAmount.replace(',', '.'),
																		) /
																			(invoice.deposits_total_ttc
																				? (invoice.balance_due ??
																					invoice.total_ttc)
																				: invoice.total_ttc)) *
																			100,
																	).toFixed(1)}
																	% du total
																</p>
															)}
													</>
												)}
												<div className='flex gap-2'>
													<Button
														size='sm'
														onClick={handleCreateDeposit}
														disabled={createDeposit.isPending}
													>
														{createDeposit.isPending && (
															<Loader2 className='h-3 w-3 animate-spin mr-1' />
														)}
														Créer
													</Button>
													<Button
														size='sm'
														variant='ghost'
														onClick={() => setDepositDialogOpen(false)}
													>
														Annuler
													</Button>
												</div>
											</div>
										) : (
											<Button
												variant='outline'
												size='sm'
												className='w-full'
												onClick={() => setDepositDialogOpen(true)}
											>
												<Plus className='h-4 w-4 mr-2' />
												Demander un acompte
											</Button>
										))}

									{invoice &&
										canCreateBalanceInvoice(invoice) &&
										!depositsData?.balanceInvoice &&
										depositsData?.pendingCount === 0 && (
											<Button
												variant='outline'
												size='sm'
												className='w-full'
												onClick={handleCreateBalanceInvoice}
												disabled={createBalanceInvoice.isPending}
											>
												{createBalanceInvoice.isPending ? (
													<Loader2 className='h-3 w-3 animate-spin mr-2' />
												) : (
													<CreditCard className='h-4 w-4 mr-2' />
												)}
												Générer la facture de solde
											</Button>
										)}
								</div>
							</div>
						)}

						{/* ── Acompte : lien vers facture parente ── */}
						{isDeposit && originalId && (
							<div className='border-t pt-4'>
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
										onClick={() =>
											navigate({
												to: '/connect/invoices/$invoiceId',
												params: { invoiceId: originalId },
											})
										}
									>
										Voir
									</Button>
								</div>
							</div>
						)}

						{invoice.notes && (
							<div>
								<p className='text-sm text-muted-foreground'>Notes</p>
								<p className='text-sm'>{invoice.notes}</p>
							</div>
						)}
					</CardContent>
				</Card>

				{/* ── Client ── */}
				<Card>
					<CardHeader>
						<CardTitle>Client</CardTitle>
					</CardHeader>
					<CardContent>
						{customer ? (
							<div className='space-y-2'>
								<p className='font-medium'>{customer.name}</p>
								{customer.company && (
									<p className='text-sm text-muted-foreground'>
										{customer.company}
									</p>
								)}
								{customer.email && (
									<p className='text-sm text-muted-foreground'>
										{customer.email}
									</p>
								)}
								{customer.phone && (
									<p className='text-sm text-muted-foreground'>
										{customer.phone}
									</p>
								)}
								{customer.address && (
									<p className='text-sm text-muted-foreground'>
										{customer.address}
									</p>
								)}
							</div>
						) : (
							<p className='text-muted-foreground'>Client inconnu</p>
						)}
					</CardContent>
				</Card>

				{/* ── Articles ── */}
				<Card className='lg:col-span-3'>
					<CardHeader>
						<CardTitle>Articles</CardTitle>
						<CardDescription>
							{invoice.items.length} ligne(s) dans{' '}
							{isCreditNote
								? 'cet avoir'
								: invoice.is_pos_ticket
									? 'ce ticket'
									: 'cette facture'}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Article</TableHead>
									<TableHead className='text-center w-20'>Qté</TableHead>
									<TableHead className='text-right'>P.U. HT</TableHead>
									<TableHead className='text-right'>Remise</TableHead>
									<TableHead className='text-right'>TVA</TableHead>
									<TableHead className='text-right'>Total TTC</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{invoice.items.map((item: any, idx: number) => {
									const promo = getLineDiscountLabel(item)
									const beforeUnitTtc = Number(
										item?.unit_price_ttc_before_discount,
									)
									const hasBefore =
										Number.isFinite(beforeUnitTtc) && beforeUnitTtc > 0
									const coef = 1 + Number(item?.tva_rate ?? 20) / 100
									const unitTtcFromHt = round2(
										Number(item?.unit_price_ht ?? 0) * coef,
									)
									return (
										<TableRow key={`${item.name}-${idx}`}>
											<TableCell className='font-medium'>
												<div className='flex flex-col'>
													<span>{item.name}</span>
													{hasBefore && promo.hasDiscount && (
														<span className='text-xs text-muted-foreground'>
															<span className='line-through mr-2'>
																{round2(beforeUnitTtc).toFixed(2)} €
															</span>
															<span>{unitTtcFromHt.toFixed(2)} € TTC</span>
														</span>
													)}
												</div>
											</TableCell>
											<TableCell className='text-center'>
												{item.quantity}
											</TableCell>
											<TableCell className='text-right'>
												{Number(item.unit_price_ht ?? 0).toFixed(2)} €
											</TableCell>
											<TableCell className='text-right'>
												{promo.label}
											</TableCell>
											<TableCell className='text-right'>
												{item.tva_rate}%
											</TableCell>
											<TableCell className='text-right'>
												{Number(item.total_ttc ?? 0).toFixed(2)} €
											</TableCell>
										</TableRow>
									)
								})}
							</TableBody>
						</Table>

						{/* Totaux */}
						<div className='mt-6 flex justify-end'>
							<div className='w-72 space-y-2 text-sm'>
								{discounts.hasAnyDiscount && (
									<>
										<div className='flex justify-between'>
											<span className='text-muted-foreground'>
												Sous-total TTC
											</span>
											<span>
												{formatCurrency(
													discounts.grandSubtotal,
													invoice.currency,
												)}
											</span>
										</div>
										{discounts.lineDiscountsTtc > 0 && (
											<div className='flex justify-between'>
												<span className='text-muted-foreground'>
													Remises lignes
												</span>
												<span>
													-
													{formatCurrency(
														discounts.lineDiscountsTtc,
														invoice.currency,
													)}
												</span>
											</div>
										)}
										{discounts.cartDiscountTtc > 0 && (
											<div className='flex justify-between'>
												<span className='text-muted-foreground'>
													Remise globale {discounts.cartDiscountLabel}
												</span>
												<span>
													-
													{formatCurrency(
														discounts.cartDiscountTtc,
														invoice.currency,
													)}
												</span>
											</div>
										)}
										<div className='border-t pt-2' />
									</>
								)}
								<div className='flex justify-between'>
									<span className='text-muted-foreground'>Total HT</span>
									<span>
										{formatCurrency(invoice.total_ht, invoice.currency)}
									</span>
								</div>
								<div className='flex justify-between'>
									<span className='text-muted-foreground'>TVA</span>
									<span>
										{formatCurrency(invoice.total_tva, invoice.currency)}
									</span>
								</div>
								{vatBreakdown.length > 0 && (
									<div className='pt-1'>
										{vatBreakdown.map((vb) => (
											<div
												key={vb.rate}
												className='flex justify-between text-xs text-muted-foreground'
											>
												<span>
													TVA {vb.rate}% sur {vb.base_ht.toFixed(2)} € HT
												</span>
												<span>{vb.vat.toFixed(2)} €</span>
											</div>
										))}
									</div>
								)}
								<div className='flex justify-between font-bold text-lg border-t pt-2'>
									<span>Total TTC</span>
									<span>
										{formatCurrency(invoice.total_ttc, invoice.currency)}
									</span>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			<SendInvoiceEmailDialog
				open={emailDialogOpen}
				onOpenChange={setEmailDialogOpen}
				invoice={invoice}
				onSuccess={() => setEmailDialogOpen(false)}
			/>
		</ConnectModuleShell>
	)
}
