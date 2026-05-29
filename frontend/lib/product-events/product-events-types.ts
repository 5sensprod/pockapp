// frontend/lib/product-events/product-events-types.ts
// Types TypeScript pour la collection product_events (PocketBase)
//
// product_events est une collection append-only.
// Elle répond à : "Qu'est-il arrivé à ce produit dans le temps ?"
// Elle NE remplace PAS inventory_entries (source de vérité du comptage).

// ============================================================================
// CONSTANTE COLLECTION
// ============================================================================

export const PRODUCT_EVENTS_COLLECTION = 'product_events'

// ============================================================================
// EVENT TYPE
// ============================================================================

export type ProductEventType =
	// Cycle de vie
	| 'product_created'
	| 'product_updated'
	// Stock
	| 'stock_updated' // modif ponctuelle UI AppPOS / admin
	| 'stock_adjusted_inventory' // écart appliqué après comptage physique
	| 'stock_sale' // décrémentation après vente
	| 'stock_return' // incrémentation après retour client
	// Prix
	| 'purchase_price_changed'
	| 'sale_price_changed'
	// Fiche produit
	| 'name_changed'
	| 'category_changed'
	| 'sku_changed'
	| 'barcode_changed'
	// Synchronisation
	| 'sync_apppos'

// ============================================================================
// SOURCE
// ============================================================================

export type ProductEventSource =
	| 'inventory_session' // ajustement post-comptage physique
	| 'sale' // vente POS
	| 'return' // retour client
	| 'apppos_update' // modification via UI AppPOS
	| 'apppos_sync' // resynchronisation AppPOS → PocketApp
	| 'manual' // correction manuelle opérateur
	| 'import' // import externe

// ============================================================================
// PAYLOADS BEFORE / AFTER / DELTA (selon event_type)
// ============================================================================

export interface StockPayload {
	stock: number
}

export interface PricePayload {
	price_ttc?: number
	cost_price?: number
}

export interface NamePayload {
	name: string
}

export interface CategoryPayload {
	category_id: string
	category_name?: string
}

export interface SkuPayload {
	sku: string
}

export interface BarcodePayload {
	barcode: string
}

export interface StockDelta {
	stock: number // positif = gain, négatif = perte
}

export interface PriceDelta {
	price_ttc?: number
	cost_price?: number
}

// ============================================================================
// MÉTADONNÉES PAR SOURCE
// ============================================================================

export interface InventorySessionMetadata {
	session_id: string
	entry_id: string
	adjusted_at: string // ISO
	session_label?: string | null
}

export interface SaleMetadata {
	ticket_id: string
	quantity_sold: number
	unit_price?: number
}

export interface ReturnMetadata {
	ticket_id?: string
	destination: 'restock' | 'sav' | 'stock_b'
	reason?: string
}

// ============================================================================
// ENTITÉ PRINCIPALE
// ============================================================================

/**
 * Collection PocketBase : `product_events`
 * Enregistrement append-only d'un événement sur un produit.
 */
export interface ProductEvent {
	id: string

	// Produit concerné
	product_id: string
	product_name_snapshot: string
	product_sku_snapshot: string

	// Qualification de l'événement
	event_type: ProductEventType
	source: ProductEventSource
	source_id: string | null

	// Qui / Quand
	operator: string
	occurred_at: string // ISO — timestamp métier (≠ created PocketBase)

	// Valeurs avant / après (structure dépend de event_type)
	before: Record<string, unknown> | null
	after: Record<string, unknown> | null
	delta: Record<string, unknown> | null

	// Métadonnées contextuelles (structure dépend de source)
	metadata: object | null

	// Champs PocketBase auto
	created: string
	updated: string
	collectionId: string
	collectionName: string
}

// ============================================================================
// INPUT (pour créer un événement)
// ============================================================================

export interface CreateProductEventInput {
	product_id: string
	product_name_snapshot?: string
	product_sku_snapshot?: string
	event_type: ProductEventType
	source: ProductEventSource
	source_id?: string | null
	operator?: string
	occurred_at?: string // défaut : maintenant
	before?: Record<string, unknown> | null
	after?: Record<string, unknown> | null
	delta?: Record<string, unknown> | null
	// object (et non Record<string, unknown>) pour accepter les interfaces
	// typées comme InventorySessionMetadata, SaleMetadata, ReturnMetadata
	// sans avoir à caster manuellement à chaque appel.
	metadata?: object | null
}

// ============================================================================
// BUILDER — détection automatique des diffs avant/après updateAppPosProduct
// ============================================================================

