// frontend/modules/connect/types/order.ts

export type OrderStatus =
	| 'draft' // brouillon
	| 'confirmed' // bon de commande confirmé (contrat formé)
	| 'in_progress' // en cours d'exécution
	| 'delivered' // livré / prestation réalisée
	| 'billed' // facturé
	| 'cancelled' // annulé (avec motif)

export interface OrderLine {
	id: string
	description: string
	quantity: number
	unitPrice: number // HT
	vatRate: number // ex: 0.20 pour 20%
	totalHT: number
	totalTTC: number
}

export interface Order {
	id: string
	reference: string // ex: "BC-2024-0042"
	customerId: string
	customerName: string // snapshot contractuel
	status: OrderStatus
	lines: OrderLine[]
	totalHT: number
	totalTVA: number
	totalTTC: number
	paymentConditions?: string
	deliveryConditions?: string
	notes?: string

	// Traçabilité
	sourceQuoteId?: string // si généré depuis un devis
	invoiceId?: string // si déjà facturé
	cancellationReason?: string

	createdAt: string // ISO 8601
	confirmedAt?: string
	deliveredAt?: string
	billedAt?: string
	cancelledAt?: string
	updatedAt: string
}

// ── Labels UI ──────────────────────────────────────────────────────────────
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
	draft: 'Brouillon',
	confirmed: 'Confirmé',
	in_progress: 'En cours',
	delivered: 'Livré',
	billed: 'Facturé',
	cancelled: 'Annulé',
}

export const ORDER_STATUS_COLORS: Record<
	OrderStatus,
	{ bg: string; text: string; border: string }
> = {
	draft: {
		bg: 'bg-muted',
		text: 'text-muted-foreground',
		border: 'border-border',
	},
	confirmed: {
		bg: 'bg-blue-50',
		text: 'text-blue-700',
		border: 'border-blue-200',
	},
	in_progress: {
		bg: 'bg-amber-50',
		text: 'text-amber-700',
		border: 'border-amber-200',
	},
	delivered: {
		bg: 'bg-emerald-50',
		text: 'text-emerald-700',
		border: 'border-emerald-200',
	},
	billed: {
		bg: 'bg-purple-50',
		text: 'text-purple-700',
		border: 'border-purple-200',
	},
	cancelled: {
		bg: 'bg-red-50',
		text: 'text-red-700',
		border: 'border-red-200',
	},
}

// ── Transitions d'état autorisées ─────────────────────────────────────────
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	draft: ['confirmed', 'cancelled'],
	confirmed: ['in_progress', 'cancelled'],
	in_progress: ['delivered', 'cancelled'],
	delivered: ['billed'],
	billed: [],
	cancelled: [],
}

// ── Helpers ───────────────────────────────────────────────────────────────
export function computeOrderTotals(lines: OrderLine[]): {
	totalHT: number
	totalTVA: number
	totalTTC: number
} {
	const totalHT = lines.reduce((s, l) => s + l.totalHT, 0)
	const totalTVA = lines.reduce((s, l) => s + l.totalHT * l.vatRate, 0)
	return {
		totalHT,
		totalTVA,
		totalTTC: totalHT + totalTVA,
	}
}

export function generateOrderReference(sequence: number): string {
	const year = new Date().getFullYear()
	return `BC-${year}-${String(sequence).padStart(4, '0')}`
}
