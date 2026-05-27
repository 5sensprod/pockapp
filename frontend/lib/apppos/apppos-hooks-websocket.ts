// frontend/lib/apppos/apppos-hooks-websocket.ts
//
// ARCHITECTURE
// ─────────────────────────────────────────────────────────────────────────────
// 1. Reçoit tous les events AppPOS via WebSocket
// 2. Patche le cache React Query chirurgicalement (products.updated)
//    ou invalide (products.created / deleted / categories / suppliers)
// 3. Relaie optionnellement les events produits via broadcastInvalidate()
//    pour que TOUS les clients PocketApp (navigateurs distants) soient
//    synchronisés — pas seulement le client Wails connecté au WS AppPOS.
//
// MAPPING _id → id
// ─────────────────────────────────────────────────────────────────────────────
// AppPOS stocke les produits avec `_id` (NeDB).
// Le transformer appPosTransformers.product() renomme `_id` → `id`.
// Dans le cache React Query, on cherche donc par `p.id`.
// `entityId` reçu via WS = valeur brute de `_id` → doit correspondre à `p.id`.
//
// SUPPRESSION du stock.updated synthétique
// ─────────────────────────────────────────────────────────────────────────────
// apppos-websocket.ts n'émet plus de stock.updated en doublon.
// products.updated contient déjà le stock complet dans `data.stock`.

import { broadcastInvalidate } from '@/lib/presence/broadcast'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { AppPosProduct } from './apppos-types'
import type { AppPosWebSocketEvent } from './apppos-websocket'
import { appPosWebSocket } from './apppos-websocket'

// ─── Types internes ───────────────────────────────────────────────────────────

/** Produit tel qu'il est stocké dans le cache après transformation */
type CachedProduct = { id: string; [key: string]: unknown }

/** Produit brut AppPOS (avant transformation) */
type RawProduct = AppPosProduct & { id?: string }

type ProductsDataShape =
	| { items: CachedProduct[] }
	| { data: CachedProduct[] }
	| CachedProduct[]
	| CachedProduct
	| unknown

// ─── buildPatchFromRaw ────────────────────────────────────────────────────────
//
// Construit un patch partiel depuis le produit brut reçu par le WebSocket.
// Les noms correspondent EXACTEMENT aux champs produits par transformAppPosProduct().
// Pour ajouter un champ à synchroniser : ajouter une ligne ici ET dans le transformer.

