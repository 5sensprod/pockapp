// frontend/modules/connect/hooks/useQuoteActions.ts
//
// Responsabilité unique : actions métier sur un devis.
// Pattern identique à useInvoiceActions.

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import {
	useConvertQuoteToInvoice,
	useDeleteQuote,
} from '@/lib/queries/quotes'
import type { QuoteResponse } from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { pdf } from '@react-pdf/renderer'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { QuotePdfDocument } from '../pdf/QuotePdf'

export interface QuoteActionsState {
	// ── États dialogs ──────────────────────────────────────────────────────────
	emailDialogOpen: boolean
	setEmailDialogOpen: (v: boolean) => void

	deleteDialogOpen: boolean
	setDeleteDialogOpen: (v: boolean) => void

	convertDialogOpen: boolean
	setConvertDialogOpen: (v: boolean) => void

	// ── États async ────────────────────────────────────────────────────────────
	isDownloading: boolean
	isDeleting: boolean
	isConverting: boolean

	// ── Handlers ──────────────────────────────────────────────────────────────
	handleDownloadPdf: () => Promise<void>
	handleOpenDelete: () => void
	handleConfirmDelete: () => Promise<void>
	handleOpenConvert: () => void
	handleConfirmConvert: () => Promise<void>
}

export function useQuoteActions(
	quote: QuoteResponse | undefined,
): QuoteActionsState {
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as any
	const navigate = useNavigate()

	const [isDownloading, setIsDownloading] = useState(false)
	const [emailDialogOpen, setEmailDialogOpen] = useState(false)
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [convertDialogOpen, setConvertDialogOpen] = useState(false)

	const deleteQuote = useDeleteQuote()
	const convertQuoteToInvoice = useConvertQuoteToInvoice()

	// ── PDF ────────────────────────────────────────────────────────────────────
	const handleDownloadPdf = async () => {
		if (!quote || !activeCompanyId) {
			toast.error('Données manquantes')
			return
		}
		setIsDownloading(true)
		try {
			const fullQuote = await pb.collection('quotes').getOne(quote.id, {
				expand: 'customer,issued_by',
			})

			let company: any
			try {
				company = await pb.collection('companies').getOne(activeCompanyId)
			} catch (err) {
				console.warn('Entreprise non trouvée:', err)
			}

			let customer = fullQuote.expand?.customer
			if (!customer && fullQuote.customer) {
				try {
					customer = await pb.collection('customers').getOne(fullQuote.customer)
				} catch (err) {
					console.warn('Client non trouvé:', err)
				}
			}

			let companyLogoUrl: string | null = null
			if (company?.logo) {
				companyLogoUrl = pb.files.getUrl(company, company.logo)
			}

			const blob = await pdf(
				<QuotePdfDocument
					quote={fullQuote as any}
					customer={customer}
					company={company}
					companyLogoUrl={companyLogoUrl}
				/>,
			).toBlob()

			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = `Devis_${quote.number.replace(/\//g, '-')}.pdf`
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			URL.revokeObjectURL(url)
			toast.success('PDF téléchargé')
		} catch (error) {
			console.error('Erreur génération PDF:', error)
			toast.error('Erreur lors de la génération du PDF')
		} finally {
			setIsDownloading(false)
		}
	}

	// ── Suppression ────────────────────────────────────────────────────────────
	const handleOpenDelete = () => setDeleteDialogOpen(true)

	const handleConfirmDelete = async () => {
		if (!quote) return
		try {
			await deleteQuote.mutateAsync(quote.id)
			toast.success(`Devis ${quote.number} supprimé`)
			setDeleteDialogOpen(false)
			navigate({ to: '/connect/quotes' })
		} catch (error: any) {
			toast.error(error?.message || 'Erreur lors de la suppression du devis')
		}
	}

	// ── Conversion en facture ──────────────────────────────────────────────────
	const handleOpenConvert = () => setConvertDialogOpen(true)

	const handleConfirmConvert = async () => {
		if (!quote) return
		try {
			await convertQuoteToInvoice.mutateAsync(quote.id)
			toast.success(`Facture créée à partir du devis ${quote.number}`)
			setConvertDialogOpen(false)
		} catch (error: any) {
			toast.error(error?.message || 'Erreur lors de la création de la facture')
		}
	}

	return {
		emailDialogOpen,
		setEmailDialogOpen,
		deleteDialogOpen,
		setDeleteDialogOpen,
		convertDialogOpen,
		setConvertDialogOpen,
		isDownloading,
		isDeleting: deleteQuote.isPending,
		isConverting: convertQuoteToInvoice.isPending,
		handleDownloadPdf,
		handleOpenDelete,
		handleConfirmDelete,
		handleOpenConvert,
		handleConfirmConvert,
	}
}
