// frontend/lib/pricing/promo-caisse.test.ts
//
// Le prix promo, de l'ajout au panier jusqu'à ce que la route de caisse reçoit.
// Le serveur plafonne une remise « amount » au total de la ligne et écrit le
// prix d'origine dans `unit_price_ttc_before_discount`
// (`backend/routes/pos_routes.go`) : ce test tient la moitié client.

import { describe, expect, it, vi } from 'vitest'

import type { CartItem } from '@/modules/cash/components/terminal/types/cart'

vi.mock('@/lib/use-pocketbase', () => ({ usePocketBase: () => ({}) }))

const { cartItemToPosItem } = await import('@/lib/queries/pos')
const { remiseCaisse, compteurParDefaut, remiseCaisseSelonCompteur } =
	await import('./promo-price')

const JOUR = '2026-09-10'

describe('le Stock B à la caisse', () => {
	const produit = {
		price_ttc: 499,
		promo_price_ttc: 450,
		sale_state: 'promo',
		stock_b_price_ttc: 380,
	}

	it('prend le neuf s’il en reste, sinon le B', () => {
		expect(compteurParDefaut({ stock: 2, stock_b: 3 })).toBe('stock')
		expect(compteurParDefaut({ stock: 0, stock_b: 3 })).toBe('stock_b')
		expect(compteurParDefaut({ stock: 0, stock_b: 0 })).toBe('stock')
	})

	it('vend une unité B à son prix, en remise, et le dit sur le ticket', () => {
		const envoye = cartItemToPosItem({
			id: 'l1',
			productId: 'p1',
			name: 'Guitare',
			unitPrice: 499,
			quantity: 2,
			tvaRate: 20,
			stockCounter: 'stock_b',
			...remiseCaisseSelonCompteur(produit, 'stock_b', JOUR),
		})
		expect(envoye).toMatchObject({
			name: 'Guitare (Stock B)',
			unit_price_ttc: 499,
			line_discount_mode: 'amount',
			line_discount_value: 238,
		})
	})

	it('une bascule efface la remise précédente quand le nouveau compteur n’en a pas', () => {
		const sansPrixB = { ...produit, stock_b_price_ttc: 0 }
		expect(remiseCaisseSelonCompteur(sansPrixB, 'stock_b', JOUR)).toEqual({
			lineDiscountMode: undefined,
			lineDiscountValue: undefined,
			lineDiscountRaw: '',
		})
		// Et une unité B ne profite pas de la promo du neuf.
		expect(
			remiseCaisseSelonCompteur(sansPrixB, 'stock', JOUR).lineDiscountValue,
		).toBe(450)
	})
})

function ligne(produit: Parameters<typeof remiseCaisse>[0], quantite: number) {
	return {
		id: 'l1',
		productId: 'p1',
		name: 'Guitare',
		unitPrice: Number(produit.price_ttc),
		quantity: quantite,
		tvaRate: 20,
		...remiseCaisse(produit, JOUR),
	} satisfies CartItem
}

describe('le prix promo à la caisse', () => {
	it('garde le prix d’origine et envoie la remise, recalculée à la quantité', () => {
		const produit = { price_ttc: 499, promo_price_ttc: 450, sale_state: 'sale' }

		expect(cartItemToPosItem(ligne(produit, 1))).toMatchObject({
			unit_price_ttc: 499,
			line_discount_mode: 'amount',
			line_discount_value: 49,
		})
		expect(cartItemToPosItem(ligne(produit, 3))).toMatchObject({
			unit_price_ttc: 499,
			line_discount_value: 147,
		})
	})

	it('n’envoie aucune remise sans le tag', () => {
		const envoye = cartItemToPosItem(
			ligne({ price_ttc: 499, promo_price_ttc: 450, sale_state: '' }, 2),
		)
		expect(envoye.unit_price_ttc).toBe(499)
		expect(envoye.line_discount_mode).toBeUndefined()
		expect(envoye.line_discount_value).toBeUndefined()
	})
})
