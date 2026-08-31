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

describe("création catalogue depuis un dépôt d'occasion", () => {
	it("passe par la couche catalogue, marque l'occasion et pose une adresse", async () => {
		const payload = consignmentProductPayload(
			{
				description: 'Guitare Électrique Yamaha',
				store_price: 499,
				customer: 'customer_1',
			},
			{
				company: 'company_1',
				name: 'Guitare Électrique Yamaha',
				description: 'Très bon état',
				status: 'draft',
				taxRate: 20,
				brand: 'brand_1',
				categories: ['category_1'],
				gallery: [],
			},
		)

		await (useCreateCatalogProduct() as any).mutationFn(payload)

		expect(creations).toHaveLength(1)
		expect(creations[0].collection).toBe('products')
		expect(creations[0].data).toMatchObject({
			commercial_state: 'used',
			consignor: 'customer_1',
			price_ttc: 499,
			brand: 'brand_1',
			categories: ['category_1'],
			slug: 'guitare-electrique-yamaha',
		})
		expect(creations[0].data.legacy_id).toMatch(/^pa_[a-z0-9]{16}$/)
		expect(creations[0].data).not.toHaveProperty('supplier')
		expect(creations[0].data).not.toHaveProperty('stock')
	})
})
