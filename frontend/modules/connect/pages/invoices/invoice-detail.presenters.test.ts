// frontend/modules/connect/pages/invoices/invoice-detail.presenters.test.ts
//
// Ces fonctions ont été SORTIES d'un composant de 1066 lignes. Le test est
// écrit pour geler leurs sorties AVANT le déplacement : il ne prouve pas
// qu'elles sont justes, il prouve qu'elles n'ont pas changé.
//
// C'est le seul endroit de l'écran qui manipule des chiffres fiscaux.

import type { InvoiceItem, InvoiceResponse } from '@/lib/types/invoice.types'
import { describe, expect, it } from 'vitest'
import {
	computeDiscounts,
	computeVatBreakdown,
	getLineDiscountLabel,
	getSoldByLabel,
} from './invoice-detail.presenters'

const ligne = (patch: Partial<InvoiceItem> = {}): InvoiceItem =>
	({
		name: 'Guitare',
		quantity: 1,
		unit_price_ht: 100,
		tva_rate: 20,
		total_ht: 100,
		total_ttc: 120,
		...patch,
	}) as InvoiceItem

const facture = (patch: Partial<InvoiceResponse> = {}): InvoiceResponse =>
	({
		id: 'inv1',
		number: 'FAC-2026-000001',
		invoice_type: 'invoice',
		status: 'validated',
		total_ttc: 1200,
		total_ht: 1000,
		total_tva: 200,
		currency: 'EUR',
		items: [],
		...patch,
	}) as InvoiceResponse

describe('getLineDiscountLabel — les quatre branches', () => {
	it('sans remise : un tiret, et rien à barrer', () => {
		expect(getLineDiscountLabel(ligne())).toEqual({
			label: '-',
			hasDiscount: false,
		})
	})

	it('en pourcentage', () => {
		const r = getLineDiscountLabel(
			ligne({ line_discount_mode: 'percent', line_discount_value: 15 }),
		)
		expect(r).toEqual({ label: '-15%', hasDiscount: true })
	})

	it("en montant, avec le prix d'avant remise : l'écart par unité", () => {
		// 100 HT à 20 % = 120 TTC ; le prix d'avant remise était 150.
		const r = getLineDiscountLabel(
			ligne({
				line_discount_mode: 'amount',
				line_discount_value: 30,
				unit_price_ttc_before_discount: 150,
			}),
		)
		expect(r).toEqual({ label: '-30.00 €/u', hasDiscount: true })
	})

	it("en montant, SANS prix d'avant remise : la valeur brute (documents anciens)", () => {
		const r = getLineDiscountLabel(
			ligne({ line_discount_mode: 'amount', line_discount_value: 25 }),
		)
		expect(r).toEqual({ label: '-25.00 €', hasDiscount: true })
	})

	it('une remise nulle ou négative ne se signale pas', () => {
		expect(
			getLineDiscountLabel(
				ligne({ line_discount_mode: 'percent', line_discount_value: 0 }),
			).hasDiscount,
		).toBe(false)
		expect(
			getLineDiscountLabel(
				ligne({ line_discount_mode: 'amount', line_discount_value: 0 }),
			).hasDiscount,
		).toBe(false)
	})
})

describe('computeVatBreakdown', () => {
	it('regroupe par taux et trie du plus bas au plus haut', () => {
		const r = computeVatBreakdown([
			ligne({ tva_rate: 20, total_ht: 100, total_ttc: 120 }),
			ligne({ tva_rate: 5.5, total_ht: 200, total_ttc: 211 }),
			ligne({ tva_rate: 20, total_ht: 50, total_ttc: 60 }),
		])

		expect(r.map((v) => v.rate)).toEqual([5.5, 20])
		expect(r[0]).toEqual({ rate: 5.5, base_ht: 200, vat: 11, total_ttc: 211 })
		expect(r[1]).toEqual({ rate: 20, base_ht: 150, vat: 30, total_ttc: 180 })
	})

	it('sur une facture de solde, l’écart se range sous « TVA 0 % »', () => {
		// Cas connu et NON corrigé : les lignes déductives d'une facture de
		// solde sont posées à tva_rate 0 (backend/deposit.go). Les totaux du
		// document restent justes ; c'est la ventilation par ligne qui trompe.
		// Le test fige le comportement actuel, il ne l'approuve pas.
		const r = computeVatBreakdown([
			ligne({ tva_rate: 20, total_ht: 1000, total_ttc: 1200 }),
			ligne({ tva_rate: 0, total_ht: -300, total_ttc: -360 }),
		])

		const zero = r.find((v) => v.rate === 0)
		expect(zero?.vat).toBe(-60)
	})

	it('sans lignes, aucune ventilation', () => {
		expect(computeVatBreakdown([])).toEqual([])
	})
})

describe('computeDiscounts', () => {
	it('remonte le sous-total depuis le total et les remises', () => {
		const r = computeDiscounts(
			facture({
				total_ttc: 1000,
				line_discounts_total_ttc: 150,
				cart_discount_ttc: 50,
				cart_discount_mode: 'percent',
				cart_discount_value: 5,
			}),
		)

		expect(r.hasAnyDiscount).toBe(true)
		expect(r.grandSubtotal).toBe(1200)
		expect(r.cartDiscountLabel).toBe('(5%)')
	})

	it('libelle une remise globale en montant', () => {
		const r = computeDiscounts(
			facture({
				cart_discount_ttc: 50,
				cart_discount_mode: 'amount',
				cart_discount_value: 50,
			}),
		)
		expect(r.cartDiscountLabel).toBe('(50.00 €)')
	})

	it('sans remise, le sous-total est le total et rien ne s’affiche', () => {
		const r = computeDiscounts(facture({ total_ttc: 1200 }))
		expect(r.hasAnyDiscount).toBe(false)
		expect(r.grandSubtotal).toBe(1200)
		expect(r.cartDiscountLabel).toBe('')
	})
})

describe('getSoldByLabel', () => {
	it('préfère le nom, puis le pseudo, puis l’email', () => {
		expect(
			getSoldByLabel(
				facture({ expand: { sold_by: { id: 'u1', name: 'Chris' } } }),
			),
		).toBe('Chris')
		expect(
			getSoldByLabel(
				facture({ expand: { sold_by: { id: 'u1', username: 'chris' } } }),
			),
		).toBe('chris')
		expect(
			getSoldByLabel(
				facture({ expand: { sold_by: { id: 'u1', email: 'c@x.fr' } } }),
			),
		).toBe('c@x.fr')
	})

	it("retombe sur l'identifiant, puis sur un tiret", () => {
		expect(getSoldByLabel(facture({ sold_by: 'u1' }))).toBe('u1')
		expect(getSoldByLabel(facture())).toBe('-')
	})
})
