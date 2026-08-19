// frontend/lib/queries/stock-adjust.test.ts

import type PocketBase from 'pocketbase'
import { describe, expect, it } from 'vitest'
import {
	applyStockMovements,
	eventSourceFor,
	eventTypeFor,
	looksLikePocketBaseId,
	nextStock,
	productFilter,
	setCountedStock,
} from './stock-adjust'

// Un PocketBase de comptoir : il tient les produits en mémoire et note ce qu'on
// lui demande d'écrire. Assez pour prouver la règle sans base réelle.
function fakePb(
	produits: Array<{
		id: string
		legacy_id?: string
		name?: string
		stock?: number
	}>,
) {
	const journal: any[] = []
	const updates: Array<{ id: string; data: any }> = []

	const pb = {
		collection(nom: string) {
			if (nom === 'products') {
				return {
					getFirstListItem: async (filtre: string) => {
						const trouve = produits.find(
							(p) =>
								filtre.includes(`id = "${p.id}"`) ||
								(p.legacy_id &&
									filtre.includes(`legacy_id = "${p.legacy_id}"`)),
						)
						if (!trouve) throw new Error("The requested resource wasn't found.")
						return { ...trouve }
					},
					update: async (id: string, data: any) => {
						updates.push({ id, data })
						const cible = produits.find((p) => p.id === id)
						if (cible) cible.stock = data.stock
						return { ...cible }
					},
				}
			}
			return {
				create: async (data: any) => {
					journal.push(data)
					return data
				},
			}
		},
	} as unknown as PocketBase

	return { pb, journal, updates }
}

describe('la résolution des identifiants', () => {
	it('reconnaît la forme des identifiants PocketBase', () => {
		expect(looksLikePocketBaseId('583fjmjlr9l0wh8')).toBe(true)
		// 16 caractères, casses mêlées : c'est du NeDB.
		expect(looksLikePocketBaseId('9XBUS4bQr3jyoJ0j')).toBe(false)
	})

	it('interroge les DEUX champs, id et clé stable', () => {
		// Ne tester que `id` laisserait introuvable un produit désigné par sa clé
		// NeDB — c'est-à-dire tout ce qui vient de la caisse et de l'inventaire.
		const filtre = productFilter('9XBUS4bQr3jyoJ0j')
		expect(filtre).toContain('id = "9XBUS4bQr3jyoJ0j"')
		expect(filtre).toContain('legacy_id = "9XBUS4bQr3jyoJ0j"')
	})

	it('neutralise les guillemets, qui casseraient le filtre', () => {
		expect(productFilter('a"b')).not.toContain('a"b')
	})
})

describe('le calcul du stock', () => {
	it('ajoute un mouvement relatif', () => {
		expect(nextStock(10, { productId: 'x', delta: -3 })).toBe(7)
		expect(nextStock(10, { productId: 'x', delta: 2 })).toBe(12)
	})

	it("laisse l'inventaire poser sa valeur, sans la corriger", () => {
		expect(nextStock(10, { productId: 'x', absolute: 4 })).toBe(4)
	})

	it('fait primer le comptage sur le mouvement', () => {
		expect(nextStock(10, { productId: 'x', absolute: 4, delta: 99 })).toBe(4)
	})

	it('ne plafonne pas à zéro', () => {
		// Un stock négatif dit qu'il s'est vendu plus que ce que la base croyait
		// détenir. L'écraser masquerait la cause.
		expect(nextStock(1, { productId: 'x', delta: -3 })).toBe(-2)
	})
})

describe('le motif décide du journal', () => {
	it('nomme le type et la source, sans les déduire ailleurs', () => {
		expect(eventTypeFor('inventory')).toBe('stock_adjusted_inventory')
		expect(eventSourceFor('inventory')).toBe('inventory_session')
		expect(eventTypeFor('return')).toBe('stock_return')
		expect(eventTypeFor('sale')).toBe('stock_sale')
		expect(eventSourceFor('sale')).toBe('sale')
	})
})

