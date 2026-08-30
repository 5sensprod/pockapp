// frontend/lib/invoices/dossier-id.ts
//
// Quel identifiant interroger pour connaître le dossier d'un document.
//
// La route `GET /api/invoices/:id/deposits` traite `:id` comme la facture
// PARENTE (backend/routes/deposit_routes.go:191-232). Passée l'identifiant d'une
// facture de solde, elle répond 200 avec un dossier VIDE — pas une erreur, un
// silence. C'est ce qui produit aujourd'hui le cul-de-sac de la facture de
// solde : elle n'affiche aucun lien vers sa parente ni vers ses acomptes.
//
// Voir frontend/modules/connect/PocketConnect-docs/01-audit-detail-facture.md §13.

import type { InvoiceResponse } from '@/lib/types/invoice.types'

/** Nature du document courant DANS son dossier. Dérivée, jamais stockée. */
export type DossierRole =
	| 'parent' // facture, sans original_invoice_id
	| 'balance' // facture, AVEC original_invoice_id — le cas oublié aujourd'hui
	| 'deposit'
	| 'credit_note'
	| 'ticket'

export function resolveDossierRole(invoice: InvoiceResponse): DossierRole {
	if (invoice.is_pos_ticket) return 'ticket'
	if (invoice.invoice_type === 'credit_note') return 'credit_note'
	if (invoice.invoice_type === 'deposit') return 'deposit'
	return invoice.original_invoice_id ? 'balance' : 'parent'
}

/**
 * L'identifiant à passer à `/deposits`, ou `undefined` s'il n'y a pas de
 * dossier à interroger.
 *
 * Un ticket de caisse ne porte jamais d'acompte
 * (invoice.types.ts, canCreateDeposit) : l'interroger est un appel pour rien.
 */
export function resolveDossierId(
	invoice: InvoiceResponse | undefined,
): string | undefined {
	if (!invoice) return undefined
	if (invoice.is_pos_ticket) return undefined

	const role = resolveDossierRole(invoice)
	if (role === 'parent') return invoice.id

	// Acompte, avoir, facture de solde : le dossier est celui de la parente.
	// Un avoir dont l'origine est un acompte désigne cet acompte, pas la
	// facture — la chaîne se remonte alors d'un cran à la fois, côté appelant.
	return invoice.original_invoice_id || undefined
}
