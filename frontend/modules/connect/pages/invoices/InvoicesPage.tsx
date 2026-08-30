// frontend/modules/connect/components/InvoicesPage.tsx
// ISCA v2 - refactorisé : table extraite dans InvoicesTable, pagination serveur, debounce

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
// import { navigationActions } from '@/lib/stores/navigationStore'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useDebounce } from '@/lib/hooks/useDebounce'
import {
	type ChainVerificationResult,
	type DocumentType,
	useClosures,
	useIntegritySummary,
	usePerformDailyClosure,
	useVerifyInvoiceChain,
} from '@/lib/queries/closures'

import { PeriodSelector } from '@/components/PeriodSelector'
import {
	PERIOD_PREFERENCE_KEYS,
	usePeriodFilter,
} from '@/lib/hooks/usePeriodFilter'
import {
	useCancelInvoice,
	useDeleteDraftInvoice,
	useInvoiceStats,
	useInvoices,
	useRefundDeposit,
} from '@/lib/queries/invoices'
import type { InvoiceResponse, InvoiceStatus } from '@/lib/types/invoice.types'
import { isOverdue } from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { RefundInvoiceDialog } from '@/modules/common/RefundInvoiceDialog'
import { RefundTicketDialog } from '@/modules/common/RefundTicketDialog'
import {
	StockReclassificationDialog,
	type StockReclassificationItem,
} from '@/modules/common/StockReclassificationDialog'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
	FileText,
	Plus,
	RotateCcw,
	Shield,
	ShieldAlert,
	ShieldCheck,
	XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { InvoicesTable } from '../../features/invoices/InvoicesTable'
import { formatCurrency, formatDate } from '../../utils/formatters'
// ============================================================================
// TYPES
// ============================================================================

type StatusFilter = InvoiceStatus | 'all' | 'unpaid' | 'overdue'

const PER_PAGE = 30

// ============================================================================
// COMPONENT
// ============================================================================

