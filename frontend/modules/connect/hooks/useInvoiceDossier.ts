// frontend/modules/connect/hooks/useInvoiceDossier.ts
//
// Un document de facturation ne se comprend jamais seul : il appartient à un
// dossier — une parente, ses acomptes, ses avoirs, sa facture de solde. Ce hook
// rassemble ce dossier et en tire les deux seules choses dont l'écran a besoin :
// la synthèse financière et la prochaine action.
//
// Il remplace quatre appels dispersés dans InvoiceDetailPage, et surtout les
// trois formules divergentes qui recalculaient le même chiffre.
//
// Un changement de comportement réseau, et un seul : `resolveDossierId` fait
// interroger la PARENTE. Coût réel, mesuré sur les cinq natures de document :
//
//   parente / facture simple  1 appel  ->  1 appel, même clé de cache     0
//   facture de solde          1 appel  ->  1 appel juste (il était faux)  0
//   acompte                   0        ->  1 appel                       +1
//   avoir                     0        ->  1 appel                       +1
//   ticket de caisse          1 appel  ->  0 (un ticket n'a pas d'acompte) −1
//
// Les deux « +1 » sont le prix des liens de dossier sur un acompte et un avoir —
// sans eux, « Retour à la facture F-… » ne peut pas nommer la facture. Et ils
// sont servis par le cache dans le parcours nominal : la clé est celle de la
// parente, d'où l'on vient en cliquant « Voir ».
//
// Voir frontend/modules/connect/PocketConnect-docs/01-audit-detail-facture.md §13.

import {
	type DossierRole,
	resolveDossierId,
	resolveDossierRole,
} from '@/lib/invoices/dossier-id'
import {
	type InvoiceFinancialSummary,
	computeInvoiceSummary,
} from '@/lib/invoices/dossier-summary'
import {
	type NextActionResolution,
	resolveNextAction,
} from '@/lib/invoices/next-action'
import {
	type DepositsForInvoice,
	useDepositsForInvoice,
} from '@/lib/queries/deposits'
import { useCreditNotesForInvoice, useInvoice } from '@/lib/queries/invoices'
import { useOrder } from '@/lib/queries/orders'
import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { useMemo } from 'react'

export interface InvoiceDossier {
	// ── Document courant ──────────────────────────────────────────────────
	readonly invoice: InvoiceResponse | undefined
	readonly isLoading: boolean
	/** Acomptes et avoirs — indépendant du chargement du document. */
	readonly isDossierLoading: boolean
	readonly notFound: boolean

	// ── Dossier ───────────────────────────────────────────────────────────
	readonly role: DossierRole | undefined
	readonly dossierId: string | undefined
	/** La parente, tirée de l'expand — aucun appel supplémentaire. */
	readonly parent: InvoiceResponse | null
	readonly deposits: readonly InvoiceResponse[]
	readonly balanceInvoice: InvoiceResponse | null
	readonly creditNotes: readonly InvoiceResponse[]
	readonly sourceOrder: unknown
	/**
	 * La réponse brute de `/deposits`, pour les compteurs que le serveur tient
	 * lui-même (`pendingCount`, `depositsCount`). Transitoire : les écrans
	 * doivent basculer sur `summary`, qui porte les mêmes nombres sous des
	 * règles vérifiées.
	 */
	readonly depositsData: DepositsForInvoice | undefined

	// ── Le point unique ───────────────────────────────────────────────────
	readonly summary: InvoiceFinancialSummary | undefined
	readonly nextAction: NextActionResolution | undefined
}

export function useInvoiceDossier(
	invoiceId: string | undefined,
): InvoiceDossier {
	const { data: invoice, isLoading } = useInvoice(invoiceId)

	const dossierId = resolveDossierId(invoice)
	const { data: depositsData, isLoading: isDepositsLoading } =
		useDepositsForInvoice(dossierId)

	// Les avoirs restent attachés au DOCUMENT COURANT : ce sont les siens, pas
	// ceux du dossier. Un avoir n'en porte évidemment pas.
	const { data: creditNotesData } = useCreditNotesForInvoice(
		invoice && invoice.invoice_type !== 'credit_note' ? invoiceId : undefined,
	)

	const sourceOrderId = invoice?.source_order_id ?? null
	const { data: sourceOrder } = useOrder(sourceOrderId ?? undefined)

	const deposits = depositsData?.deposits ?? []
	const balanceInvoice = depositsData?.balanceInvoice ?? null
	const creditNotes = creditNotesData ?? []

	// La parente vient de l'expand de useInvoice (`original_invoice_id` y est
	// déjà demandé, invoices.ts:389) : la connaître ne coûte aucune requête.
	const parent = invoice?.expand?.original_invoice_id ?? null

	const summary = useMemo(() => {
		if (!invoice) return undefined
		const role = resolveDossierRole(invoice)
		const parenteDuDossier =
			role === 'parent' || role === 'ticket' ? invoice : (parent ?? invoice)

		return computeInvoiceSummary({
			current: invoice,
			parent: parenteDuDossier,
			deposits,
			creditNotes,
			// Un dossier non résolu ne doit pas se rendre comme un dossier vide :
			// un zéro affiché est indiscernable d'une facture soldée.
			isResolved: !dossierId || !isDepositsLoading,
		})
	}, [invoice, parent, deposits, creditNotes, dossierId, isDepositsLoading])

	const nextAction = useMemo(() => {
		if (!invoice || !summary) return undefined
		return resolveNextAction({
			current: invoice,
			parent,
			deposits,
			creditNotes,
			summary,
			balanceInvoice,
		})
	}, [invoice, summary, parent, deposits, creditNotes, balanceInvoice])

	return {
		invoice,
		isLoading,
		isDossierLoading: isDepositsLoading,
		notFound: !isLoading && !invoice,
		role: invoice ? resolveDossierRole(invoice) : undefined,
		dossierId,
		parent,
		deposits,
		balanceInvoice,
		creditNotes,
		sourceOrder,
		depositsData,
		summary,
		nextAction,
	}
}
