// frontend/modules/cash/components/terminal/hooks/useCartManager.ts
import * as React from 'react'
import type { AppPosProduct, CartItem, LineDiscountMode } from '../types/cart'
import { clamp } from '../utils/calculations'
import { getImageUrl } from '../utils/imageUtils'

export interface ParkedCart {
	id: string
	items: CartItem[]
	parkedAt: Date
	label?: string
}

export function useCartManager() {
	const [cart, setCart] = React.useState<CartItem[]>([])
	const [lastAddedItem, setLastAddedItem] = React.useState<CartItem | null>(
		null,
	)
	const [parkedCarts, setParkedCarts] = React.useState<ParkedCart[]>([])

	const addToCart = React.useCallback((product: AppPosProduct) => {
		const price = product.price_ttc || product.price_ht || 0
		const imageUrl = getImageUrl(product.images)
		const tvaRate = product.tva_rate ?? 20

		setCart((prev) => {
			const existingIndex = prev.findIndex(
				(item) => item.productId === product.id,
			)
			if (existingIndex >= 0) {
				const next = [...prev]
				next[existingIndex] = {
					...next[existingIndex],
					quantity: next[existingIndex].quantity + 1,
				}
				setLastAddedItem(next[existingIndex])
				return next
			}

			const newItem: CartItem = {
				id: `cart-${Date.now()}-${Math.random().toString(16).slice(2)}`,
				productId: product.id,
				name: product.name,
				designation: product.designation || product.name,
				sku: product.sku || '',
				image: imageUrl || '',
				unitPrice: price,
				quantity: 1,
				tvaRate,
				displayMode: 'name',
			}
			setLastAddedItem(newItem)
			return [...prev, newItem]
		})

		setTimeout(() => setLastAddedItem(null), 1500)
	}, [])

	const updateQuantity = React.useCallback(
		(itemId: string, newQuantity: number) => {
			setCart((prev) => {
				if (newQuantity <= 0) return prev.filter((item) => item.id !== itemId)
				return prev.map((item) =>
					item.id === itemId ? { ...item, quantity: newQuantity } : item,
				)
			})
		},
		[],
	)

	const setUnitPrice = React.useCallback((itemId: string, raw: string) => {
		setCart((prev) =>
			prev.map((it) => {
				if (it.id !== itemId) return it

				const original = it.originalUnitPrice ?? it.unitPrice

				if (raw.trim() === '') {
					return {
						...it,
						unitPrice: original,
						originalUnitPrice: original,
						unitPriceRaw: '',
					}
				}

				const normalized = raw.replace(',', '.')
				const v = Number.parseFloat(normalized)

				if (Number.isNaN(v)) {
					return { ...it, unitPriceRaw: raw }
				}

				return {
					...it,
					unitPrice: Math.max(0, +v.toFixed(2)),
					originalUnitPrice: original,
					unitPriceRaw: raw,
				}
			}),
		)
	}, [])

	const clearUnitPrice = React.useCallback((itemId: string) => {
		setCart((prev) =>
			prev.map((it) => {
				if (it.id !== itemId) return it
				const original = it.originalUnitPrice ?? it.unitPrice
				return {
					...it,
					unitPrice: original,
					originalUnitPrice: undefined,
					unitPriceRaw: '',
				}
			}),
		)
	}, [])

	const setLineDiscountMode = React.useCallback(
		(itemId: string, mode: LineDiscountMode) => {
			setCart((prev) =>
				prev.map((it) => {
					if (it.id !== itemId) return it

					const currentVal = it.lineDiscountValue
					const nextValue =
						mode === 'percent'
							? clamp(currentVal ?? 0, 0, 100)
							: clamp(currentVal ?? it.unitPrice, 0, it.unitPrice)

					return {
						...it,
						lineDiscountMode: mode,
						lineDiscountValue: nextValue,
						lineDiscountRaw: String(nextValue),
					}
				}),
			)
		},
		[],
	)

	const setLineDiscountValue = React.useCallback(
		(itemId: string, raw: string) => {
			setCart((prev) =>
				prev.map((it) => {
					if (it.id !== itemId) return it

					const mode = it.lineDiscountMode ?? 'percent'

					if (raw.trim() === '') {
						return {
							...it,
							lineDiscountMode: mode,
							lineDiscountValue: undefined,
							lineDiscountRaw: '',
						}
					}

					const normalized = raw.replace(',', '.')
					const v = Number.parseFloat(normalized)

					if (Number.isNaN(v)) {
						return {
							...it,
							lineDiscountMode: mode,
							lineDiscountValue: undefined,
							lineDiscountRaw: raw,
						}
					}

					const next =
						mode === 'percent' ? clamp(v, 0, 100) : clamp(v, 0, it.unitPrice)

					return {
						...it,
						lineDiscountMode: mode,
						lineDiscountValue: next,
						lineDiscountRaw: raw,
					}
				}),
			)
		},
		[],
	)

	const toggleItemDisplayMode = React.useCallback((itemId: string) => {
		setCart((prev) =>
			prev.map((it) => {
				if (it.id !== itemId) return it
				const modes: Array<'name' | 'designation' | 'sku'> = [
					'name',
					'designation',
					'sku',
				]
				const current = it.displayMode ?? 'name'
				const currentIndex = modes.indexOf(current)
				const nextIndex = (currentIndex + 1) % modes.length
				return { ...it, displayMode: modes[nextIndex] }
			}),
		)
	}, [])

	const clearCart = React.useCallback(() => {
		setCart([])
		setLastAddedItem(null)
	}, [])

	const parkCart = React.useCallback(
		(label?: string) => {
			if (cart.length === 0) return

			const parked: ParkedCart = {
				id: `parked-${Date.now()}`,
				items: cart,
				parkedAt: new Date(),
				label,
			}

			setParkedCarts((prev) => [...prev, parked])
			clearCart()
		},
		[cart, clearCart],
	)

	const unparkCart = React.useCallback(
		(parkedId: string) => {
			const parked = parkedCarts.find((p) => p.id === parkedId)
			if (!parked) return

			setCart(parked.items)
			setParkedCarts((prev) => prev.filter((p) => p.id !== parkedId))
		},
		[parkedCarts],
	)

	const deleteParkedCart = React.useCallback((parkedId: string) => {
		setParkedCarts((prev) => prev.filter((p) => p.id !== parkedId))
	}, [])

	return {
		cart,
		lastAddedItem,
		parkedCarts,
		addToCart,
		updateQuantity,
		setUnitPrice,
		clearUnitPrice,
		setLineDiscountMode,
		setLineDiscountValue,
		toggleItemDisplayMode,
		clearCart,
		parkCart,
		unparkCart,
		deleteParkedCart,
	}
}