/**
 * Paramètres pour construire les événements depuis un before/after produit AppPOS.
 * Utilisé dans updateAppPosProduct() après le PUT.
 */
export interface BuildProductEventsParams {
	productId: string
	productNameSnapshot?: string
	productSkuSnapshot?: string
	before: {
		stock?: number
		price_ttc?: number
		cost_price?: number
		name?: string
		category_id?: string
		category_name?: string
		sku?: string
		barcode?: string
	}
	after: {
		stock?: number
		price_ttc?: number
		cost_price?: number
		name?: string
		category_id?: string
		category_name?: string
		sku?: string
		barcode?: string
	}
	source: ProductEventSource
	sourceId?: string | null
	operator?: string
}

/**
 * Construit la liste des événements à créer depuis un diff before/after.
 * Un seul updateAppPosProduct peut générer plusieurs événements
 * (ex: changement prix + changement catégorie simultanés).
 */
export function buildProductEvents(
	params: BuildProductEventsParams,
): CreateProductEventInput[] {
	const {
		productId,
		productNameSnapshot = '',
		productSkuSnapshot = '',
		before,
		after,
		source,
		sourceId = null,
		operator = '',
	} = params

	const events: CreateProductEventInput[] = []
	const now = new Date().toISOString()

	const base: Omit<
		CreateProductEventInput,
		'event_type' | 'before' | 'after' | 'delta'
	> = {
		product_id: productId,
		product_name_snapshot: productNameSnapshot,
		product_sku_snapshot: productSkuSnapshot,
		source,
		source_id: sourceId,
		operator,
		occurred_at: now,
	}

	// ── Stock ──────────────────────────────────────────────────────────────────
	if (
		before.stock !== undefined &&
		after.stock !== undefined &&
		before.stock !== after.stock
	) {
		events.push({
			...base,
			event_type: 'stock_updated',
			before: { stock: before.stock },
			after: { stock: after.stock },
			delta: { stock: after.stock - before.stock },
		})
	}

	// ── Prix de vente TTC ──────────────────────────────────────────────────────
	if (
		before.price_ttc !== undefined &&
		after.price_ttc !== undefined &&
		Math.abs((before.price_ttc ?? 0) - (after.price_ttc ?? 0)) > 0.001
	) {
		events.push({
			...base,
			event_type: 'sale_price_changed',
			before: { price_ttc: before.price_ttc },
			after: { price_ttc: after.price_ttc },
			delta: { price_ttc: (after.price_ttc ?? 0) - (before.price_ttc ?? 0) },
		})
	}

	// ── Prix d'achat ───────────────────────────────────────────────────────────
	if (
		before.cost_price !== undefined &&
		after.cost_price !== undefined &&
		Math.abs((before.cost_price ?? 0) - (after.cost_price ?? 0)) > 0.001
	) {
		events.push({
			...base,
			event_type: 'purchase_price_changed',
			before: { cost_price: before.cost_price },
			after: { cost_price: after.cost_price },
			delta: { cost_price: (after.cost_price ?? 0) - (before.cost_price ?? 0) },
		})
	}

	// ── Nom ────────────────────────────────────────────────────────────────────
	if (
		before.name !== undefined &&
		after.name !== undefined &&
		before.name !== after.name
	) {
		events.push({
			...base,
			event_type: 'name_changed',
			before: { name: before.name },
			after: { name: after.name },
			delta: null,
		})
	}

	// ── Catégorie ──────────────────────────────────────────────────────────────
	if (
		before.category_id !== undefined &&
		after.category_id !== undefined &&
		before.category_id !== after.category_id
	) {
		events.push({
			...base,
			event_type: 'category_changed',
			before: {
				category_id: before.category_id,
				category_name: before.category_name,
			},
			after: {
				category_id: after.category_id,
				category_name: after.category_name,
			},
			delta: null,
		})
	}

	// ── SKU ────────────────────────────────────────────────────────────────────
	if (
		before.sku !== undefined &&
		after.sku !== undefined &&
		before.sku !== after.sku
	) {
		events.push({
			...base,
			event_type: 'sku_changed',
			before: { sku: before.sku },
			after: { sku: after.sku },
			delta: null,
		})
	}

	// ── Code-barres ────────────────────────────────────────────────────────────
	if (
		before.barcode !== undefined &&
		after.barcode !== undefined &&
		before.barcode !== after.barcode
	) {
		events.push({
			...base,
			event_type: 'barcode_changed',
			before: { barcode: before.barcode },
			after: { barcode: after.barcode },
			delta: null,
		})
	}

	return events
}
