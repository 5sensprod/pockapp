import { describe, expect, it } from 'vitest'

import {
	type LigneDocumentBridable,
	briderLigneDocument,
	plafondDe,
	prixDeReference,
	prixPlancher,
} from './plafond-remise'

describe('plafond de remise', () => {
	it("n'en pose pas pour un admin ni une limite désactivée", () => {
		expect(plafondDe(null)).toBeNull()
		expect(
			plafondDe({
				role: 'admin',
				discount_limit_enabled: true,
				max_discount_percent: 5,
			}),
		).toBeNull()
		expect(
			plafondDe({ role: 'caissier', discount_limit_enabled: false }),
		).toBeNull()
		expect(
			plafondDe({
				role: 'caissier',
				discount_limit_enabled: true,
				max_discount_percent: 10,
			}),
		).toBe(10)
	})

	it('part de la promo en vigueur, ou du prix B sur une ligne B', () => {
		const fiche = {
			price_ttc: 100,
			promo_price_ttc: 80,
			sale_state: 'promo',
			stock_b_price_ttc: 60,
		}
		expect(prixDeReference(fiche, 'stock', 100, '2026-09-17')).toBe(80)
		expect(prixDeReference(fiche, 'stock_b', 100, '2026-09-17')).toBe(60)
		expect(prixDeReference(undefined, 'stock', 11.9, null)).toBe(11.9)
	})

	it('arrondit le plancher au centime supérieur', () => {
		expect(prixPlancher(11.9, 20)).toBe(9.52)
		expect(prixPlancher(9.99, 15)).toBe(8.5)
	})
})

describe('ligne de facture ou de devis', () => {
	const ligne: LigneDocumentBridable = { unit_price_ttc: 100, quantity: 2 }

	it('borne un pourcentage et réécrit la saisie', () => {
		const out = briderLigneDocument(
			{ ...ligne, lineDiscountMode: 'percent' as const, lineDiscountValue: 25 },
			90,
		)
		expect(out.lineDiscountValue).toBe(10)
		expect(out.lineDiscountRaw).toBe('10')
	})

	it('borne un montant en euros sur le total de la ligne', () => {
		const out = briderLigneDocument(
			{ ...ligne, lineDiscountMode: 'amount' as const, lineDiscountValue: 50 },
			90,
		)
		expect(out.lineDiscountValue).toBe(20)
	})

	it('relève un prix retapé sous le plancher', () => {
		expect(
			briderLigneDocument({ ...ligne, unit_price_ttc: 50 }, 90).unit_price_ttc,
		).toBe(90)
	})

	it('ne touche rien sans plafond', () => {
		const it0 = {
			...ligne,
			lineDiscountMode: 'percent' as const,
			lineDiscountValue: 80,
		}
		expect(briderLigneDocument(it0, null)).toBe(it0)
	})
})