function buildPatchFromRaw(raw: AppPosProduct): Partial<CachedProduct> {
	const patch: Partial<CachedProduct> = {}

	// ── Identité ────────────────────────────────────────────────────────────
	if (raw.name !== undefined) patch.name = raw.name
	if (raw.designation !== undefined) patch.designation = raw.designation
	if (raw.description !== undefined) patch.description = raw.description
	if (raw.sku !== undefined) patch.sku = raw.sku

	// active = status === 'publish' (comme dans le transformer)
	if (raw.status !== undefined) patch.active = raw.status === 'publish'

	// ── Barcode — extrait depuis meta_data ───────────────────────────────────
	if (raw.meta_data !== undefined) {
		const entry = raw.meta_data.find(
			(m) => m.key === 'barcode' || m.key === 'ean',
		)
		patch.barcode = entry?.value ?? ''
	}

	// ── Prix ─────────────────────────────────────────────────────────────────
	if (raw.price !== undefined) {
		patch.price_ttc = raw.price
		if (raw.tax_rate !== undefined) {
			patch.price_ht = raw.price / (1 + Number(raw.tax_rate) / 100)
		}
	}
	if (raw.purchase_price !== undefined) patch.cost_price = raw.purchase_price
	if (raw.tax_rate !== undefined) patch.tva_rate = Number(raw.tax_rate)
	if (raw.regular_price !== undefined) patch.regular_price = raw.regular_price
	if (raw.sale_price !== undefined) patch.sale_price = raw.sale_price
	if (raw.margin_rate !== undefined) patch.margin_rate = raw.margin_rate
	if (raw.margin_amount !== undefined) patch.margin_amount = raw.margin_amount
	if (raw.promo_rate !== undefined) patch.promo_rate = raw.promo_rate
	if (raw.promo_amount !== undefined) patch.promo_amount = raw.promo_amount

	// ── Stock ─────────────────────────────────────────────────────────────────
	// Le transformer renomme `stock` → `stock_quantity`
	// On met les deux pour couvrir les caches qui n'ont pas été transformés
	if (typeof raw.stock === 'number') {
		patch.stock_quantity = raw.stock
		patch.stock = raw.stock
	}
	if (raw.min_stock !== undefined) patch.stock_min = raw.min_stock
	if (raw.manage_stock !== undefined) patch.manage_stock = raw.manage_stock

	// ── Image ─────────────────────────────────────────────────────────────────
	// Le transformer extrait image.src → images (string)
	if (raw.image !== undefined) {
		patch.images = raw.image?.src ?? ''
		patch.image = raw.image
	}
	if (raw.gallery_images !== undefined)
		patch.gallery_images = raw.gallery_images

	// ── Relations ─────────────────────────────────────────────────────────────
	if (raw.brand_id !== undefined) patch.brand = raw.brand_id
	if (raw.supplier_id !== undefined) patch.supplier = raw.supplier_id
	if (raw.categories !== undefined) patch.categories = raw.categories
	if (raw.category_id !== undefined) patch.category_id = raw.category_id

	// refs enrichies (présentes dans le produit retourné par getAll via findByIdWithCategoryInfo)
	if (raw.brand_ref !== undefined) patch.brand_ref = raw.brand_ref
	if (raw.supplier_ref !== undefined) patch.supplier_ref = raw.supplier_ref
	if (raw.categories_refs !== undefined)
		patch.categories_refs = raw.categories_refs

	// ── Stats ventes ──────────────────────────────────────────────────────────
	if (raw.total_sold !== undefined) patch.total_sold = raw.total_sold
	if (raw.sales_count !== undefined) patch.sales_count = raw.sales_count
	if (raw.last_sold_at !== undefined) patch.last_sold_at = raw.last_sold_at
	if (raw.revenue_total !== undefined) patch.revenue_total = raw.revenue_total

	return patch
}

// ─── Helpers cache ────────────────────────────────────────────────────────────

/**
 * Résout l'id d'un produit, quelle que soit sa forme (transformé ou brut).
 *
 * Dans le cache React Query, le produit est transformé → `id` (string).
 * `entityId` reçu via WS = `_id` NeDB brut → doit correspondre à `p.id`
 * après transformation.
 */
function getProductId(p: CachedProduct | RawProduct): string | undefined {
	if ('id' in p && p.id) return String(p.id)
	if ('_id' in p && (p as RawProduct)._id) return String((p as RawProduct)._id)
	return undefined
}

function patchArray(
	arr: (CachedProduct | RawProduct)[],
	productId: string,
	patch: Partial<CachedProduct>,
): { next: (CachedProduct | RawProduct)[]; hits: number } {
	let hits = 0
	const next = arr.map((p) => {
		if (getProductId(p) === productId) {
			hits++
			return { ...p, ...patch }
		}
		return p
	})
	return { next, hits }
}

function patchProductsData(
	oldData: ProductsDataShape,
	productId: string,
	patch: Partial<CachedProduct>,
): ProductsDataShape {
	if (!oldData) return oldData

	// { items: [...] }  ← format useAppPosProducts
	if (
		typeof oldData === 'object' &&
		!Array.isArray(oldData) &&
		'items' in (oldData as object)
	) {
		const od = oldData as { items: (CachedProduct | RawProduct)[] }
		if (!Array.isArray(od.items)) return oldData
		const { next, hits } = patchArray(od.items, productId, patch)
		return hits > 0 ? { ...od, items: next } : oldData
	}

	// { data: [...] }
	if (
		typeof oldData === 'object' &&
		!Array.isArray(oldData) &&
		'data' in (oldData as object)
	) {
		const od = oldData as { data: (CachedProduct | RawProduct)[] }
		if (!Array.isArray(od.data)) return oldData
		const { next, hits } = patchArray(od.data, productId, patch)
		return hits > 0 ? { ...od, data: next } : oldData
	}

	// Array direct
	if (Array.isArray(oldData)) {
		const { next, hits } = patchArray(
			oldData as (CachedProduct | RawProduct)[],
			productId,
			patch,
		)
		return hits > 0 ? next : oldData
	}

	// Produit unique (cache useAppPosProduct)
	if (typeof oldData === 'object' && oldData !== null) {
		if (getProductId(oldData as CachedProduct) === productId) {
			return { ...(oldData as object), ...patch }
		}
	}

	return oldData
}

