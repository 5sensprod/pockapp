// frontend/lib/inventory/inventory-pocketbase.ts
// Fonctions CRUD PocketBase pour les sessions et entrées d'inventaire

import type PocketBase from 'pocketbase'
import type {
	CreateInventorySessionInput,
	InventoryEntry,
	InventorySession,
	InventorySessionStatus,
} from './inventory-types'
import {
	INVENTORY_ENTRIES_COLLECTION,
	INVENTORY_SESSIONS_COLLECTION,
} from './inventory-types'

// ============================================================================
// SESSIONS
// ============================================================================

/**
 * Récupère la session active (draft ou in_progress), s'il y en a une.
 * Il ne peut y en avoir qu'une seule à la fois.
 */
export async function getActiveInventorySession(
	pb: PocketBase,
): Promise<InventorySession | null> {
	try {
		const record = await pb
			.collection(INVENTORY_SESSIONS_COLLECTION)
			.getFirstListItem<InventorySession>(
				'status = "draft" || status = "in_progress"',
				{ sort: '-created', $autoCancel: false },
			)
		return record
	} catch {
		return null
	}
}

/**
 * Récupère une session par son ID.
 */
export async function getInventorySession(
	pb: PocketBase,
	sessionId: string,
): Promise<InventorySession | null> {
	try {
		return await pb
			.collection(INVENTORY_SESSIONS_COLLECTION)
			.getOne<InventorySession>(sessionId, { $autoCancel: false })
	} catch {
		return null
	}
}

/**
 * Récupère l'historique des sessions complétées/annulées.
 */
export async function getInventorySessionHistory(
	pb: PocketBase,
	page = 1,
	perPage = 20,
) {
	return pb
		.collection(INVENTORY_SESSIONS_COLLECTION)
		.getList<InventorySession>(page, perPage, {
			filter: 'status = "completed" || status = "cancelled"',
			sort: '-completed_at',
			$autoCancel: false,
		})
}

/**
 * Crée une nouvelle session d'inventaire.
 * Échoue si une session active existe déjà.
 */
export async function createInventorySession(
	pb: PocketBase,
	input: CreateInventorySessionInput,
): Promise<InventorySession> {
	// Vérifier qu'il n'y a pas déjà une session active
	const existing = await getActiveInventorySession(pb)
	if (existing) {
		throw new Error(
			`Une session d'inventaire est déjà en cours (ID: ${existing.id}). Terminez-la avant d'en créer une nouvelle.`,
		)
	}

	return pb.collection(INVENTORY_SESSIONS_COLLECTION).create<InventorySession>({
		status: 'draft' as InventorySessionStatus,
		started_at: new Date().toISOString(),
		completed_at: null,
		operator: input.operator,
		scope: input.scope,
		scope_category_ids: input.scope_category_ids ?? [],
		validated_category_ids: [],
		apppos_snapshot_at: new Date().toISOString(),
		notes: input.notes ?? '',
	})
}

/**
 * Passe la session de "draft" à "in_progress".
 */
export async function startInventorySession(
	pb: PocketBase,
	sessionId: string,
): Promise<InventorySession> {
	return pb
		.collection(INVENTORY_SESSIONS_COLLECTION)
		.update<InventorySession>(sessionId, {
			status: 'in_progress',
			started_at: new Date().toISOString(),
		})
}

/**
 * Marque une catégorie comme validée dans la session.
 * Une catégorie validée n'est plus modifiable.
 */
export async function validateInventoryCategory(
	pb: PocketBase,
	sessionId: string,
	categoryId: string,
): Promise<InventorySession> {
	const session = await getInventorySession(pb, sessionId)
	if (!session) throw new Error('Session introuvable')
	if (session.status !== 'in_progress') {
		throw new Error('La session doit être en cours pour valider une catégorie')
	}

	const already = session.validated_category_ids ?? []
	if (already.includes(categoryId)) return session // Déjà validée

	return pb
		.collection(INVENTORY_SESSIONS_COLLECTION)
		.update<InventorySession>(sessionId, {
			validated_category_ids: [...already, categoryId],
		})
}

/**
 * Complète la session (tous les écarts ont été appliqués).
 */
export async function completeInventorySession(
	pb: PocketBase,
	sessionId: string,
): Promise<InventorySession> {
	return pb
		.collection(INVENTORY_SESSIONS_COLLECTION)
		.update<InventorySession>(sessionId, {
			status: 'completed',
			completed_at: new Date().toISOString(),
		})
}

/**
 * Annule la session. Les ajustements déjà appliqués ne sont PAS annulés.
 */
export async function cancelInventorySession(
	pb: PocketBase,
	sessionId: string,
): Promise<InventorySession> {
	return pb
		.collection(INVENTORY_SESSIONS_COLLECTION)
		.update<InventorySession>(sessionId, {
			status: 'cancelled',
			completed_at: new Date().toISOString(),
		})
}

// ============================================================================
// ENTRÉES
// ============================================================================

/**
 * Récupère toutes les entrées d'une session.
 * Triées par catégorie puis par nom de produit.
 */
