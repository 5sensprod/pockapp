// frontend/modules/connect/hooks/useInvoiceActions.ts
//
// Responsabilité unique : actions métier sur une facture.
// Retourne handlers stables + états dialogs + isPending.
// Aucune logique d'affichage ici.
//
// Pattern identique à useTicketActions — utilisable dans InvoiceDetailPage.

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { getAppPosToken } from '@/lib/apppos'
import type { CompaniesResponse } from '@/lib/pocketbase-types'
import { useCreateBalanceInvoice } from '@/lib/queries/deposits'
import {
	useCancelInvoice,
	useDeleteDraftInvoice,
	useMarkInvoiceAsSent,
	useRefundDeposit,
	useValidateInvoice,
} from '@/lib/queries/invoices'
import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import {
	type DepositPdfData,
	InvoicePdfDocument,
} from '@/modules/connect/pdf/InvoicePdf'
import { toPngDataUrl } from '@/modules/connect/utils/images'
import { pdf } from '@react-pdf/renderer'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

export interface InvoiceActionsState {
	// ── États dialogs ──────────────────────────────────────────────────────────
	emailDialogOpen: boolean
	setEmailDialogOpen: (v: boolean) => void

	cancelDialogOpen: boolean
	setCancelDialogOpen: (v: boolean) => void
	cancelReason: string
	setCancelReason: (v: string) => void

	paymentDialogOpen: boolean
	setPaymentDialogOpen: (v: boolean) => void

	deleteDraftDialogOpen: boolean
	setDeleteDraftDialogOpen: (v: boolean) => void

	refundTicketDialogOpen: boolean
	setRefundTicketDialogOpen: (v: boolean) => void

	refundInvoiceOpen: boolean
	setRefundInvoiceOpen: (v: boolean) => void

	refundDepositOpen: boolean
	setRefundDepositOpen: (v: boolean) => void
	refundDepositReason: string
	setRefundDepositReason: (v: string) => void

	stockReclassifyOpen: boolean
	setStockReclassifyOpen: (v: boolean) => void
	stockItemsToReclassify: any[]
	setStockItemsToReclassify: (v: any[]) => void
	stockDocumentNumber: string | undefined
	setStockDocumentNumber: (v: string | undefined) => void

	// ── États async ────────────────────────────────────────────────────────────
	isDownloading: boolean
	isValidating: boolean
	isMarkingAsSent: boolean
	isCancelling: boolean
	isDeletingDraft: boolean
	isCreatingBalanceInvoice: boolean
	isRefundingDeposit: boolean

	// ── Handlers ──────────────────────────────────────────────────────────────
	handleDownloadPdf: () => Promise<void>
	handleValidate: () => Promise<void>
	handleMarkAsSent: () => Promise<void>
	handleOpenPaymentDialog: () => void
	handleOpenCancelDialog: () => void
	handleCancelInvoice: () => Promise<void>
	handleOpenDeleteDraft: () => void
	handleConfirmDeleteDraft: () => Promise<void>
	handleCreateBalanceInvoice: () => Promise<void>
	handleRefundDeposit: () => Promise<void>
}

