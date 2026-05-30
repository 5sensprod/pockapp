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
// 4. Journalise les modifications produit dans product_events (PocketBase)
//    quand pb est fourni — uniquement pour les modifs UI AppPOS (source undefined).
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
import { createProductEvents } from '@/lib/product-events/product-events-pocketbase'
import { buildProductEvents } from '@/lib/product-events/product-events-types'
import { useQueryClient } from '@tanstack/react-query'
import type PocketBase from 'pocketbase'
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

// ─── findProductInCache ───────────────────────────────────────────────────────
//
// Extrait un produit depuis n'importe quelle forme de cache RQ.
// Utilisé pour capturer le "before" avant que patchProductsData l'écrase.

function findProductInCache(
	data: ProductsDataShape,
	productId: string,
): CachedProduct | null {
	if (!data) return null

	if (
		typeof data === 'object' &&
		!Array.isArray(data) &&
		'items' in (data as object)
	) {
		const arr = (data as { items: CachedProduct[] }).items
		return arr?.find((p) => getProductId(p) === productId) ?? null
	}

	if (
		typeof data === 'object' &&
		!Array.isArray(data) &&
		'data' in (data as object)
	) {
		const arr = (data as { data: CachedProduct[] }).data
		return arr?.find((p) => getProductId(p) === productId) ?? null
	}

	if (Array.isArray(data)) {
		return (
			(data as CachedProduct[]).find((p) => getProductId(p) === productId) ??
			null
		)
	}

	if (typeof data === 'object' && data !== null) {
		const p = data as CachedProduct
		if (getProductId(p) === productId) return p
	}

	return null
}

// ─── journalizeAppPosUpdate ───────────────────────────────────────────────────
//
// Crée les product_events pour une modification UI AppPOS (source undefined).
// Appelé APRÈS le patch du cache, avec before capturé juste avant.
// Best-effort : ne throw jamais.

async function journalizeAppPosUpdate(
	pb: PocketBase,
	productId: string,
	before: CachedProduct,
	patch: Partial<CachedProduct>,
): Promise<void> {
	try {
		// Reconstituer les champs "after" depuis le before + patch
		const after = { ...before, ...patch }

		const events = buildProductEvents({
			productId,
			productNameSnapshot: String(after.name ?? before.name ?? ''),
			productSkuSnapshot: String(after.sku ?? before.sku ?? ''),
			// designation utilisée comme label d'identification si sku vide
			before: {
				stock:
					typeof before.stock_quantity === 'number'
						? before.stock_quantity
						: typeof before.stock === 'number'
							? before.stock
							: undefined,
				price_ttc:
					typeof before.price_ttc === 'number' ? before.price_ttc : undefined,
				cost_price:
					typeof before.cost_price === 'number' ? before.cost_price : undefined,
				name: typeof before.name === 'string' ? before.name : undefined,
				designation:
					typeof before.designation === 'string'
						? before.designation
						: undefined,
				category_id:
					typeof before.category_id === 'string'
						? before.category_id
						: undefined,
				sku: typeof before.sku === 'string' ? before.sku : undefined,
				barcode:
					typeof before.barcode === 'string' ? before.barcode : undefined,
			},
			after: {
				stock:
					typeof after.stock_quantity === 'number'
						? after.stock_quantity
						: typeof after.stock === 'number'
							? after.stock
							: undefined,
				price_ttc:
					typeof after.price_ttc === 'number' ? after.price_ttc : undefined,
				cost_price:
					typeof after.cost_price === 'number' ? after.cost_price : undefined,
				name: typeof after.name === 'string' ? after.name : undefined,
				designation:
					typeof after.designation === 'string' ? after.designation : undefined,
				category_id:
					typeof after.category_id === 'string' ? after.category_id : undefined,
				sku: typeof after.sku === 'string' ? after.sku : undefined,
				barcode: typeof after.barcode === 'string' ? after.barcode : undefined,
			},
			source: 'apppos_update',
			sourceId: null,
			operator: '',
		})

		if (events.length > 0) {
			await createProductEvents(pb, events)
			console.log(
				`[product_events] ${events.length} événement(s) journalisé(s) via WS pour ${productId}`,
			)
		}
	} catch (err: any) {
		console.warn(
			'[product_events] Échec journalisation WS apppos_update:',
			err?.message ?? err,
		)
	}
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

	/**
	 * Instance PocketBase — si fournie, les modifications UI AppPOS (source undefined)
	 * sont automatiquement journalisées dans product_events.
	 * Ventes (source='sale') et retours (source='return') sont exclus car déjà
	 * tracés par stock-utils.ts.
	 */
	pb?: PocketBase

	// Callbacks optionnels
	/**
	 * Appelé après chaque patch produit.
	 * source est présent uniquement si émis via entityUpdatedWithSource côté serveur :
	 *   'sale'   → décrémentation vente
	 *   'return' → retour client
	 *   undefined → modification produit classique (PUT)
	 */
	onProductUpdate?: (
		productId: string,
		patch: Partial<CachedProduct>,
		source?: string,
	) => void
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
		pb,
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
				const productId = event.data.entityId ?? raw?._id
				const source = event.data.source // undefined = modif UI AppPOS

				if (!productId) {
					console.warn('⚠️ [RQ PATCH] products.updated sans entityId — ignoré')
					return
				}

				const patch = buildPatchFromRaw(raw)

				if (Object.keys(patch).length === 0) {
					console.warn('⚠️ [RQ PATCH] patch vide pour', productId)
					return
				}

				// ── Capturer le "before" AVANT le patch du cache ──────────────────────
				// Nécessaire pour journaliser les diffs dans product_events.
				// On cherche dans le catalogue (clé la plus susceptible d'être chargée).
				let productBefore: CachedProduct | null = null
				if (pb && source === undefined) {
					const catalogData = queryClient.getQueryData<ProductsDataShape>([
						'apppos',
						'products',
						'catalog',
					])
					if (catalogData) {
						productBefore = findProductInCache(catalogData, productId)
					}
					// Fallback : chercher dans tous les caches products si pas dans catalog
					if (!productBefore) {
						const candidates = queryClient
							.getQueryCache()
							.getAll()
							.filter((q) => isProductsQueryKey(q.queryKey))
						for (const q of candidates) {
							const data = queryClient.getQueryData<ProductsDataShape>(
								q.queryKey,
							)
							const found = data ? findProductInCache(data, productId) : null
							if (found) {
								productBefore = found
								break
							}
						}
					}
				}

				// ── Patch chirurgical du cache ─────────────────────────────────────────
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
						source ? `(source: ${source})` : '(source: apppos_update)',
					)
				} else {
					console.warn(
						'⚠️ [RQ PATCH] Produit introuvable dans le cache, invalidation catalogue',
						productId,
					)
					queryClient.invalidateQueries({
						queryKey: ['apppos', 'products', 'catalog'],
					})
				}

				// ── Journalisation product_events ──────────────────────────────────────
				// Uniquement pour les modifs UI AppPOS (source === undefined).
				// Ventes (sale) et retours (return) sont déjà tracés par stock-utils.ts.
				if (pb && source === undefined && productBefore) {
					void journalizeAppPosUpdate(pb, productId, productBefore, patch)
				}

				// ── Broadcast vers les autres clients PocketApp ────────────────────────
				if (broadcastToPocketApp) {
					void broadcastInvalidate(['apppos', 'products'])
				}

				onProductUpdate?.(productId, patch, source)
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
		pb,
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
