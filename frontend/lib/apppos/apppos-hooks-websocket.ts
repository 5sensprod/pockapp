// frontend/lib/apppos/apppos-hooks-websocket.ts

import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { AppPosProduct } from './apppos-types'
import { appPosWebSocket } from './apppos-websocket'

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXTE :
// Le cache React Query contient des objets transformés par transformAppPosProduct().
// Le patch WebSocket DOIT utiliser les noms de champs transformés, pas les noms bruts.
//
// Mapping brut AppPOS → cache transformé (transformAppPosProduct) :
//   _id            → id
//   price          → price_ttc
//   price (calc)   → price_ht  (calculé)
//   purchase_price → cost_price
//   tax_rate       → tva_rate  (Number())
//   image.src      → images    (string)
//   stock          → stock_quantity
//   min_stock      → stock_min
//   status         → active    (boolean: status === 'publish')
//   brand_id       → brand
//   supplier_id    → supplier
//   meta_data      → barcode   (extrait par clé 'barcode' ou 'ean')
//
// Stratégie par type d'event :
//   products.updated → patch partiel du cache (champs transformés)
//   products.created → invalidateQueries → refetch automatique
//   products.deleted → invalidateQueries → refetch automatique
//   stock.updated    → patch minimal stock (fallback)
// ─────────────────────────────────────────────────────────────────────────────

// Shape du produit tel qu'il est stocké dans le cache (après transformation)
type CachedProduct = {
	id: string
	[key: string]: unknown
}

// Shape brute AppPOS (avant transformation)
type AnyProduct = AppPosProduct & { id?: string }

type ProductsDataShape =
	| { items: CachedProduct[] }
	| { data: CachedProduct[] }
	| { success: boolean; data: CachedProduct[] }
	| CachedProduct[]
	| CachedProduct
	| unknown

