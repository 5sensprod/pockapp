// frontend/modules/connect/utils/formatters.ts

/**
 * Formate une date au format français (JJ/MM/AAAA)
 */
export function formatDate(dateStr?: string | null): string {
	if (!dateStr) return '-'
	return new Date(dateStr).toLocaleDateString('fr-FR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	})
}

/**
 * Formate un montant en devise (ex: 1 200,50 €)
 */
export function formatCurrency(amount: number, currency = 'EUR'): string {
	return new Intl.NumberFormat('fr-FR', {
		style: 'currency',
		currency,
	}).format(amount)
}

// ── Ajouts Connect ────────────────────────────────────────────────────────────

const PAYMENT_METHOD_LABELS: Record<string, string> = {
	especes: 'Espèces',
	cb: 'Carte bancaire',
	cheque: 'Chèque',
	virement: 'Virement',
	autre: 'Autre',
}

/**
 * Retourne le libellé lisible d'un moyen de paiement ou de remboursement.
 */
export function formatPaymentMethod(method?: string | null): string {
	if (!method) return '-'
	return PAYMENT_METHOD_LABELS[method] ?? method
}

/**
 * Retourne le libellé affiché d'une facture selon son moyen de paiement.
 * Priorité : payment_method_label (saisi librement) > payment_method (enum).
 */
export function getPaymentMethodLabel(invoice: any): string {
	const label = (invoice?.payment_method_label || '').trim()
	if (label) return label
	return formatPaymentMethod(invoice?.payment_method)
}

const PAYMENT_TERMS_LABELS: Record<string, string> = {
	immediate: 'Immédiat',
	'30_days': '30 jours',
	'45_days': '45 jours',
	'60_days': '60 jours',
}

/**
 * Retourne le libellé d'un délai de paiement client.
 */
export function formatPaymentTerms(terms?: string | null): string {
	if (!terms) return 'Immédiat'
	return PAYMENT_TERMS_LABELS[terms] ?? terms
}

/**
 * Arrondit à 2 décimales en évitant les erreurs flottantes.
 * Ex : round2(1.005) → 1.01
 */
export function round2(n: number): number {
	return Math.round((n + Number.EPSILON) * 100) / 100
}
