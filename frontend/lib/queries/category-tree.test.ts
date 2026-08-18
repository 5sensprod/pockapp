// frontend/lib/queries/category-tree.test.ts

import { describe, expect, it } from 'vitest'
import {
	type CategoryNode,
	collectBranchIds,
	toCategoryOptions,
} from './category-tree'

//  Guitares ─┬─ Électriques ─── Solid body
//            └─ Acoustiques
//  Batteries
const arbre: CategoryNode[] = [
	{ id: 'g', name: 'Guitares', parent: '' },
	{ id: 'e', name: 'Électriques', parent: 'g' },
	{ id: 's', name: 'Solid body', parent: 'e' },
	{ id: 'a', name: 'Acoustiques', parent: 'g' },
	{ id: 'b', name: 'Batteries' },
]

describe('collectBranchIds', () => {
	it('rend la racine et TOUTE sa descendance, pas seulement ses enfants directs', () => {
		expect(collectBranchIds(arbre, 'g').sort()).toEqual(['a', 'e', 'g', 's'])
	})

	it('rend la feuille seule quand la feuille est demandée', () => {
		expect(collectBranchIds(arbre, 's')).toEqual(['s'])
	})

	it('rend le nœud intermédiaire et ce qui pend dessous', () => {
		expect(collectBranchIds(arbre, 'e').sort()).toEqual(['e', 's'])
	})

	it('rend une liste vide pour une catégorie inconnue — jamais tout le catalogue', () => {
		// Un filtre qui ne trouve pas sa catégorie doit ne rien rendre. Rendre
		// `[]` en le traitant comme « pas de filtre » afficherait 2999 produits
		// sous une catégorie qui n'existe pas.
		expect(collectBranchIds(arbre, 'inconnue')).toEqual([])
		expect(collectBranchIds(arbre, '')).toEqual([])
	})

	it('ne boucle pas sur un cycle de parenté', () => {
		const cycle: CategoryNode[] = [
			{ id: 'x', name: 'X', parent: 'y' },
			{ id: 'y', name: 'Y', parent: 'x' },
		]
		expect(collectBranchIds(cycle, 'x').sort()).toEqual(['x', 'y'])
	})
})

describe('toCategoryOptions', () => {
	it("suit l'ordre de l'arbre, fratries par ordre alphabétique", () => {
		expect(toCategoryOptions(arbre).map((o) => o.id)).toEqual([
			'b', // Batteries, racine, avant Guitares
			'g',
			'a', // Acoustiques avant Électriques
			'e',
			's',
		])
	})

	it('donne la profondeur, pour indenter', () => {
		const parId = new Map(toCategoryOptions(arbre).map((o) => [o.id, o.depth]))
		expect(parId.get('g')).toBe(0)
		expect(parId.get('e')).toBe(1)
		expect(parId.get('s')).toBe(2)
	})

	it('remonte à la racine une catégorie dont le parent a disparu', () => {
		// Sinon elle n'apparaît nulle part, et devient impossible à filtrer.
		const orpheline: CategoryNode[] = [
			{ id: 'o', name: 'Orpheline', parent: 'parti' },
		]
		expect(toCategoryOptions(orpheline)).toEqual([
			{ id: 'o', name: 'Orpheline', depth: 0 },
		])
	})

	it("n'oublie et ne duplique aucune catégorie", () => {
		expect(toCategoryOptions(arbre)).toHaveLength(arbre.length)
	})
})
