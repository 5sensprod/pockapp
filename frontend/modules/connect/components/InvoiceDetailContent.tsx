// frontend/modules/connect/components/InvoiceDetailContent.tsx

import { ModuleCard } from '@/components/module-ui/ModuleCard'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { buildReceiptFromInvoice } from '@/lib/pos/buildReceiptFromInvoice'
import { downloadReceiptPreviewPdf } from '@/lib/pos/posPreview'
import { loadPosPrinterSettings } from '@/lib/pos/printerSettings'
import { useReprintTicket } from '@/lib/pos/useReprintTicket'
import {
	useCreateBalanceInvoice,
	useCreateDeposit,
	useDepositsForInvoice,
} from '@/lib/queries/deposits'
import { useCreditNotesForInvoice, useInvoice } from '@/lib/queries/invoices'
import {
	type InvoiceResponse,
	canCreateBalanceInvoice,
	canCreateDeposit,
	getDisplayStatus,
	isOverdue,
} from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { RefundTicketDialog } from '@/modules/common/RefundTicketDialog'
import {
	StockReclassificationDialog,
	type StockReclassificationItem,
} from '@/modules/common/StockReclassificationDialog'
import { pdf } from '@react-pdf/renderer'
import { useNavigate } from '@tanstack/react-router'
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
	Printer,
	Receipt,
	RefreshCcw,
	RotateCcw,
	ShoppingCart,
	User,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { formatCurrency, formatDate } from '../utils/formatters'
import { toPngDataUrl } from '../utils/images'
import { type DepositPdfData, InvoicePdfDocument } from './InvoicePdf'
import { SendInvoiceEmailDialog } from './SendInvoiceEmailDialog'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

type VatBreakdown = {
	rate: number
	base_ht: number
	vat: number
	total_ttc: number
}

function getRefundMethodLabel(method?: string): string {
	const map: Record<string, string> = {
		especes: 'Espèces',
		cb: 'Carte bancaire',
		cheque: 'Chèque',
		virement: 'Virement',
		autre: 'Autre',
	}
	return (method && map[method]) || method || '-'
}

