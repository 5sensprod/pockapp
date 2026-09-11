// frontend/lib/pricing/promo-price.test.ts

import { describe, expect, it } from 'vitest'

import {
	periodePromo,
	prixPromoActif,
	remiseInitialeDeLigne,
	remisePromoPourcent,
} from './promo-price'

const arrondi = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const JOUR = '2026-09-10'

describe('prixPromoActif', () => {
	it('s’applique à un produit soldé ou en promotion', () => {
		expect(
			prixPromoActif(
				{ price_ttc: 499, promo_price_ttc: 450, sale_state: 'sale' },
				JOUR,
			),
		).toBe(450)
		expect(
			prixPromoActif(
				{ price_ttc: 499, promo_price_ttc: 450, sale_state: 'promo' },
				JOUR,
			),
		).toBe(450)
	})

	it('ne s’applique pas sans le tag : un prix promo oublié reste inerte', () => {
		expect(
			prixPromoActif(
				{ price_ttc: 499, promo_price_ttc: 450, sale_state: '' },
				JOUR,
			),
		).toBeNull()
	})

	it('ne s’applique ni sans prix promo, ni s’il n’est pas une baisse', () => {
		expect(
			prixPromoActif({ price_ttc: 499, sale_state: 'sale' }, JOUR),
		).toBeNull()
		expect(
			prixPromoActif(
				{ price_ttc: 499, promo_price_ttc: 499, sale_state: 'sale' },
				JOUR,
			),
		).toBeNull()
		expect(
			prixPromoActif(
				{ price_ttc: 499, promo_price_ttc: 520, sale_state: 'sale' },
				JOUR,
			),
		).toBeNull()
		expect(
			prixPromoActif(
				{ price_ttc: 0, promo_price_ttc: 10, sale_state: 'sale' },
				JOUR,
			),
		).toBeNull()
	})
})

describe('la période d’une promo', () => {
	const promo = { price_ttc: 499, promo_price_ttc: 450, sale_state: 'promo' }

	// Les MÊMES cas que `backend/promo/promo_test.go` : la règle existe en Go
	// et en PHP, ses bornes doivent dire la même chose partout.
	it.each([
		['', '', '2026-09-10', 'sans-periode'],
		['2026-09-10', '2026-09-20', '2026-09-10', 'en-cours'],
		['2026-09-10', '2026-09-20', '2026-09-20', 'en-cours'],
		['2026-09-10', '2026-09-20', '2026-09-09', 'programmee'],
		['2026-09-10', '2026-09-20', '2026-09-21', 'expiree'],
		['2026-09-10', '', '2026-12-31', 'en-cours'],
		['', '2026-09-20', '2026-01-01', 'en-cours'],
	])('[%s, %s] le %s : %s', (debut, fin, jour, attendu) => {
		expect(periodePromo({ promo_start: debut, promo_end: fin }, jour)).toBe(
			attendu,
		)
	})

	it('ne s’applique qu’entre ses bornes, incluses', () => {
		const periode = {
			...promo,
			promo_start: '2026-09-10',
			promo_end: '2026-09-20',
		}
		expect(prixPromoActif(periode, '2026-09-09')).toBeNull()
		expect(prixPromoActif(periode, '2026-09-10')).toBe(450)
		expect(prixPromoActif(periode, '2026-09-20')).toBe(450)
		expect(prixPromoActif(periode, '2026-09-21')).toBeNull()
	})

	it('sans jour connu, une promo À PÉRIODE ne s’applique pas — une promo sans période, si', () => {
		expect(
			prixPromoActif({ ...promo, promo_end: '2026-09-20' }, null),
		).toBeNull()
		expect(prixPromoActif(promo, null)).toBe(450)
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
			const pourcent = remisePromoPourcent(
				{ price_ttc: prix, promo_price_ttc: promo, sale_state: 'promo' },
				JOUR,
			) as number
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
		expect(remiseInitialeDeLigne({ price_ttc: 499 }, JOUR)).toEqual({
			lineDiscountMode: 'percent',
			lineDiscountValue: 0,
		})
	})

	it('affiche un pourcentage arrondi mais garde la valeur exacte', () => {
		const remise = remiseInitialeDeLigne(
			{ price_ttc: 499, promo_price_ttc: 450, sale_state: 'sale' },
			JOUR,
		)
		expect(remise.lineDiscountRaw).toBe('9.82')
		expect(remise.lineDiscountValue).not.toBe(9.82)
	})

	it('une facture faite après la fin de la promo ne la reprend pas', () => {
		expect(
			remiseInitialeDeLigne(
				{
					price_ttc: 499,
					promo_price_ttc: 450,
					sale_state: 'sale',
					promo_end: '2026-09-09',
				},
				JOUR,
			).lineDiscountValue,
		).toBe(0)
	})
})
