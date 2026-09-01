import { describe, expect, it } from 'vitest'

import { PRODUCT_HEALTH_MAX, productHealth } from './catalog-health'

const complete = {
	name: 'Guitare folk',
	description: '<p>Une guitare prête à jouer.</p>',
	image: 'guitare.webp',
	categories: ['guitares'],
	price_ttc: 299,
	slug: 'guitare-folk',
}

describe('productHealth', () => {
	it('rend le maximum à une fiche prête pour le site', () => {
		expect(productHealth(complete)).toEqual({
			score: PRODUCT_HEALTH_MAX,
			max: PRODUCT_HEALTH_MAX,
			missing: [],
		})
	})

	it('nomme chaque prérequis de publication manquant', () => {
		const health = productHealth({
			...complete,
			description: '  ',
			image: '',
			categories: [],
		})
		expect(health.score).toBe(3)
		expect(health.missing).toEqual([
			'description',
			'image principale',
			'catégorie',
		])
	})
})
