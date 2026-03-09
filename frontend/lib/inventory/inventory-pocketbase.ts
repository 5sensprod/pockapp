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
 * Récupère toutes les sessions actives (draft ou in_progress).
 * Plusieurs sessions peuvent coexister simultanément.
 */
export async function getActiveSessions(
	pb: PocketBase,
): Promise<InventorySession[]> {
	try {
		const result = await pb
			.collection(INVENTORY_SESSIONS_COLLECTION)
			.getList<InventorySession>(1, 50, {
				filter: 'status = "draft" || status = "in_progress"',
				sort: '-created',
				$autoCancel: false,
			})
		return result.items
	} catch {
		return []
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
 * Plusieurs sessions peuvent coexister simultanément.
 */
export async function createInventorySession(
	pb: PocketBase,
	input: CreateInventorySessionInput,
): Promise<InventorySession> {
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
 * Écrit les stats dénormalisées pour l'affichage de l'historique sans requêter les entrées.
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
 * Complète la session ET écrit les stats dénormalisées.
 * À préférer à completeInventorySession() pour un historique riche.
 * @param stats - Calculées depuis le summary avant clôture
 */
export async function completeInventorySessionWithStats(
	pb: PocketBase,
	sessionId: string,
	stats: {
		totalProducts: number
		countedProducts: number
		totalGaps: number
		categoryNames: string[]
	},
): Promise<InventorySession> {
	return pb
		.collection(INVENTORY_SESSIONS_COLLECTION)
		.update<InventorySession>(sessionId, {
			status: 'completed',
			completed_at: new Date().toISOString(),
			stats_total_products: stats.totalProducts,
			stats_counted_products: stats.countedProducts,
			stats_total_gaps: stats.totalGaps,
			stats_category_names: stats.categoryNames,
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
		product_barcode: string
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
					product_barcode: p.product_barcode || '',
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
 * Compte un produit ET applique immédiatement l'ajustement AppPOS si écart.
 * Appelé dès que l'opérateur valide la quantité (onBlur / Enter).
 * Si le stock_compte === stock_theorique : marked counted, adjusted reste false.
 * Si écart : PUT AppPOS + adjusted: true en une seule opération.
 */
export async function countAndAdjustProduct(
	pb: PocketBase,
	entry: InventoryEntry,
	stockCompte: number,
	updateAppPosStock: (productId: string, stock: number) => Promise<unknown>,
): Promise<{ entry: InventoryEntry; adjusted: boolean; error?: string }> {
	if (stockCompte < 0)
		throw new Error('Le stock compté ne peut pas être négatif')

	const hasGap = stockCompte !== entry.stock_theorique

	// 1. Toujours mettre à jour PocketBase
	const updated = await pb
		.collection(INVENTORY_ENTRIES_COLLECTION)
		.update<InventoryEntry>(entry.id, {
			stock_compte: stockCompte,
			status: 'counted',
			counted_at: new Date().toISOString(),
			// On remet adjusted à false si la valeur a changé par rapport à avant
			adjusted: false,
			adjusted_at: null,
		})

	// 2. Si écart → ajuster AppPOS immédiatement
	if (hasGap) {
		try {
			await updateAppPosStock(entry.product_id, stockCompte)
			const adjustedEntry = await pb
				.collection(INVENTORY_ENTRIES_COLLECTION)
				.update<InventoryEntry>(entry.id, {
					adjusted: true,
					adjusted_at: new Date().toISOString(),
				})
			return { entry: adjustedEntry, adjusted: true }
		} catch (err: any) {
			// L'ajustement AppPOS a échoué — on retourne l'entrée comptée sans adjusted
			return {
				entry: updated,
				adjusted: false,
				error: err?.message ?? 'Erreur ajustement AppPOS',
			}
		}
	}

	return { entry: updated, adjusted: false }
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

/**
 * Récupère un résumé de progression d'une session pour l'affichage en card.
 * Charge uniquement les champs nécessaires (fields) pour limiter la charge réseau.
 */
export async function getSessionProgress(
	pb: PocketBase,
	sessionId: string,
): Promise<{
	total: number
	counted: number
	categoryNames: string[]
}> {
	try {
		const records = await pb
			.collection(INVENTORY_ENTRIES_COLLECTION)
			.getFullList<Pick<InventoryEntry, 'status' | 'category_name'>>(500, {
				filter: `session_id ~ "${sessionId}"`,
				fields: 'status,category_name',
				$autoCancel: false,
			})

		const total = records.length
		const counted = records.filter((r) => r.status === 'counted').length
		const categoryNames = [
			...new Set(records.map((r) => r.category_name)),
		].sort()

		return { total, counted, categoryNames }
	} catch {
		return { total: 0, counted: 0, categoryNames: [] }
	}
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

/**
 * Récupère les entrées d'une session clôturée pour affichage dans l'historique.
 * Triées par catégorie puis par nom produit — seulement les produits comptés.
 */
export async function getInventoryEntriesForHistory(
	pb: PocketBase,
	sessionId: string,
): Promise<InventoryEntry[]> {
	const records = await pb
		.collection(INVENTORY_ENTRIES_COLLECTION)
		.getFullList<InventoryEntry>(500, {
			filter: `session_id ~ "${sessionId}" && status = "counted"`,
			sort: 'category_name,product_name',
			$autoCancel: false,
		})
	return records
}
