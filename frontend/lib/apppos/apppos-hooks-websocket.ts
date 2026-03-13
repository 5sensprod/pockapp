// frontend/lib/apppos/apppos-hooks-websocket.ts

import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { AppPosProduct } from './apppos-types'
import { appPosWebSocket } from './apppos-websocket'

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXTE :
// Le cache React Query pour ['apppos', 'products', 'catalog'] contient des
// objets déjà transformés par appPosTransformers.product() :
//   - _id       → id          (string)
//   - stock     → stock_quantity (number)
//
// Le patch WebSocket DOIT donc :
//   1. Identifier le produit par son champ "id" (pas "_id")
//   2. Mettre à jour "stock_quantity" (pas "stock")
//
// Le useMemo de useAppPosProducts lit catalogQuery.data — dès que le cache
// est patché, le tableau filtré/paginé se recalcule automatiquement. ✅
// ─────────────────────────────────────────────────────────────────────────────

// Shape du produit tel qu'il est stocké dans le cache (après transformation)
type CachedProduct = {
	id: string // ← converti depuis _id par le transformer
	stock_quantity: number // ← converti depuis stock par le transformer
	[key: string]: unknown
}

// Shape brute AppPOS (avant transformation) — peut aussi se trouver dans d'autres caches
type AnyProduct = AppPosProduct & { id?: string }

type ProductsDataShape =
	| { items: CachedProduct[] }
	| { data: CachedProduct[] }
	| { success: boolean; data: CachedProduct[] }
	| CachedProduct[]
	| CachedProduct
	| unknown

// Résout l'id quel que soit le format (transformé ou brut)
const getProductId = (p: AnyProduct | CachedProduct): string | undefined => {
	if ('id' in p && p.id) return p.id as string
	if ('_id' in p && (p as AnyProduct)._id) return (p as AnyProduct)._id
	return undefined
}

// Patch un tableau : met à jour stock_quantity ET stock pour couvrir les deux shapes
function patchArray(
	arr: (CachedProduct | AnyProduct)[],
	productId: string,
	newStock: number,
) {
	let hits = 0
	const next = arr.map((p) => {
		if (getProductId(p) === productId) {
			hits++
			return {
				...p,
				stock_quantity: newStock, // shape transformée (cache catalog)
				stock: newStock, // shape brute (autres caches éventuels)
			}
		}
		return p
	})
	return { next, hits }
}

function patchProductsData(
	oldData: ProductsDataShape,
	productId: string,
	newStock: number,
): ProductsDataShape {
	if (!oldData) return oldData

	// { items: [...] }
	if (typeof oldData === 'object' && oldData !== null && 'items' in oldData) {
		const od = oldData as { items: (CachedProduct | AnyProduct)[] }
		if (!Array.isArray(od.items)) return oldData
		const { next, hits } = patchArray(od.items, productId, newStock)
		return hits > 0 ? { ...od, items: next } : oldData
	}

	// { data: [...] }
	if (typeof oldData === 'object' && oldData !== null && 'data' in oldData) {
		const od = oldData as { data: (CachedProduct | AnyProduct)[] }
		if (!Array.isArray(od.data)) return oldData
		const { next, hits } = patchArray(od.data, productId, newStock)
		return hits > 0 ? { ...od, data: next } : oldData
	}

	// Array direct
	if (Array.isArray(oldData)) {
		const { next, hits } = patchArray(
			oldData as (CachedProduct | AnyProduct)[],
			productId,
			newStock,
		)
		return hits > 0 ? next : oldData
	}

	// Produit unique
	if (typeof oldData === 'object' && oldData !== null) {
		const p = oldData as CachedProduct | AnyProduct
		if (getProductId(p) === productId) {
			return {
				...p,
				stock_quantity: newStock,
				stock: newStock,
			}
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

export function useAppPosStockUpdates(
	options: {
		enabled?: boolean
		onStockUpdate?: (productId: string, newStock: number) => void
	} = {},
) {
	const { enabled = true, onStockUpdate } = options
	const queryClient = useQueryClient()

	useEffect(() => {
		if (!enabled) return undefined

		appPosWebSocket.connect()

		const unsubscribe = appPosWebSocket.subscribe((event) => {
			let productId: string | undefined
			let newStock: number | undefined

			if (event.type === 'products.updated') {
				// entityId = _id côté AppPOS (avant transformation)
				productId = event.data.entityId ?? event.data.data?._id
				newStock = event.data.data?.stock
			} else if (event.type === 'stock.updated') {
				productId = event.data.productId
				newStock = event.data.newStock
			} else {
				return
			}

			if (!productId || typeof newStock !== 'number') return

			// Le cache 'catalog' stocke l'id transformé (= _id original d'AppPOS)
			// donc productId reçu du WS correspond bien à id dans le cache. ✅

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
				const next = patchProductsData(prev, productId, newStock)

				if (next !== prev) {
					patched++
					queryClient.setQueryData(key, next)
				}
			}

			console.log('✅ [RQ PATCH] patched queries:', patched, {
				productId,
				newStock,
			})

			if (patched === 0) {
				console.warn(
					'⚠️ [RQ PATCH] Aucun cache patché — vérifier que productId correspond bien au champ "id" dans le cache:',
					productId,
				)
			}

			onStockUpdate?.(productId, newStock)
		})

		return () => {
			unsubscribe()
		}
	}, [enabled, onStockUpdate, queryClient])

	return { isConnected: appPosWebSocket.isConnected() }
}
