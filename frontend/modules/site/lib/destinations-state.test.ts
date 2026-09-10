// frontend/modules/site/lib/destinations-state.test.ts
// `pnpm test`
//
// Garde la règle de `destinationsState` : une liste de destinations VIDE n'est
// pas une liste chargée. Avant le 10 septembre 2026 elle l'était, et une
// lecture faite avant la connexion faisait refuser toutes les catégories du
// menu comme « absentes du catalogue ».

import type { SiteMenuRefType } from '@/lib/queries/site-menu'
import { describe, expect, it } from 'vitest'
import { destinationsState } from './publish-menu'

const types = (...t: SiteMenuRefType[]) => new Set(t)

describe('destinationsState', () => {
	it('chargé quand chaque liste employée a des éléments', () => {
		expect(
			destinationsState(types('category', 'page'), {
				category: [{}],
				brand: undefined,
				product: undefined,
			}),
		).toEqual({ loaded: true, vides: [] })
	})

	it('pas chargé tant qu’une liste employée est en cours de lecture', () => {
		expect(
			destinationsState(types('category'), {
				category: undefined,
				brand: [],
				product: [],
			}),
		).toEqual({ loaded: false, vides: [] })
	})

	it('pas chargé, et nommé, quand une liste employée est vide', () => {
		expect(
			destinationsState(types('category', 'product'), {
				category: [],
				brand: [],
				product: [{}],
			}),
		).toEqual({ loaded: false, vides: ['category'] })
	})

	it('une liste vide mais non employée ne bloque rien', () => {
		expect(
			destinationsState(types('page'), {
				category: [],
				brand: [],
				product: [],
			}),
		).toEqual({ loaded: true, vides: [] })
	})
})
