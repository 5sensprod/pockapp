import { beforeEach, describe, expect, it, vi } from 'vitest'

const creations: Array<{ collection: string; data: Record<string, unknown> }> =
	[]

vi.mock('@tanstack/react-query', () => ({
	useMutation: (options: unknown) => options,
	useQuery: () => ({ data: undefined }),
	useQueryClient: () => ({ invalidateQueries: () => {} }),
}))

vi.mock('@/lib/use-pocketbase', () => ({
	usePocketBase: () => ({
		collection: (collection: string) => ({
			getFirstListItem: async () => {
				throw new Error('404')
			},
			create: async (data: Record<string, unknown>) => {
				creations.push({ collection, data })
				return { id: 'product_1', ...data }
			},
		}),
	}),
}))

import { useCreateCatalogProduct } from './catalog-products'
import { consignmentProductPayload } from './consignment-product'

beforeEach(() => {
	creations.length = 0
})

/** La fiche telle que la remplit `ConsignmentCatalogProductDialog`, le statut
 *  restant au choix du vendeur — c'est lui qui décide si le dépôt part en
 *  ligne tout de suite. */
const depot = (status: 'draft' | 'published') =>
	consignmentProductPayload(
		{
			description: 'Guitare Électrique Yamaha',
			store_price: 499,
			customer: 'customer_1',
		},
		{
			company: 'company_1',
			name: 'Guitare Électrique Yamaha',
			description: 'Très bon état',
			status,
			taxRate: 20,
			brand: 'brand_1',
			categories: ['category_1'],
			gallery: [],
		},
	)

describe("création catalogue depuis un dépôt d'occasion", () => {
	it("passe par la couche catalogue et marque l'occasion", async () => {
		await (useCreateCatalogProduct() as any).mutationFn(depot('draft'))

		expect(creations).toHaveLength(1)
		expect(creations[0].collection).toBe('products')
		expect(creations[0].data).toMatchObject({
			commercial_state: 'used',
			consignor: 'customer_1',
			price_ttc: 499,
			brand: 'brand_1',
			categories: ['category_1'],
		})
		expect(creations[0].data.legacy_id).toMatch(/^pa_[a-z0-9]{16}$/)
		expect(creations[0].data).not.toHaveProperty('supplier')
		expect(creations[0].data).not.toHaveProperty('stock')
	})

	// ⚠️ LA RÈGLE A CHANGÉ LE 11 SEPTEMBRE 2026, et ce test disait l'ancienne :
	// il créait un BROUILLON et exigeait une adresse. Le slug n'est plus posé à
	// la création mais au premier enregistrement en `published` (`withSlug`,
	// catalog-products.ts) — un dépôt gardé en brouillon peut encore changer de
	// nom sans déplacer sa future page.
	it('ne pose aucune adresse tant que le dépôt reste en brouillon', async () => {
		await (useCreateCatalogProduct() as any).mutationFn(depot('draft'))

		expect(creations[0].data).not.toHaveProperty('slug')
	})

	it('pose l’adresse dès que le dépôt est créé publié', async () => {
		await (useCreateCatalogProduct() as any).mutationFn(depot('published'))

		expect(creations[0].data).toMatchObject({
			slug: 'guitare-electrique-yamaha',
		})
	})
})
