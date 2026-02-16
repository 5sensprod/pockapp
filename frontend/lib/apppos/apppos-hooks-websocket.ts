// frontend/lib/apppos/apppos-hooks-websocket.ts

import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { AppPosProduct } from './apppos-types'
import { appPosWebSocket } from './apppos-websocket'

type AnyProduct = AppPosProduct & { id?: string }

type ProductsDataShape =
	| { items: AnyProduct[] }
	| { data: AnyProduct[] } // AppPosApiResponse<List>
	| { success: boolean; data: AnyProduct[] } // AppPosApiResponse<List> (autre variante)
	| AnyProduct[]
	| AnyProduct
	| unknown

const getProductId = (p: AnyProduct) => p._id ?? p.id

function patchArray(arr: AnyProduct[], productId: string, newStock: number) {
	let hits = 0
	const next = arr.map((p) => {
		if (getProductId(p) === productId) {
			hits++
			return { ...p, stock: newStock }
		}
		return p
	})
	return { next, hits }
}

function patchProductsData(
	oldData: ProductsDataShape,
	productId: string,
	newStock: number,
) {
	if (!oldData) return oldData

	// { items: [...] }
	if (typeof oldData === 'object' && oldData !== null && 'items' in oldData) {
		const od = oldData as { items: AnyProduct[] }
		if (!Array.isArray(od.items)) return oldData

		const { next, hits } = patchArray(od.items, productId, newStock)
		return hits > 0 ? { ...od, items: next } : oldData
	}

	// { data: [...] }
	if (typeof oldData === 'object' && oldData !== null && 'data' in oldData) {
		const od = oldData as { data: AnyProduct[] }
		if (!Array.isArray(od.data)) return oldData

		const { next, hits } = patchArray(od.data, productId, newStock)
		return hits > 0 ? { ...od, data: next } : oldData
	}

	// Array<product>
	if (Array.isArray(oldData)) {
		const { next, hits } = patchArray(
			oldData as AnyProduct[],
			productId,
			newStock,
		)
		return hits > 0 ? next : oldData
	}

	// Product direct
	if (
		typeof oldData === 'object' &&
		oldData !== null &&
		('_id' in oldData || 'id' in oldData) &&
		getProductId(oldData as AnyProduct) === productId
	) {
		return { ...(oldData as AnyProduct), stock: newStock }
	}

	return oldData
}

function isProductsQueryKey(queryKey: unknown): queryKey is unknown[] {
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
				productId = event.data.entityId ?? event.data.data?._id
				newStock = event.data.data?.stock
			} else if (event.type === 'stock.updated') {
				productId = event.data.productId
				newStock = event.data.newStock
			} else {
				return
			}

			if (!productId || typeof newStock !== 'number') return

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
				} else {
					// DEBUG utile: voir la shape réelle
					// console.log('🧪 [RQ PATCH] no change for key', key, prev)
				}
			}

			console.log('✅ [RQ PATCH] patched queries:', patched, {
				productId,
				newStock,
			})

			onStockUpdate?.(productId, newStock)
		})

		return () => {
			unsubscribe()
		}
	}, [enabled, onStockUpdate, queryClient])

	return { isConnected: appPosWebSocket.isConnected() }
}
