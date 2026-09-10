// La sélection « Toutes les pages » doit charger le même ensemble que la
// liste filtrée, mais par gros lots : revenir aux pages de 25 transformerait
// un catalogue de 3000 produits en quelque 120 requêtes.

import { beforeAll, describe, expect, it, vi } from 'vitest'

type CatalogProductsModule = typeof import('./catalog-products')
let fetchAllCatalogProducts: CatalogProductsModule['fetchAllCatalogProducts']

beforeAll(async () => {
	const g = globalThis as any
	g.window ??= g
	g.document ??= { location: { origin: 'http://127.0.0.1:8090' } }
	fetchAllCatalogProducts = (await import('./catalog-products'))
		.fetchAllCatalogProducts
})

describe('sélection de toutes les pages du catalogue', () => {
	it('utilise getFullList par lots de 500 avec les filtres courants', async () => {
		const getFullList = vi.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }])
		const pb = {
			filter: (clause: string, values: Record<string, string>) =>
				`${clause}:${Object.values(values).join(',')}`,
			collection: vi.fn(() => ({ getFullList })),
		}

		const result = await fetchAllCatalogProducts(pb, {
			companyId: 'company-1',
			page: 4,
			perPage: 25,
			search: "l'artiste",
			status: 'published',
			missingImage: true,
			sort: '-created',
		})

		expect(result).toHaveLength(2)
		expect(pb.collection).toHaveBeenCalledWith('products')
		expect(getFullList).toHaveBeenCalledWith(
			expect.objectContaining({
				batch: 500,
				sort: '-created',
				filter: expect.stringContaining('company-1'),
			}),
		)
		const options = getFullList.mock.calls[0][0]
		expect(options.filter).toContain('published')
		expect(options.filter).toContain('image:length = 0')
		expect(options.filter).toContain("l'artiste")
	})

	it('parcourt aussi toutes les pages de la route de tri éditorial', async () => {
		const send = vi.fn(async (path: string) => {
			const page = Number(
				new URL(path, 'http://local').searchParams.get('page'),
			)
			return {
				items: [{ id: `p${page}` }],
				page,
				perPage: 500,
				totalItems: 3,
				totalPages: 3,
			}
		})
		const pb = { filter: vi.fn(), send }

		const result = await fetchAllCatalogProducts(pb, {
			companyId: 'company-1',
			page: 1,
			perPage: 25,
			sort: '-health',
		})

		expect(result.map((product) => product.id)).toEqual(['p1', 'p2', 'p3'])
		expect(send).toHaveBeenCalledTimes(3)
		for (const [path] of send.mock.calls) {
			expect(path).toContain('perPage=500')
			expect(path).toContain('sort=-health')
		}
	})
})
