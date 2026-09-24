// frontend/lib/queries/catalog-search-filter.test.ts
//
// GARDIEN — la forme du filtre de recherche du catalogue.
//
// Ce que ce test tient : chaque MOT doit se retrouver dans le texte du produit,
// sa MARQUE ou l'une de ses CATÉGORIES, et arrive PLIÉ (sans casse ni accent).
// Que PocketBase sache résoudre ces chemins sans dupliquer de lignes est gardé
// de l'autre côté, contre un vrai PocketBase :
// `backend/routes/catalog_search_test.go`, dont les chaînes sont celles-ci.
//
// ⚠️ L'import est DYNAMIQUE, comme `catalog-fields.test.ts` : le module
// construit le client PocketBase au chargement, qui lit `window`.

import { beforeAll, describe, expect, it } from 'vitest'

let buildCatalogProductsFilter: (pb: any, query: any) => string | undefined

// `pb.filter` de la vraie bibliothèque lie et échappe les paramètres ; ce double
// ne fait que les nommer, ce qui suffit à lire ce que le filtre demande.
const pb = {
	filter: (gabarit: string, params: Record<string, unknown>) =>
		gabarit.replace(/\{:(\w+)\}/g, (_, cle) => JSON.stringify(params[cle])),
}

beforeAll(async () => {
	const g = globalThis as any
	g.window ??= g
	g.document ??= { location: { origin: 'http://127.0.0.1:8090' } }
	buildCatalogProductsFilter = (await import('./catalog-products'))
		.buildCatalogProductsFilter
})

const filtre = (search?: string) =>
	buildCatalogProductsFilter(pb, { page: 1, perPage: 25, search })

describe('la recherche du catalogue', () => {
	it('cherche dans le produit, sa marque ET ses catégories', () => {
		const f = filtre('lag') as string
		expect(f).toContain('search_text ~ "lag"')
		expect(f).toContain('brand.name_sort ~ "lag"')
		// `?~` : l'UNE des catégories. `~` exigerait qu'elles contiennent TOUTES
		// le mot, et un produit rangé dans deux catégories disparaîtrait.
		expect(f).toContain('categories.name_sort ?~ "lag"')
	})

	it('ne dépend ni de la casse ni des accents saisis', () => {
		// Tous ces mots partent au serveur sous la MÊME forme pliée, celle de
		// `products.search_text` et de `name_sort`.
		const formes = ['ÉCLAT', 'éclat', 'Eclat', 'eclat', 'Éclat']
		const filtres = new Set(formes.map((saisi) => filtre(saisi)))
		expect(filtres.size).toBe(1)
		expect([...filtres][0]).toContain('search_text ~ "eclat"')
		expect([...filtres][0]).not.toMatch(/[É é]clat/)
	})

	it('demande CHAQUE mot, pas la phrase entière', () => {
		const f = filtre('Lag  ÉLECTRIQUE') as string
		// Une clause par mot, reliées par ET : « lag » peut venir de la marque et
		// « electrique » de la catégorie.
		const clauses = f.split(' && ')
		expect(clauses).toHaveLength(2)
		expect(clauses[0]).toContain('"lag"')
		expect(clauses[1]).toContain('"electrique"')
		expect(f).not.toContain('lag electrique')
	})

	it('ne pose aucune clause pour une recherche vide', () => {
		expect(filtre(undefined)).toBeUndefined()
		expect(filtre('')).toBeUndefined()
		expect(filtre('   ')).toBeUndefined()
	})

	it('ne cherche plus sur les champs BRUTS, qui ne pliaient pas les accents', () => {
		const f = filtre('eclat') as string
		expect(f).not.toContain('designation ~')
		expect(f).not.toContain('name ~')
		expect(f).not.toContain('sku ~')
		expect(f).not.toContain('barcode ~')
	})

	it('reste combinable avec les autres filtres', () => {
		const f = buildCatalogProductsFilter(pb, {
			page: 1,
			perPage: 25,
			search: 'lag',
			status: 'published',
		}) as string
		expect(f).toContain('status = "published"')
		expect(f).toContain('search_text ~ "lag"')
		expect(f.split(' && ').length).toBeGreaterThanOrEqual(2)
	})
})
