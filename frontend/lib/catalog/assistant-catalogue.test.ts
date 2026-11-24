// frontend/lib/catalog/assistant-catalogue.test.ts
//
// GARDIEN — l'assistant du catalogue, côté écran.
//
// Ce que ce test tient :
//   • les critères de l'assistant deviennent LA requête de l'écran, et passent
//     par `buildCatalogProductsFilter` — le filtre de la liste, pas un autre ;
//   • une catégorie se filtre par sa BRANCHE ;
//   • le filtre de prix existe, bornes incluses, et 0 est une borne ;
//   • la phrase ne porte qu'un nombre : celui qu'on lui donne ;
//   • l'historique envoyé au serveur ne porte jamais ce nombre.
//
// De l'autre côté : `backend/routes/assistant_catalogue_routes_test.go`, dont
// le dernier test rejoue les chaînes de filtre ci-dessous contre un vrai
// PocketBase et les compare aux décomptes de `/api/catalog/counts`.
//
// ⚠️ L'import de `catalog-products` est DYNAMIQUE, comme dans
// `catalog-search-filter.test.ts` : le module construit le client PocketBase
// au chargement, qui lit `window`.

import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'

import {
	type CriteresAssistant,
	type EffetAssistant,
	TEXTE_EFFET_HISTORIQUE,
	TOURS_ASSISTANT_MAX,
	historiquePourEnvoi,
	phraseAssistant,
	queryDepuisCriteres,
} from './assistant-catalogue'

let buildCatalogProductsFilter: (pb: any, query: any) => string | undefined

const pb = {
	filter: (gabarit: string, params: Record<string, unknown>) =>
		gabarit.replace(/\{:(\w+)\}/g, (_, cle) => JSON.stringify(params[cle])),
}

beforeAll(async () => {
	const g = globalThis as any
	g.window ??= g
	g.document ??= { location: { origin: 'http://127.0.0.1:8090' } }
	buildCatalogProductsFilter = (await import('@/lib/queries/catalog-products'))
		.buildCatalogProductsFilter
})

const VIDES: CriteresAssistant = {
	search: '',
	status: '',
	brandId: '',
	withoutBrand: false,
	categoryId: '',
	withoutCategory: false,
	commercialState: '',
	saleState: '',
	missingImage: false,
	missingDescription: false,
	missingPurchasePrice: false,
	emptyStock: false,
	withStockB: false,
	featured: false,
	priceMin: null,
	priceMax: null,
	sortId: '',
	sortDesc: false,
}

const CATEGORIES = [
	{ id: 'guit', name: 'Guitares', parent: '' },
	{ id: 'class', name: 'Classiques', parent: 'guit' },
	{ id: 'folk', name: 'Folk', parent: 'guit' },
	{ id: 'micro', name: 'Microphones', parent: '' },
]

const effet = (
	criteres: Partial<CriteresAssistant>,
	action: EffetAssistant['action'] = 'filtrer',
): EffetAssistant => ({
	action,
	criteres: { ...VIDES, ...criteres },
	libelles: { marque: 'Prodipe', categorie: 'Guitares > Classiques' },
	reglages: {},
})

const filtre = (criteres: Partial<CriteresAssistant>) =>
	buildCatalogProductsFilter(
		pb,
		queryDepuisCriteres({ ...VIDES, ...criteres }, CATEGORIES, 'soc1'),
	)

describe("les critères de l'assistant passent par le filtre de l'écran", () => {
	it('« guitares classiques Prodipe entre 0 et 500 € »', () => {
		expect(
			filtre({
				brandId: 'mprodipe',
				categoryId: 'class',
				priceMin: 0,
				priceMax: 500,
			}),
		).toBe(
			'company = "soc1" && brand = "mprodipe" && (categories ~ "class") && price_ttc >= 0 && price_ttc <= 500',
		)
	})

	it('une catégorie se filtre par sa branche entière', () => {
		const f = filtre({ categoryId: 'guit' }) as string
		for (const id of ['guit', 'class', 'folk']) {
			expect(f).toContain(`categories ~ "${id}"`)
		}
		expect(f).not.toContain('micro')
	})

	it('une catégorie inconnue ne devient pas « pas de filtre »', () => {
		expect(filtre({ categoryId: 'disparue' })).toContain(
			'categories ~ "disparue"',
		)
	})

	it('sans critère, seule reste l’entreprise', () => {
		expect(filtre({})).toBe('company = "soc1"')
	})

	it('pose chaque manette de l’écran', () => {
		const f = filtre({
			search: 'Éclat',
			status: 'published',
			withoutBrand: true,
			withoutCategory: true,
			commercialState: 'used',
			saleState: 'promo',
			missingImage: true,
			emptyStock: true,
			withStockB: true,
			featured: true,
		}) as string
		for (const clause of [
			'status = "published"',
			'brand:length = 0',
			'categories:length = 0',
			'commercial_state = "used"',
			'sale_state = "promo"',
			'image:length = 0',
			'stock = 0',
			'stock_b > 0',
			'featured = true',
			'search_text ~ "eclat"',
		]) {
			expect(f).toContain(clause)
		}
	})
})

