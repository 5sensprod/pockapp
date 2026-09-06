import { describe, expect, it } from 'vitest'

import { categoriesAfterBatchChange } from './catalog-product-category-batch'

describe('categoriesAfterBatchChange', () => {
	it('ajoute la destination sans perdre les catégories existantes', () => {
		expect(
			categoriesAfterBatchChange(['guitares'], 'promotions', 'add'),
		).toEqual(['guitares', 'promotions'])
	})

	it('ne duplique pas une catégorie déjà présente', () => {
		expect(categoriesAfterBatchChange(['guitares'], 'guitares', 'add')).toEqual(
			['guitares'],
		)
	})

	it('remplace toute la relation par la destination', () => {
		expect(
			categoriesAfterBatchChange(
				['guitares', 'promotions'],
				'archives',
				'replace',
			),
		).toEqual(['archives'])
	})
})
