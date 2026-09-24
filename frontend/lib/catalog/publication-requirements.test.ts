// frontend/lib/catalog/publication-requirements.test.ts
// GARDIEN — la règle « pas de publication sans image ni catégorie », partagée
// par la fiche et par le lot de la page produits.

import { describe, expect, it } from 'vitest'
import {
	MANQUE_CATEGORIE,
	MANQUE_IMAGE,
	dire,
	manquesPourPublier,
} from './publication-requirements'

describe('manquesPourPublier', () => {
	it('une fiche complète est publiable', () => {
		expect(manquesPourPublier({ image: 'a.jpg', categories: ['c1'] })).toEqual(
			[],
		)
	})

	it('dit ce qui manque, image d’abord', () => {
		expect(manquesPourPublier({ image: '', categories: [] })).toEqual([
			MANQUE_IMAGE,
			MANQUE_CATEGORIE,
		])
		expect(manquesPourPublier({ image: '', categories: ['c1'] })).toEqual([
			MANQUE_IMAGE,
		])
		expect(manquesPourPublier({ image: 'a.jpg', categories: [] })).toEqual([
			MANQUE_CATEGORIE,
		])
	})

	it('traite l’absence comme un manque : champ non demandé, null, espaces', () => {
		expect(manquesPourPublier({})).toEqual([MANQUE_IMAGE, MANQUE_CATEGORIE])
		expect(manquesPourPublier({ image: null, categories: null })).toEqual([
			MANQUE_IMAGE,
			MANQUE_CATEGORIE,
		])
		expect(manquesPourPublier({ image: '   ', categories: ['c'] })).toEqual([
			MANQUE_IMAGE,
		])
	})

	it('une image choisie mais pas encore enregistrée ne manque pas', () => {
		// Propre à la fiche : elle la porte à l'enregistrement.
		expect(
			manquesPourPublier({
				image: '',
				categories: ['c'],
				imageEnAttente: true,
			}),
		).toEqual([])
	})
})

describe('dire', () => {
	it('joint par « et »', () => {
		expect(dire([MANQUE_IMAGE, MANQUE_CATEGORIE])).toBe(
			'une image principale et une catégorie',
		)
		expect(dire([MANQUE_IMAGE])).toBe('une image principale')
	})
})
