// frontend/modules/connect/types/order.ts
//
// Source de vérité UI pour les bons de commande.
// Les types (OrderItem, OrderResponse) sont en snake_case pour coller
// exactement aux champs PocketBase retournés par le backend.
// Le numéro BC-YYYY-XXXX est généré par le hook OnRecordBeforeCreate côté Go.

// ── Ré-export depuis les hooks pour éviter les imports multiples ────────────
// Les composants importent OrderStatus / OrderItem / OrderResponse depuis ici.
export type {
	OrderStatus,
	OrderItem,
	OrderResponse,
	OrderCreateDto,
	OrdersListOptions,
	PatchOrderStatusDto,
} from '@/lib/queries/orders'

// ── Labels UI ──────────────────────────────────────────────────────────────
import type { OrderStatus } from '@/lib/queries/orders'

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

// ── Helpers de calcul ─────────────────────────────────────────────────────
// Utilisé dans OrderCreatePage / OrderEditPage pour recalculer les totaux
// à partir des lignes saisies dans le formulaire.
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

// computeItem : recalcule total_ht et total_ttc d'une ligne à partir
// de quantity / unit_price_ht / vat_rate.
// Utilisé dans OrderCreatePage quand l'utilisateur modifie un champ.
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

// emptyItem : ligne vide par défaut pour le formulaire de création.
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