// ─────────────────────────────────────────────────────────────────────────────
// Construit un patch partiel depuis le produit brut reçu par le WebSocket.
// Les noms de champs correspondent EXACTEMENT à ceux produits par
// transformAppPosProduct() — c'est la shape stockée dans le cache React Query.
// Pour ajouter un nouveau champ à synchroniser : ajouter une ligne ici.
// ─────────────────────────────────────────────────────────────────────────────
function buildPatchFromRaw(raw: AppPosProduct): Partial<CachedProduct> {
	const patch: Partial<CachedProduct> = {}

	// Identité
	if (raw.name !== undefined) patch.name = raw.name
	if (raw.designation !== undefined) patch.designation = raw.designation
	if (raw.description !== undefined) patch.description = raw.description
	if (raw.sku !== undefined) patch.sku = raw.sku
	if (raw.status !== undefined) patch.active = raw.status === 'publish'

	// Barcode — extrait depuis meta_data comme dans transformAppPosProduct()
	if (raw.meta_data !== undefined) {
		const barcodeEntry = raw.meta_data.find(
			(m) => m.key === 'barcode' || m.key === 'ean',
		)
		patch.barcode = barcodeEntry?.value ?? ''
	}

	// Prix — noms transformés par transformAppPosProduct()
	if (raw.price !== undefined) {
		patch.price_ttc = raw.price
		// Recalcule price_ht comme le transformer
		if (raw.tax_rate !== undefined) {
			patch.price_ht = raw.price / (1 + Number(raw.tax_rate) / 100)
		}
	}
	if (raw.purchase_price !== undefined) patch.cost_price = raw.purchase_price
	if (raw.tax_rate !== undefined) patch.tva_rate = Number(raw.tax_rate)
	// Champs prix non renommés par le transformer
	if (raw.regular_price !== undefined) patch.regular_price = raw.regular_price
	if (raw.sale_price !== undefined) patch.sale_price = raw.sale_price
	if (raw.margin_rate !== undefined) patch.margin_rate = raw.margin_rate
	if (raw.margin_amount !== undefined) patch.margin_amount = raw.margin_amount
	if (raw.promo_rate !== undefined) patch.promo_rate = raw.promo_rate
	if (raw.promo_amount !== undefined) patch.promo_amount = raw.promo_amount

	// Stock — noms transformés par transformAppPosProduct()
	if (typeof raw.stock === 'number') {
		patch.stock_quantity = raw.stock
		patch.stock = raw.stock // garde aussi le nom brut (autres caches)
	}
	if (raw.min_stock !== undefined) patch.stock_min = raw.min_stock
	if (raw.manage_stock !== undefined) patch.manage_stock = raw.manage_stock

	// Image — le transformer extrait image.src → images (string)
	if (raw.image !== undefined) {
		patch.images = raw.image?.src || ''
		patch.image = raw.image // garde l'objet complet pour les autres caches
	}
	if (raw.gallery_images !== undefined)
		patch.gallery_images = raw.gallery_images

	// Relations — noms transformés par transformAppPosProduct()
	if (raw.brand_id !== undefined) patch.brand = raw.brand_id
	if (raw.supplier_id !== undefined) patch.supplier = raw.supplier_id
	if (raw.categories !== undefined) patch.categories = raw.categories
	if (raw.category_id !== undefined) patch.category_id = raw.category_id

	// Statistiques de vente
	if (raw.total_sold !== undefined) patch.total_sold = raw.total_sold
	if (raw.sales_count !== undefined) patch.sales_count = raw.sales_count
	if (raw.last_sold_at !== undefined) patch.last_sold_at = raw.last_sold_at
	if (raw.revenue_total !== undefined) patch.revenue_total = raw.revenue_total

	return patch
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de patch du cache
// ─────────────────────────────────────────────────────────────────────────────

// Résout l'id quel que soit le format (transformé ou brut)
const getProductId = (p: AnyProduct | CachedProduct): string | undefined => {
	if ('id' in p && p.id) return p.id as string
	if ('_id' in p && (p as AnyProduct)._id) return (p as AnyProduct)._id
	return undefined
}

// Patch un tableau : merge le patch partiel sur le produit correspondant
function patchArray(
	arr: (CachedProduct | AnyProduct)[],
	productId: string,
	patch: Partial<CachedProduct>,
) {
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

	// { items: [...] }
	if (typeof oldData === 'object' && oldData !== null && 'items' in oldData) {
		const od = oldData as { items: (CachedProduct | AnyProduct)[] }
		if (!Array.isArray(od.items)) return oldData
		const { next, hits } = patchArray(od.items, productId, patch)
		return hits > 0 ? { ...od, items: next } : oldData
	}

	// { data: [...] }
	if (typeof oldData === 'object' && oldData !== null && 'data' in oldData) {
		const od = oldData as { data: (CachedProduct | AnyProduct)[] }
		if (!Array.isArray(od.data)) return oldData
		const { next, hits } = patchArray(od.data, productId, patch)
		return hits > 0 ? { ...od, data: next } : oldData
	}

	// Array direct
	if (Array.isArray(oldData)) {
		const { next, hits } = patchArray(
			oldData as (CachedProduct | AnyProduct)[],
			productId,
			patch,
		)
		return hits > 0 ? next : oldData
	}

	// Produit unique
	if (typeof oldData === 'object' && oldData !== null) {
		const p = oldData as CachedProduct | AnyProduct
		if (getProductId(p) === productId) {
			return { ...p, ...patch }
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

// ─────────────────────────────────────────────────────────────────────────────
// Hook principal
// ─────────────────────────────────────────────────────────────────────────────

export function useAppPosProductUpdates(
	options: {
		enabled?: boolean
		onStockUpdate?: (productId: string, newStock: number) => void
		onProductUpdate?: (productId: string, patch: Partial<CachedProduct>) => void
		onProductCreated?: () => void
		onProductDeleted?: (productId: string) => void
	} = {},
) {
	const {
		enabled = true,
		onStockUpdate,
		onProductUpdate,
		onProductCreated,
		onProductDeleted,
	} = options
	const queryClient = useQueryClient()

	useEffect(() => {
		if (!enabled) return undefined

		appPosWebSocket.connect()

		const unsubscribe = appPosWebSocket.subscribe((event) => {
			// ── Création : on invalide, React Query refetch tout seul ────────
			if (event.type === 'products.created') {
				console.log('🆕 [RQ] products.created → invalidateQueries')
				queryClient.invalidateQueries({ queryKey: ['apppos', 'products'] })
				onProductCreated?.()
				return
			}

			// ── Suppression : idem ───────────────────────────────────────────
			if (event.type === 'products.deleted') {
				console.log(
					'🗑️ [RQ] products.deleted → invalidateQueries',
					event.data.entityId,
				)
				queryClient.invalidateQueries({ queryKey: ['apppos', 'products'] })
				onProductDeleted?.(event.data.entityId)
				return
			}

			// ── Mise à jour : patch chirurgical du cache ─────────────────────
			let productId: string | undefined
			let patch: Partial<CachedProduct> | undefined

			if (event.type === 'products.updated') {
				const raw = event.data.data
				// entityId = _id côté AppPOS (avant transformation)
				productId = event.data.entityId ?? raw?._id

				if (raw) {
					patch = buildPatchFromRaw(raw)
				}
			} else if (event.type === 'stock.updated') {
				// Fallback minimal si products.updated n'est pas émis
				productId = event.data.productId
				patch = {
					stock_quantity: event.data.newStock,
					stock: event.data.newStock,
				}
			} else {
				return
			}

			if (!productId || !patch || Object.keys(patch).length === 0) return

			const candidates = queryClient
				.getQueryCache()
				.getAll()
				.filter((q) => isProductsQueryKey(q.queryKey))

			console.log(
				'🧩 [RQ PATCH] candidates:',
				candidates.map((q) => q.queryKey),
			)

			let patched = 0

			for (const q of candidates) {
				const key = q.queryKey
				const prev = queryClient.getQueryData<ProductsDataShape>(key)
				const next = patchProductsData(prev, productId, patch)

				if (next !== prev) {
					patched++
					queryClient.setQueryData(key, next)
				}
			}

			console.log('✅ [RQ PATCH] patched queries:', patched, {
				productId,
				patch,
			})

			if (patched === 0) {
				console.warn(
					'⚠️ [RQ PATCH] Aucun cache patché — vérifier que productId correspond bien au champ "id" dans le cache:',
					productId,
				)
			}

			onProductUpdate?.(productId, patch)

			// Rétrocompatibilité : callback stock-only
			if (typeof patch.stock_quantity === 'number') {
				onStockUpdate?.(productId, patch.stock_quantity as number)
			}
		})

		return () => {
			unsubscribe()
		}
	}, [
		enabled,
		onStockUpdate,
		onProductUpdate,
		onProductCreated,
		onProductDeleted,
		queryClient,
	])

	return { isConnected: appPosWebSocket.isConnected() }
}

// Alias rétrocompatible pour les imports existants
export const useAppPosStockUpdates = useAppPosProductUpdates
