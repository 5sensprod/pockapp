// frontend/modules/connect/components/InvoicesPage.tsx
// ISCA v2 - avec is_paid séparé, avoirs, clôtures, intégrité et suppression de brouillons

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

import { decrementAppPosProductsStock, getAppPosToken } from '@/lib/apppos'

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import type { CompaniesResponse } from '@/lib/pocketbase-types'
import {
	type ChainVerificationResult,
	type DocumentType,
	useClosures,
	useIntegritySummary,
	usePerformDailyClosure,
	useVerifyInvoiceChain,
} from '@/lib/queries/closures'

import { PeriodSelector } from '@/components/PeriodSelector'
import { usePeriodFilter } from '@/lib/hooks/usePeriodFilter'
import { useCreateDeposit } from '@/lib/queries/deposits'
import {
	useCancelInvoice,
	useDeleteDraftInvoice,
	useInvoiceStats,
	useInvoices,
	useMarkInvoiceAsSent,
	useRecordPayment,
	useValidateInvoice,
} from '@/lib/queries/invoices'
import { usePaymentMethods } from '@/lib/queries/payment-methods'
import type { InvoiceResponse, InvoiceStatus } from '@/lib/types/invoice.types'
import {
	canMarkAsPaid,
	canTransitionTo,
	getDisplayStatus,
	isOverdue,
} from '@/lib/types/invoice.types'
import { canCreateDeposit } from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { RefundInvoiceDialog } from '@/modules/common/RefundInvoiceDialog'
import { RefundTicketDialog } from '@/modules/common/RefundTicketDialog'
import {
	StockReclassificationDialog,
	type StockReclassificationItem,
} from '@/modules/common/StockReclassificationDialog'
import { pdf } from '@react-pdf/renderer'
import { useNavigate } from '@tanstack/react-router'
import {
	AlertTriangle,
	Banknote,
	CheckCircle,
	Download,
	Edit,
	Eye,
	FileText,
	Mail,
	MoreHorizontal,
	Plus,
	Receipt,
	RotateCcw,
	Send,
	Shield,
	ShieldAlert,
	ShieldCheck,
	XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { type DepositPdfData, InvoicePdfDocument } from './InvoicePdf'
import { SendInvoiceEmailDialog } from './SendInvoiceEmailDialog'

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(dateStr: string) {
	if (!dateStr) return '-'
	return new Date(dateStr).toLocaleDateString('fr-FR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	})
}

function formatCurrency(amount: number) {
	return new Intl.NumberFormat('fr-FR', {
		style: 'currency',
		currency: 'EUR',
	}).format(amount)
}

async function toPngDataUrl(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.crossOrigin = 'anonymous'
		img.onload = () => {
			try {
				const canvas = document.createElement('canvas')
				canvas.width = img.naturalWidth || img.width
				canvas.height = img.naturalHeight || img.height
				const ctx = canvas.getContext('2d')
				if (!ctx) {
					reject(new Error('Impossible de créer un contexte 2D'))
					return
				}
				ctx.drawImage(img, 0, 0)
				const dataUrl = canvas.toDataURL('image/png')
				resolve(dataUrl)
			} catch (err) {
				reject(err)
			}
		}
		img.onerror = (err) => reject(err)
		img.src = url
	})
}

// ============================================================================
// TYPES POUR LES FILTRES
// ============================================================================

type StatusFilter = InvoiceStatus | 'all' | 'unpaid' | 'overdue'
type DocumentTypeFilter = 'all' | 'tik' | 'fac'

// ============================================================================
// COMPONENT
// ============================================================================

