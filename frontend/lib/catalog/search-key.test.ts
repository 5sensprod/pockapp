// frontend/lib/catalog/search-key.test.ts
// GARDIEN — le pliage de la recherche. Mêmes cas que
// `backend/catalog/searchkey/searchkey_test.go` : la clé existe des deux côtés
// du réseau, et une divergence ferait zéro résultat sans aucune erreur.

import { describe, expect, it } from 'vitest'
import {
	MAX_MOTS_RECHERCHE,
	cleDeRecherche,
	motsDeRecherche,
} from './search-key'

const casPartages: Record<string, string> = {
	Éclat: 'eclat',
	ÉCLAT: 'eclat',
	eclat: 'eclat',
	'Cœur de Lion': 'coeur de lion',
	COEUR: 'coeur',
	Æther: 'aether',
	'Guitare   FOLK': 'guitare folk',
	'  Ukulélé  ': 'ukulele',
	'ABG S14SH': 'abg s14sh',
	'10" CL Clear': '10" cl clear',
	'Crème brûlée': 'creme brulee',
	'': '',
	'   ': '',
}

describe('cleDeRecherche', () => {
	it.each(Object.entries(casPartages))('plie %j en %j', (entree, attendu) => {
		expect(cleDeRecherche(entree)).toBe(attendu)
	})

	it('ne dépend ni de la casse ni des accents saisis', () => {
		// Le cas demandé : « ÉCLAT », « éclat », « Eclat » et « eclat » sont la
		// même recherche.
		const formes = ['ÉCLAT', 'éclat', 'Eclat', 'eclat', 'ÈCLAT']
		expect(new Set(formes.map(cleDeRecherche)).size).toBe(1)
	})

	it('plie aussi une forme décomposée (e + accent combinant)', () => {
		// Un clavier ou un copier-coller peut donner « é » en deux points de code.
		expect(cleDeRecherche('éclat')).toBe('eclat')
	})
})

describe('motsDeRecherche', () => {
	it('découpe et plie', () => {
		expect(motsDeRecherche('  LAG   Guitare  ÉLECTRIQUE ')).toEqual([
			'lag',
			'guitare',
			'electrique',
		])
	})

	it('rend une liste vide pour une recherche vide', () => {
		expect(motsDeRecherche('')).toEqual([])
		expect(motsDeRecherche('   ')).toEqual([])
	})

	it('borne le nombre de mots', () => {
		const mots = motsDeRecherche('a b c d e f g h i j')
		expect(mots).toHaveLength(MAX_MOTS_RECHERCHE)
	})
})
