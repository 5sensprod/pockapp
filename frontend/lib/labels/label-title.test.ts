// frontend/lib/labels/label-title.test.ts
//
// GARDIEN : l'étiquette porte la désignation, jamais le nom du site.
//
// `name` est le titre de la page produit sur axemusique.shop — écrit pour le
// référencement, long, parfois très long. `designation` est le nom du
// comptoir, celui qui part déjà sur le ticket de caisse. Les deux existent
// côte à côte dans la même fiche, et prendre l'un pour l'autre ne casse rien :
// ça imprime juste la mauvaise chose, discrètement, sur du papier.

import { describe, expect, it } from 'vitest'

import { labelTitle } from './render-product-label'

describe("le nom imprimé sur l'étiquette", () => {
	it('est la désignation', () => {
		expect(labelTitle({ designation: 'Ampli Blackstar HT-5' })).toBe(
			'Ampli Blackstar HT-5',
		)
	})

	it('ne retombe JAMAIS sur le nom du site, même sans désignation', () => {
		const produit = {
			designation: '',
			// Ce que `name` contient en vrai, sur une fiche publiée.
			name: 'Amplificateur guitare électrique Blackstar HT-5R MkII 5W lampes — Axe Musique',
		} as Parameters<typeof labelTitle>[0] & { name: string }

		expect(labelTitle(produit)).toBe('')
	})

	it('tolère une désignation absente', () => {
		expect(labelTitle({})).toBe('')
	})
})
