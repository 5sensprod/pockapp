// frontend/lib/pricing/promo-price.test.ts

import { describe, expect, it } from 'vitest'

import {
	prixPromoActif,
	remiseInitialeDeLigne,
	remisePromoPourcent,
} from './promo-price'

const arrondi = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

describe('prixPromoActif', () => {
	it('s’applique à un produit soldé ou en promotion', () => {
		expect(
			prixPromoActif({
				price_ttc: 499,
				promo_price_ttc: 450,
				sale_state: 'sale',
			}),
		).toBe(450)
		expect(
			prixPromoActif({
				price_ttc: 499,
				promo_price_ttc: 450,
				sale_state: 'promo',
			}),
		).toBe(450)
	})

	it('ne s’applique pas sans le tag : un prix promo oublié reste inerte', () => {
		expect(
			prixPromoActif({ price_ttc: 499, promo_price_ttc: 450, sale_state: '' }),
		).toBeNull()
	})

	it('ne s’applique ni sans prix promo, ni s’il n’est pas une baisse', () => {
		expect(prixPromoActif({ price_ttc: 499, sale_state: 'sale' })).toBeNull()
		expect(
			prixPromoActif({
				price_ttc: 499,
				promo_price_ttc: 499,
				sale_state: 'sale',
			}),
		).toBeNull()
		expect(
			prixPromoActif({
				price_ttc: 499,
				promo_price_ttc: 520,
				sale_state: 'sale',
			}),
		).toBeNull()
		expect(
			prixPromoActif({ price_ttc: 0, promo_price_ttc: 10, sale_state: 'sale' }),
		).toBeNull()
	})
})

describe('remisePromoPourcent', () => {
	it('redonne exactement (prix − promo) × quantité, quelle que soit la quantité', () => {
		// Le calcul de ligne des factures et devis : arrondi(base × % / 100).
		for (const [prix, promo] of [
			[499, 450],
			[19.9, 14.9],
			[1299, 999.99],
			[3.5, 2.95],
		]) {
			const pourcent = remisePromoPourcent({
				price_ttc: prix,
				promo_price_ttc: promo,
				sale_state: 'promo',
			}) as number
			for (const quantite of [1, 2, 3, 7, 13]) {
				const base = arrondi(prix * quantite)
				expect(arrondi(base * (pourcent / 100))).toBe(
					arrondi((prix - promo) * quantite),
				)
			}
		}
	})
})

describe('remiseInitialeDeLigne', () => {
	it('rend une ligne sans remise quand aucune promo n’est active', () => {
		expect(remiseInitialeDeLigne({ price_ttc: 499 })).toEqual({
			lineDiscountMode: 'percent',
			lineDiscountValue: 0,
		})
	})

	it('affiche un pourcentage arrondi mais garde la valeur exacte', () => {
		const remise = remiseInitialeDeLigne({
			price_ttc: 499,
			promo_price_ttc: 450,
			sale_state: 'sale',
		})
		expect(remise.lineDiscountRaw).toBe('9.82')
		expect(remise.lineDiscountValue).not.toBe(9.82)
	})
})
