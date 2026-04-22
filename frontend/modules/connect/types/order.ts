// frontend/modules/connect/types/order.ts

export type {
	OrderStatus,
	OrderItem,
	OrderResponse,
	OrderCreateDto,
	OrdersListOptions,
	PatchOrderStatusDto,
} from '@/lib/queries/orders'

import type { OrderStatus } from '@/lib/queries/orders'

// Labels UI — billed conservé pour compat PocketBase mais masqué dans l'UI
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
	draft: 'Brouillon',
	confirmed: 'Confirmé',
	in_progress: 'En cours',
	delivered: 'Livré',
	billed: 'Facturé', // conservé pour compat, non affiché comme transition
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
		// même couleur que delivered — état transparent pour l'utilisateur
		bg: 'bg-emerald-50',
		text: 'text-emerald-700',
		border: 'border-emerald-200',
	},
	cancelled: {
		bg: 'bg-red-50',
		text: 'text-red-700',
		border: 'border-red-200',
	},
}

// ── État paiement (calculé depuis la facture liée) ─────────────────────────
// Non stocké dans PocketBase — dérivé côté UI.
export type OrderPaymentStatus = 'unpaid' | 'partial' | 'paid'

export const ORDER_PAYMENT_STATUS_LABELS: Record<OrderPaymentStatus, string> = {
	unpaid: 'Non réglé',
	partial: 'Acompte versé',
	paid: 'Réglé',
}

export const ORDER_PAYMENT_STATUS_COLORS: Record<
	OrderPaymentStatus,
	{ bg: string; text: string; border: string }
> = {
	unpaid: {
		bg: 'bg-slate-50',
		text: 'text-slate-600',
		border: 'border-slate-200',
	},
	partial: {
		bg: 'bg-blue-50',
		text: 'text-blue-700',
		border: 'border-blue-200',
	},
	paid: {
		bg: 'bg-emerald-100',
		text: 'text-emerald-800',
		border: 'border-emerald-300',
	},
}

// ── Transitions manuelles (état commande uniquement) ───────────────────────
// billed n'apparaît plus comme transition manuelle.
// delivered est terminal côté commande — la facturation est gérée ailleurs.
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	draft: ['confirmed', 'cancelled'],
	confirmed: ['in_progress', 'cancelled'],
	in_progress: ['delivered', 'cancelled'],
	delivered: ['cancelled'], // terminal côté commande, plus de "billed" ici
	billed: [], // conservé pour compat PocketBase
	cancelled: [],
}

import type { OrderItem } from '@/lib/queries/orders'

export function computeOrderTotals(items: OrderItem[]): {
	total_ht: number
	total_tva: number
	total_ttc: number
} {
	const total_ht = items.reduce((s, i) => s + i.total_ht, 0)
	const total_tva = items.reduce((s, i) => s + i.total_ht * i.vat_rate, 0)
	return {
		total_ht,
		total_tva,
		total_ttc: total_ht + total_tva,
	}
}

export function computeItem(
	item: Omit<OrderItem, 'total_ht' | 'total_ttc'>,
): OrderItem {
	const total_ht = item.quantity * item.unit_price_ht
	return {
		...item,
		total_ht,
		total_ttc: total_ht * (1 + item.vat_rate),
	}
}

export function emptyItem(): OrderItem {
	return {
		id: crypto.randomUUID(),
		description: '',
		quantity: 1,
		unit_price_ht: 0,
		vat_rate: 0.2,
		total_ht: 0,
		total_ttc: 0,
	}
}
