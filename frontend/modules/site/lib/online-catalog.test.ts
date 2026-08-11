// frontend/modules/site/lib/online-catalog.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// LA RÈGLE DE MISE EN LIGNE — cas vérifiés
// ═══════════════════════════════════════════════════════════════════════════
// `pnpm test`
//
// Cette règle décide de ce qui existe sur le site. Elle n'a pas d'autre
// gardien : elle n'est écrite nulle part dans le schéma — délibérément, la
// publication étant dérivée et non saisie. Une régression ici ferait
// disparaître une branche entière de la navigation sans qu'aucune erreur ne
// soit levée.
//
// Aucun réseau, aucune base : `buildOnlineCatalog` prend ses trois collections
// en paramètre.
// ═══════════════════════════════════════════════════════════════════════════

import type {
	CatalogBrand,
	CatalogCategory,
	CatalogProduct,
} from '@/lib/queries/site-catalog'
import { describe, expect, it } from 'vitest'
import { buildOnlineCatalog } from './online-catalog'

const cat = (id: string, parent = ''): CatalogCategory => ({
	id,
	collectionId: 'c',
	collectionName: 'categories',
	legacy_id: id,
	name: id,
	parent,
})

const prod = (
	id: string,
	categories: string[] = [],
	brand = '',
): CatalogProduct => ({
	id,
	collectionId: 'p',
	collectionName: 'products',
	legacy_id: id,
	name: id,
	status: 'published',
	categories,
	brand,
})

const brand = (id: string): CatalogBrand => ({
	id,
	collectionId: 'b',
	collectionName: 'brands',
	legacy_id: id,
	name: id,
})

/** Aplatit l'arbre en identifiants, pour comparer sans dépendre de la forme. */
const flatten = (nodes: ReturnType<typeof buildOnlineCatalog>['tree']) => {
	const out: string[] = []
	const walk = (ns: typeof nodes) => {
		for (const n of ns) {
			out.push(n.category.id)
			walk(n.children)
		}
	}
	walk(nodes)
	return out.sort()
}

describe('buildOnlineCatalog', () => {
	it('ne met en ligne aucune catégorie sans produit publié', () => {
		const r = buildOnlineCatalog([], [cat('a'), cat('b', 'a')], [])

		expect(r.tree).toEqual([])
		expect(r.onlineCategoryIds.size).toBe(0)
	})

	it('met en ligne les ancêtres d’une catégorie qui porte un produit', () => {
		// racine → milieu → feuille, le produit n'est QUE sur la feuille
		const cats = [
			cat('racine'),
			cat('milieu', 'racine'),
			cat('feuille', 'milieu'),
		]
		const r = buildOnlineCatalog([prod('p1', ['feuille'])], cats, [])

		expect(flatten(r.tree)).toEqual(['feuille', 'milieu', 'racine'])
		expect(r.tree).toHaveLength(1)
		expect(r.tree[0].category.id).toBe('racine')
	})

	it('laisse hors ligne une sœur sans produit publié', () => {
		const cats = [
			cat('racine'),
			cat('gauche', 'racine'),
			cat('droite', 'racine'),
		]
		const r = buildOnlineCatalog([prod('p1', ['gauche'])], cats, [])

		expect(flatten(r.tree)).toEqual(['gauche', 'racine'])
		expect(r.onlineCategoryIds.has('droite')).toBe(false)
	})

	it('compte le produit une seule fois dans l’ancêtre commun de deux sœurs', () => {
		const cats = [
			cat('racine'),
			cat('gauche', 'racine'),
			cat('droite', 'racine'),
		]
		const r = buildOnlineCatalog([prod('p1', ['gauche', 'droite'])], cats, [])

		const racine = r.tree[0]
		expect(racine.directCount).toBe(0)
		expect(racine.totalCount).toBe(1)
		expect(racine.children.map((c) => c.totalCount)).toEqual([1, 1])
	})

	it('cumule direct et descendance dans totalCount', () => {
		const cats = [cat('racine'), cat('enfant', 'racine')]
		const r = buildOnlineCatalog(
			[prod('p1', ['racine']), prod('p2', ['enfant'])],
			cats,
			[],
		)

		expect(r.tree[0].directCount).toBe(1)
		expect(r.tree[0].totalCount).toBe(2)
	})

	it('signale les produits publiés sans aucune catégorie', () => {
		const r = buildOnlineCatalog(
			[prod('p1'), prod('p2', ['a'])],
			[cat('a')],
			[],
		)

		expect(r.uncategorized.map((p) => p.id)).toEqual(['p1'])
	})

	it('signale une catégorie citée mais absente, sans perdre le produit', () => {
		const r = buildOnlineCatalog([prod('p1', ['fantome'])], [cat('a')], [])

		expect(r.missingCategoryIds).toEqual(['fantome'])
		// Rattaché à rien d'existant : il partirait sans point d'entrée.
		expect(r.uncategorized.map((p) => p.id)).toEqual(['p1'])
	})

	it('remonte à la racine une catégorie dont le parent n’existe pas', () => {
		// L'arbre chargé n'a aucun parent manquant ; si cela changeait, la
		// branche doit rester visible plutôt que disparaître de l'affichage.
		const r = buildOnlineCatalog(
			[prod('p1', ['orpheline'])],
			[cat('orpheline', 'disparue')],
			[],
		)

		expect(r.tree.map((n) => n.category.id)).toEqual(['orpheline'])
	})

	it('ne boucle pas sur un cycle de parenté', () => {
		const cats = [cat('a', 'b'), cat('b', 'a')]
		const r = buildOnlineCatalog([prod('p1', ['a'])], cats, [])

		expect(r.onlineCategoryIds.has('a')).toBe(true)
		expect(r.onlineCategoryIds.has('b')).toBe(true)
	})

	it('ne retient que les marques portant un produit publié, par volume', () => {
		const r = buildOnlineCatalog(
			[
				prod('p1', [], 'yamaha'),
				prod('p2', [], 'yamaha'),
				prod('p3', [], 'fender'),
			],
			[],
			[brand('yamaha'), brand('fender'), brand('inutilisee')],
		)

		expect(r.brands.map((b) => [b.brand.id, b.productCount])).toEqual([
			['yamaha', 2],
			['fender', 1],
		])
	})
})
