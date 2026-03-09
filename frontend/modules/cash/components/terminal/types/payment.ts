// frontend/modules/cash/components/terminal/types/payment.ts

// ============================================================================
// TYPES DE BASE
// ============================================================================

export type PaymentStep = 'cart' | 'payment' | 'success'

export type BackendPaymentMethod =
	| 'especes'
	| 'cb'
	| 'cheque'
	| 'autre'
	| 'virement'
	| 'multi' // ✅ NOUVEAU : règlement multipaiement

export interface PaymentMethod {
	id: string
	code: string
	name: string
	description?: string
	type: 'default' | 'custom'
	accounting_category: 'cash' | 'card' | 'check' | 'transfer' | 'other'
	enabled: boolean
	requires_session: boolean
	icon?: string
	color?: string
	text_color?: string
	display_order: number
}

// ============================================================================
// MULTIPAIEMENT
// ============================================================================

/**
 * Une ligne de paiement dans un règlement multipaiement.
 */
export interface PaymentEntry {
	method: PaymentMethod
	amount: number
}

/**
 * Ce qui est envoyé à l'API pour chaque ligne de paiement.
 */
export interface PosPaymentInput {
	method_code: string
	method_label: string
	accounting_category: string
	amount: number
	/** Montant reçu en espèces — seulement si accounting_category === 'cash' */
	amount_received?: number
}

/**
 * Convertit un PaymentEntry[] en PosPaymentInput[] pour l'API backend.
 */
export function paymentEntriesToApiPayload(
	entries: PaymentEntry[],
): PosPaymentInput[] {
	return entries.map((entry) => ({
		method_code: entry.method.code,
		method_label: entry.method.name,
		accounting_category: entry.method.accounting_category,
		amount: entry.amount,
		...(entry.method.accounting_category === 'cash'
			? { amount_received: entry.amount }
			: {}),
	}))
}

/**
 * Label lisible pour le ticket (ex: "CB + Espèces").
 */
export function getMultiPaymentLabel(entries: PaymentEntry[]): string {
	if (entries.length === 0) return ''
	const names = [...new Set(entries.map((e) => e.method.name))]
	return names.join(' + ')
}

// ============================================================================
// HELPERS EXISTANTS (inchangés + compatibles multipaiement)
// ============================================================================

export function getDefaultPaymentMethod(
	code: 'cash' | 'card' | 'check' | 'transfer',
): PaymentMethod {
	const defaults: Record<string, PaymentMethod> = {
		cash: {
			id: 'default-cash',
			code: 'cash',
			name: 'Espèces',
			type: 'default',
			accounting_category: 'cash',
			enabled: true,
			requires_session: false,
			icon: 'Banknote',
			color: '#22c55e',
			text_color: '#ffffff',
			display_order: 1,
		},
		card: {
			id: 'default-card',
			code: 'card',
			name: 'Carte bancaire',
			type: 'default',
			accounting_category: 'card',
			enabled: true,
			requires_session: false,
			icon: 'CreditCard',
			color: '#3b82f6',
			text_color: '#ffffff',
			display_order: 2,
		},
		check: {
			id: 'default-check',
			code: 'check',
			name: 'Chèque',
			type: 'default',
			accounting_category: 'check',
			enabled: true,
			requires_session: false,
			icon: 'Receipt',
			color: '#a855f7',
			text_color: '#ffffff',
			display_order: 3,
		},
		transfer: {
			id: 'default-transfer',
			code: 'transfer',
			name: 'Virement',
			type: 'default',
			accounting_category: 'transfer',
			enabled: true,
			requires_session: false,
			icon: 'ArrowRightLeft',
			color: '#f59e0b',
			text_color: '#ffffff',
			display_order: 4,
		},
	}
	return defaults[code]
}

/**
 * Retourne le code backend legacy pour un moyen unique (rétrocompat).
 * Pour le multipaiement, utiliser getMainPaymentMethodCode().
 */
export function getPaymentMethodCode(
	method: PaymentMethod,
): BackendPaymentMethod {
	if (method.type === 'default') {
		const mapping: Record<
			'card' | 'cash' | 'check' | 'transfer',
			BackendPaymentMethod
		> = {
			card: 'cb',
			cash: 'especes',
			check: 'cheque',
			transfer: 'virement',
		}
		return (
			mapping[method.code as 'card' | 'cash' | 'check' | 'transfer'] ?? 'autre'
		)
	}
	return 'autre'
}

/**
 * Retourne le label d'un moyen unique (rétrocompat).
 * Pour le multipaiement, utiliser getMultiPaymentLabel().
 */
export function getPaymentMethodLabel(
	method: PaymentMethod,
): string | undefined {
	return method.type === 'custom' ? method.name : undefined
}

/**
 * Détermine le code backend principal pour un règlement multipaiement.
 * - 1 seul moyen default → son code legacy (ex: 'cb')
 * - 1 seul moyen custom  → 'autre'
 * - Plusieurs moyens      → 'multi'
 */
export function getMainPaymentMethodCode(
	entries: PaymentEntry[],
): BackendPaymentMethod {
	if (entries.length === 0) return 'autre'
	if (entries.length === 1) return getPaymentMethodCode(entries[0].method)
	return 'multi'
}
