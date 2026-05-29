// frontend/lib/product-events/product-events-pocketbase.ts
// Fonctions CRUD PocketBase pour la collection product_events.
// Append-only : on ne crée jamais, on ne modifie jamais, on ne supprime jamais.

import type PocketBase from 'pocketbase'
import type {
	CreateProductEventInput,
	InventorySessionMetadata,
	ProductEvent,
	ReturnMetadata,
	SaleMetadata,
} from './product-events-types'
import { PRODUCT_EVENTS_COLLECTION } from './product-events-types'

// ============================================================================
// ÉCRITURE
// ============================================================================

/**
 * Crée un seul événement produit.
 * Best-effort : ne fait jamais planter l'appelant si PocketBase est indisponible.
 */
export async function createProductEvent(
	pb: PocketBase,
	input: CreateProductEventInput,
): Promise<ProductEvent | null> {
	try {
		return await pb.collection(PRODUCT_EVENTS_COLLECTION).create<ProductEvent>(
			{
				product_id: input.product_id,
				product_name_snapshot: input.product_name_snapshot ?? '',
				product_sku_snapshot: input.product_sku_snapshot ?? '',
				event_type: input.event_type,
				source: input.source,
				source_id: input.source_id ?? null,
				operator: input.operator ?? '',
				occurred_at: input.occurred_at ?? new Date().toISOString(),
				before: input.before ?? null,
				after: input.after ?? null,
				delta: input.delta ?? null,
				metadata: input.metadata ?? null,
			},
			{ $autoCancel: false },
		)
	} catch (err: any) {
		// Ne jamais faire planter l'opération principale à cause du journal
		console.warn(
			`[product_events] Échec création événement ${input.event_type} pour ${input.product_id}:`,
			err?.message ?? err,
		)
		return null
	}
}

/**
 * Crée plusieurs événements en séquentiel (best-effort).
 * Utilisé après buildProductEvents() pour persister tous les diffs d'un coup.
 */
export async function createProductEvents(
	pb: PocketBase,
	inputs: CreateProductEventInput[],
): Promise<void> {
	for (const input of inputs) {
		await createProductEvent(pb, input)
	}
}

// ============================================================================
// HELPERS MÉTIER — constructeurs d'événements spécifiques
// ============================================================================

/**
 * Crée un événement stock_adjusted_inventory après comptage physique.
 * Appelé depuis countAndAdjustProduct() après le adjusted_at.
 */
export async function createInventoryAdjustmentEvent(
	pb: PocketBase,
	params: {
		productId: string
		productName: string
		productSku: string
		stockBefore: number
		stockAfter: number
		entryId: string
		sessionId: string
		sessionLabel?: string | null
		adjustedAt: string
		operator?: string
	},
): Promise<ProductEvent | null> {
	const meta: InventorySessionMetadata = {
		session_id: params.sessionId,
		entry_id: params.entryId,
		adjusted_at: params.adjustedAt,
		session_label: params.sessionLabel ?? null,
	}

	return createProductEvent(pb, {
		product_id: params.productId,
		product_name_snapshot: params.productName,
		product_sku_snapshot: params.productSku,
		event_type: 'stock_adjusted_inventory',
		source: 'inventory_session',
		source_id: params.sessionId,
		operator: params.operator ?? '',
		occurred_at: params.adjustedAt,
		before: { stock: params.stockBefore },
		after: { stock: params.stockAfter },
		delta: { stock: params.stockAfter - params.stockBefore },
		metadata: meta,
	})
}

/**
 * Crée un événement stock_sale après décrémentation vente.
 * Appelé depuis decrementAppPosProductsStock() après chaque produit.
 */
