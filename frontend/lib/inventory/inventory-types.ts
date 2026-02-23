// frontend/lib/inventory/inventory-types.ts
// Tous les types TypeScript pour la feature d'inventaire physique

// ============================================================================
// SESSION D'INVENTAIRE
// ============================================================================

export type InventorySessionStatus =
	| 'draft' // Créée mais pas encore démarrée
	| 'in_progress' // Comptage en cours
	| 'completed' // Validée et ajustements appliqués
	| 'cancelled' // Annulée

export type InventoryScope = 'all' | 'selection'

/**
 * Collection PocketBase : `inventory_sessions`
 * Une session = un inventaire physique complet (ou partiel selon le scope)
 */
export interface InventorySession {
	id: string
	status: InventorySessionStatus
	started_at: string // ISO date — quand le comptage a commencé
	completed_at: string | null // ISO date — quand tout a été validé
	operator: string // Nom de l'opérateur
	scope: InventoryScope // 'all' = tout le catalogue, 'selection' = catégories choisies
	scope_category_ids: string[] // Si scope === 'selection', IDs de catégories AppPOS
	validated_category_ids: string[] // Catégories dont le comptage est validé (plus modifiables)
	apppos_snapshot_at: string // ISO date — moment du gel des stocks théoriques
	notes: string
	// Champs PocketBase auto
	created: string
	updated: string
	collectionId: string
	collectionName: string
}

// ============================================================================
// ENTRÉES D'INVENTAIRE (une par produit par session)
// ============================================================================

export type InventoryEntryStatus =
	| 'pending' // Pas encore inventorié
	| 'counted' // Quantité saisie

/**
 * Collection PocketBase : `inventory_entries`
 * Une entrée = un produit dans une session d'inventaire
 */
export interface InventoryEntry {
	id: string
	session_id: string // Relation → inventory_sessions
	product_id: string // ID AppPOS du produit
	product_name: string // Snapshot nom (au moment du gel)
	product_sku: string // Snapshot SKU
	product_image: string // Snapshot image URL (pour l'UI)
	category_id: string // ID AppPOS de la catégorie
	category_name: string // Snapshot nom catégorie
	stock_theorique: number // Stock AppPOS au moment du gel (snapshot)
	stock_compte: number | null // Quantité saisie par l'opérateur (null = pas encore compté)
	status: InventoryEntryStatus
	counted_at: string | null // ISO date — quand la quantité a été saisie
	adjusted: boolean // true si l'ajustement AppPOS a été appliqué
	adjusted_at: string | null // ISO date — quand l'ajustement a été fait
	// Champs PocketBase auto
	created: string
	updated: string
	collectionId: string
	collectionName: string
}

// ============================================================================
// ÉTATS DÉRIVÉS (calculés côté client, jamais stockés en base)
// ============================================================================

/** Écart pour un produit (calculé à la volée) */
export interface ProductGap {
	productId: string
	productName: string
	productSku: string
	categoryId: string
	categoryName: string
	stockTheorique: number
	stockCompte: number // Jamais null ici — seulement sur les produits comptés
	ecart: number // stockCompte - stockTheorique (positif = surplus, négatif = manquant)
	entryId: string
}

/** Statut dérivé d'une catégorie dans la session courante */
export type CategoryInventoryStatus =
	| 'todo' // Aucun produit compté
	| 'in_progress' // Comptage partiel
	| 'counted' // Tous les produits comptés, pas encore validé
	| 'validated' // Validé — plus modifiable, ajustements appliqués

/** Résumé d'une catégorie dans la session */
export interface CategoryInventorySummary {
	categoryId: string
	categoryName: string
	status: CategoryInventoryStatus
	totalProducts: number
	countedProducts: number
	pendingProducts: number
	gaps: ProductGap[] // Seulement les produits avec écart ≠ 0
	totalGapCount: number // Nombre de produits avec écart
	isValidated: boolean // Catégorie validée → plus modifiable
}

/** Résumé global de la session */
export interface InventorySessionSummary {
	session: InventorySession
	totalProducts: number
	countedProducts: number
	pendingProducts: number
	totalCategories: number
	completedCategories: number // counted ou validated
	validatedCategories: number // validated uniquement
	progressPercent: number // 0-100
	totalGaps: ProductGap[] // Tous les écarts de la session
	categories: CategoryInventorySummary[]
	canComplete: boolean // true si tous les produits sont comptés
}

// ============================================================================
// INPUTS / ACTIONS
// ============================================================================

/** Pour créer une nouvelle session */
export interface CreateInventorySessionInput {
	operator: string
	scope: InventoryScope
	scope_category_ids?: string[]
	notes?: string
}

/** Pour enregistrer la saisie d'un produit */
export interface CountProductInput {
	entryId: string
	stockCompte: number
}

/** Résultat de l'application des ajustements sur une catégorie */
export interface AdjustmentResult {
	categoryId: string
	categoryName: string
	adjustedCount: number
	skippedCount: number // Pas d'écart → pas d'ajustement nécessaire
	errors: Array<{ productId: string; productName: string; error: string }>
}

// ============================================================================
// SCHÉMA POCKETBASE (pour référence lors de la création des collections)
// ============================================================================

/**
 * Schéma PocketBase pour `inventory_sessions`
 *
 * Champs à créer dans PocketBase Admin :
 * - status          : Select  — options: draft, in_progress, completed, cancelled
 * - started_at      : Date
 * - completed_at    : Date    — optional
 * - operator        : Text    — required
 * - scope           : Select  — options: all, selection
 * - scope_category_ids     : JSON
 * - validated_category_ids : JSON
 * - apppos_snapshot_at     : Date
 * - notes           : Text    — optional
 */
export const INVENTORY_SESSIONS_COLLECTION = 'inventory_sessions'

/**
 * Schéma PocketBase pour `inventory_entries`
 *
 * Champs à créer dans PocketBase Admin :
 * - session_id      : Relation → inventory_sessions  — required, cascade delete
 * - product_id      : Text    — required
 * - product_name    : Text    — required
 * - product_sku     : Text
 * - product_image   : Text
 * - category_id     : Text    — required
 * - category_name   : Text    — required
 * - stock_theorique : Number  — required
 * - stock_compte    : Number  — optional (null = pending)
 * - status          : Select  — options: pending, counted
 * - counted_at      : Date    — optional
 * - adjusted        : Bool    — default: false
 * - adjusted_at     : Date    — optional
 */
export const INVENTORY_ENTRIES_COLLECTION = 'inventory_entries'