describe('le filtre de prix', () => {
	const prix = (priceMin?: number, priceMax?: number) =>
		buildCatalogProductsFilter(pb, { page: 1, perPage: 25, priceMin, priceMax })

	it('porte sur le prix de vente TTC, bornes incluses', () => {
		expect(prix(100, 300)).toBe('price_ttc >= 100 && price_ttc <= 300')
		expect(prix(undefined, 300)).toBe('price_ttc <= 300')
	})

	it('0 est une borne, pas une absence', () => {
		expect(prix(0, undefined)).toBe('price_ttc >= 0')
	})

	it('une valeur qui n’est pas un nombre ne part pas', () => {
		expect(prix(Number.NaN, Number.POSITIVE_INFINITY)).toBeUndefined()
	})
})

describe('la clé de cache de la liste', () => {
	// `featured` a manqué à la clé : le filtre changeait, la lecture ne
	// repartait pas. Tout champ de `CatalogProductQuery` lu par le filtre doit
	// être dans la clé de `useCatalogProducts`.
	it('porte tous les champs de la requête', () => {
		const source = readFileSync(
			new URL('../queries/catalog-products.ts', import.meta.url),
			'utf8',
		)
		const type = source.match(
			/export type CatalogProductQuery = \{([\s\S]*?)\n\}/,
		)?.[1] as string
		const champs = [...type.matchAll(/^\t(\w+)\??:/gm)].map((m) => m[1])
		const cle = source.match(
			/queryKey: \[\s*'catalog-products',([\s\S]*?)\],/,
		)?.[1] as string
		expect(champs.length).toBeGreaterThan(15)
		for (const champ of champs) {
			expect(cle, `« ${champ} » manque à la clé de cache`).toMatch(
				new RegExp(`\\b${champ}\\b`),
			)
		}
	})
})

describe("la phrase de l'assistant", () => {
	it('dit ce qui est posé et le nombre de la liste', () => {
		expect(
			phraseAssistant(
				effet({
					brandId: 'm',
					categoryId: 'class',
					priceMin: 0,
					priceMax: 500,
				}),
				12,
			),
		).toBe(
			'12 produits : marque Prodipe, catégorie Guitares > Classiques, de 0 € à 500 €.',
		)
	})

	it('accorde et dit zéro', () => {
		expect(phraseAssistant(effet({ brandId: 'm' }), 1)).toBe(
			'1 produit : marque Prodipe.',
		)
		expect(phraseAssistant(effet({ brandId: 'm' }), 0)).toBe(
			'Aucun produit : marque Prodipe.',
		)
	})

	it('un décompte dit que la liste n’a pas bougé', () => {
		expect(phraseAssistant(effet({ brandId: 'm' }, 'compter'), 287)).toBe(
			"287 produits : marque Prodipe. La liste n'a pas changé.",
		)
	})

	it('sans filtre, dit que tout est retiré', () => {
		expect(phraseAssistant(effet({}), 2999)).toMatch(/^Filtres retirés : /)
	})
})

describe("l'historique envoyé au serveur", () => {
	it('ne porte aucun nombre pour un effet', () => {
		for (const texte of Object.values(TEXTE_EFFET_HISTORIQUE)) {
			expect(texte).not.toMatch(/\d/)
		}
	})

	it('est borné aux derniers tours', () => {
		const tours = Array.from({ length: 30 }, (_, i) => ({
			role: i % 2 ? ('model' as const) : ('user' as const),
			texte: `t${i}`,
		}))
		const envoyes = historiquePourEnvoi(tours)
		expect(envoyes).toHaveLength(TOURS_ASSISTANT_MAX)
		expect(envoyes.at(-1)?.texte).toBe('t29')
	})
})
