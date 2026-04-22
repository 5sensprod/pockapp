// frontend/modules/connect/hooks/useOrderActions.tsx
//
// Responsabilité unique : actions métier sur un bon de commande.
// Retourne handlers stables + états dialogs + isPending.
// Pattern identique à useInvoiceActions.

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import {
	type OrderStatus,
	useDeleteDraftOrder,
	usePatchOrderStatus,
} from '@/lib/queries/orders'
import { usePocketBase } from '@/lib/use-pocketbase'
import { OrderPdfDocument } from '@/modules/connect/pdf/OrderPdf'
import { toPngDataUrl } from '@/modules/connect/utils/images'
import { pdf } from '@react-pdf/renderer'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

export interface OrderActionsState {
	// ── États dialogs ──────────────────────────────────────────────────────────
	emailDialogOpen: boolean
	setEmailDialogOpen: (v: boolean) => void

	cancelDialogOpen: boolean
	setCancelDialogOpen: (v: boolean) => void
	cancellationReason: string
	setCancellationReason: (v: string) => void

	deleteDialogOpen: boolean
	setDeleteDialogOpen: (v: boolean) => void

	validateDialogOpen: boolean
	setValidateDialogOpen: (v: boolean) => void

	// ── États async ────────────────────────────────────────────────────────────
	isDownloading: boolean
	isPatching: boolean
	isDeleting: boolean

	// ── Handlers ──────────────────────────────────────────────────────────────
	handleDownloadPdf: () => Promise<void>
	handleTransition: (next: OrderStatus) => Promise<void>
	handleConfirmCancel: () => Promise<void>
	handleDelete: () => Promise<void>
	handleConvertToInvoice: () => void
}

export function useOrderActions(
	order: any | undefined,
	onDeleteSuccess: () => void,
): OrderActionsState {
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as any
	const navigate = useNavigate()

	// ── États ──────────────────────────────────────────────────────────────────
	const [isDownloading, setIsDownloading] = useState(false)
	const [emailDialogOpen, setEmailDialogOpen] = useState(false)
	const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
	const [cancellationReason, setCancellationReason] = useState('')
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [validateDialogOpen, setValidateDialogOpen] = useState(false)

	// ── Mutations ──────────────────────────────────────────────────────────────
	const { mutateAsync: patchStatus, isPending: isPatching } =
		usePatchOrderStatus()
	const { mutateAsync: deleteDraft, isPending: isDeleting } =
		useDeleteDraftOrder()

	// ── PDF ────────────────────────────────────────────────────────────────────
	const handleDownloadPdf = async () => {
		if (!activeCompanyId || !order) {
			toast.error('Aucune entreprise sélectionnée')
			return
		}
		setIsDownloading(true)
		try {
			let company: any = null
			try {
				company = await pb.collection('companies').getOne(activeCompanyId)
			} catch (err) {
				console.warn('Entreprise non trouvée:', err)
			}

			let logoDataUrl: string | null = null
			if (company?.logo) {
				try {
					logoDataUrl = await toPngDataUrl(
						pb.files.getUrl(company, company.logo),
					)
				} catch (err) {
					console.warn('Erreur conversion logo', err)
				}
			}

			let customer: any = null
			if (order.customer) {
				try {
					customer = await pb.collection('customers').getOne(order.customer)
				} catch (err) {
					console.warn('Client non trouvé:', err)
				}
			}

			const blob = await pdf(
				<OrderPdfDocument
					order={order}
					customer={customer}
					company={company}
					companyLogoUrl={logoDataUrl}
				/>,
			).toBlob()

			const url = URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			a.download = `BonDeCommande_${order.number.replace(/\//g, '-')}.pdf`
			a.click()
			URL.revokeObjectURL(url)
		} catch (err) {
			console.error('Erreur génération PDF:', err)
			toast.error('Erreur lors de la génération du PDF')
		} finally {
			setIsDownloading(false)
		}
	}

	// ── Transitions statut ─────────────────────────────────────────────────────
	const handleTransition = async (next: OrderStatus) => {
		if (next === 'cancelled') {
			setCancellationReason('')
			setCancelDialogOpen(true)
			return
		}
		try {
			if (!order) return
			await patchStatus({ id: order.id, status: next })
		} catch (err) {
			console.error('Erreur transition statut:', err)
			toast.error('Erreur lors du changement de statut')
		}
	}

	const handleConfirmCancel = async () => {
		if (!cancellationReason.trim() || !order) return
		try {
			await patchStatus({
				id: order.id,
				status: 'cancelled',
				cancellation_reason: cancellationReason.trim(),
			})
			setCancelDialogOpen(false)
			setCancellationReason('')
		} catch (err) {
			console.error('Erreur annulation:', err)
			toast.error("Erreur lors de l'annulation")
		}
	}

	// ── Suppression brouillon ──────────────────────────────────────────────────
	const handleDelete = async () => {
		if (!order) return
		try {
			await deleteDraft(order.id)
			onDeleteSuccess()
		} catch (err) {
			console.error('Erreur suppression:', err)
			toast.error('Erreur lors de la suppression')
		}
	}

	// ── Conversion en facture ──────────────────────────────────────────────────
	// Adapte la route selon ta structure — ex: /connect/invoices/new?fromOrderId=xxx
	const handleConvertToInvoice = () => {
		if (!order) return
		navigate({
			to: '/connect/invoices/new',
			search: { fromOrderId: order.id },
		})
	}

	return {
		// dialogs
		emailDialogOpen,
		setEmailDialogOpen,
		cancelDialogOpen,
		setCancelDialogOpen,
		cancellationReason,
		setCancellationReason,
		deleteDialogOpen,
		setDeleteDialogOpen,
		validateDialogOpen,
		setValidateDialogOpen,
		// async
		isDownloading,
		isPatching,
		isDeleting,
		// handlers
		handleDownloadPdf,
		handleTransition,
		handleConfirmCancel,
		handleDelete,
		handleConvertToInvoice,
	}
}
