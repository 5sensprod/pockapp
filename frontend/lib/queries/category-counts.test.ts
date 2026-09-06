import { describe, expect, it } from 'vitest'
import { hasUsableCategoryCounts } from './category-counts'

describe('hasUsableCategoryCounts', () => {
	it('refuse une ventilation vide lorsque le catalogue contient des produits', () => {
		expect(
			hasUsableCategoryCounts({ totalProduits: 2600, parCategorie: {} }),
		).toBe(false)
	})

	it('accepte une ventilation contenant au moins une catégorie', () => {
		expect(
			hasUsableCategoryCounts({
				totalProduits: 2600,
				parCategorie: { guitares: { direct: 2, total: 12 } },
			}),
		).toBe(true)
	})

	it('accepte naturellement un catalogue réellement vide', () => {
		expect(
			hasUsableCategoryCounts({ totalProduits: 0, parCategorie: {} }),
		).toBe(true)
	})

	it("refuse l'absence complète de réponse", () => {
		expect(hasUsableCategoryCounts(undefined)).toBe(false)
	})
})
