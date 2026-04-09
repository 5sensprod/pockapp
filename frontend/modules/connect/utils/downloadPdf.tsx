// frontend/modules/connect/utils/downloadPdf.tsx   ← .tsx (contient du JSX)
//
// Logique de téléchargement PDF mutualisée pour le module Connect.
// Remplace les blocs handleDownloadPdf dupliqués dans :
//   QuoteDetailPage, QuotesPage, InvoiceDetailPage

import type { CompaniesResponse } from '@/lib/pocketbase-types'
import type { InvoiceResponse, QuoteResponse } from '@/lib/types/invoice.types'
import { pdf } from '@react-pdf/renderer'
import type { ReactElement } from 'react'

// ── Utilitaire logo ───────────────────────────────────────────────────────────

/**
 * Convertit une URL image en data URL PNG via un canvas.
 * Nécessaire car react-pdf ne supporte pas les URLs CORS directes.
 */
export async function toPngDataUrl(url: string): Promise<string> {
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
				resolve(canvas.toDataURL('image/png'))
			} catch (err) {
				reject(err)
			}
		}
		img.onerror = (err) => reject(err)
		img.src = url
	})
}

// ── Fetch company + logo ──────────────────────────────────────────────────────

export interface CompanyWithLogo {
	company: CompaniesResponse
	logoDataUrl: string | null
}

/**
 * Récupère l'entreprise active et convertit son logo en data URL PNG.
 * @param cached  Entreprise déjà chargée — évite un fetch redondant
 */
export async function fetchCompanyWithLogo(
	pb: any,
	activeCompanyId: string,
	cached?: CompaniesResponse | null,
): Promise<CompanyWithLogo | null> {
	let company: CompaniesResponse | null = cached ?? null

	if (!company) {
		try {
			company = (await pb
				.collection('companies')
				.getOne(activeCompanyId)) as CompaniesResponse
		} catch (err) {
			console.warn('Entreprise non trouvée:', err)
			return null
		}
	}

	let logoDataUrl: string | null = null
	if ((company as any).logo) {
		const fileUrl = pb.files.getUrl(company, (company as any).logo)
		try {
			logoDataUrl = await toPngDataUrl(fileUrl)
		} catch (err) {
			console.warn('Erreur conversion logo:', err)
		}
	}

	return { company, logoDataUrl }
}

// ── Trigger téléchargement ────────────────────────────────────────────────────

function triggerBlobDownload(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	URL.revokeObjectURL(url)
}

export type PdfDownloadResult = { ok: true } | { ok: false; error: unknown }

// ── downloadQuotePdf ──────────────────────────────────────────────────────────

export interface DownloadQuotePdfOptions {
	pb: any
	quote: QuoteResponse
	activeCompanyId: string
	/** Composant react-pdf — importé par l'appelant pour éviter le couplage */
	PdfDocument: (props: any) => ReactElement
}

export async function downloadQuotePdf({
	pb,
	quote,
	activeCompanyId,
	PdfDocument,
}: DownloadQuotePdfOptions): Promise<PdfDownloadResult> {
	try {
		const companyData = await fetchCompanyWithLogo(pb, activeCompanyId)
		if (!companyData)
			return { ok: false, error: new Error('Entreprise introuvable') }
		const { company, logoDataUrl } = companyData

		let customer = quote.expand?.customer
		if (!customer && quote.customer) {
			try {
				customer = await pb.collection('customers').getOne(quote.customer)
			} catch (err) {
				console.warn('Client non trouvé:', err)
			}
		}

		const element = (
			<PdfDocument
				quote={quote}
				customer={customer}
				company={company}
				companyLogoUrl={logoDataUrl}
			/>
		)

		const blob = await pdf(element).toBlob()
		triggerBlobDownload(blob, `Devis_${quote.number.replace(/\//g, '-')}.pdf`)
		return { ok: true }
	} catch (error) {
		console.error('Erreur génération PDF devis:', error)
		return { ok: false, error }
	}
}

// ── downloadInvoicePdf ────────────────────────────────────────────────────────

export interface DownloadInvoicePdfOptions {
	pb: any
	invoice: InvoiceResponse
	activeCompanyId: string
	cachedCompany?: CompaniesResponse | null
	PdfDocument: (props: any) => ReactElement
}

export async function downloadInvoicePdf({
	pb,
	invoice,
	activeCompanyId,
	cachedCompany,
	PdfDocument,
}: DownloadInvoicePdfOptions): Promise<PdfDownloadResult> {
	try {
		const companyData = await fetchCompanyWithLogo(
			pb,
			activeCompanyId,
			cachedCompany,
		)
		if (!companyData)
			return { ok: false, error: new Error('Entreprise introuvable') }
		const { company, logoDataUrl } = companyData

		const customer = (invoice as any).expand?.customer ?? null

		// ── depositPdfData — 3 cas ───────────────────────────────────────────
		//  1. deposit  : facture d'acompte → facture parente
		//  2. balance  : facture de solde  → parente + liste acomptes
		//  3. parent   : facture principale avec acomptes → liste acomptes

		let depositPdfData: import('../pdf/InvoicePdf').DepositPdfData | undefined

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
			((invoice as any).deposits_total_ttc ?? 0) > 0
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

		const element = (
			<PdfDocument
				invoice={invoice}
				customer={customer}
				company={company}
				companyLogoUrl={logoDataUrl}
				depositPdfData={depositPdfData}
			/>
		)

		const blob = await pdf(element).toBlob()
		const filename = `Facture_${(invoice.number ?? invoice.id).replace(/\//g, '-')}.pdf`
		triggerBlobDownload(blob, filename)
		return { ok: true }
	} catch (error) {
		console.error('Erreur génération PDF facture:', error)
		return { ok: false, error }
	}
}