export async function createSaleStockEvent(
	pb: PocketBase,
	params: {
		productId: string
		productName: string
		productSku?: string
		stockBefore: number
		stockAfter: number
		quantitySold: number
		ticketId?: string
		operator?: string
	},
): Promise<ProductEvent | null> {
	const meta: SaleMetadata = {
		ticket_id: params.ticketId ?? '',
		quantity_sold: params.quantitySold,
	}

	return createProductEvent(pb, {
		product_id: params.productId,
		product_name_snapshot: params.productName,
		product_sku_snapshot: params.productSku ?? '',
		event_type: 'stock_sale',
		source: 'sale',
		source_id: params.ticketId ?? null,
		operator: params.operator ?? '',
		occurred_at: new Date().toISOString(),
		before: { stock: params.stockBefore },
		after: { stock: params.stockAfter },
		delta: { stock: -params.quantitySold },
		metadata: meta,
	})
}

/**
 * Crée un événement stock_return après retour client.
 * Appelé depuis incrementAppPosProductsStock() après chaque produit.
 */
export async function createReturnStockEvent(
	pb: PocketBase,
	params: {
		productId: string
		productName: string
		productSku?: string
		stockBefore: number
		stockAfter: number
		quantityReturned: number
		destination: 'restock' | 'sav' | 'stock_b'
		reason?: string
		ticketId?: string
		operator?: string
	},
): Promise<ProductEvent | null> {
	const meta: ReturnMetadata = {
		ticket_id: params.ticketId,
		destination: params.destination,
		reason: params.reason,
	}

	return createProductEvent(pb, {
		product_id: params.productId,
		product_name_snapshot: params.productName,
		product_sku_snapshot: params.productSku ?? '',
		event_type: 'stock_return',
		source: 'return',
		source_id: params.ticketId ?? null,
		operator: params.operator ?? '',
		occurred_at: new Date().toISOString(),
		before: { stock: params.stockBefore },
		after: { stock: params.stockAfter },
		delta: { stock: params.quantityReturned },
		metadata: meta,
	})
}

// ============================================================================
// LECTURE
// ============================================================================

/**
 * Récupère l'historique complet d'un produit, du plus récent au plus ancien.
 */
export async function getProductEvents(
	pb: PocketBase,
	productId: string,
	options: {
		limit?: number
		eventTypes?: string[]
	} = {},
): Promise<ProductEvent[]> {
	const { limit = 100, eventTypes } = options

	let filter = `product_id = "${productId}"`
	if (eventTypes && eventTypes.length > 0) {
		const typeFilter = eventTypes.map((t) => `event_type = "${t}"`).join(' || ')
		filter += ` && (${typeFilter})`
	}

	try {
		return await pb
			.collection(PRODUCT_EVENTS_COLLECTION)
			.getFullList<ProductEvent>(limit, {
				filter,
				sort: '-occurred_at',
				$autoCancel: false,
			})
	} catch (err: any) {
		console.warn('[product_events] Erreur lecture:', err?.message ?? err)
		return []
	}
}

/**
 * Récupère les événements de stock d'une session d'inventaire.
 * Utile pour afficher le détail des ajustements dans l'historique d'inventaire.
 */
export async function getInventorySessionEvents(
	pb: PocketBase,
	sessionId: string,
): Promise<ProductEvent[]> {
	try {
		return await pb
			.collection(PRODUCT_EVENTS_COLLECTION)
			.getFullList<ProductEvent>(500, {
				filter: `source = "inventory_session" && source_id = "${sessionId}"`,
				sort: 'occurred_at',
				$autoCancel: false,
			})
	} catch (err: any) {
		console.warn('[product_events] Erreur lecture session:', err?.message ?? err)
		return []
	}
}

/**
 * Récupère les N derniers événements toutes sources confondues.
 * Utile pour un dashboard "activité récente".
 */
export async function getRecentProductEvents(
	pb: PocketBase,
	limit = 50,
): Promise<ProductEvent[]> {
	try {
		return await pb
			.collection(PRODUCT_EVENTS_COLLECTION)
			.getFullList<ProductEvent>(limit, {
				sort: '-occurred_at',
				$autoCancel: false,
			})
	} catch (err: any) {
		console.warn('[product_events] Erreur lecture récents:', err?.message ?? err)
		return []
	}
}