function isProductsQueryKey(queryKey: unknown): boolean {
	return (
		Array.isArray(queryKey) &&
		queryKey.length >= 2 &&
		queryKey[0] === 'apppos' &&
		queryKey[1] === 'products'
	)
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export interface UseAppPosProductUpdatesOptions {
	enabled?: boolean

	/**
	 * Si true, relaie les invalidations produits via broadcastInvalidate()
	 * → tous les clients PocketApp (navigateurs distants) sont aussi synchronisés.
	 * À activer sur le client Wails "principal" uniquement pour éviter les boucles.
	 * @default false
	 */
	broadcastToPocketApp?: boolean

	// Callbacks optionnels
	onProductUpdate?: (productId: string, patch: Partial<CachedProduct>) => void
	onProductCreated?: () => void
	onProductDeleted?: (productId: string) => void

	// Events non-produits
	onCategoriesChanged?: () => void
	onSuppliersChanged?: () => void
	onStockStatisticsChanged?: (data: unknown) => void
	onCashierSessionChanged?: (
		data: AppPosWebSocketEvent & { type: 'cashier_session.status.changed' },
	) => void
	onCashierStatsUpdated?: (
		data: AppPosWebSocketEvent & { type: 'cashier_session.stats.updated' },
	) => void
	onDrawerMovement?: (
		data: AppPosWebSocketEvent & { type: 'cashier_drawer.movement.added' },
	) => void
	onLcdChanged?: (type: string, data: unknown) => void
}

export function useAppPosProductUpdates(
	options: UseAppPosProductUpdatesOptions = {},
) {
	const {
		enabled = true,
		broadcastToPocketApp = false,
		onProductUpdate,
		onProductCreated,
		onProductDeleted,
		onCategoriesChanged,
		onSuppliersChanged,
		onStockStatisticsChanged,
		onCashierSessionChanged,
		onCashierStatsUpdated,
		onDrawerMovement,
		onLcdChanged,
	} = options

	const queryClient = useQueryClient()

	useEffect(() => {
		if (!enabled) return undefined

		appPosWebSocket.connect()

		const unsubscribe = appPosWebSocket.subscribe((event) => {
			// ── Création ────────────────────────────────────────────────────────────
			if (event.type === 'products.created') {
				console.log('🆕 [RQ] products.created → invalidate catalog')
				queryClient.invalidateQueries({
					queryKey: ['apppos', 'products', 'catalog'],
				})
				if (broadcastToPocketApp) {
					void broadcastInvalidate(['apppos', 'products'])
				}
				onProductCreated?.()
				return
			}

			// ── Suppression ─────────────────────────────────────────────────────────
			if (event.type === 'products.deleted') {
				const productId = event.data.entityId
				console.log('🗑️ [RQ] products.deleted → invalidate catalog', productId)
				queryClient.invalidateQueries({
					queryKey: ['apppos', 'products', 'catalog'],
				})
				// Invalider aussi le cache du produit individuel
				queryClient.removeQueries({
					queryKey: ['apppos', 'products', productId],
				})
				if (broadcastToPocketApp) {
					void broadcastInvalidate(['apppos', 'products'])
				}
				onProductDeleted?.(productId)
				return
			}

			// ── Mise à jour — patch chirurgical ──────────────────────────────────────
			if (event.type === 'products.updated') {
				const raw = event.data.data
				// entityId = _id NeDB brut = ce qui a été passé à notifyEntityUpdated(entityType, id, data)
				// Après transformation, le cache stocke ce même id sous p.id → le mapping est direct.
				const productId = event.data.entityId ?? raw?._id

				if (!productId) {
					console.warn('⚠️ [RQ PATCH] products.updated sans entityId — ignoré')
					return
				}

				const patch = buildPatchFromRaw(raw)

				if (Object.keys(patch).length === 0) {
					console.warn('⚠️ [RQ PATCH] patch vide pour', productId)
					return
				}

				// Parcourir tous les caches apppos/products/...
				const candidates = queryClient
					.getQueryCache()
					.getAll()
					.filter((q) => isProductsQueryKey(q.queryKey))

				let patched = 0
				for (const q of candidates) {
					const prev = queryClient.getQueryData<ProductsDataShape>(q.queryKey)
					const next = patchProductsData(prev, productId, patch)
					if (next !== prev) {
						patched++
						queryClient.setQueryData(q.queryKey, next)
					}
				}

				if (patched > 0) {
					console.log(
						'✅ [RQ PATCH] patched',
						patched,
						'queries pour produit',
						productId,
					)
				} else {
					// Produit non trouvé dans le cache → peut-être pas encore chargé
					// On invalide le catalogue pour forcer un refetch propre
					console.warn(
						'⚠️ [RQ PATCH] Produit introuvable dans le cache, invalidation catalogue',
						productId,
					)
					queryClient.invalidateQueries({
						queryKey: ['apppos', 'products', 'catalog'],
					})
				}

				// Optionnel : broadcast vers les autres clients PocketApp
				if (broadcastToPocketApp) {
					void broadcastInvalidate(['apppos', 'products'])
				}

				onProductUpdate?.(productId, patch)
				return
			}

			// ── Catégories / fournisseurs ────────────────────────────────────────────
			if (event.type === 'categories.tree.changed') {
				console.log('🌳 [RQ] categories.tree.changed → invalidate')
				queryClient.invalidateQueries({ queryKey: ['apppos', 'categories'] })
				if (broadcastToPocketApp) {
					void broadcastInvalidate(['apppos', 'categories'])
				}
				onCategoriesChanged?.()
				return
			}

			if (event.type === 'suppliers.tree.changed') {
				console.log('🌳 [RQ] suppliers.tree.changed → invalidate')
				queryClient.invalidateQueries({ queryKey: ['apppos', 'suppliers'] })
				if (broadcastToPocketApp) {
					void broadcastInvalidate(['apppos', 'suppliers'])
				}
				onSuppliersChanged?.()
				return
			}

			// ── Stats stock ───────────────────────────────────────────────────────────
			if (event.type === 'stock.statistics.changed') {
				onStockStatisticsChanged?.(event.data.data)
				return
			}

			// ── Session caisse ────────────────────────────────────────────────────────
			if (event.type === 'cashier_session.status.changed') {
				onCashierSessionChanged?.(event)
				return
			}

			if (event.type === 'cashier_session.stats.updated') {
				onCashierStatsUpdated?.(event)
				return
			}

			// ── Tiroir caisse ─────────────────────────────────────────────────────────
			if (event.type === 'cashier_drawer.movement.added') {
				onDrawerMovement?.(event)
				return
			}

			// ── LCD ───────────────────────────────────────────────────────────────────
			if (
				event.type === 'lcd.ownership.changed' ||
				event.type === 'lcd.connection.lost' ||
				event.type === 'lcd.connection.restored' ||
				event.type === 'lcd.connection.failed'
			) {
				onLcdChanged?.(event.type, event.data)
				return
			}
		})

		return () => {
			unsubscribe()
		}
	}, [
		enabled,
		broadcastToPocketApp,
		onProductUpdate,
		onProductCreated,
		onProductDeleted,
		onCategoriesChanged,
		onSuppliersChanged,
		onStockStatisticsChanged,
		onCashierSessionChanged,
		onCashierStatsUpdated,
		onDrawerMovement,
		onLcdChanged,
		queryClient,
	])

	return { isConnected: appPosWebSocket.isConnected() }
}

// Alias rétrocompatible
export const useAppPosStockUpdates = useAppPosProductUpdates
