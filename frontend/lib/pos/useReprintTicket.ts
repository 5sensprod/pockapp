// frontend/lib/pos/useReprintTicket.ts
//
// Hook qui expose deux actions :
//   • reprintTicket(ticket)  — envoie à l'imprimante physique (si configurée)
//   • previewTicket(ticket)  — ouvre la preview HTML dans un nouvel onglet
//
// Les deux actions acceptent un InvoiceResponse complet (items déjà présents).
// Le logo de l'entreprise est chargé une seule fois via getCompanyLogoBase64.

import * as React from 'react'
import { toast } from 'sonner'

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { type Company, getLogoUrl, useCompany } from '@/lib/queries/companies'
import { fetchAsDataUrl } from '@/lib/queries/logoToDataUrl'
import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'

import {
	type PrintReceiptPayloadWithLogo,
	buildReceiptFromInvoice,
} from './buildReceiptFromInvoice'
import { openReceiptPreviewWindow } from './posPreview'
import { printReceipt } from './posPrint'
import { loadPosPrinterSettings } from './printerSettings'

export function useReprintTicket() {
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase()
	const { data: activeCompany } = useCompany(activeCompanyId ?? undefined)

	const [isPrinting, setIsPrinting] = React.useState(false)
	const [isPreviewing, setIsPreviewing] = React.useState(false)

	// ── Logo en base64 (mis en cache entre deux appels) ──────────────────────
	const getLogoBase64 = React.useCallback(async (): Promise<
		string | undefined
	> => {
		if (!activeCompany) return undefined
		const url = getLogoUrl(pb, activeCompany as Company)
		if (!url) return undefined
		try {
			return await fetchAsDataUrl(url)
		} catch {
			return undefined
		}
	}, [activeCompany, pb])

	// ── Impression physique ──────────────────────────────────────────────────
	const reprintTicket = React.useCallback(
		async (ticket: InvoiceResponse) => {
			const printerSettings = loadPosPrinterSettings()

			if (!printerSettings.enabled || !printerSettings.printerName) {
				toast.error(
					"Aucune imprimante configurée. Vérifiez les paramètres d'impression.",
				)
				return
			}

			setIsPrinting(true)
			try {
				const logoBase64 = await getLogoBase64()
				const receipt: PrintReceiptPayloadWithLogo = buildReceiptFromInvoice(
					ticket,
					logoBase64,
				)

				await printReceipt({
					printerName: printerSettings.printerName,
					width: printerSettings.width,
					companyId: activeCompanyId ?? undefined,
					receipt: receipt as any,
				})

				toast.success(`Ticket ${ticket.number} réimprimé`)
			} catch (err: any) {
				toast.error(err?.message || "Erreur lors de l'impression")
			} finally {
				setIsPrinting(false)
			}
		},
		[activeCompanyId, getLogoBase64],
	)

	// ── Aperçu dans un nouvel onglet ─────────────────────────────────────────
	const previewTicket = React.useCallback(
		async (ticket: InvoiceResponse) => {
			setIsPreviewing(true)
			try {
				const printerSettings = loadPosPrinterSettings()
				const width = (printerSettings.width === 80 ? 80 : 58) as 58 | 80

				const logoBase64 = await getLogoBase64()
				const receipt: PrintReceiptPayloadWithLogo = buildReceiptFromInvoice(
					ticket,
					logoBase64,
				)

				await openReceiptPreviewWindow({
					width,
					companyId: activeCompanyId ?? undefined,
					receipt: receipt as any,
				})
			} catch (err: any) {
				toast.error(err?.message || "Impossible d'afficher l'aperçu")
			} finally {
				setIsPreviewing(false)
			}
		},
		[activeCompanyId, getLogoBase64],
	)

	return {
		reprintTicket,
		previewTicket,
		isPrinting,
		isPreviewing,
	}
}
