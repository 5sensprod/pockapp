import { describe, expect, it } from 'vitest'
import {
	EMPTY_PRODUCT_DETAIL_VALUES,
	productCreationSchema,
	productDetailPayload,
} from './product-detail-form'

const values = {
	...EMPTY_PRODUCT_DETAIL_VALUES,
	designation: 'Guitare',
	name: 'Guitare',
	price_ttc: 120,
}

describe('validation de la nouvelle fiche', () => {
	it.each(['', 0, -1, undefined])(
		'refuse un prix absent ou non positif : %s',
		(price_ttc) => {
			expect(
				productCreationSchema.safeParse({ ...values, price_ttc }).success,
			).toBe(false)
		},
	)
	it('accepte une désignation et un nom avec un prix positif', () => {
		expect(productCreationSchema.safeParse(values).success).toBe(true)
	})
	it('ne contourne ni le nom ni les règles promo du schéma partagé', () => {
		expect(
			productCreationSchema.safeParse({ ...values, name: '   ' }).success,
		).toBe(false)
		expect(
			productCreationSchema.safeParse({ ...values, sale_state: 'promo' })
				.success,
		).toBe(false)
		expect(
			productCreationSchema.safeParse({
				...values,
				promo_start: '2026-09-20',
				promo_end: '2026-09-10',
			}).success,
		).toBe(false)
	})
	it('ne transmet aucune quantité ni motif à la collection produits', () => {
		const payload = productDetailPayload({
			...values,
			stock: 5,
			stock_b: 2,
			stock_reason: 'restock',
		})
		for (const field of ['stock', 'stock_b', 'stock_reason', 'stock_comment'])
			expect(payload).not.toHaveProperty(field)
	})
})
