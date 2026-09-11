import {
	clearTerminalState,
	getTerminalState,
	setTerminalState,
} from '@/lib/stores/appCashStore'
// frontend/modules/cash/components/terminal/hooks/useCartManager.ts
import {
	type CompteurDeStock,
	compteurParDefaut,
	remiseCaisseSelonCompteur,
} from '@/lib/pricing/promo-price'
import { useJourServeur } from '@/lib/pricing/use-jour-serveur'
import * as React from 'react'
import type { CartItem, LineDiscountMode, PosProduct } from '../types/cart'
import { clamp } from '../utils/calculations'

export interface ParkedCart {
	id: string
	items: CartItem[]
	parkedAt: Date
	label?: string
}

export function useCartManager(registerId: string) {
	// ✅ Initialisation depuis le store (persiste entre navigations)
	const [cart, setCart_] = React.useState<CartItem[]>(
		() => getTerminalState(registerId).cart,
	)
	const [parkedCarts, setParkedCarts] = React.useState<ParkedCart[]>(
		() => getTerminalState(registerId).parkedCarts,
	)
	const [lastAddedItem, setLastAddedItem] = React.useState<CartItem | null>(
		null,
	)
	// Le jour du SERVEUR juge la période d'une promo — jamais l'horloge du
	// navigateur (`use-jour-serveur.ts`). Lu à l'ajout : une ligne déjà au
	// panier garde sa remise si la promo finit entre-temps.
	const jour = useJourServeur()

	// ✅ Sync vers le store à chaque changement
	React.useEffect(() => {
		setTerminalState(registerId, { cart, parkedCarts })
	}, [registerId, cart, parkedCarts])

	const setCart = React.useCallback(
		(updater: React.SetStateAction<CartItem[]>) => {
			setCart_((prev) =>
				typeof updater === 'function' ? updater(prev) : updater,
			)
		},
		[],
	)

	const addToCart = React.useCallback(
		(product: PosProduct) => {
			// `price_ht` a disparu du schéma : le prix de vente est TTC.
			const price = product.price_ttc || 0
			const imageUrl = product.imageUrl
			const tvaRate = product.tax_rate ?? 20

			const compteur = compteurParDefaut(product)
			const pricing = {
				price_ttc: product.price_ttc,
				promo_price_ttc: product.promo_price_ttc,
				sale_state: product.sale_state,
				promo_start: product.promo_start,
				promo_end: product.promo_end,
				stock_b_price_ttc: product.stock_b_price_ttc,
			}

			setCart((prev) => {
				// Une ligne neuve et une ligne B du même produit sont deux lignes :
				// elles ne se vendent ni au même prix, ni sur le même compteur.
				const existingIndex = prev.findIndex(
					(item) =>
						item.productId === product.id &&
						(item.stockCounter ?? 'stock') === compteur,
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
					stockCounter: compteur,
					stockBAvailable: Number(product.stock_b ?? 0),
					pricing,
					// Soldé, en promotion ou vendu en Stock B : le prix réduit devient
					// une remise de ligne, le prix d'origine reste celui de la ligne —
					// le ticket montre les deux, et le Z compte la remise.
					...remiseCaisseSelonCompteur(pricing, compteur, jour),
				}
				setLastAddedItem(newItem)
				return [...prev, newItem]
			})

			setTimeout(() => setLastAddedItem(null), 1500)
		},
		[setCart, jour],
	)

	const updateQuantity = React.useCallback(
		(itemId: string, newQuantity: number) => {
			setCart((prev) => {
				if (newQuantity <= 0) return prev.filter((item) => item.id !== itemId)
				return prev.map((item) =>
					item.id === itemId ? { ...item, quantity: newQuantity } : item,
				)
			})
		},
		[setCart],
	)

	const setUnitPrice = React.useCallback(
		(itemId: string, raw: string) => {
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
					const v = Number.parseFloat(raw.replace(',', '.'))
					if (Number.isNaN(v)) return { ...it, unitPriceRaw: raw }
					return {
						...it,
						unitPrice: Math.max(0, +v.toFixed(2)),
						originalUnitPrice: original,
						unitPriceRaw: raw,
					}
				}),
			)
		},
		[setCart],
	)

	const clearUnitPrice = React.useCallback(
		(itemId: string) => {
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
		},
		[setCart],
	)

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
		[setCart],
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
					const v = Number.parseFloat(raw.replace(',', '.'))
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
		[setCart],
	)

	/** Bascule une ligne entre neuf et Stock B, et repose la remise qui va avec :
	 *  le prix B, ou la promo en neuf. Une remise saisie à la main sur la ligne
	 *  est remplacée — changer de compteur, c'est changer d'article. */
	const setItemStockCounter = React.useCallback(
		(itemId: string, compteur: CompteurDeStock) => {
			setCart((prev) =>
				prev.map((it) => {
					if (it.id !== itemId) return it
					return {
						...it,
						stockCounter: compteur,
						...remiseCaisseSelonCompteur(
							it.pricing ?? { price_ttc: it.originalUnitPrice ?? it.unitPrice },
							compteur,
							jour,
						),
					}
				}),
			)
		},
		[setCart, jour],
	)

	const toggleItemDisplayMode = React.useCallback(
		(itemId: string) => {
			setCart((prev) =>
				prev.map((it) => {
					if (it.id !== itemId) return it
					const modes: Array<'name' | 'designation' | 'sku'> = [
						'name',
						'designation',
						'sku',
					]
					const current = it.displayMode ?? 'name'
					const nextIndex = (modes.indexOf(current) + 1) % modes.length
					return { ...it, displayMode: modes[nextIndex] }
				}),
			)
		},
		[setCart],
	)

	const clearCart = React.useCallback(() => {
		setCart([])
		setLastAddedItem(null)
	}, [setCart])

	// ✅ À appeler après une vente confirmée : vide le state ET le store
	const clearCartAndStore = React.useCallback(() => {
		setCart([])
		setParkedCarts([])
		setLastAddedItem(null)
		clearTerminalState(registerId)
	}, [setCart, registerId])

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
		[parkedCarts, setCart],
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
		setItemStockCounter,
		toggleItemDisplayMode,
		clearCart,
		clearCartAndStore,
		parkCart,
		unparkCart,
		deleteParkedCart,
	}
}
