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

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
	especes: 'Espèces',
	cb: 'Carte bancaire',
	cheque: 'Chèque',
	virement: 'Virement',
	autre: 'Autre',
}

/**
 * Retourne le libellé lisible d'un moyen de paiement ou de remboursement.
 */
export interface PaymentMethodLabelSource {
	code: string
	name: string
}

/**
 * Résout un libellé dans l'ordre qui préserve les documents scellés : le nom
 * enregistré sur le document, le réglage courant, puis le vocabulaire legacy.
 */
export function resolvePaymentMethodLabel(
	method?: string | null,
	methodLabel?: string | null,
	paymentMethods: readonly PaymentMethodLabelSource[] = [],
): string {
	const savedLabel = methodLabel?.trim()
	if (savedLabel) return savedLabel
	if (!method) return '-'
	return (
		paymentMethods.find((paymentMethod) => paymentMethod.code === method)
			?.name ?? PAYMENT_METHOD_LABELS[method] ?? method
	)
}

export function formatPaymentMethod(
	method?: string | null,
	paymentMethods: readonly PaymentMethodLabelSource[] = [],
): string {
	return resolvePaymentMethodLabel(method, undefined, paymentMethods)
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

/**
 * Retourne le P.U. TTC d'origine d'une ligne, avant remise ligne.
 *
 * Lit le champ persiste `unit_price_ttc_before_discount` lorsqu'il existe.
 * Pour les documents legacy crees avant sa mise en place, le prix est
 * reconstruit par calcul inverse depuis le prix net et la remise.
 */
export function getUnitPriceTtcBeforeDiscount(item: any): number {
	if (item?.unit_price_ttc_before_discount != null) {
		return round2(item.unit_price_ttc_before_discount)
	}

	// ── Legacy : reconstruction par calcul inverse ──────────────
	const qty = Math.max(1, item?.quantity ?? 1)
	const mode = item?.line_discount_mode || 'percent'
	const value = item?.line_discount_value || 0

	const netUnitTtc =
		item?.unit_price_ttc ??
		(item?.total_ttc != null
			? item.total_ttc / qty
			: (item?.unit_price_ht ?? 0) * (1 + (item?.tva_rate ?? 0) / 100))

	if (value <= 0) return round2(netUnitTtc)

	if (mode === 'percent') {
		// remise a 100% : le prix d'origine est irrecuperable
		if (value >= 100) return round2(netUnitTtc)
		return round2(netUnitTtc / (1 - value / 100))
	}

	return round2(netUnitTtc + value / qty)
}
