import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
	current: { id: 'p1', name: 'Ancien nom', status: 'draft', slug: '' },
	create: vi.fn(async (data: any) => ({ id: 'p1', ...data })),
	update: vi.fn(async (id: string, data: any) => ({ id, ...data })),
	lookup: vi.fn(async () => {
		throw new Error('404')
	}),
}))
vi.mock('@tanstack/react-query', () => ({
	useMutation: (options: any) => options,
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/lib/use-pocketbase', () => ({
	usePocketBase: () => ({
		collection: () => ({
			create: db.create,
			update: db.update,
			getOne: async () => db.current,
			getFirstListItem: db.lookup,
		}),
	}),
}))

import {
	useCreateCatalogProduct,
	useUpdateCatalogProduct,
	useUpdateCatalogProductStatusBatch,
} from './catalog-products'

beforeEach(() => {
	vi.clearAllMocks()
	db.current = { id: 'p1', name: 'Ancien nom', status: 'draft', slug: '' }
})

describe('adresse à la première publication', () => {
	it('crée un brouillon avec sa clé stable mais sans slug ni recherche de slug', async () => {
		await (useCreateCatalogProduct() as any).mutationFn({
			name: 'Guitare',
			status: 'draft',
		})
		expect(db.create.mock.calls[0][0]).toMatchObject({
			legacy_id: expect.stringMatching(/^pa_/),
		})
		expect(db.create.mock.calls[0][0]).not.toHaveProperty('slug')
		expect(db.lookup).not.toHaveBeenCalled()
	})
	it('continue à attribuer un slug aux produits créés publiés en caisse', async () => {
		await (useCreateCatalogProduct() as any).mutationFn({
			name: 'Guitare',
			status: 'published',
		})
		expect(db.create.mock.calls[0][0]).toMatchObject({ slug: 'guitare' })
	})
	it('renomme un brouillon sans figer son adresse', async () => {
		await (useUpdateCatalogProduct() as any).mutationFn({
			id: 'p1',
			data: { name: 'Nom final' },
		})
		expect(db.update.mock.calls[0][1]).toEqual({ name: 'Nom final' })
		expect(db.lookup).not.toHaveBeenCalled()
	})
	it('utilise le nom final quand on publie et renomme en un seul enregistrement', async () => {
		await (useUpdateCatalogProduct() as any).mutationFn({
			id: 'p1',
			data: { name: 'Nom final', status: 'published' },
		})
		expect(db.update.mock.calls[0][1]).toMatchObject({ slug: 'nom-final' })
	})
	it('publie aussi les brouillons sans slug depuis la liste', async () => {
		await (useUpdateCatalogProductStatusBatch() as any).mutationFn({
			products: [{ id: 'p1', status: 'draft' }],
			status: 'published',
		})
		expect(db.update.mock.calls[0][1]).toEqual({
			status: 'published',
			slug: 'ancien-nom',
		})
	})
	it.each(['draft', 'published'])(
		'préserve une adresse existante au passage en %s',
		async (status) => {
			db.current.slug = 'adresse-originale'
			await (useUpdateCatalogProduct() as any).mutationFn({
				id: 'p1',
				data: { name: 'Nouveau nom', status, slug: 'a-ne-pas-utiliser' },
			})
			expect(db.update.mock.calls[0][1]).toMatchObject({
				slug: 'adresse-originale',
			})
			expect(db.lookup).not.toHaveBeenCalled()
		},
	)
})