export function InvoicesPage() {
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as any

	// États filtres
	const [searchTerm, setSearchTerm] = useState('')
	const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
	const [typeFilter, setTypeFilter] = useState<
		'all' | 'invoice' | 'credit_note'
	>('all')

	// Pagination
	const [page, setPage] = useState(1)
	// const prevDebouncedRef = useRef('')
	const debouncedSearch = useDebounce(searchTerm, 400)

	// Reset page via ref quand la recherche change — sans re-render supplémentaire
	// if (debouncedSearch !== prevDebouncedRef.current) {
	// 	prevDebouncedRef.current = debouncedSearch
	// 	if (page !== 1) setPage(1)
	// }

	// Résolution des IDs clients correspondant au terme recherché.
	// PocketBase ne supporte pas customer.name ~ "x" en filtre cross-collection fiable,
	// on cherche d'abord les IDs dans la collection customers, puis on filtre les factures.
	const { data: matchingCustomerIds } = useQuery({
		queryKey: ['customer-search-ids', activeCompanyId, debouncedSearch],
		queryFn: async () => {
			if (!debouncedSearch || !activeCompanyId) return []
			const result = await pb.collection('customers').getFullList({
				filter: `owner_company = "${activeCompanyId}" && name ~ "${debouncedSearch}"`,
				fields: 'id',
			})
			return result.map((c: any) => c.id as string)
		},
		enabled: !!debouncedSearch && !!activeCompanyId,
		staleTime: 10_000,
	})

	// Filtre combiné : numéro OU clients correspondants
	const searchFilter = useMemo(() => {
		if (!debouncedSearch) return undefined
		const parts: string[] = [`number ~ "${debouncedSearch}"`]
		if (matchingCustomerIds && matchingCustomerIds.length > 0) {
			const customerFilter = matchingCustomerIds
				.map((id: string) => `customer = "${id}"`)
				.join(' || ')
			parts.push(`(${customerFilter})`)
		}
		return `(${parts.join(' || ')})`
	}, [debouncedSearch, matchingCustomerIds])

	// États dialogs
	const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
	const [invoiceToCancel, setInvoiceToCancel] =
		useState<InvoiceResponse | null>(null)
	const [cancelReason, setCancelReason] = useState('')


	// Sept fonctions et sept etats sont morts ici le 30 aout 2026, avec le
	// dialogue d'encaissement inatteignable qu'ils servaient. Ils n'etaient
	// joignables que par des props qu'InvoicesTable declarait sans les lire.
	// L'encaissement se fait depuis le detail d'une facture.

	const [refundDepositOpen, setRefundDepositOpen] = useState(false)
	const [refundDepositReason, setRefundDepositReason] = useState('')
	const [depositToRefund, setDepositToRefund] =
		useState<InvoiceResponse | null>(null)
	const refundDeposit = useRefundDeposit()

	const [closureConfirmOpen, setClosureConfirmOpen] = useState(false)

	const [deleteDraftDialogOpen, setDeleteDraftDialogOpen] = useState(false)
	const [draftToDelete, setDraftToDelete] = useState<InvoiceResponse | null>(
		null,
	)


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

	const [integrityDialogOpen, setIntegrityDialogOpen] = useState(false)
	const [integrityDocType, setIntegrityDocType] = useState<DocumentType>('all')
	const [integrityResult, setIntegrityResult] =
		useState<ChainVerificationResult | null>(null)

	const { data: integritySummary, refetch: refetchIntegritySummary } =
		useIntegritySummary(activeCompanyId ?? undefined)

	// Mutations
	const cancelInvoice = useCancelInvoice()
	const deleteDraftInvoice = useDeleteDraftInvoice()
	const performDailyClosure = usePerformDailyClosure()
	const verifyChain = useVerifyInvoiceChain()

	const { data: closuresData } = useClosures({
		companyId: activeCompanyId ?? undefined,
		closureType: 'daily',
	})

	const { period, setPeriod, dateRange } = usePeriodFilter(
		'all',
		PERIOD_PREFERENCE_KEYS.invoices,
	)

	// Query principale avec pagination serveur
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
		filter: searchFilter
			? `is_pos_ticket != true && ${searchFilter}`
			: 'is_pos_ticket != true',
		dateFrom: dateRange.from,
		dateTo: dateRange.to,
		page,
		perPage: PER_PAGE,
	})

	// Filtres côté client (overdue, TIK/FAC) — appliqués sur la page courante uniquement
	let invoices = (invoicesData?.items ?? []) as InvoiceResponse[]
	if (statusFilter === 'overdue') {
		invoices = invoices.filter((inv) => isOverdue(inv))
	}

	// useEffect(() => {
	// 	navigationActions.clear()
	// }, [])

	// Le chargement de la societe active servait le PDF, genere depuis cette
	// page par un handler devenu injoignable. Retire avec lui.

	// Stats globales
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
	}

	const today = new Date()
	today.setHours(0, 0, 0, 0)
	const hasTodayClosure =
		(closuresData?.items ?? []).some((c) => {
			const d = new Date(c.period_start)
			d.setHours(0, 0, 0, 0)
			return d.getTime() === today.getTime()
		}) ?? false

	// === HANDLERS ===

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

			if (stockItems.length > 0) {
				setStockItemsToReclassify(stockItems)
				setStockDocumentNumber(invoiceToCancel.number)
				setStockReclassifyOpen(true)
			}
		} catch (error: any) {
			toast.error(error.message || "Erreur lors de la création de l'avoir")
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

	const handleDailyClosureClick = () => {
		if (!activeCompanyId) {
			toast.error('Aucune entreprise sélectionnée')
			return
		}
		if (hasTodayClosure) return
		setClosureConfirmOpen(true)
	}

	const handleVerifyChain = async () => {
		if (!activeCompanyId) {
			toast.error('Aucune entreprise sélectionnée')
			return
		}
		try {
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
					<Button
						variant='outline'
						onClick={() => {
							setIntegrityDocType('all')
							setIntegrityDialogOpen(true)
						}}
					>
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
					<Button onClick={() => navigate({ to: '/connect/invoices/new' })}>
						<Plus className='h-4 w-4 mr-2' />
						Nouvelle facture
					</Button>
				</div>
			</div>

			{/* Filtre de période */}
			<div className='flex items-center justify-between mb-3'>
				<PeriodSelector
					period={period}
					onPeriodChange={(nextPeriod) => {
						setPeriod(nextPeriod)
						setPage(1)
					}}
				/>
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
						placeholder='Rechercher par numéro ou nom du client...'
						value={searchTerm}
						onChange={(e) => {
							setSearchTerm(e.target.value)
							setPage(1) // <-- Retour instantané à la page 1 !
						}}
					/>
				</div>
				<div className='flex gap-2'>
					<Select
						value={statusFilter}
						onValueChange={(value: StatusFilter) => {
							setStatusFilter(value)
							setPage(1)
						}}
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
						onValueChange={(value: 'all' | 'invoice' | 'credit_note') => {
							setTypeFilter(value)
							setPage(1)
						}}
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
				</div>
			</div>

			{/* Table — pas de early return sur isLoading, spinner géré dans InvoicesTable */}
			<InvoicesTable
				invoices={invoices}
				isLoading={isLoading}
				page={page}
				totalPages={invoicesData?.totalPages ?? 1}
				totalItems={invoicesData?.totalItems ?? 0}
				perPage={PER_PAGE}
				onPageChange={setPage}
			/>

			{/* ── Dialogs ─────────────────────────────────────────────────────── */}

			{/* Clôture journalière */}
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
							les exigences légales françaises.
							<br />
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
							onClick={async () => {
								setClosureConfirmOpen(false)
								await handleDailyClosure()
							}}
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

			{/* Vérification d'intégrité */}
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
						{!integrityResult &&
							integritySummary &&
							(integritySummary.sequenceGaps > 0 ||
								integritySummary.draftsSkipped > 0) && (
								<p className='text-xs text-muted-foreground'>
									{integritySummary.sequenceGaps > 0 &&
										`${integritySummary.sequenceGaps} discontinuité(s) de numérotation`}
									{integritySummary.sequenceGaps > 0 &&
										integritySummary.draftsSkipped > 0 &&
										' • '}
									{integritySummary.draftsSkipped > 0 &&
										`${integritySummary.draftsSkipped} brouillon(s) hors contrôle`}
								</p>
							)}
						{integrityResult && (
							<div className='space-y-3'>
								<div
									className={`flex items-center gap-3 p-4 rounded-lg ${integrityResult.allValid ? 'bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200' : 'bg-red-50 dark:bg-red-950/20 border border-red-200'}`}
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
										{(integrityResult.sequenceGaps > 0 ||
											integrityResult.draftsSkipped > 0) && (
											<p className='text-sm text-muted-foreground'>
												{integrityResult.sequenceGaps > 0 &&
													`${integrityResult.sequenceGaps} discontinuité(s) de numérotation — document supprimé par le passé, sans altération de la chaîne`}
												{integrityResult.sequenceGaps > 0 &&
													integrityResult.draftsSkipped > 0 &&
													' • '}
												{integrityResult.draftsSkipped > 0 &&
													`${integrityResult.draftsSkipped} brouillon(s) hors contrôle — non numérotés tant qu'ils ne sont pas validés`}
											</p>
										)}
									</div>
								</div>
								<div className='grid grid-cols-3 gap-2'>
									{[
										{
											label: 'Factures B2B',
											data: integrityResult.summary.invoices,
										},
										{
											label: 'Tickets POS',
											data: integrityResult.summary.posTickets,
										},
										{
											label: 'Avoirs',
											data: integrityResult.summary.creditNotes,
										},
									].map(({ label, data }) => (
										<div
											key={label}
											className={`text-center p-2 rounded ${data.count === data.valid ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}
										>
											<p className='text-xs text-muted-foreground'>{label}</p>
											<p className='font-medium'>
												{data.valid}/{data.count}
											</p>
										</div>
									))}
								</div>
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

			{/* Créer un avoir */}
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

			{/* Le dialogue d'encaissement qui vivait ici a été supprimé le
			    30 août 2026. Il était INATTEIGNABLE : son ouverture ne passait que
			    par `onOpenPayment`, une prop qu'InvoicesTable déclarait sans jamais
			    la lire. C'était de surcroît un doublon d'InvoicePaymentDialog, au
			    vocabulaire divergent et SANS son verrouillage de fermeture — donc
			    sans sa protection contre la double facturation.

			    L'encaissement est gouverné depuis le détail d'une facture, et la
			    liste n'a pas vocation à encaisser. Si ce besoin réapparaît, il se
			    rouvre avec le composant partagé, pas avec cette copie. */}

			{/* Rembourser un acompte */}
			<Dialog open={refundDepositOpen} onOpenChange={setRefundDepositOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Rembourser l'acompte</DialogTitle>
						<DialogDescription>
							Un avoir sera créé pour annuler l'acompte{' '}
							<strong>{depositToRefund?.number}</strong> de{' '}
							<strong>{formatCurrency(depositToRefund?.total_ttc ?? 0)}</strong>
							. Le solde de la facture parente sera recalculé.
						</DialogDescription>
					</DialogHeader>
					<div className='space-y-2 py-4'>
						<Label>Motif du remboursement *</Label>
						<Textarea
							value={refundDepositReason}
							onChange={(e) => setRefundDepositReason(e.target.value)}
							placeholder='Ex: Annulation de commande, litige client...'
							rows={3}
						/>
						{depositToRefund && (
							<div className='bg-muted/50 rounded-lg p-3 text-sm mt-2'>
								<p>
									<strong>Acompte :</strong> {depositToRefund.number}
								</p>
								<p>
									<strong>Montant :</strong>{' '}
									{formatCurrency(depositToRefund.total_ttc)}
								</p>
								<p>
									<strong>Client :</strong>{' '}
									{depositToRefund.expand?.customer?.name}
								</p>
							</div>
						)}
					</div>
					<DialogFooter>
						<Button
							variant='outline'
							onClick={() => {
								setRefundDepositOpen(false)
								setDepositToRefund(null)
								setRefundDepositReason('')
							}}
						>
							Annuler
						</Button>
						<Button
							variant='destructive'
							disabled={!refundDepositReason.trim() || refundDeposit.isPending}
							onClick={async () => {
								if (!depositToRefund) return
								try {
									await refundDeposit.mutateAsync({
										depositId: depositToRefund.id,
										reason: refundDepositReason,
									})
									toast.success(
										`Avoir créé pour l'acompte ${depositToRefund.number}`,
									)
									setRefundDepositOpen(false)
									setDepositToRefund(null)
									setRefundDepositReason('')
									await refetchInvoices()
								} catch (err: any) {
									toast.error(
										err?.message || "Erreur lors du remboursement de l'acompte",
									)
								}
							}}
						>
							{refundDeposit.isPending ? 'Création...' : "Créer l'avoir"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Suppression de brouillon */}
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

			{/* Dialogs externes */}
			<RefundTicketDialog
				open={refundTicketDialogOpen}
				onOpenChange={(o) => {
					if (!o) {
						setRefundTicketDialogOpen(false)
						setTicketToRefund(null)
					} else setRefundTicketDialogOpen(true)
				}}
				ticket={ticketToRefund}
				onSuccess={(stockItems) => {
					setRefundTicketDialogOpen(false)
					setTicketToRefund(null)
					void refetchInvoices()
					if (stockItems && stockItems.length > 0)
						handleOpenStockReclassify(stockItems, ticketToRefund?.number)
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
					if (stockItems && stockItems.length > 0)
						handleOpenStockReclassify(stockItems, invoiceToRefund?.number)
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
			{/* Le dialogue d'envoi par email a suivi le meme sort : son ouverture
			    ne passait que par une prop qu'InvoicesTable ne lisait pas. */}
		</div>
	)
}