export function InvoicesPage() {
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()
	const { paymentMethods } = usePaymentMethods(activeCompanyId)
	const enabledMethods = paymentMethods?.filter((m) => m.enabled) || []
	const pb = usePocketBase() as any

	// États filtres
	const [searchTerm, setSearchTerm] = useState('')
	const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
	const [typeFilter, setTypeFilter] = useState<
		'all' | 'invoice' | 'credit_note'
	>('all')
	const [documentTypeFilter, setDocumentTypeFilter] =
		useState<DocumentTypeFilter>('all')

	// États dialogs
	const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
	const [invoiceToCancel, setInvoiceToCancel] =
		useState<InvoiceResponse | null>(null)
	const [cancelReason, setCancelReason] = useState('')

	const [sendEmailDialogOpen, setSendEmailDialogOpen] = useState(false)
	const [invoiceToEmail, setInvoiceToEmail] = useState<InvoiceResponse | null>(
		null,
	)

	const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
	const [invoiceToPay, setInvoiceToPay] = useState<InvoiceResponse | null>(null)
	const [, setPaymentMethod] = useState('virement')
	const [selectedMethodId, setSelectedMethodId] = useState<string>('')

	const [paymentMode, setPaymentMode] = useState<'full' | 'deposit'>('full')
	const [depositPercentage, setDepositPercentage] = useState<number>(30)
	const createDeposit = useCreateDeposit()

	const [closureConfirmOpen, setClosureConfirmOpen] = useState(false)

	const [deleteDraftDialogOpen, setDeleteDraftDialogOpen] = useState(false)
	const [draftToDelete, setDraftToDelete] = useState<InvoiceResponse | null>(
		null,
	)

	const [company, setCompany] = useState<CompaniesResponse | null>(null)

	const [refundTicketDialogOpen, setRefundTicketDialogOpen] = useState(false)
	const [ticketToRefund, setTicketToRefund] = useState<InvoiceResponse | null>(
		null,
	)

	const [refundInvoiceOpen, setRefundInvoiceOpen] = useState(false)
	const [invoiceToRefund, setInvoiceToRefund] =
		useState<InvoiceResponse | null>(null)

	const [stockReclassifyOpen, setStockReclassifyOpen] = useState(false)
	const [stockItemsToReclassify, setStockItemsToReclassify] = useState<
		StockReclassificationItem[]
	>([])
	const [stockDocumentNumber, setStockDocumentNumber] = useState<
		string | undefined
	>()

	const handleOpenRefundTicketDialog = (ticket: InvoiceResponse) => {
		setTicketToRefund(ticket)
		setRefundTicketDialogOpen(true)
	}

	const handleCloseRefundTicketDialog = () => {
		setRefundTicketDialogOpen(false)
		setTicketToRefund(null)
	}

	// Dialog intégrité
	const [integrityDialogOpen, setIntegrityDialogOpen] = useState(false)
	const [integrityDocType, setIntegrityDocType] = useState<DocumentType>('all')
	const [integrityResult, setIntegrityResult] =
		useState<ChainVerificationResult | null>(null)

	// Hook pour le résumé rapide (optionnel - pour afficher un indicateur)
	const { data: integritySummary, refetch: refetchIntegritySummary } =
		useIntegritySummary(activeCompanyId ?? undefined)

	// Mutations / hooks factures
	const cancelInvoice = useCancelInvoice()
	const deleteDraftInvoice = useDeleteDraftInvoice()
	const recordPayment = useRecordPayment()
	const validateInvoice = useValidateInvoice()
	const markAsSent = useMarkInvoiceAsSent()

	// Clôtures & intégrité
	const performDailyClosure = usePerformDailyClosure()
	const verifyChain = useVerifyInvoiceChain()
	const { data: closuresData } = useClosures({
		companyId: activeCompanyId ?? undefined,
		closureType: 'daily',
	})

	// Filtre de période — affecte stats + liste
	const { period, setPeriod, dateRange } = usePeriodFilter('this_month')

	// Query avec filtres
	const {
		data: invoicesData,
		isLoading,
		refetch: refetchInvoices,
	} = useInvoices({
		companyId: activeCompanyId ?? undefined,
		status:
			statusFilter !== 'all' &&
			statusFilter !== 'unpaid' &&
			statusFilter !== 'overdue'
				? statusFilter
				: undefined,
		invoiceType: typeFilter !== 'all' ? typeFilter : undefined,
		isPaid: statusFilter === 'unpaid' ? false : undefined,
		filter: searchTerm ? `number ~ "${searchTerm}"` : undefined,
		dateFrom: dateRange.from,
		dateTo: dateRange.to,
	})

	// Base list
	let invoices = (invoicesData?.items ?? []) as InvoiceResponse[]

	// Filtrer côté client pour "overdue"
	if (statusFilter === 'overdue') {
		invoices = invoices.filter((inv) => isOverdue(inv))
	}

	// Filtrer côté client pour document type (TIK / FAC)
	if (documentTypeFilter === 'tik') {
		invoices = invoices.filter((inv) => inv.number?.startsWith('TIK-'))
	} else if (documentTypeFilter === 'fac') {
		invoices = invoices.filter((inv) => inv.number?.startsWith('FAC-'))
	}

	// Charger la société active
	useEffect(() => {
		const loadCompany = async () => {
			if (!activeCompanyId) return
			try {
				const result = await pb.collection('companies').getOne(activeCompanyId)
				setCompany(result as CompaniesResponse)
			} catch (err) {
				console.error('Erreur chargement company', err)
			}
		}
		void loadCompany()
	}, [activeCompanyId, pb])

	// Somme des montants d'avoirs par facture d'origine
	const creditNotesByOriginal: Record<string, number> = {}

	for (const inv of invoices) {
		if (inv.invoice_type === 'credit_note' && inv.original_invoice_id) {
			creditNotesByOriginal[inv.original_invoice_id] =
				(creditNotesByOriginal[inv.original_invoice_id] ?? 0) + inv.total_ttc
		}
	}

	// Stats globales — calculées côté backend sur TOUTES les factures (sans limite de pagination)
	const { data: invoiceStats } = useInvoiceStats(activeCompanyId ?? undefined, {
		dateFrom: dateRange.from,
		dateTo: dateRange.to,
	})

	const stats = {
		totalTTC: invoiceStats?.total_ttc ?? 0,
		paid: invoiceStats?.paid ?? 0,
		pending: invoiceStats?.pending ?? 0,
		overdue: invoiceStats?.overdue ?? 0,
		invoiceCount: invoiceStats?.invoice_count ?? 0,
		creditNoteCount: invoiceStats?.credit_note_count ?? 0,
		creditNotesTTC: invoiceStats?.credit_notes_ttc ?? 0,
	}
	// Clôture du jour déjà existante ?
	const today = new Date()
	today.setHours(0, 0, 0, 0)

	const hasTodayClosure =
		(closuresData?.items ?? []).some((c) => {
			const d = new Date(c.period_start)
			d.setHours(0, 0, 0, 0)
			return d.getTime() === today.getTime()
		}) ?? false

	// === HANDLERS ===

	const handleOpenSendEmailDialog = (invoice: InvoiceResponse) => {
		setInvoiceToEmail(invoice)
		setSendEmailDialogOpen(true)
	}

	const handleOpenDeleteDraftDialog = (invoice: InvoiceResponse) => {
		setDraftToDelete(invoice)
		setDeleteDraftDialogOpen(true)
	}

	const handleConfirmDeleteDraft = async () => {
		if (!draftToDelete) return

		try {
			await deleteDraftInvoice.mutateAsync(draftToDelete.id)
			toast.success(`Brouillon ${draftToDelete.number} supprimé`)
			setDeleteDraftDialogOpen(false)
			setDraftToDelete(null)
			await refetchInvoices()
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la suppression du brouillon')
		}
	}

	const handleValidate = async (invoice: InvoiceResponse) => {
		try {
			await validateInvoice.mutateAsync(invoice.id)
			toast.success(`Facture ${invoice.number} validée`)
			await refetchInvoices()
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la validation')
		}
	}

	const handleMarkAsSent = async (invoice: InvoiceResponse) => {
		try {
			await markAsSent.mutateAsync(invoice.id)
			toast.success(`Facture ${invoice.number} marquée comme envoyée`)
			await refetchInvoices()
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la mise à jour')
		}
	}

	const handleOpenPaymentDialog = (invoice: InvoiceResponse) => {
		console.log('🔍 invoice to pay:', {
			id: invoice.id,
			status: invoice.status,
			invoice_type: invoice.invoice_type,
			is_pos_ticket: invoice.is_pos_ticket,
			balance_due: invoice.balance_due,
			canCreateDeposit: canCreateDeposit(invoice),
		})
		setInvoiceToPay(invoice)
		setPaymentMethod('')
		setPaymentMode('full')
		setDepositPercentage(30)
		setSelectedMethodId('')
		setPaymentDialogOpen(true)
	}

	const handleRecordPayment = async () => {
		// 🆕 Mode acompte
		if (paymentMode === 'deposit') {
			if (!invoiceToPay) return
			try {
				await createDeposit.mutateAsync({
					parentId: invoiceToPay.id,
					percentage: depositPercentage,
				})
				toast.success(`Acompte de ${depositPercentage}% créé`)
				setPaymentDialogOpen(false)
			} catch (err: any) {
				toast.error(err?.message || "Erreur lors de la création de l'acompte")
			}
			return
		}
		if (!invoiceToPay || !selectedMethodId) return

		const method = enabledMethods.find((m) => m.id === selectedMethodId)
		if (!method) return

		const mapping: Record<string, string> = {
			card: 'cb',
			cash: 'especes',
			check: 'cheque',
			transfer: 'virement',
		}

		const code =
			method.type === 'default' ? mapping[method.code] || method.code : 'autre'

		const label = method.type === 'custom' ? method.name : undefined
		console.log('🔍 Envoi paiement:', {
			invoiceId: invoiceToPay.id,
			code,
			label,
		})
		await recordPayment.mutateAsync({
			invoiceId: invoiceToPay.id,
			paymentMethod: code,
			paymentMethodLabel: label,
		})

		setPaymentDialogOpen(false)
		setSelectedMethodId('') // Reset
		if (getAppPosToken() && invoiceToPay.items?.length) {
			const stockItems = buildStockItemsFromInvoice(invoiceToPay.items)
			if (stockItems.length > 0) {
				try {
					await decrementAppPosProductsStock(stockItems)
					toast.success('Stock synchronisé', {
						description: `${stockItems.length} produit(s) mis à jour dans AppPOS`,
					})
				} catch (err) {
					console.error('❌ Erreur synchro stock AppPOS:', err)
					toast.warning(
						'Paiement enregistré mais erreur de synchronisation du stock',
					)
				}
			}
		}
	}

	const handleOpenCancelDialog = (invoice: InvoiceResponse) => {
		setInvoiceToCancel(invoice)
		setCancelReason('')
		setCancelDialogOpen(true)
	}

	const handleCancelInvoice = async () => {
		if (!invoiceToCancel || !cancelReason.trim()) {
			toast.error("Veuillez indiquer un motif d'annulation")
			return
		}

		try {
			await cancelInvoice.mutateAsync({
				invoiceId: invoiceToCancel.id,
				reason: cancelReason,
			})
			toast.success(`Avoir créé pour la facture ${invoiceToCancel.number}`)
			setCancelDialogOpen(false)
			setCancelReason('')

			// 🆕 Proposer la reclassification stock si items AppPOS
			const stockItems = buildStockItemsFromInvoice(
				invoiceToCancel.items ?? [],
			).map((it) => ({
				product_id: it.productId,
				name:
					invoiceToCancel.items?.find((i: any) => i.product_id === it.productId)
						?.name ?? it.productId,
				quantity: it.quantitySold,
			}))

			setInvoiceToCancel(null)
			await refetchInvoices()

			if (stockItems.length > 0 && getAppPosToken()) {
				setStockItemsToReclassify(stockItems)
				setStockDocumentNumber(invoiceToCancel.number)
				setStockReclassifyOpen(true)
			}
		} catch (error: any) {
			toast.error(error.message || "Erreur lors de la création de l'avoir")
		}
	}

	const handleDownloadPdf = async (invoice: InvoiceResponse) => {
		try {
			const customer = invoice.expand?.customer
			let logoDataUrl: string | null = null

			if (company && (company as any).logo) {
				const fileUrl = pb.files.getUrl(company, (company as any).logo)
				try {
					logoDataUrl = await toPngDataUrl(fileUrl)
				} catch (err) {
					console.warn('Erreur conversion logo', err)
				}
			}

			// 🆕 Fetch depositPdfData
			let depositPdfData: DepositPdfData | undefined

			if (invoice.invoice_type === 'deposit' && invoice.original_invoice_id) {
				try {
					const parent = (await pb
						.collection('invoices')
						.getOne(invoice.original_invoice_id)) as InvoiceResponse
					depositPdfData = { type: 'deposit', parentInvoice: parent }
				} catch (err) {
					console.warn('Facture parente non trouvée:', err)
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
					console.warn('Données solde non trouvées:', err)
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
					console.warn('Acomptes non trouvés:', err)
				}
			}

			const blob = await pdf(
				<InvoicePdfDocument
					invoice={invoice}
					customer={customer as any}
					company={company || undefined}
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
		} catch (error) {
			console.error('Erreur génération PDF', error)
			toast.error('Erreur lors de la génération du PDF')
		}
	}
	const handleDailyClosure = async () => {
		if (!activeCompanyId) {
			toast.error('Aucune entreprise sélectionnée')
			return
		}

		try {
			const closure = await performDailyClosure.mutateAsync(activeCompanyId)
			toast.success(
				`Clôture journalière effectuée pour le ${formatDate(closure.period_start)}`,
			)
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la clôture journalière')
		}
	}

	const handleConfirmDailyClosure = async () => {
		setClosureConfirmOpen(false)
		await handleDailyClosure()
	}

	const handleDailyClosureClick = () => {
		if (!activeCompanyId) {
			toast.error('Aucune entreprise sélectionnée')
			return
		}

		if (hasTodayClosure) {
			return
		}

		setClosureConfirmOpen(true)
	}

	const handleVerifyChain = async () => {
		if (!activeCompanyId) {
			toast.error('Aucune entreprise sélectionnée')
			return
		}

		try {
			// ✅ MODIFIÉ: Utiliser la nouvelle API avec docType
			const result = await verifyChain.mutateAsync({
				companyId: activeCompanyId,
				docType: integrityDocType,
			})

			setIntegrityResult(result)
			await refetchIntegritySummary()

			if (result.allValid) {
				toast.success(
					`Intégrité vérifiée ✓ – ${result.totalChecked} document(s)`,
				)
			} else {
				toast.error(
					`Anomalies détectées: ${result.invalidCount}/${result.totalChecked} documents`,
				)
			}
		} catch (error: any) {
			toast.error(error.message || "Erreur lors de la vérification d'intégrité")
		}
	}

	// Handler pour ouvrir le dialog
	const handleOpenIntegrityDialog = () => {
		setIntegrityDocType('all')
		setIntegrityDialogOpen(true)
	}

	const handleOpenStockReclassify = (
		items: StockReclassificationItem[],
		documentNumber?: string,
	) => {
		setStockItemsToReclassify(items)
		setStockDocumentNumber(documentNumber)
		setStockReclassifyOpen(true)
	}

	const buildStockItemsFromInvoice = (
		items: any[],
	): { productId: string; quantitySold: number }[] => {
		return items
			.filter((it) => !!it?.product_id)
			.map((it) => ({
				productId: it.product_id,
				quantitySold: Math.abs(Number(it.quantity ?? 1)),
			}))
	}
	// === RENDER ===

	return (
		<div className='container mx-auto px-6 py-8'>
			{/* Header */}
			<div className='flex items-center justify-between mb-6'>
				<div>
					<h1 className='text-2xl font-bold flex items-center gap-2'>
						<FileText className='h-6 w-6' />
						Factures & avoirs
					</h1>
					<p className='text-muted-foreground'>
						Gérez vos factures, avoirs et la conformité ISCA.
					</p>
				</div>
				<div className='flex items-center gap-2'>
					<Button variant='outline' onClick={handleOpenIntegrityDialog}>
						<Shield className='h-4 w-4 mr-2' />
						Vérifier intégrité
						{(integrityResult
							? !integrityResult.allValid
							: integritySummary && !integritySummary.allValid) && (
							<Badge variant='destructive' className='ml-2'>
								{integrityResult?.invalidCount ??
									integritySummary?.invalidDocuments}
							</Badge>
						)}
					</Button>
					<Button
						variant={hasTodayClosure ? 'outline' : 'destructive'}
						onClick={handleDailyClosureClick}
						disabled={performDailyClosure.isPending || hasTodayClosure}
					>
						{hasTodayClosure ? 'Journée déjà clôturée' : 'Clôture journalière'}
					</Button>
					<Button
						onClick={() =>
							navigate({
								to: '/connect/invoices/new',
							})
						}
					>
						<Plus className='h-4 w-4 mr-2' />
						Nouvelle facture
					</Button>
				</div>
			</div>

			{/* Filtre de période */}
			<div className='flex items-center justify-between mb-3'>
				<PeriodSelector period={period} onPeriodChange={setPeriod} />
			</div>

			{/* Stats */}
			<div className='grid grid-cols-1 md:grid-cols-4 gap-4 mb-6'>
				<div className='border rounded-lg p-4'>
					<p className='text-xs text-muted-foreground uppercase'>
						Factures (net)
					</p>
					<p className='text-xl font-bold'>
						{formatCurrency(stats.totalTTC || 0)}
					</p>
					<p className='text-xs text-muted-foreground'>
						{stats.invoiceCount} facture(s), {stats.creditNoteCount} avoir(s)
					</p>
				</div>
				<div className='border rounded-lg p-4'>
					<p className='text-xs text-muted-foreground uppercase'>Payé</p>
					<p className='text-xl font-bold'>{formatCurrency(stats.paid || 0)}</p>
				</div>
				<div className='border rounded-lg p-4'>
					<p className='text-xs text-muted-foreground uppercase'>En attente</p>
					<p className='text-xl font-bold'>
						{formatCurrency(stats.pending || 0)}
					</p>
				</div>
				<div className='border rounded-lg p-4'>
					<p className='text-xs text-muted-foreground uppercase text-red-600'>
						En retard
					</p>
					<p className='text-xl font-bold text-red-600'>
						{formatCurrency(stats.overdue || 0)}
					</p>
				</div>
			</div>

			{/* Filtres */}
			<div className='flex flex-col md:flex-row gap-4 mb-6'>
				<div className='flex-1'>
					<Input
						placeholder='Rechercher par numéro de facture...'
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
					/>
				</div>

				<div className='flex gap-2'>
					<Select
						value={statusFilter}
						onValueChange={(value: StatusFilter) => setStatusFilter(value)}
					>
						<SelectTrigger className='w-[160px]'>
							<SelectValue placeholder='Statut' />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='all'>Tous les statuts</SelectItem>
							<SelectItem value='draft'>Brouillon</SelectItem>
							<SelectItem value='validated'>Validée</SelectItem>
							<SelectItem value='sent'>Envoyée</SelectItem>
							<SelectItem value='cancelled'>Annulée</SelectItem>
							<SelectItem value='unpaid'>Impayée</SelectItem>
							<SelectItem value='overdue'>En retard</SelectItem>
						</SelectContent>
					</Select>

					<Select
						value={typeFilter}
						onValueChange={(value: 'all' | 'invoice' | 'credit_note') =>
							setTypeFilter(value)
						}
					>
						<SelectTrigger className='w-[160px]'>
							<SelectValue placeholder='Type' />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='all'>Factures + avoirs</SelectItem>
							<SelectItem value='invoice'>Factures uniquement</SelectItem>
							<SelectItem value='credit_note'>Avoirs uniquement</SelectItem>
						</SelectContent>
					</Select>

					{/* Filtre TIK/FAC */}
					<Select
						value={documentTypeFilter}
						onValueChange={(value: DocumentTypeFilter) =>
							setDocumentTypeFilter(value)
						}
					>
						<SelectTrigger className='w-[180px]'>
							<SelectValue placeholder='Document' />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='all'>Tous documents</SelectItem>
							<SelectItem value='tik'>Tickets POS</SelectItem>
							<SelectItem value='fac'>Factures</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Table */}
			{isLoading ? (
				<p className='text-muted-foreground'>Chargement des factures...</p>
			) : invoices.length === 0 ? (
				<div className='border rounded-lg p-6 text-center text-muted-foreground'>
					Aucune facture trouvée pour ces filtres.
				</div>
			) : (
				<div className='border rounded-lg overflow-hidden'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Numéro</TableHead>
								<TableHead>Vendeur</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Client</TableHead>
								<TableHead>Date</TableHead>
								<TableHead>Échéance</TableHead>
								<TableHead>Statut</TableHead>
								<TableHead className='text-right'>Montant TTC</TableHead>
								<TableHead className='w-10' />
							</TableRow>
						</TableHeader>
						<TableBody>
							{invoices.map((invoice) => {
								const displayStatus = getDisplayStatus(invoice)
								const customer = invoice.expand?.customer
								const overdue = isOverdue(invoice)

								const soldBy = (invoice as any).expand?.sold_by
								const sellerName =
									soldBy?.name ||
									soldBy?.username ||
									soldBy?.email ||
									(invoice.sold_by ? String(invoice.sold_by) : '—')

								const hasCancellationCreditNote = invoices.some(
									(other) =>
										other.invoice_type === 'credit_note' &&
										other.original_invoice_id === invoice.id,
								)

								const isTicket =
									invoice.is_pos_ticket === true ||
									invoice.number?.startsWith('TIK-')

								if (isTicket) {
									console.log('🎫 Ticket:', invoice.number, {
										is_pos_ticket: invoice.is_pos_ticket,
										remaining_amount: invoice.remaining_amount,
										credit_notes_total: invoice.credit_notes_total,
										total_ttc: invoice.total_ttc,
										invoice_type: invoice.invoice_type,
									})
								}

								// Fix: Si remaining_amount n'existe pas, calculer depuis total_ttc
								const remainingAmount =
									typeof invoice.remaining_amount === 'number'
										? invoice.remaining_amount
										: (invoice.total_ttc ?? 0) -
											(invoice.credit_notes_total ?? 0)

								return (
									<TableRow
										key={invoice.id}
										className={overdue ? 'bg-red-50/50' : ''}
									>
										<TableCell className='font-medium'>
											<div className='flex items-center gap-2'>
												<span className='font-mono'>{invoice.number}</span>

												{/* Si c'est un ticket transformé en facture */}
												{invoice.converted_to_invoice && <Badge>→ FAC</Badge>}

												{/* Si c'est un avoir (remboursement), on regarde le type de l'original */}
												{invoice.original_invoice_id && (
													<Badge>
														←{' '}
														{invoice.expand?.original_invoice_id?.is_pos_ticket
															? 'TIK'
															: 'FAC'}
													</Badge>
												)}
											</div>
										</TableCell>

										<TableCell className='text-sm text-muted-foreground'>
											{sellerName}
										</TableCell>

										<TableCell>
											<Badge
												variant={
													invoice.invoice_type === 'credit_note'
														? 'destructive'
														: 'outline'
												}
											>
												{invoice.is_pos_ticket
													? 'Ticket'
													: invoice.invoice_type === 'credit_note'
														? 'Avoir'
														: 'Facture'}
											</Badge>
										</TableCell>

										<TableCell>
											<div>
												<p className='font-medium'>
													{customer?.name || 'Client inconnu'}
												</p>
												{customer?.email && (
													<p className='text-xs text-muted-foreground'>
														{customer.email}
													</p>
												)}
											</div>
										</TableCell>

										<TableCell>{formatDate(invoice.date)}</TableCell>

										<TableCell>
											<span
												className={overdue ? 'text-red-600 font-medium' : ''}
											>
												{invoice.due_date ? formatDate(invoice.due_date) : '-'}
											</span>
											{overdue && (
												<AlertTriangle className='h-3 w-3 inline ml-1 text-red-500' />
											)}
										</TableCell>

										<TableCell>
											<div className='flex items-center gap-2'>
												<Badge variant={displayStatus.variant}>
													{displayStatus.label}
												</Badge>
												{displayStatus.isPaid && (
													<CheckCircle className='h-4 w-4 text-green-600' />
												)}
											</div>
										</TableCell>

										<TableCell
											className={`text-right font-medium ${invoice.total_ttc < 0 ? 'text-red-600' : ''}`}
										>
											{formatCurrency(invoice.total_ttc)}
										</TableCell>

										<TableCell>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button variant='ghost' className='h-8 w-8 p-0'>
														<MoreHorizontal className='h-4 w-4' />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align='end'>
													<DropdownMenuLabel>Actions</DropdownMenuLabel>

													<DropdownMenuItem
														onClick={() =>
															navigate({
																to: '/connect/invoices/$invoiceId',
																params: () => ({ invoiceId: invoice.id }),
															})
														}
													>
														<Eye className='h-4 w-4 mr-2' />
														Voir
													</DropdownMenuItem>

													<DropdownMenuItem
														onClick={() => handleDownloadPdf(invoice)}
													>
														<Download className='h-4 w-4 mr-2' />
														Télécharger PDF
													</DropdownMenuItem>

													<DropdownMenuItem
														onClick={() => handleOpenSendEmailDialog(invoice)}
														disabled={invoice.status === 'draft'}
													>
														<Mail className='h-4 w-4 mr-2' />
														Envoyer par email
													</DropdownMenuItem>

													{/* Convertir ticket -> facture */}
													{invoice.number?.startsWith('TIK-') &&
														!invoice.converted_to_invoice && (
															<>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	onClick={() =>
																		navigate({
																			to: '/cash/convert-to-invoice/$ticketId',
																			params: { ticketId: invoice.id },
																		})
																	}
																>
																	<Receipt className='h-4 w-4 mr-2' />
																	Convertir en facture
																</DropdownMenuItem>
															</>
														)}

													{/* Ticket Remboursement - Ajout de displayStatus.isPaid */}
													{isTicket &&
														displayStatus.isPaid &&
														invoice.invoice_type === 'invoice' && (
															<>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	onClick={() => {
																		if (remainingAmount <= 0) {
																			toast.error(
																				'Ticket déjà totalement remboursé',
																				{
																					description: `Le ticket ${invoice.number} a déjà été intégralement remboursé.`,
																				},
																			)
																			return
																		}
																		handleOpenRefundTicketDialog(invoice)
																	}}
																>
																	<RotateCcw className='h-4 w-4 mr-2' />
																	Rembourser ticket
																	{remainingAmount <= 0 && (
																		<span className='ml-2 text-xs text-muted-foreground'>
																			(remboursé)
																		</span>
																	)}
																</DropdownMenuItem>
															</>
														)}

													<DropdownMenuSeparator />

													{/* Actions spécifiques aux brouillons */}
													{invoice.status === 'draft' &&
														invoice.invoice_type === 'invoice' && (
															<>
																<DropdownMenuItem
																	onClick={() =>
																		navigate({
																			to: '/connect/invoices/$invoiceId/edit',
																			params: { invoiceId: invoice.id },
																		})
																	}
																>
																	<Edit className='h-4 w-4 mr-2' />
																	Modifier
																</DropdownMenuItem>
																<DropdownMenuItem
																	onClick={() => handleValidate(invoice)}
																>
																	<CheckCircle className='h-4 w-4 mr-2' />
																	Valider
																</DropdownMenuItem>

																<DropdownMenuItem
																	onClick={() =>
																		handleOpenDeleteDraftDialog(invoice)
																	}
																	className='text-red-600'
																>
																	<XCircle className='h-4 w-4 mr-2' />
																	Supprimer le brouillon
																</DropdownMenuItem>

																<DropdownMenuSeparator />
															</>
														)}

													{/* Workflow après brouillon */}
													{canTransitionTo(invoice.status, 'sent') && (
														<DropdownMenuItem
															onClick={() => handleMarkAsSent(invoice)}
														>
															<Send className='h-4 w-4 mr-2' />
															Marquer envoyée
														</DropdownMenuItem>
													)}

													{/* Paiement */}
													{canMarkAsPaid(invoice) &&
														!hasCancellationCreditNote &&
														// Facture avec acomptes ET pas déjà une facture de solde
														(invoice.invoice_type === 'invoice' &&
														(invoice.deposits_total_ttc ?? 0) > 0 &&
														!invoice.original_invoice_id ? (
															<DropdownMenuItem
																onClick={() =>
																	navigate({
																		to: '/connect/invoices/$invoiceId',
																		params: { invoiceId: invoice.id },
																	})
																}
															>
																<CheckCircle className='h-4 w-4 mr-2 text-blue-600' />
																Solder
															</DropdownMenuItem>
														) : (
															<DropdownMenuItem
																onClick={() => handleOpenPaymentDialog(invoice)}
															>
																<CheckCircle className='h-4 w-4 mr-2 text-green-600' />
																Enregistrer paiement
															</DropdownMenuItem>
														))}
													{/* Annulation par avoir - Ajout de displayStatus.isPaid */}
													{invoice.invoice_type === 'invoice' &&
														displayStatus.isPaid &&
														!isTicket &&
														invoice.status !== 'draft' &&
														!hasCancellationCreditNote && (
															<>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	onClick={() =>
																		handleOpenCancelDialog(invoice)
																	}
																	className='text-red-600'
																>
																	<XCircle className='h-4 w-4 mr-2' />
																	Créer un avoir
																</DropdownMenuItem>
															</>
														)}

													{/* Rembourser Facture - Ajout de displayStatus.isPaid */}
													{invoice.invoice_type === 'invoice' &&
														displayStatus.isPaid &&
														!isTicket &&
														invoice.status !== 'draft' && (
															<>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	onClick={() => {
																		if (remainingAmount <= 0) {
																			toast.error(
																				'Facture déjà totalement remboursée',
																				{
																					description: `La facture ${invoice.number} a déjà été intégralement remboursée.`,
																				},
																			)
																			return
																		}
																		setInvoiceToRefund(invoice)
																		setRefundInvoiceOpen(true)
																	}}
																	className={
																		remainingAmount <= 0
																			? 'text-muted-foreground'
																			: ''
																	}
																>
																	<RotateCcw className='h-4 w-4 mr-2' />
																	Rembourser
																	{remainingAmount <= 0 && (
																		<span className='ml-2 text-xs text-muted-foreground'>
																			(remboursée)
																		</span>
																	)}
																</DropdownMenuItem>
															</>
														)}
												</DropdownMenuContent>
											</DropdownMenu>
										</TableCell>
									</TableRow>
								)
							})}
						</TableBody>
					</Table>
				</div>
			)}

			{/* Dialog: Clôture journalière */}
			<Dialog open={closureConfirmOpen} onOpenChange={setClosureConfirmOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Clôture journalière</DialogTitle>
						<DialogDescription>
							Cette action va{' '}
							<strong>clôturer définitivement la journée fiscale</strong> pour
							l&apos;entreprise sélectionnée.
							<br />
							<br />
							Elle ne peut être réalisée qu&apos;
							<strong>une seule fois par jour</strong> et contribue à respecter
							les exigences légales françaises (inaltérabilité, traçabilité,
							chronologie des écritures).
							<br />
							<br />
							Toutes les factures et avoirs du jour seront :
							<ul className='mt-2 list-disc list-inside'>
								<li>inclus dans cette clôture</li>
								<li>chaînés cryptographiquement (hash ISCA)</li>
								<li>rattachés à cette période via un identifiant de clôture</li>
							</ul>
							<br />
							Cette opération est <strong>irréversible</strong> pour la période
							concernée.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant='outline'
							onClick={() => setClosureConfirmOpen(false)}
						>
							Annuler
						</Button>
						<Button
							onClick={handleConfirmDailyClosure}
							disabled={performDailyClosure.isPending}
							className='bg-red-600 hover:bg-red-700'
						>
							{performDailyClosure.isPending
								? 'Clôture en cours...'
								: 'Je comprends, clôturer la journée'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Dialog: Vérification d'intégrité */}
			<Dialog open={integrityDialogOpen} onOpenChange={setIntegrityDialogOpen}>
				<DialogContent className='max-w-2xl'>
					<DialogHeader>
						<DialogTitle className='flex items-center gap-2'>
							<Shield className='h-5 w-5' />
							Vérification d'intégrité
						</DialogTitle>
						<DialogDescription>
							Vérifiez l'intégrité de la chaîne de hachage et des données
							fiscales.
						</DialogDescription>
					</DialogHeader>

					<div className='space-y-4 py-4'>
						{/* Sélecteur de type */}
						<div className='space-y-2'>
							<Label>Type de documents à vérifier</Label>
							<Select
								value={integrityDocType}
								onValueChange={(v) => setIntegrityDocType(v as DocumentType)}
							>
								<SelectTrigger>
									<SelectValue placeholder='Sélectionner le type' />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='all'>Tous les documents</SelectItem>
									<SelectItem value='invoice'>
										Factures B2B uniquement
									</SelectItem>
									<SelectItem value='pos_ticket'>
										Tickets POS uniquement
									</SelectItem>
									<SelectItem value='credit_note'>Avoirs uniquement</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Résumé rapide (si disponible) */}
						{(integrityResult || integritySummary) && (
							<div className='grid grid-cols-4 gap-2 text-sm'>
								<div className='p-2 rounded bg-muted/50 text-center'>
									<p className='text-muted-foreground text-xs'>Total</p>
									<p className='font-semibold'>
										{integrityResult?.totalChecked ??
											integritySummary?.totalDocuments}
									</p>
								</div>
								<div className='p-2 rounded bg-muted/50 text-center'>
									<p className='text-muted-foreground text-xs'>Factures</p>
									<p className='font-semibold'>
										{integrityResult
											? `${integrityResult.summary.invoices.valid}/${integrityResult.summary.invoices.count}`
											: `${integritySummary?.byType.invoices.valid}/${integritySummary?.byType.invoices.total}`}
									</p>
								</div>
								<div className='p-2 rounded bg-muted/50 text-center'>
									<p className='text-muted-foreground text-xs'>Tickets</p>
									<p className='font-semibold'>
										{integrityResult
											? `${integrityResult.summary.posTickets.valid}/${integrityResult.summary.posTickets.count}`
											: `${integritySummary?.byType.posTickets.valid}/${integritySummary?.byType.posTickets.total}`}
									</p>
								</div>
								<div className='p-2 rounded bg-muted/50 text-center'>
									<p className='text-muted-foreground text-xs'>Avoirs</p>
									<p className='font-semibold'>
										{integrityResult
											? `${integrityResult.summary.creditNotes.valid}/${integrityResult.summary.creditNotes.count}`
											: `${integritySummary?.byType.creditNotes.valid}/${integritySummary?.byType.creditNotes.total}`}
									</p>
								</div>
							</div>
						)}

						{/* Résultats de la vérification */}
						{integrityResult && (
							<div className='space-y-3'>
								{/* Statut global */}
								<div
									className={`flex items-center gap-3 p-4 rounded-lg ${
										integrityResult.allValid
											? 'bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200'
											: 'bg-red-50 dark:bg-red-950/20 border border-red-200'
									}`}
								>
									{integrityResult.allValid ? (
										<ShieldCheck className='h-6 w-6 text-emerald-600' />
									) : (
										<ShieldAlert className='h-6 w-6 text-red-600' />
									)}
									<div>
										<p className='font-semibold'>
											{integrityResult.allValid
												? 'Intégrité vérifiée ✓'
												: 'Anomalies détectées'}
										</p>
										<p className='text-sm text-muted-foreground'>
											{integrityResult.totalChecked} document(s) vérifié(s) •{' '}
											{integrityResult.validCount} valide(s) •{' '}
											{integrityResult.invalidCount} invalide(s)
											{integrityResult.chainBreaks > 0 &&
												` • ${integrityResult.chainBreaks} rupture(s) de chaîne`}
										</p>
									</div>
								</div>

								{/* Résumé par type */}
								<div className='grid grid-cols-3 gap-2'>
									<div
										className={`text-center p-2 rounded ${
											integrityResult.summary.invoices.count ===
											integrityResult.summary.invoices.valid
												? 'bg-emerald-50 dark:bg-emerald-950/20'
												: 'bg-red-50 dark:bg-red-950/20'
										}`}
									>
										<p className='text-xs text-muted-foreground'>
											Factures B2B
										</p>
										<p className='font-medium'>
											{integrityResult.summary.invoices.valid}/
											{integrityResult.summary.invoices.count}
										</p>
									</div>
									<div
										className={`text-center p-2 rounded ${
											integrityResult.summary.posTickets.count ===
											integrityResult.summary.posTickets.valid
												? 'bg-emerald-50 dark:bg-emerald-950/20'
												: 'bg-red-50 dark:bg-red-950/20'
										}`}
									>
										<p className='text-xs text-muted-foreground'>Tickets POS</p>
										<p className='font-medium'>
											{integrityResult.summary.posTickets.valid}/
											{integrityResult.summary.posTickets.count}
										</p>
									</div>
									<div
										className={`text-center p-2 rounded ${
											integrityResult.summary.creditNotes.count ===
											integrityResult.summary.creditNotes.valid
												? 'bg-emerald-50 dark:bg-emerald-950/20'
												: 'bg-red-50 dark:bg-red-950/20'
										}`}
									>
										<p className='text-xs text-muted-foreground'>Avoirs</p>
										<p className='font-medium'>
											{integrityResult.summary.creditNotes.valid}/
											{integrityResult.summary.creditNotes.count}
										</p>
									</div>
								</div>

								{/* Détails des erreurs */}
								{integrityResult.invalidCount > 0 && (
									<div className='max-h-48 overflow-y-auto space-y-2'>
										<p className='text-sm font-medium text-red-600'>
											Documents avec erreurs:
										</p>
										{integrityResult.details
											.filter((d) => !d.isValid)
											.map((detail) => (
												<div
													key={detail.invoiceId}
													className='flex items-start gap-2 p-2 rounded bg-red-50 dark:bg-red-950/20 text-sm'
												>
													<XCircle className='h-4 w-4 text-red-500 mt-0.5 shrink-0' />
													<div>
														<span className='font-medium'>
															{detail.invoiceNumber}
														</span>
														{detail.errors.map((err) => (
															<p
																key={`${detail.invoiceId}-${err}`}
																className='text-muted-foreground text-xs'
															>
																{err}
															</p>
														))}
													</div>
												</div>
											))}
									</div>
								)}
							</div>
						)}
					</div>

					<DialogFooter>
						<Button
							variant='outline'
							onClick={() => setIntegrityDialogOpen(false)}
						>
							Fermer
						</Button>
						<Button
							onClick={handleVerifyChain}
							disabled={verifyChain.isPending}
						>
							{verifyChain.isPending ? (
								<>
									<RotateCcw className='h-4 w-4 animate-spin mr-2' />
									Vérification...
								</>
							) : (
								<>
									<ShieldCheck className='h-4 w-4 mr-2' />
									Lancer la vérification
								</>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Dialog: Créer un avoir */}
			<Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Créer un avoir d&apos;annulation</DialogTitle>
						<DialogDescription>
							Cette action va créer un avoir pour annuler la facture{' '}
							<strong>{invoiceToCancel?.number}</strong>.
							<br />
							L&apos;avoir sera automatiquement validé et contiendra les mêmes
							lignes avec des montants négatifs.
						</DialogDescription>
					</DialogHeader>
					<div className='space-y-4 py-4'>
						<div className='space-y-2'>
							<Label htmlFor='cancel-reason'>Motif d&apos;annulation *</Label>
							<Textarea
								id='cancel-reason'
								placeholder='Ex: Erreur de facturation, annulation commande client.'
								value={cancelReason}
								onChange={(e) => setCancelReason(e.target.value)}
								rows={3}
							/>
						</div>
						{invoiceToCancel && (
							<div className='bg-muted/50 rounded-lg p-3 text-sm'>
								<p>
									<strong>Facture originale:</strong> {invoiceToCancel.number}
								</p>
								<p>
									<strong>Montant TTC:</strong>{' '}
									{formatCurrency(invoiceToCancel.total_ttc)}
								</p>
								<p>
									<strong>Client:</strong>{' '}
									{invoiceToCancel.expand?.customer?.name}
								</p>
							</div>
						)}
					</div>
					<DialogFooter>
						<Button
							variant='outline'
							onClick={() => setCancelDialogOpen(false)}
						>
							Annuler
						</Button>
						<Button
							variant='destructive'
							onClick={handleCancelInvoice}
							disabled={!cancelReason.trim() || cancelInvoice.isPending}
						>
							{cancelInvoice.isPending ? 'Création...' : "Créer l'avoir"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Dialog: Enregistrer paiement */}
			<Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Enregistrer un paiement</DialogTitle>
						<DialogDescription>
							{formatCurrency(
								invoiceToPay?.deposits_total_ttc
									? (invoiceToPay?.balance_due ?? 0)
									: (invoiceToPay?.total_ttc ?? 0),
							)}
						</DialogDescription>
					</DialogHeader>

					<div className='space-y-4 py-4'>
						{/* Toggle mode — seulement si la facture peut recevoir un acompte */}
						{invoiceToPay &&
							invoiceToPay.invoice_type !== 'deposit' &&
							canCreateDeposit(invoiceToPay) && (
								<div className='flex rounded-lg border overflow-hidden'>
									<button
										type='button'
										onClick={() => setPaymentMode('full')}
										className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
											paymentMode === 'full'
												? 'bg-primary text-primary-foreground'
												: 'bg-background text-muted-foreground hover:bg-muted'
										}`}
									>
										<CheckCircle className='h-4 w-4 inline mr-2' />
										Paiement total
									</button>
									<button
										type='button'
										onClick={() => setPaymentMode('deposit')}
										className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
											paymentMode === 'deposit'
												? 'bg-primary text-primary-foreground'
												: 'bg-background text-muted-foreground hover:bg-muted'
										}`}
									>
										<Banknote className='h-4 w-4 inline mr-2' />
										Acompte
									</button>
								</div>
							)}

						{paymentMode === 'full' ? (
							/* ── Paiement total ── */
							<div className='space-y-2'>
								<Label>Méthode de paiement</Label>
								<Select
									value={selectedMethodId}
									onValueChange={setSelectedMethodId}
								>
									<SelectTrigger>
										<SelectValue placeholder='Sélectionner' />
									</SelectTrigger>
									<SelectContent>
										{enabledMethods.map((method) => (
											<SelectItem key={method.id} value={method.id}>
												{method.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{invoiceToPay && (
									<div className='bg-green-50 dark:bg-green-950/20 rounded-lg p-3 text-sm space-y-1'>
										<p>
											<strong>Montant :</strong>{' '}
											{formatCurrency(
												invoiceToPay.invoice_type === 'deposit'
													? invoiceToPay.total_ttc
													: invoiceToPay.deposits_total_ttc
														? (invoiceToPay.balance_due ??
															invoiceToPay.total_ttc)
														: invoiceToPay.total_ttc,
											)}
										</p>
										<p>
											<strong>Client :</strong>{' '}
											{invoiceToPay.expand?.customer?.name}
										</p>
									</div>
								)}
							</div>
						) : (
							/* ── Acompte ── */
							<div className='space-y-3'>
								<Label>Pourcentage de l'acompte</Label>
								<div className='flex items-center gap-3'>
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
									<span className='w-12 text-right font-semibold'>
										{depositPercentage}%
									</span>
								</div>
								{invoiceToPay && (
									<div className='bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 text-sm space-y-1'>
										<p>
											<strong>Acompte :</strong>{' '}
											{formatCurrency(
												((invoiceToPay.deposits_total_ttc
													? (invoiceToPay.balance_due ?? invoiceToPay.total_ttc)
													: invoiceToPay.total_ttc) *
													depositPercentage) /
													100,
											)}
										</p>
										<p>
											<strong>Solde restant :</strong>{' '}
											{formatCurrency(
												((invoiceToPay.deposits_total_ttc
													? (invoiceToPay.balance_due ?? invoiceToPay.total_ttc)
													: invoiceToPay.total_ttc) *
													(100 - depositPercentage)) /
													100,
											)}
										</p>
										<p>
											<strong>Client :</strong>{' '}
											{invoiceToPay.expand?.customer?.name}
										</p>
									</div>
								)}
							</div>
						)}
					</div>

					<DialogFooter>
						<Button
							variant='outline'
							onClick={() => setPaymentDialogOpen(false)}
						>
							Annuler
						</Button>
						<Button
							onClick={handleRecordPayment}
							disabled={
								paymentMode === 'full'
									? !selectedMethodId || recordPayment.isPending
									: createDeposit.isPending
							}
							className={
								paymentMode === 'full' ? 'bg-green-600 hover:bg-green-700' : ''
							}
						>
							{paymentMode === 'full'
								? recordPayment.isPending
									? 'Enregistrement...'
									: 'Confirmer le paiement'
								: createDeposit.isPending
									? 'Création...'
									: `Créer l'acompte ${depositPercentage}%`}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Dialog: Suppression de brouillon */}
			<Dialog
				open={deleteDraftDialogOpen}
				onOpenChange={setDeleteDraftDialogOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Supprimer le brouillon</DialogTitle>
						<DialogDescription>
							Cette action va <strong>supprimer définitivement</strong> le
							brouillon de facture <strong>{draftToDelete?.number}</strong>.
							<br />
							Tant qu&apos;une facture est en statut <strong>brouillon</strong>,
							elle n&apos;a pas encore de valeur légale et peut être effacée.
							<br />
							<br />
							Une fois supprimée, vous ne pourrez plus la récupérer.
						</DialogDescription>
					</DialogHeader>
					{draftToDelete && (
						<div className='bg-muted/50 rounded-lg p-3 text-sm mb-4'>
							<p>
								<strong>Client :</strong>{' '}
								{draftToDelete.expand?.customer?.name || 'Non renseigné'}
							</p>
							<p>
								<strong>Montant TTC :</strong>{' '}
								{formatCurrency(draftToDelete.total_ttc)}
							</p>
						</div>
					)}
					<DialogFooter>
						<Button
							variant='outline'
							onClick={() => setDeleteDraftDialogOpen(false)}
						>
							Annuler
						</Button>
						<Button
							variant='destructive'
							onClick={handleConfirmDeleteDraft}
							disabled={deleteDraftInvoice.isPending}
						>
							{deleteDraftInvoice.isPending
								? 'Suppression...'
								: 'Supprimer le brouillon'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<RefundTicketDialog
				open={refundTicketDialogOpen}
				onOpenChange={(o) => {
					if (!o) handleCloseRefundTicketDialog()
					else setRefundTicketDialogOpen(true)
				}}
				ticket={ticketToRefund}
				onSuccess={(stockItems) => {
					handleCloseRefundTicketDialog()
					void refetchInvoices()
					if (stockItems && stockItems.length > 0) {
						handleOpenStockReclassify(stockItems, ticketToRefund?.number)
					}
				}}
			/>

			<RefundInvoiceDialog
				open={refundInvoiceOpen}
				invoice={invoiceToRefund}
				onClose={() => {
					setRefundInvoiceOpen(false)
					setInvoiceToRefund(null)
				}}
				onSuccess={(stockItems) => {
					void refetchInvoices()
					if (stockItems && stockItems.length > 0) {
						handleOpenStockReclassify(stockItems, invoiceToRefund?.number)
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

			{/* Dialog: Envoyer la facture par email */}
			<SendInvoiceEmailDialog
				open={sendEmailDialogOpen}
				onOpenChange={setSendEmailDialogOpen}
				invoice={invoiceToEmail}
				onSuccess={async () => {
					await refetchInvoices()
				}}
			/>
		</div>
	)
}