export async function getInventoryEntries(
	pb: PocketBase,
	sessionId: string,
): Promise<InventoryEntry[]> {
	console.log('[getInventoryEntries] sessionId:', sessionId)

	// Compatibilité avec toutes les versions du SDK PocketBase
	// getFullList(batchSize, queryParams) — ancienne API
	// getFullList(queryParams) — nouvelle API
	const records = await pb
		.collection(INVENTORY_ENTRIES_COLLECTION)
		.getFullList<InventoryEntry>(500, {
			filter: `session_id ~ "${sessionId}"`,
			sort: 'category_name,product_name',
			$autoCancel: false,
		})

	console.log('[getInventoryEntries] résultat:', records.length, 'entrées')
	return records
}

/**
 * Récupère les entrées d'une catégorie spécifique dans une session.
 */
export async function getInventoryEntriesByCategory(
	pb: PocketBase,
	sessionId: string,
	categoryId: string,
): Promise<InventoryEntry[]> {
	const result = await pb
		.collection(INVENTORY_ENTRIES_COLLECTION)
		.getList<InventoryEntry>(1, 500, {
			filter: `session_id ~ "${sessionId}" && category_id = "${categoryId}"`,
			sort: 'product_name',
			$autoCancel: false,
		})
	return result.items
}

/**
 * Crée toutes les entrées pour une session (snapshot du catalogue AppPOS).
 * À appeler après createInventorySession(), avec les produits AppPOS chargés.
 */
export async function createInventoryEntries(
	pb: PocketBase,
	sessionId: string,
	products: Array<{
		product_id: string
		product_name: string
		product_sku: string
		product_image: string
		category_id: string
		category_name: string
		stock_theorique: number
	}>,
	onProgress?: (done: number, total: number) => void,
): Promise<void> {
	// Séquentiel pur — évite l'auto-cancellation du SDK PocketBase sur 2000+ produits
	for (let i = 0; i < products.length; i++) {
		const p = products[i]
		try {
			await pb.collection(INVENTORY_ENTRIES_COLLECTION).create<InventoryEntry>(
				{
					session_id: sessionId,
					product_id: p.product_id,
					product_name: p.product_name,
					product_sku: p.product_sku || '',
					product_image: p.product_image || '',
					category_id: p.category_id,
					category_name: p.category_name,
					stock_theorique: Number(p.stock_theorique) || 0,
					status: 'pending',
					adjusted: false,
				},
				{ $autoCancel: false },
			)
			onProgress?.(i + 1, products.length)
		} catch (err: any) {
			console.error(
				`❌ [createInventoryEntries] Erreur produit "${p.product_name}":`,
				err?.response?.data ?? err?.message ?? err,
			)
			throw err
		}
	}
}

/**
 * Met à jour le stock compté d'un produit dans la session.
 */
export async function countInventoryProduct(
	pb: PocketBase,
	entryId: string,
	stockCompte: number,
): Promise<InventoryEntry> {
	if (stockCompte < 0)
		throw new Error('Le stock compté ne peut pas être négatif')

	return pb
		.collection(INVENTORY_ENTRIES_COLLECTION)
		.update<InventoryEntry>(entryId, {
			stock_compte: stockCompte,
			status: 'counted',
			counted_at: new Date().toISOString(),
		})
}

/**
 * Réinitialise le comptage d'un produit (retour à "pending").
 * Impossible si la catégorie est déjà validée.
 */
export async function resetInventoryProduct(
	pb: PocketBase,
	entryId: string,
): Promise<InventoryEntry> {
	return pb
		.collection(INVENTORY_ENTRIES_COLLECTION)
		.update<InventoryEntry>(entryId, {
			stock_compte: null,
			status: 'pending',
			counted_at: null,
		})
}

/**
 * Marque une entrée comme ajustée dans AppPOS.
 */
export async function markEntryAsAdjusted(
	pb: PocketBase,
	entryId: string,
): Promise<InventoryEntry> {
	return pb
		.collection(INVENTORY_ENTRIES_COLLECTION)
		.update<InventoryEntry>(entryId, {
			adjusted: true,
			adjusted_at: new Date().toISOString(),
		})
}

// ============================================================================
// HELPERS DÉRIVÉS
// ============================================================================

/**
 * Calcule les écarts pour une liste d'entrées.
 * Ne retourne que les produits comptés avec un écart ≠ 0.
 */
export function computeGaps(
	entries: InventoryEntry[],
): Array<{ entry: InventoryEntry; ecart: number }> {
	return entries
		.filter(
			(e): e is InventoryEntry & { stock_compte: number } =>
				e.status === 'counted' && e.stock_compte !== null,
		)
		.map((e) => ({ entry: e, ecart: e.stock_compte - e.stock_theorique }))
		.filter(({ ecart }) => ecart !== 0)
}

/**
 * Vérifie si tous les produits d'une catégorie ont été comptés.
 */
export function isCategoryFullyCounted(entries: InventoryEntry[]): boolean {
	return entries.length > 0 && entries.every((e) => e.status === 'counted')
}
