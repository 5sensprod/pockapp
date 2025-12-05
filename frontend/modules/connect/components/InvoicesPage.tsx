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
import { pdf } from '@react-pdf/renderer'
import { useNavigate } from '@tanstack/react-router'
import {
	AlertTriangle,
	CheckCircle,
	Download,
	Eye,
	FileText,
	MoreHorizontal,
	Plus,
	Send,
	XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { InvoicePdfDocument } from './InvoicePdf'

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

	// États dialogs
	const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
	const [invoiceToCancel, setInvoiceToCancel] =
		useState<InvoiceResponse | null>(null)
	const [cancelReason, setCancelReason] = useState('')

	const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
	const [invoiceToPay, setInvoiceToPay] = useState<InvoiceResponse | null>(null)
	const [paymentMethod, setPaymentMethod] = useState<string>('')

	const [closureConfirmOpen, setClosureConfirmOpen] = useState(false)

	const [deleteDraftDialogOpen, setDeleteDraftDialogOpen] = useState(false)
	const [draftToDelete, setDraftToDelete] = useState<InvoiceResponse | null>(
		null,
	)

	const [viewDialogOpen, setViewDialogOpen] = useState(false)
	const [invoiceToView, setInvoiceToView] = useState<InvoiceResponse | null>(
		null,
	)

	const [company, setCompany] = useState<CompaniesResponse | null>(null)

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

	// Filtrer côté client pour "overdue"
	let invoices = (invoicesData?.items ?? []) as InvoiceResponse[]
	if (statusFilter === 'overdue') {
		invoices = invoices.filter((inv) => isOverdue(inv))
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

	// Stats (NOUVEAU: utilise is_paid au lieu du statut)
	const stats = invoices.reduce(
		(acc, inv) => {
			if (inv.invoice_type === 'invoice') {
				// ✅ Factures classiques
				acc.invoiceCount++
				acc.totalTTC += inv.total_ttc

				if (inv.is_paid) {
					acc.paid += inv.total_ttc
				} else if (inv.status !== 'draft') {
					acc.pending += inv.total_ttc
					if (isOverdue(inv)) {
						acc.overdue += inv.total_ttc
					}
				}
			} else if (inv.invoice_type === 'credit_note') {
				// ✅ Avoirs : montants négatifs qui viennent diminuer le total
				acc.creditNoteCount++
				acc.totalTTC += inv.total_ttc // net factures - avoirs
				acc.creditNotesTTC += inv.total_ttc // suivi séparé
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

	const handleOpenViewDialog = (invoice: InvoiceResponse) => {
		setInvoiceToView(invoice)
		setViewDialogOpen(true)
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
						Factures
					</h1>
					<p className='text-muted-foreground'>Gérez vos factures clients</p>
				</div>
				<Button
					onClick={() => navigate({ to: '/connect/invoices/new' })}
					className='gap-2'
				>
					<Plus className='h-4 w-4' />
					Nouvelle facture
				</Button>
			</div>

			{/* Stats */}
			<div className='grid sm:grid-cols-5 gap-4 mb-6'>
				<div className='bg-muted/30 rounded-lg p-4'>
					<p className='text-sm text-muted-foreground'>Total factures</p>
					<p className='text-2xl font-bold'>{stats.invoiceCount}</p>
				</div>

				<div className='bg-muted/30 rounded-lg p-4'>
					<p className='text-sm text-muted-foreground'>Montant total (net)</p>
					<p className='text-2xl font-bold'>{formatCurrency(stats.totalTTC)}</p>
					{stats.creditNotesTTC !== 0 && (
						<p className='text-xs text-muted-foreground mt-1'>
							Dont avoirs : {formatCurrency(stats.creditNotesTTC)}
						</p>
					)}
				</div>

				<div className='bg-green-50 rounded-lg p-4'>
					<p className='text-sm text-green-600'>Encaissé</p>
					<p className='text-2xl font-bold text-green-700'>
						{formatCurrency(stats.paid)}
					</p>
				</div>

				<div className='bg-orange-50 rounded-lg p-4'>
					<p className='text-sm text-orange-600'>En attente</p>
					<p className='text-2xl font-bold text-orange-700'>
						{formatCurrency(stats.pending)}
					</p>
				</div>

				{stats.overdue > 0 && (
					<div className='bg-red-50 rounded-lg p-4'>
						<p className='text-sm text-red-600 flex items-center gap-1'>
							<AlertTriangle className='h-3 w-3' />
							En retard
						</p>
						<p className='text-2xl font-bold text-red-700'>
							{formatCurrency(stats.overdue)}
						</p>
					</div>
				)}
			</div>

			{/* Filtres */}
			<div className='flex gap-4 mb-6 flex-wrap'>
				<div className='flex-1 max-w-sm'>
					<Input
						placeholder='Rechercher par numéro...'
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
					/>
				</div>
				<Select
					value={statusFilter}
					onValueChange={(value) => setStatusFilter(value as StatusFilter)}
				>
					<SelectTrigger className='w-[180px]'>
						<SelectValue placeholder='Statut' />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value='all'>Tous les statuts</SelectItem>
						<SelectItem value='draft'>Brouillons</SelectItem>
						<SelectItem value='validated'>Validées</SelectItem>
						<SelectItem value='sent'>Envoyées</SelectItem>
						<SelectItem value='unpaid'>Non payées</SelectItem>
						<SelectItem value='overdue'>En retard</SelectItem>
					</SelectContent>
				</Select>
				<Select
					value={typeFilter}
					onValueChange={(value) => setTypeFilter(value as any)}
				>
					<SelectTrigger className='w-[150px]'>
						<SelectValue placeholder='Type' />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value='all'>Tous types</SelectItem>
						<SelectItem value='invoice'>Factures</SelectItem>
						<SelectItem value='credit_note'>Avoirs</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* Actions de contrôle (clôture & intégrité) */}
			<div className='flex flex-wrap gap-3 mb-6 justify-between items-center'>
				<p className='text-sm text-muted-foreground'>
					Contrôles fiscaux &amp; intégrité (ISCA)
				</p>
				<div className='flex gap-3'>
					<Button
						variant='outline'
						size='sm'
						onClick={handleVerifyChain}
						disabled={verifyChain.isPending || !activeCompanyId}
					>
						{verifyChain.isPending ? 'Vérification...' : 'Vérifier la chaîne'}
					</Button>
					<Button
						variant='outline'
						size='sm'
						onClick={handleDailyClosureClick}
						disabled={
							performDailyClosure.isPending ||
							!activeCompanyId ||
							hasTodayClosure
						}
					>
						{hasTodayClosure
							? 'Clôture déjà effectuée'
							: performDailyClosure.isPending
								? 'Clôture en cours...'
								: 'Clôture journalière'}
					</Button>
				</div>
			</div>

			{/* Table */}
			{isLoading ? (
				<div className='text-center py-12 text-muted-foreground'>
					Chargement...
				</div>
			) : invoices.length === 0 ? (
				<div className='text-center py-12'>
					<FileText className='h-12 w-12 mx-auto text-muted-foreground/50 mb-4' />
					<p className='text-muted-foreground'>Aucune facture</p>
					<Button
						className='mt-4'
						onClick={() => navigate({ to: '/connect/invoices/new' })}
					>
						Créer ma première facture
					</Button>
				</div>
			) : (
				<div className='rounded-md border'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Numéro</TableHead>
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

								return (
									<TableRow
										key={invoice.id}
										className={overdue ? 'bg-red-50/50' : ''}
									>
										<TableCell className='font-mono font-medium'>
											{invoice.number}
										</TableCell>
										<TableCell>
											<Badge
												variant={
													invoice.invoice_type === 'credit_note'
														? 'destructive'
														: 'outline'
												}
											>
												{invoice.invoice_type === 'credit_note'
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
														onClick={() => handleOpenViewDialog(invoice)}
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

													<DropdownMenuSeparator />

													{/* Actions spécifiques aux brouillons */}
													{invoice.status === 'draft' &&
														invoice.invoice_type === 'invoice' && (
															<>
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

													{/* Paiement (NOUVEAU: indépendant du statut) */}
													{canMarkAsPaid(invoice) && (
														<DropdownMenuItem
															onClick={() => handleOpenPaymentDialog(invoice)}
														>
															<CheckCircle className='h-4 w-4 mr-2 text-green-600' />
															Enregistrer paiement
														</DropdownMenuItem>
													)}

													{/* Annulation par avoir */}
													{invoice.invoice_type === 'invoice' &&
														invoice.status !== 'draft' && (
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
								placeholder='Ex: Erreur de facturation, annulation commande client...'
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
									<SelectValue placeholder='Sélectionner...' />
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

			{/* Dialog: Voir la facture */}
			<Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
				<DialogContent className='max-w-3xl'>
					<DialogHeader>
						<DialogTitle>
							{invoiceToView?.invoice_type === 'credit_note'
								? `Avoir ${invoiceToView?.number}`
								: `Facture ${invoiceToView?.number}`}
						</DialogTitle>
						<DialogDescription>
							Visualisation détaillée de la facture.
							<br />
							Pour générer un PDF officiel, utilisez l&apos;action
							&quot;Télécharger PDF&quot;.
						</DialogDescription>
					</DialogHeader>

					{invoiceToView && (
						<div className='space-y-4'>
							{/* Infos principales */}
							<div className='grid sm:grid-cols-2 gap-4 text-sm'>
								<div className='space-y-1'>
									<p>
										<span className='text-muted-foreground'>Date :</span>{' '}
										<strong>{formatDate(invoiceToView.date)}</strong>
									</p>
									<p>
										<span className='text-muted-foreground'>Échéance :</span>{' '}
										<strong>
											{invoiceToView.due_date
												? formatDate(invoiceToView.due_date)
												: '-'}
										</strong>
									</p>
									<p>
										<span className='text-muted-foreground'>Statut :</span>{' '}
										<strong>{getDisplayStatus(invoiceToView).label}</strong>
									</p>
									<p>
										<span className='text-muted-foreground'>Type :</span>{' '}
										<strong>
											{invoiceToView.invoice_type === 'credit_note'
												? 'Avoir'
												: 'Facture'}
										</strong>
									</p>
								</div>
								<div className='space-y-1'>
									<p>
										<span className='text-muted-foreground'>Client :</span>{' '}
										<strong>
											{invoiceToView.expand?.customer?.name || 'Client inconnu'}
										</strong>
									</p>
									{invoiceToView.expand?.customer?.email && (
										<p>
											<span className='text-muted-foreground'>Email :</span>{' '}
											{invoiceToView.expand.customer.email}
										</p>
									)}
									{invoiceToView.expand?.customer?.address && (
										<p>
											<span className='text-muted-foreground'>Adresse :</span>{' '}
											{invoiceToView.expand.customer.address}
										</p>
									)}
								</div>
							</div>

							{/* Tableau des lignes */}
							<div className='border rounded-md overflow-hidden'>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Article</TableHead>
											<TableHead className='text-center w-20'>Qté</TableHead>
											<TableHead className='text-right'>P.U. HT</TableHead>
											<TableHead className='text-right'>TVA</TableHead>
											<TableHead className='text-right'>Total TTC</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{invoiceToView.items.map((item, idx) => (
											<TableRow key={`${item.name}-${idx}`}>
												<TableCell>{item.name}</TableCell>
												<TableCell className='text-center'>
													{item.quantity}
												</TableCell>
												<TableCell className='text-right'>
													{item.unit_price_ht.toFixed(2)} €
												</TableCell>
												<TableCell className='text-right'>
													{item.tva_rate}%
												</TableCell>
												<TableCell className='text-right'>
													{item.total_ttc.toFixed(2)} €
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>

							{/* Totaux */}
							<div className='flex flex-col items-end space-y-1 text-sm'>
								<p>
									<span className='text-muted-foreground mr-2'>Total HT :</span>
									<strong>{formatCurrency(invoiceToView.total_ht)}</strong>
								</p>
								<p>
									<span className='text-muted-foreground mr-2'>TVA :</span>
									<strong>{formatCurrency(invoiceToView.total_tva)}</strong>
								</p>
								<p className='text-base'>
									<span className='text-muted-foreground mr-2'>
										Total TTC :
									</span>
									<strong>{formatCurrency(invoiceToView.total_ttc)}</strong>
								</p>
								{invoiceToView.is_paid && (
									<p className='text-xs text-green-700 mt-1'>
										Payée le{' '}
										{invoiceToView.paid_at
											? formatDate(invoiceToView.paid_at)
											: '(date non renseignée)'}{' '}
										par {invoiceToView.payment_method || 'méthode inconnue'}.
									</p>
								)}
							</div>

							{/* Notes */}
							{invoiceToView.notes && (
								<div className='mt-2 border-t pt-2 text-sm'>
									<p className='text-muted-foreground mb-1'>Notes</p>
									<p>{invoiceToView.notes}</p>
								</div>
							)}
						</div>
					)}

					<DialogFooter>
						<Button onClick={() => setViewDialogOpen(false)}>Fermer</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
