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
	useClosures,
	usePerformDailyClosure,
	useVerifyInvoiceChain,
} from '@/lib/queries/closures'
import {
	useCancelInvoice,
	useDeleteDraftInvoice,
	useInvoices,
	useMarkInvoiceAsSent,
	useRecordPayment,
	useValidateInvoice,
} from '@/lib/queries/invoices'
import type { InvoiceResponse, InvoiceStatus } from '@/lib/types/invoice.types'
import {
	canMarkAsPaid,
	canTransitionTo,
	getDisplayStatus,
	isOverdue,
} from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { RefundTicketDialog } from '@/modules/common/RefundTicketDialog'
import { pdf } from '@react-pdf/renderer'
import { useNavigate } from '@tanstack/react-router'
import {
	AlertTriangle,
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
	XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { InvoicePdfDocument } from './InvoicePdf'
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
	const [paymentMethod, setPaymentMethod] = useState<string>('')

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

	const handleOpenRefundTicketDialog = (ticket: InvoiceResponse) => {
		setTicketToRefund(ticket)
		setRefundTicketDialogOpen(true)
	}

	const handleCloseRefundTicketDialog = () => {
		setRefundTicketDialogOpen(false)
		setTicketToRefund(null)
	}

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

	// Stats (NOUVEAU: utilise is_paid au lieu du statut)
	const stats = useMemo(
		() =>
			invoices.reduce(
				(acc, inv) => {
					if (inv.invoice_type === 'invoice') {
						acc.invoiceCount++

						const creditTotal = creditNotesByOriginal[inv.id] ?? 0
						const netAmount = inv.total_ttc + creditTotal

						acc.totalTTC += inv.total_ttc

						if (inv.is_paid) {
							acc.paid += inv.total_ttc
						} else if (inv.status !== 'draft') {
							if (netAmount > 0) {
								acc.pending += netAmount
								if (isOverdue(inv)) acc.overdue += netAmount
							}
						}
					} else if (inv.invoice_type === 'credit_note') {
						acc.creditNoteCount++
						acc.totalTTC += inv.total_ttc
						acc.creditNotesTTC += inv.total_ttc
					}
					return acc
				},
				{
					invoiceCount: 0,
					creditNoteCount: 0,
					totalTTC: 0,
					creditNotesTTC: 0,
					paid: 0,
					pending: 0,
					overdue: 0,
				},
			),
		// deps: surtout pas creditNotesByOriginal (c'est un nouvel objet à chaque render)
		[invoices],
	)
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
		setInvoiceToPay(invoice)
		setPaymentMethod('')
		setPaymentDialogOpen(true)
	}

	const handleRecordPayment = async () => {
		if (!invoiceToPay) return

		try {
			await recordPayment.mutateAsync({
				invoiceId: invoiceToPay.id,
				paymentMethod: (paymentMethod as any) || undefined,
			})
			toast.success(`Paiement enregistré pour ${invoiceToPay.number}`)
			setPaymentDialogOpen(false)
			setInvoiceToPay(null)
			await refetchInvoices()
		} catch (error: any) {
			toast.error(
				error.message || "Erreur lors de l'enregistrement du paiement",
			)
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
			setInvoiceToCancel(null)
			await refetchInvoices()
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

			const doc = (
				<InvoicePdfDocument
					invoice={invoice}
					customer={customer as any}
					company={company || undefined}
					companyLogoUrl={logoDataUrl}
				/>
			)

			const blob = await pdf(doc).toBlob()
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
			const result = await verifyChain.mutateAsync(activeCompanyId)

			if (result.allValid) {
				toast.success(
					`Chaîne de factures valide – ${result.totalChecked} factures vérifiées`,
				)
			} else {
				toast.error(
					`Anomalies détectées: ${result.invalidCount} / ${result.totalChecked} factures`,
				)
				console.warn('Détails intégrité factures', result.details)
			}
		} catch (error: any) {
			toast.error(error.message || "Erreur lors de la vérification d'intégrité")
		}
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
						onClick={handleVerifyChain}
						disabled={verifyChain.isPending}
					>
						{verifyChain.isPending ? 'Vérification...' : 'Vérifier intégrité'}
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
												{invoice.converted_to_invoice && <Badge>→ FAC</Badge>}
												{invoice.original_invoice_id && <Badge>← TIK</Badge>}
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

													{isTicket && invoice.invoice_type === 'invoice' && (
														<>
															<DropdownMenuSeparator />
															<DropdownMenuItem
																onClick={() => {
																	// Vérifier si remboursement possible
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
																// Retirer le disabled pour permettre le clic et afficher le toast
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
														!hasCancellationCreditNote && (
															<DropdownMenuItem
																onClick={() => handleOpenPaymentDialog(invoice)}
															>
																<CheckCircle className='h-4 w-4 mr-2 text-green-600' />
																Enregistrer paiement
															</DropdownMenuItem>
														)}

													{/* Annulation par avoir */}
													{invoice.invoice_type === 'invoice' &&
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
							Marquer la facture <strong>{invoiceToPay?.number}</strong> comme
							payée.
						</DialogDescription>
					</DialogHeader>
					<div className='space-y-4 py-4'>
						<div className='space-y-2'>
							<Label htmlFor='payment-method'>Méthode de paiement</Label>
							<Select value={paymentMethod} onValueChange={setPaymentMethod}>
								<SelectTrigger>
									<SelectValue placeholder='Sélectionner.' />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='virement'>Virement</SelectItem>
									<SelectItem value='cb'>Carte bancaire</SelectItem>
									<SelectItem value='especes'>Espèces</SelectItem>
									<SelectItem value='cheque'>Chèque</SelectItem>
									<SelectItem value='autre'>Autre</SelectItem>
								</SelectContent>
							</Select>
						</div>
						{invoiceToPay && (
							<div className='bg-green-50 rounded-lg p-3 text-sm'>
								<p>
									<strong>Montant:</strong>{' '}
									{formatCurrency(invoiceToPay.total_ttc)}
								</p>
								<p>
									<strong>Client:</strong> {invoiceToPay.expand?.customer?.name}
								</p>
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
							disabled={recordPayment.isPending}
							className='bg-green-600 hover:bg-green-700'
						>
							{recordPayment.isPending
								? 'Enregistrement...'
								: 'Confirmer le paiement'}
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
				onSuccess={() => {
					handleCloseRefundTicketDialog()
					void refetchInvoices()
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
