// frontend/modules/cash/components/ticket-detail/useTicketActions.ts
//
// Responsabilité unique : actions métier sur un ticket.
// Retourne des handlers stables + états isPending.
// Aucune logique d'affichage ici.

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import type { CompaniesResponse } from '@/lib/pocketbase-types'
import { buildReceiptFromInvoice } from '@/lib/pos/buildReceiptFromInvoice'
import { downloadReceiptPreviewPdf } from '@/lib/pos/posPreview'
import { loadPosPrinterSettings } from '@/lib/pos/printerSettings'
import { useReprintTicket } from '@/lib/pos/useReprintTicket'
import {
	useCreateBalanceInvoice,
	useCreateDeposit,
} from '@/lib/queries/deposits'
import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import {
	type DepositPdfData,
	InvoicePdfDocument,
} from '@/modules/connect/components/InvoicePdf'
import { toPngDataUrl } from '@/modules/connect/utils/images'
import { pdf } from '@react-pdf/renderer'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export type DepositMode = 'percent' | 'amount'

export interface TicketActionsState {
	// États dialogues
	emailDialogOpen: boolean
	setEmailDialogOpen: (v: boolean) => void
	refundTicketDialogOpen: boolean
	setRefundTicketDialogOpen: (v: boolean) => void
	stockReclassifyOpen: boolean
	setStockReclassifyOpen: (v: boolean) => void
	stockItemsToReclassify: any[]
	setStockItemsToReclassify: (v: any[]) => void
	stockDocumentNumber: string | undefined
	setStockDocumentNumber: (v: string | undefined) => void
	depositDialogOpen: boolean
	setDepositDialogOpen: (v: boolean) => void
	depositMode: DepositMode
	setDepositMode: (v: DepositMode) => void
	depositPercentage: number
	setDepositPercentage: (v: number) => void
	depositAmount: string
	setDepositAmount: (v: string) => void

	// États async
	isDownloading: boolean
	isPrinting: boolean
	isPreviewing: boolean
	isPrinterConfigured: boolean
	isCreatingDeposit: boolean
	isCreatingBalanceInvoice: boolean

	// Handlers
	handleDownloadPdf: () => Promise<void>
	handleDownloadTicketHtml: () => Promise<void>
	handleCreateDeposit: () => Promise<void>
	handleCreateBalanceInvoice: () => Promise<void>
	reprintTicket: (invoice: any) => void
	previewTicket: (invoice: any) => void
}

export function useTicketActions(
	invoice: InvoiceResponse | undefined,
	company: CompaniesResponse | null,
): TicketActionsState {
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as any

	const [isDownloading, setIsDownloading] = useState(false)
	const [emailDialogOpen, setEmailDialogOpen] = useState(false)
	const [refundTicketDialogOpen, setRefundTicketDialogOpen] = useState(false)
	const [stockReclassifyOpen, setStockReclassifyOpen] = useState(false)
	const [stockItemsToReclassify, setStockItemsToReclassify] = useState<any[]>(
		[],
	)
	const [stockDocumentNumber, setStockDocumentNumber] = useState<
		string | undefined
	>()
	const [depositDialogOpen, setDepositDialogOpen] = useState(false)
	const [depositMode, setDepositMode] = useState<DepositMode>('percent')
	const [depositPercentage, setDepositPercentage] = useState(30)
	const [depositAmount, setDepositAmount] = useState('')

	const { reprintTicket, previewTicket, isPrinting, isPreviewing } =
		useReprintTicket()
	const createDeposit = useCreateDeposit()
	const createBalanceInvoice = useCreateBalanceInvoice()

	const isPrinterConfigured = useMemo(() => {
		const s = loadPosPrinterSettings()
		return s.enabled && !!s.printerName
	}, [])

	// ── Téléchargement PDF facture (B2B) ────────────────────────────────────────
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
					invoice={invoice as InvoiceResponse}
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

	// ── Téléchargement ticket POS (PDF via chromedp backend) ────────────────────
	const handleDownloadTicketHtml = async () => {
		if (!invoice) return
		setIsDownloading(true)
		try {
			const printerSettings = loadPosPrinterSettings()
			const width = (printerSettings.width === 80 ? 80 : 58) as 58 | 80

			let logoBase64: string | undefined
			if (company && (company as any).logo) {
				try {
					logoBase64 = await toPngDataUrl(
						pb.files.getUrl(company, (company as any).logo),
					)
				} catch {
					// logo optionnel
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

	// ── Acompte ─────────────────────────────────────────────────────────────────
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

	// ── Facture de solde ─────────────────────────────────────────────────────────
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

	return {
		emailDialogOpen,
		setEmailDialogOpen,
		refundTicketDialogOpen,
		setRefundTicketDialogOpen,
		stockReclassifyOpen,
		setStockReclassifyOpen,
		stockItemsToReclassify,
		setStockItemsToReclassify,
		stockDocumentNumber,
		setStockDocumentNumber,
		depositDialogOpen,
		setDepositDialogOpen,
		depositMode,
		setDepositMode,
		depositPercentage,
		setDepositPercentage,
		depositAmount,
		setDepositAmount,
		isDownloading,
		isPrinting,
		isPreviewing,
		isPrinterConfigured,
		isCreatingDeposit: createDeposit.isPending,
		isCreatingBalanceInvoice: createBalanceInvoice.isPending,
		handleDownloadPdf,
		handleDownloadTicketHtml,
		handleCreateDeposit,
		handleCreateBalanceInvoice,
		reprintTicket,
		previewTicket,
	}
}