export function useInvoiceActions(
	invoice: InvoiceResponse | undefined,
	company: CompaniesResponse | null,
): InvoiceActionsState {
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as any
	const navigate = useNavigate()

	// ── États dialogs ──────────────────────────────────────────────────────────
	const [isDownloading, setIsDownloading] = useState(false)
	const [emailDialogOpen, setEmailDialogOpen] = useState(false)

	const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
	const [cancelReason, setCancelReason] = useState('')

	const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)

	const [deleteDraftDialogOpen, setDeleteDraftDialogOpen] = useState(false)

	const [refundTicketDialogOpen, setRefundTicketDialogOpen] = useState(false)
	const [refundInvoiceOpen, setRefundInvoiceOpen] = useState(false)

	const [refundDepositOpen, setRefundDepositOpen] = useState(false)
	const [refundDepositReason, setRefundDepositReason] = useState('')

	const [stockReclassifyOpen, setStockReclassifyOpen] = useState(false)
	const [stockItemsToReclassify, setStockItemsToReclassify] = useState<any[]>(
		[],
	)
	const [stockDocumentNumber, setStockDocumentNumber] = useState<
		string | undefined
	>()

	// ── Mutations ──────────────────────────────────────────────────────────────
	const validateInvoice = useValidateInvoice()
	const markAsSent = useMarkInvoiceAsSent()
	const cancelInvoice = useCancelInvoice()
	const deleteDraftInvoice = useDeleteDraftInvoice()
	const createBalanceInvoice = useCreateBalanceInvoice()
	const refundDeposit = useRefundDeposit()

	// ── Helpers ────────────────────────────────────────────────────────────────
	const buildStockItems = (items: any[]) =>
		items
			.filter((it) => !!it?.product_id)
			.map((it) => ({
				productId: it.product_id,
				quantitySold: Math.abs(Number(it.quantity ?? 1)),
			}))

	// ── PDF ────────────────────────────────────────────────────────────────────
	const handleDownloadPdf = async () => {
		if (!activeCompanyId || !invoice) {
			toast.error('Aucune entreprise sélectionnée')
			return
		}
		setIsDownloading(true)
		try {
			let logoDataUrl: string | null = null
			let currentCompany = company

			if (!currentCompany) {
				try {
					currentCompany = await pb
						.collection('companies')
						.getOne(activeCompanyId)
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
					invoice={invoice}
					customer={(invoice as any).expand?.customer}
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

	// ── Valider ────────────────────────────────────────────────────────────────
	const handleValidate = async () => {
		if (!invoice) return
		try {
			await validateInvoice.mutateAsync(invoice.id)
			toast.success(`Facture ${invoice.number} validée`)
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la validation')
		}
	}

	// ── Marquer envoyée ────────────────────────────────────────────────────────
	const handleMarkAsSent = async () => {
		if (!invoice) return
		try {
			await markAsSent.mutateAsync(invoice.id)
			toast.success(`Facture ${invoice.number} marquée comme envoyée`)
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la mise à jour')
		}
	}

	// ── Paiement ───────────────────────────────────────────────────────────────
	// La réinitialisation des champs (méthode, mode, montants…) est désormais
	// gérée directement par InvoicePaymentDialog à son ouverture.
	const handleOpenPaymentDialog = () => {
		setPaymentDialogOpen(true)
	}

	// ── Avoir / annulation ─────────────────────────────────────────────────────
	const handleOpenCancelDialog = () => {
		setCancelReason('')
		setCancelDialogOpen(true)
	}

	const handleCancelInvoice = async () => {
		if (!invoice || !cancelReason.trim()) {
			toast.error("Veuillez indiquer un motif d'annulation")
			return
		}
		try {
			await cancelInvoice.mutateAsync({
				invoiceId: invoice.id,
				reason: cancelReason,
			})
			toast.success(`Avoir créé pour la facture ${invoice.number}`)
			setCancelDialogOpen(false)
			setCancelReason('')

			const stockItems = buildStockItems(invoice.items ?? []).map((it) => ({
				product_id: it.productId,
				name:
					(invoice.items as any[])?.find(
						(i: any) => i.product_id === it.productId,
					)?.name ?? it.productId,
				quantity: it.quantitySold,
			}))

			if (stockItems.length > 0 && getAppPosToken()) {
				setStockItemsToReclassify(stockItems)
				setStockDocumentNumber(invoice.number)
				setStockReclassifyOpen(true)
			}
		} catch (error: any) {
			toast.error(error.message || "Erreur lors de la création de l'avoir")
		}
	}

	// ── Suppression brouillon ──────────────────────────────────────────────────
	const handleOpenDeleteDraft = () => {
		setDeleteDraftDialogOpen(true)
	}

	const handleConfirmDeleteDraft = async () => {
		if (!invoice) return
		try {
			await deleteDraftInvoice.mutateAsync(invoice.id)
			toast.success(`Brouillon ${invoice.number} supprimé`)
			setDeleteDraftDialogOpen(false)
			navigate({ to: '/connect/invoices' })
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la suppression du brouillon')
		}
	}

	// ── Facture de solde ───────────────────────────────────────────────────────
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

	// ── Remboursement acompte ──────────────────────────────────────────────────
	const handleRefundDeposit = async () => {
		if (!invoice || !refundDepositReason.trim()) return
		try {
			await refundDeposit.mutateAsync({
				depositId: invoice.id,
				reason: refundDepositReason,
			})
			toast.success(`Avoir créé pour l'acompte ${invoice.number}`)
			setRefundDepositOpen(false)
			setRefundDepositReason('')
		} catch (err: any) {
			toast.error(err?.message || "Erreur lors du remboursement de l'acompte")
		}
	}

	return {
		// dialogs
		emailDialogOpen,
		setEmailDialogOpen,
		cancelDialogOpen,
		setCancelDialogOpen,
		cancelReason,
		setCancelReason,
		paymentDialogOpen,
		setPaymentDialogOpen,
		deleteDraftDialogOpen,
		setDeleteDraftDialogOpen,
		refundTicketDialogOpen,
		setRefundTicketDialogOpen,
		refundInvoiceOpen,
		setRefundInvoiceOpen,
		refundDepositOpen,
		setRefundDepositOpen,
		refundDepositReason,
		setRefundDepositReason,
		stockReclassifyOpen,
		setStockReclassifyOpen,
		stockItemsToReclassify,
		setStockItemsToReclassify,
		stockDocumentNumber,
		setStockDocumentNumber,
		// async
		isDownloading,
		isValidating: validateInvoice.isPending,
		isMarkingAsSent: markAsSent.isPending,
		isCancelling: cancelInvoice.isPending,
		isDeletingDraft: deleteDraftInvoice.isPending,
		isCreatingBalanceInvoice: createBalanceInvoice.isPending,
		isRefundingDeposit: refundDeposit.isPending,
		// handlers
		handleDownloadPdf,
		handleValidate,
		handleMarkAsSent,
		handleOpenPaymentDialog,
		handleOpenCancelDialog,
		handleCancelInvoice,
		handleOpenDeleteDraft,
		handleConfirmDeleteDraft,
		handleCreateBalanceInvoice,
		handleRefundDeposit,
	}
}
