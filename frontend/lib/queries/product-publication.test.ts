import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
	current: { id: 'p1', name: 'Ancien nom', status: 'draft', slug: '' } as any,
	getOne: null as null | ((id: string) => Promise<any>),
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
			getOne: async (id: string) => (db.getOne ? db.getOne(id) : db.current),
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
	db.getOne = null
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
		// Une fiche complète : le lot ne publie pas sans image ni catégorie.
		Object.assign(db.current, { image: 'a.jpg', categories: ['c1'] })
		await (useUpdateCatalogProductStatusBatch() as any).mutationFn({
			products: [{ id: 'p1', status: 'draft' }],
			status: 'published',
		})
		expect(db.update.mock.calls[0][1]).toEqual({
			status: 'published',
			slug: 'ancien-nom',
		})
	})
})

describe('le lot « Publier » ne publie que les fiches complètes', () => {
	// Chaque id porte sa propre fiche : le lot relit la base, pas la sélection.
	const fiches: Record<string, any> = {}
	const lot = async (
		products: { id: string; name?: string; status?: string }[],
		status: 'draft' | 'published' = 'published',
	) =>
		(await (useUpdateCatalogProductStatusBatch() as any).mutationFn({
			products,
			status,
		})) as {
			updated: number
			unchanged: number
			refused: { id: string; name: string; manques: string[] }[]
		}

	beforeEach(() => {
		for (const id of Object.keys(fiches)) delete fiches[id]
		fiches.complete = {
			id: 'complete',
			name: 'Complète',
			status: 'draft',
			slug: '',
			image: 'a.jpg',
			categories: ['c1'],
		}
		fiches.sansImage = { ...fiches.complete, id: 'sansImage', image: '' }
		fiches.sansCategorie = {
			...fiches.complete,
			id: 'sansCategorie',
			categories: [],
		}
		fiches.rien = { ...fiches.complete, id: 'rien', image: '', categories: [] }
	})

	// `getOne` du faux PocketBase rend `db.current` : on le fait varier par id.
	const brancher = () => {
		db.getOne = async (id: string) => fiches[id]
	}

	it('publie les fiches valides, laisse les autres en brouillon et dit ce qui manque', async () => {
		brancher()
		const resultat = await lot([
			{ id: 'complete', name: 'Complète', status: 'draft' },
			{ id: 'sansImage', name: 'Sans image', status: 'draft' },
			{ id: 'sansCategorie', name: 'Sans catégorie', status: 'draft' },
			{ id: 'rien', name: 'Rien', status: 'draft' },
		])

		expect(resultat.updated).toBe(1)
		// UNE seule écriture : les refusées ne sont même pas tentées.
		expect(db.update).toHaveBeenCalledTimes(1)
		expect(db.update.mock.calls[0][0]).toBe('complete')

		const parId = Object.fromEntries(resultat.refused.map((r) => [r.id, r]))
		expect(Object.keys(parId).sort()).toEqual([
			'rien',
			'sansCategorie',
			'sansImage',
		])
		expect(parId.sansImage.manques).toEqual(['une image principale'])
		expect(parId.sansCategorie.manques).toEqual(['une catégorie'])
		expect(parId.rien.manques).toEqual([
			'une image principale',
			'une catégorie',
		])
		expect(parId.rien.name).toBe('Rien')
	})

	it('lit la fiche dans la base, pas la copie de la sélection', async () => {
		// La sélection date d'avant l'ajout de l'image : la base fait foi.
		brancher()
		fiches.sansImage.image = 'ajoutee.jpg'
		const resultat = await lot([{ id: 'sansImage', status: 'draft' }])
		expect(resultat.updated).toBe(1)
		expect(resultat.refused).toEqual([])
	})

	it('ne refuse pas un lot entier pour une fiche : aucune erreur levée', async () => {
		brancher()
		await expect(lot([{ id: 'rien', status: 'draft' }])).resolves.toMatchObject(
			{ updated: 0 },
		)
	})

	it('dépublier n’exige aucune ressource', async () => {
		brancher()
		fiches.rien.status = 'published'
		const resultat = await lot([{ id: 'rien', status: 'published' }], 'draft')
		expect(resultat.updated).toBe(1)
		expect(resultat.refused).toEqual([])
		expect(db.update.mock.calls[0][1]).toMatchObject({ status: 'draft' })
	})

	it('une fiche déjà publiée ne repasse pas le test', async () => {
		brancher()
		const resultat = await lot([{ id: 'rien', status: 'published' }])
		expect(resultat).toMatchObject({ updated: 0, unchanged: 1, refused: [] })
		expect(db.update).not.toHaveBeenCalled()
	})

	it('une erreur qui n’est pas un refus reste une erreur', async () => {
		brancher()
		db.update.mockRejectedValueOnce(new Error('réseau'))
		await expect(lot([{ id: 'complete', status: 'draft' }])).rejects.toThrow(
			'réseau',
		)
	})
})

describe('adresse à la première publication (suite)', () => {
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