function getPaymentMethodLabel(invoice: any): string {
	const label = (invoice?.payment_method_label || '').trim()
	if (label) return label
	const map: Record<string, string> = {
		especes: 'Espèces',
		cb: 'Carte bancaire',
		cheque: 'Chèque',
		virement: 'Virement',
		autre: 'Autre',
	}
	return (
		(invoice?.payment_method && map[invoice.payment_method]) ||
		invoice?.payment_method ||
		'-'
	)
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

export interface InvoiceDetailContentProps {
	invoiceId: string
	backRoute: string
	getDetailRoute?: (
		id: string,
		isTicket?: boolean,
	) => { to: string; params: Record<string, string> }
}

function defaultDetailRoute(id: string): {
	to: string
	params: Record<string, string>
} {
	return { to: '/connect/invoices/$invoiceId', params: { invoiceId: id } }
}

export function InvoiceDetailContent({
	invoiceId,
	backRoute,
	getDetailRoute = defaultDetailRoute,
}: InvoiceDetailContentProps) {
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as any

	const { data: invoice, isLoading } = useInvoice(invoiceId)
	const [company, setCompany] = useState<CompaniesResponse | null>(null)
	const [isDownloading, setIsDownloading] = useState(false)
	const [emailDialogOpen, setEmailDialogOpen] = useState(false)

	// ── Réimpression POS ──────────────────────────────────────────────────────
	const { reprintTicket, previewTicket, isPrinting, isPreviewing } =
		useReprintTicket()
	const isPrinterConfigured = useMemo(() => {
		const s = loadPosPrinterSettings()
		return s.enabled && !!s.printerName
	}, [])

	const isCreditNote = invoice?.invoice_type === 'credit_note'
	const originalId = (invoice as any)?.original_invoice_id
	const isDeposit = invoice?.invoice_type === 'deposit'
	const isTicket = invoice?.is_pos_ticket

	const { data: depositsData } = useDepositsForInvoice(
		!isCreditNote && !isDeposit ? invoiceId : undefined,
	)

	const createDeposit = useCreateDeposit()
	const createBalanceInvoice = useCreateBalanceInvoice()
	const [depositDialogOpen, setDepositDialogOpen] = useState(false)
	const [depositPercentage, setDepositPercentage] = useState<number>(30)
	const [depositMode, setDepositMode] = useState<'percent' | 'amount'>(
		'percent',
	)
	const [depositAmount, setDepositAmount] = useState<string>('')

	const { data: linkedCreditNotes } = useCreditNotesForInvoice(
		!isCreditNote ? invoiceId : undefined,
	)

	const originalDocument = (invoice as any)?.expand?.original_invoice_id
	const originalNumber = originalDocument?.number

	// Portals targets
	const [infoTarget, setInfoTarget] = useState<HTMLElement | null>(null)
	const [actionsTarget, setActionsTarget] = useState<HTMLElement | null>(null)

	useEffect(() => {
		setInfoTarget(document.getElementById('ticket-info-portal'))
		setActionsTarget(document.getElementById('ticket-actions-portal'))
	}, [])

	// États Dialogues POS
	const [refundTicketDialogOpen, setRefundTicketDialogOpen] = useState(false)
	const [stockReclassifyOpen, setStockReclassifyOpen] = useState(false)
	const [stockItemsToReclassify, setStockItemsToReclassify] = useState<
		StockReclassificationItem[]
	>([])
	const [stockDocumentNumber, setStockDocumentNumber] = useState<
		string | undefined
	>()

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

	const customer = (invoice as any)?.expand?.customer ?? null
	const displayStatus = invoice
		? getDisplayStatus(invoice)
		: { label: '', variant: 'outline', isPaid: false }
	const badgeVariant = (displayStatus.variant ??
		'outline') as BadgeProps['variant']
	const overdue = invoice ? isOverdue(invoice) : false

	const remainingAmount =
		typeof (invoice as any)?.remaining_amount === 'number'
			? (invoice as any).remaining_amount
			: (invoice?.total_ttc ?? 0) - ((invoice as any)?.credit_notes_total ?? 0)

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

	if (isLoading) {
		return (
			<div className='container mx-auto px-6 py-8 flex items-center justify-center'>
				<Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
			</div>
		)
	}

	if (!invoice) {
		return (
			<div className='container mx-auto px-6 py-8'>
				<div className='text-muted-foreground'>Document introuvable</div>
				<Button
					variant='outline'
					className='mt-4'
					onClick={() => navigate({ to: backRoute as any })}
				>
					<ArrowLeft className='h-4 w-4 mr-2' />
					Retour
				</Button>
			</div>
		)
	}

	// ── Actions ───────────────────────────────────────────────────────────────

	const handleDownloadPdf = async () => {
		if (!activeCompanyId) {
			toast.error('Aucune entreprise sélectionnée')
			return
		}
		setIsDownloading(true)
		try {
			const customer = invoice.expand?.customer
			let logoDataUrl: string | null = null
			let currentCompany: CompaniesResponse | null = company
			if (!currentCompany) {
				try {
					currentCompany = await pb
						.collection('companies')
						.getOne(activeCompanyId)
					setCompany(currentCompany)
				} catch (err) {
					console.warn('Entreprise non trouvée:', err)
				}
			}
			if (currentCompany && (currentCompany as any).logo) {
				try {
					logoDataUrl = await toPngDataUrl(
						pb.files.getUrl(currentCompany, (currentCompany as any).logo),
					)
				} catch (err) {
					console.warn('Erreur conversion logo', err)
				}
			}
			let depositPdfData: DepositPdfData | undefined
			if (invoice.invoice_type === 'deposit' && invoice.original_invoice_id) {
				try {
					const parent = (await pb
						.collection('invoices')
						.getOne(invoice.original_invoice_id)) as InvoiceResponse
					depositPdfData = { type: 'deposit', parentInvoice: parent }
				} catch (err) {
					console.warn(err)
				}
			} else if (
				invoice.invoice_type === 'invoice' &&
				invoice.original_invoice_id
			) {
				try {
					const parent = (await pb
						.collection('invoices')
						.getOne(invoice.original_invoice_id)) as InvoiceResponse
					const deposits = (await pb.collection('invoices').getFullList({
						filter: `invoice_type = "deposit" && original_invoice_id = "${invoice.original_invoice_id}"`,
						sort: '+created',
					})) as InvoiceResponse[]
					depositPdfData = { type: 'balance', parentInvoice: parent, deposits }
				} catch (err) {
					console.warn(err)
				}
			} else if (
				invoice.invoice_type === 'invoice' &&
				!invoice.original_invoice_id &&
				(invoice.deposits_total_ttc ?? 0) > 0
			) {
				try {
					const deposits = (await pb.collection('invoices').getFullList({
						filter: `invoice_type = "deposit" && original_invoice_id = "${invoice.id}"`,
						sort: '+created',
					})) as InvoiceResponse[]
					depositPdfData = { type: 'parent', deposits }
				} catch (err) {
					console.warn(err)
				}
			}
			const blob = await pdf(
				<InvoicePdfDocument
					invoice={invoice as InvoiceResponse}
					customer={customer as any}
					company={currentCompany || undefined}
					companyLogoUrl={logoDataUrl}
					depositPdfData={depositPdfData}
				/>,
			).toBlob()
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = `${invoice.number}.pdf`
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			URL.revokeObjectURL(url)
			toast.success('Facture téléchargée')
		} catch (error) {
			console.error('Erreur génération PDF:', error)
			toast.error('Erreur lors de la génération du PDF')
		} finally {
			setIsDownloading(false)
		}
	}

	// ── Téléchargement ticket POS (PDF via chromedp backend) ──────────────────
	const handleDownloadTicketHtml = async () => {
		if (!invoice) return
		setIsDownloading(true)
		try {
			const printerSettings = loadPosPrinterSettings()
			const width = (printerSettings.width === 80 ? 80 : 58) as 58 | 80

			// Charger le logo (même logique que useReprintTicket)
			let logoBase64: string | undefined
			if (company && (company as any).logo) {
				try {
					logoBase64 = await toPngDataUrl(
						pb.files.getUrl(company, (company as any).logo),
					)
				} catch {
					// logo optionnel, on continue sans
				}
			}

			const receipt = buildReceiptFromInvoice(invoice as any, logoBase64)

			await downloadReceiptPreviewPdf({
				width,
				companyId: activeCompanyId ?? undefined,
				receipt: receipt as any,
				filename: `${invoice.number}.pdf`,
			})

			toast.success('Ticket téléchargé')
		} catch (err: any) {
			toast.error(err?.message || 'Erreur lors du téléchargement du ticket')
		} finally {
			setIsDownloading(false)
		}
	}

	const handleCreateDeposit = async () => {
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
			await createDeposit.mutateAsync({
				parentId: invoice.id,
				percentage,
			})
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
		try {
			await createBalanceInvoice.mutateAsync(invoice.id)
			toast.success('Facture de solde créée')
		} catch (err: any) {
			toast.error(
				err?.message || 'Erreur lors de la création de la facture de solde',
			)
		}
	}

	// ── Status badges ─────────────────────────────────────────────────────────

	const renderStatusBadges = () => {
		if (isCreditNote)
			return (
				<>
					<Badge variant={badgeVariant}>{displayStatus.label}</Badge>
					<Badge className='bg-blue-600 hover:bg-blue-600'>
						<RefreshCcw className='h-3 w-3 mr-1' />
						Remboursé
					</Badge>
				</>
			)
		if (isDeposit)
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
		const statusLabel = displayStatus.label
		const showStatusBadge = statusLabel && statusLabel !== 'Payée'
		return (
			<>
				{showStatusBadge && <Badge variant={badgeVariant}>{statusLabel}</Badge>}
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

	const soldByLabel = getSoldByLabel(invoice as any)

	// ── Logique Sidebar Ticket ────────────────────────────────────────────────

	const hasTicketLinkedDocs =
		(invoice.converted_to_invoice && invoice.converted_invoice_id) ||
		(linkedCreditNotes && linkedCreditNotes.length > 0)
	const hasTicketNotes = !!invoice.notes
	const needsTicketSidebar =
		hasTicketLinkedDocs || hasTicketNotes || remainingAmount <= 0

	// ── Portals UI ────────────────────────────────────────────────────────────

	const standardRetourContent = !isTicket && (
		<Button
			variant='ghost'
			className='-ml-2 text-muted-foreground'
			onClick={() => navigate({ to: backRoute as any })}
		>
			<ArrowLeft className='h-4 w-4 mr-2' />
			Retour
		</Button>
	)

	const ticketInfoContent = isTicket && (
		<div className='flex items-center gap-4 w-full'>
			<Button
				variant='ghost'
				size='sm'
				className='-ml-2 text-muted-foreground hover:text-foreground'
				onClick={() => navigate({ to: backRoute as any })}
			>
				<ArrowLeft className='h-4 w-4 mr-1.5' />
				Retour
			</Button>
			<div className='h-4 w-px bg-border/60 shrink-0' />
			<div className='flex items-center flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground'>
				<span className='font-mono font-medium text-foreground'>
					{invoice.number}
				</span>
				<span className='opacity-40'>•</span>
				<span>{formatDate(invoice.date)}</span>
				<span className='opacity-40'>•</span>
				<span>{soldByLabel}</span>
				{invoice.is_paid && (
					<>
						<span className='opacity-40'>•</span>
						<span>{getPaymentMethodLabel(invoice as any)}</span>
					</>
				)}
			</div>
		</div>
	)

	const actionsContent = (
		<>
			{invoice.status === 'draft' && !isTicket && (
				<Button
					variant='outline'
					onClick={() => {
						if (!invoiceId) return
						navigate({
							to: '/connect/invoices/$invoiceId/edit' as any,
							params: { invoiceId } as any,
						})
					}}
				>
					<Pencil className='h-4 w-4 mr-2' />
					Modifier
				</Button>
			)}

			{isTicket &&
				invoice.invoice_type === 'invoice' &&
				invoice.is_paid &&
				!invoice.converted_to_invoice &&
				remainingAmount > 0 && (
					<Button
						variant='outline'
						className='text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-200'
						onClick={() => setRefundTicketDialogOpen(true)}
					>
						<RotateCcw className='h-4 w-4 mr-2' />
						Rembourser
					</Button>
				)}

			{isTicket &&
				invoice.invoice_type !== 'credit_note' &&
				!invoice.converted_to_invoice &&
				remainingAmount > 0 && (
					<Button
						variant='outline'
						onClick={() =>
							navigate({
								to: '/cash/convert-to-invoice/$ticketId' as any,
								params: { ticketId: invoice.id } as any,
							})
						}
					>
						<FileText className='h-4 w-4 mr-2' />
						Convertir en facture
					</Button>
				)}

			<Button variant='outline' onClick={() => setEmailDialogOpen(true)}>
				<Mail className='h-4 w-4 mr-2' />
				Envoyer
			</Button>

			{/* ── Actions impression POS (tickets uniquement) ── */}
			{isTicket && (
				<>
					<Button
						variant='outline'
						disabled={isPreviewing}
						onClick={() => invoice && previewTicket(invoice as any)}
					>
						{isPreviewing ? (
							<Loader2 className='h-4 w-4 animate-spin mr-2' />
						) : (
							<Receipt className='h-4 w-4 mr-2' />
						)}
						Aperçu ticket
					</Button>

					{isPrinterConfigured && (
						<Button
							variant='outline'
							disabled={isPrinting}
							onClick={() => invoice && reprintTicket(invoice as any)}
						>
							{isPrinting ? (
								<Loader2 className='h-4 w-4 animate-spin mr-2' />
							) : (
								<Printer className='h-4 w-4 mr-2' />
							)}
							Réimprimer
						</Button>
					)}
				</>
			)}
			<Button
				onClick={isTicket ? handleDownloadTicketHtml : handleDownloadPdf}
				disabled={isDownloading}
			>
				{isDownloading ? (
					<Loader2 className='h-4 w-4 animate-spin mr-2' />
				) : (
					<Download className='h-4 w-4 mr-2' />
				)}
				Télécharger
			</Button>
		</>
	)

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<div className='container mx-auto px-6 py-6'>
			{!actionsTarget && (
				<div className='flex items-center justify-between gap-3 mb-6'>
					{!isTicket && standardRetourContent}
					<div className='flex items-center gap-2'>{actionsContent}</div>
				</div>
			)}

			{actionsTarget && createPortal(actionsContent, actionsTarget)}
			{infoTarget &&
				ticketInfoContent &&
				createPortal(ticketInfoContent, infoTarget)}

			<div className='grid grid-cols-1 lg:grid-cols-12 gap-6'>
				{/* ── Logique Facture Classique (Non Ticket) ── */}
				{!isTicket && (
					<>
						{/* Détails généraux */}
						<ModuleCard
							title={isCreditNote ? 'Avoir' : 'Détails de la facture'}
							icon={FileText}
							className='lg:col-span-3'
						>
							<div className='space-y-4 pt-1'>
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
										<p className='text-sm text-muted-foreground'>Vendeur</p>
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
												{getPaymentMethodLabel(invoice as any)}
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
								<div className='flex items-center gap-2'>
									{renderStatusBadges()}
								</div>

								{/* Avoir : document original */}
								{isCreditNote && (
									<>
										{(invoice as any).refund_method && (
											<div>
												<p className='text-sm text-muted-foreground'>
													Moyen de remboursement
												</p>
												<p className='text-sm font-medium'>
													{getRefundMethodLabel((invoice as any).refund_method)}
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
											<div className='border-t border-border/50 pt-4 mt-2'>
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
															navigate(getDetailRoute(originalId) as any)
														}
													>
														Voir
													</Button>
												</div>
											</div>
										)}
									</>
								)}

								{/* Avoirs liés */}
								{!isCreditNote &&
									linkedCreditNotes &&
									linkedCreditNotes.length > 0 && (
										<div className='border-t border-border/50 pt-4 mt-2'>
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
																navigate(getDetailRoute(cn.id) as any)
															}
														>
															Voir
														</Button>
													</div>
												))}
											</div>
										</div>
									)}

								{/* Acomptes B2B */}
								{!isCreditNote && !isDeposit && (
									<div className='border-t border-border/50 pt-4 space-y-3 mt-2'>
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
																		<span className='text-emerald-600'>
																			Réglé
																		</span>
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
																navigate(getDetailRoute(dep.id) as any)
															}
														>
															Voir
														</Button>
													</div>
												))}
												{depositsData.balanceInvoice && (
													<div className='flex items-center justify-between bg-muted/50 rounded-lg p-3 border border-border/50'>
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
															onClick={() =>
																depositsData.balanceInvoice &&
																navigate(
																	getDetailRoute(
																		depositsData.balanceInvoice.id,
																	) as any,
																)
															}
														>
															Voir
														</Button>
													</div>
												)}
											</div>
										)}
										<div className='flex flex-col gap-2'>
											{invoice &&
												canCreateDeposit(invoice) &&
												(depositDialogOpen ? (
													<div className='space-y-2 bg-muted/50 rounded-lg p-3'>
														<p className='text-sm font-medium'>
															Nouvel acompte
														</p>
														<div className='flex rounded-md overflow-hidden border border-border text-xs font-medium'>
															<button
																type='button'
																className={`flex-1 px-2 py-1.5 transition-colors ${
																	depositMode === 'percent'
																		? 'bg-primary text-primary-foreground'
																		: 'bg-background text-muted-foreground hover:bg-muted'
																}`}
																onClick={() => setDepositMode('percent')}
															>
																%
															</button>
															<button
																type='button'
																className={`flex-1 px-2 py-1.5 transition-colors ${
																	depositMode === 'amount'
																		? 'bg-primary text-primary-foreground'
																		: 'bg-background text-muted-foreground hover:bg-muted'
																}`}
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
																			setDepositPercentage(
																				Number(e.target.value),
																			)
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
																			? (invoice.balance_due ??
																				invoice.total_ttc)
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
																	<span className='text-sm font-semibold'>
																		€
																	</span>
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
														<Plus className='h-4 w-4 mr-2' /> Demander un
														acompte
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

								{/* Acompte : lien retour facture parente */}
								{isDeposit && originalId && (
									<div className='border-t border-border/50 pt-4 mt-2'>
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
													navigate(getDetailRoute(originalId) as any)
												}
											>
												Voir
											</Button>
										</div>
									</div>
								)}

								{invoice.notes && (
									<div className='pt-2 border-t border-border/50'>
										<p className='text-sm text-muted-foreground'>Notes</p>
										<p className='text-sm mt-1'>{invoice.notes}</p>
									</div>
								)}
							</div>
						</ModuleCard>

						{/* Client */}
						<ModuleCard title='Client' icon={User} className='lg:col-span-3'>
							<div className='space-y-2 pt-1'>
								{customer ? (
									<>
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
											<p className='text-sm text-muted-foreground mt-2'>
												{customer.address}
											</p>
										)}
									</>
								) : (
									<p className='text-muted-foreground text-sm'>
										Client inconnu
									</p>
								)}
							</div>
						</ModuleCard>
					</>
				)}

				{/* ── Logique Sidebar Spécifique Ticket ── */}
				{isTicket && needsTicketSidebar && (
					<ModuleCard
						title='Suivi & Notes'
						icon={FileText}
						className='lg:col-span-4'
					>
						<div className='space-y-4 pt-1'>
							<div className='flex flex-wrap gap-2'>
								{invoice.converted_to_invoice && (
									<Badge
										variant='secondary'
										className='bg-blue-100 text-blue-700 hover:bg-blue-100/80'
									>
										Facturé
									</Badge>
								)}
								{remainingAmount <= 0 && (invoice.total_ttc ?? 0) > 0 && (
									<Badge
										variant='secondary'
										className='bg-orange-100 text-orange-700 hover:bg-orange-100/80'
									>
										Remboursé
									</Badge>
								)}
								{remainingAmount > 0 &&
									((invoice as any).credit_notes_total ?? 0) > 0 && (
										<Badge
											variant='outline'
											className='text-orange-600 border-orange-200'
										>
											Remboursé partiel
										</Badge>
									)}
							</div>

							{invoice.converted_to_invoice && invoice.converted_invoice_id && (
								<div className='border-t border-border/50 pt-4 mt-2'>
									<p className='text-sm text-muted-foreground mb-2'>
										Facture associée
									</p>
									<div className='flex items-center justify-between bg-muted/50 rounded-lg p-3'>
										<div className='flex items-center gap-2'>
											<FileText className='h-4 w-4 text-muted-foreground' />
											<span className='font-medium text-sm'>
												Voir la facture
											</span>
										</div>
										<Button
											variant='outline'
											size='sm'
											onClick={() => {
												if (!invoice.converted_invoice_id) return
												navigate({
													to: '/connect/invoices/$invoiceId',
													params: { invoiceId: invoice.converted_invoice_id },
												})
											}}
										>
											Ouvrir
										</Button>
									</div>
								</div>
							)}

							{linkedCreditNotes && linkedCreditNotes.length > 0 && (
								<div className='border-t border-border/50 pt-4 mt-2'>
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
													onClick={() => navigate(getDetailRoute(cn.id) as any)}
												>
													Voir
												</Button>
											</div>
										))}
									</div>
								</div>
							)}

							{invoice.notes && (
								<div className='pt-2 border-t border-border/50'>
									<p className='text-sm text-muted-foreground'>Notes</p>
									<p className='text-sm mt-1'>{invoice.notes}</p>
								</div>
							)}
						</div>
					</ModuleCard>
				)}

				{/* ── Articles (Étendu intelligemment) ── */}
				<ModuleCard
					title='Articles'
					icon={ShoppingCart}
					className={
						isTicket
							? needsTicketSidebar
								? 'lg:col-span-8'
								: 'lg:col-span-12'
							: 'lg:col-span-6'
					}
					headerRight={
						<span className='text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded'>
							{invoice.items.length} ligne(s)
						</span>
					}
				>
					<div className='overflow-x-auto'>
						<Table>
							<TableHeader>
								<TableRow className='border-border/50'>
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
										<TableRow
											key={`${item.name}-${idx}`}
											className='border-border/40'
										>
											<TableCell className='font-medium'>
												<div className='flex flex-col'>
													<span>{item.name}</span>
													{hasBefore && promo.hasDiscount && (
														<span className='text-xs text-muted-foreground mt-0.5'>
															<span className='line-through mr-2 opacity-70'>
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
											<TableCell className='text-right text-muted-foreground'>
												{item.tva_rate}%
											</TableCell>
											<TableCell className='text-right font-medium'>
												{Number(item.total_ttc ?? 0).toFixed(2)} €
											</TableCell>
										</TableRow>
									)
								})}
							</TableBody>
						</Table>
					</div>

					<div className='mt-8 flex justify-end'>
						<div className='w-72 space-y-2.5 text-sm'>
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
									<div className='border-t border-border/50 pt-2.5' />
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
											className='flex justify-between text-[11px] text-muted-foreground/80'
										>
											<span>
												TVA {vb.rate}% sur {vb.base_ht.toFixed(2)} € HT
											</span>
											<span>{vb.vat.toFixed(2)} €</span>
										</div>
									))}
								</div>
							)}
							<div className='flex justify-between font-bold text-lg border-t border-border/50 pt-3 mt-1'>
								<span>Total TTC</span>
								<span>
									{formatCurrency(invoice.total_ttc, invoice.currency)}
								</span>
							</div>
						</div>
					</div>
				</ModuleCard>
			</div>

			{/* Dialogues */}
			<SendInvoiceEmailDialog
				open={emailDialogOpen}
				onOpenChange={setEmailDialogOpen}
				invoice={invoice}
				onSuccess={() => setEmailDialogOpen(false)}
			/>

			<RefundTicketDialog
				open={refundTicketDialogOpen}
				onOpenChange={(open) => setRefundTicketDialogOpen(open)}
				ticket={invoice as any}
				onSuccess={(stockItems) => {
					setRefundTicketDialogOpen(false)
					if (stockItems && stockItems.length > 0) {
						setStockItemsToReclassify(stockItems)
						setStockDocumentNumber(invoice.number)
						setStockReclassifyOpen(true)
					}
				}}
			/>

			<StockReclassificationDialog
				open={stockReclassifyOpen}
				onOpenChange={setStockReclassifyOpen}
				items={stockItemsToReclassify}
				documentNumber={stockDocumentNumber}
				onComplete={() => {
					setStockReclassifyOpen(false)
					setStockItemsToReclassify([])
					setStockDocumentNumber(undefined)
				}}
			/>
		</div>
	)
}