describe('applyStockMovements', () => {
	it('retrouve un produit par sa clé NeDB et écrit dans PocketBase', async () => {
		const { pb, updates } = fakePb([
			{ id: 'pb1', legacy_id: 'nedb1', name: 'Ampli', stock: 5 },
		])

		const [resultat] = await applyStockMovements(
			pb,
			[{ productId: 'nedb1', delta: -2 }],
			{ reason: 'sale' },
		)

		expect(resultat.recordId).toBe('pb1')
		expect(resultat.stockBefore).toBe(5)
		expect(resultat.stockAfter).toBe(3)
		expect(resultat.applied).toBe(true)
		expect(updates).toEqual([{ id: 'pb1', data: { stock: 3 } }])
	})

	it("n'écrit ni ne journalise quand le stock ne bouge pas", async () => {
		// Un comptage conforme n'est pas un mouvement : le journal doit rester
		// lisible, sinon une session d'inventaire y noie les vrais écarts.
		const { pb, updates, journal } = fakePb([
			{ id: 'pb1', legacy_id: 'nedb1', stock: 5 },
		])

		const [resultat] = await applyStockMovements(
			pb,
			[{ productId: 'nedb1', absolute: 5 }],
			{ reason: 'inventory' },
		)

		expect(resultat.applied).toBe(false)
		expect(updates).toHaveLength(0)
		expect(journal).toHaveLength(0)
	})

	it('journalise le mouvement avec ses deux bornes et son delta', async () => {
		const { pb, journal } = fakePb([{ id: 'pb1', name: 'Ampli', stock: 5 }])

		await applyStockMovements(pb, [{ productId: 'pb1', delta: 3 }], {
			reason: 'return',
			sourceId: 'ticket-9',
			operator: 'chris',
		})

		expect(journal).toHaveLength(1)
		expect(journal[0]).toMatchObject({
			product_id: 'pb1',
			event_type: 'stock_return',
			source: 'return',
			source_id: 'ticket-9',
			operator: 'chris',
			before: { stock: 5 },
			after: { stock: 8 },
			delta: { stock: 3 },
		})
	})

	it("rend l'erreur d'un produit introuvable sans arrêter les autres", async () => {
		// 53 produits existent dans NeDB et pas dans PocketBase (mesuré le
		// 18 août 2026) : le cas n'est pas théorique.
		const { pb, updates } = fakePb([{ id: 'pb1', stock: 5 }])

		const resultats = await applyStockMovements(
			pb,
			[{ productId: 'absent-de-pocketbase' }, { productId: 'pb1', delta: -1 }],
			{ reason: 'sale' },
		)

		expect(resultats[0].applied).toBe(false)
		expect(resultats[0].error).toBeTruthy()
		expect(resultats[1].applied).toBe(true)
		expect(updates).toEqual([{ id: 'pb1', data: { stock: 4 } }])
	})

	it('traite un produit sans stock comme un stock à zéro', async () => {
		const { pb } = fakePb([{ id: 'pb1' }])
		const [resultat] = await applyStockMovements(
			pb,
			[{ productId: 'pb1', delta: 2 }],
			{ reason: 'return' },
		)
		expect(resultat.stockBefore).toBe(0)
		expect(resultat.stockAfter).toBe(2)
	})
})

describe('setCountedStock', () => {
	it("pose la valeur comptée et la déclare comme venant de l'inventaire", async () => {
		const { pb, journal } = fakePb([
			{ id: 'pb1', legacy_id: 'nedb1', stock: 12 },
		])

		const resultat = await setCountedStock(pb, 'nedb1', 9, {
			sourceId: 'session-3',
		})

		expect(resultat.stockAfter).toBe(9)
		expect(journal[0]).toMatchObject({
			event_type: 'stock_adjusted_inventory',
			source: 'inventory_session',
			source_id: 'session-3',
		})
	})
})
