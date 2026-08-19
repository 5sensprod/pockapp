// frontend/lib/queries/stock-adjust.test.ts

import type PocketBase from 'pocketbase'
import { describe, expect, it } from 'vitest'
import {
	applyStockMovements,
	eventSourceFor,
	eventTypeFor,
	recordSale,
	setCountedStock,
	toSoldLines,
} from './stock-adjust'

// Un PocketBase de comptoir. Depuis le 19 août 2026, le mouvement passe par
// `POST /api/stock/adjust` : le faux implémente donc `send`, avec la même
// sémantique que `backend/routes/stock_routes.go`. `updates` note ce qui a été
// écrit, comme avant — c'est ce que les tests vérifient.
function fakePb(
	produits: Array<{
		id: string
		legacy_id?: string
		name?: string
		sku?: string
		stock?: number
	}>,
) {
	const journal: any[] = []
	const updates: Array<{ id: string; data: any }> = []
	const envois: any[] = []

	const pb = {
		send: async (chemin: string, config: any) => {
			envois.push({ chemin, body: config?.body })
			if (chemin !== '/api/stock/adjust') {
				throw new Error(`route inattendue : ${chemin}`)
			}

			const results = (config.body.movements as any[]).map((m) => {
				const trouve = produits.find(
					(p) => p.id === m.product_id || p.legacy_id === m.product_id,
				)
				if (!trouve) {
					return {
						product_id: m.product_id,
						record_id: '',
						product_name: '',
						product_sku: '',
						stock_before: null,
						stock_after: null,
						applied: false,
						error: "The requested resource wasn't found.",
					}
				}

				const avant = trouve.stock ?? 0
				const apres =
					typeof m.absolute === 'number' ? m.absolute : avant + (m.delta ?? 0)
				const applied = apres !== avant
				if (applied) {
					updates.push({ id: trouve.id, data: { stock: apres } })
					trouve.stock = apres
				}

				return {
					product_id: m.product_id,
					record_id: trouve.id,
					product_name: trouve.name ?? '',
					product_sku: trouve.sku ?? '',
					stock_before: avant,
					stock_after: apres,
					applied,
				}
			})

			return { results }
		},
		collection(nom: string) {
			if (nom === 'products') {
				// Plus aucun mouvement ne doit passer par là : le stock ne se lit ni
				// ne s'écrit depuis le client.
				throw new Error('la collection products ne doit plus être touchée ici')
			}
			return {
				create: async (data: any) => {
					journal.push(data)
					return data
				},
			}
		},
	} as unknown as PocketBase

	return { pb, journal, updates, envois }
}

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

describe('recordSale', () => {
	it('décrémente, et accepte les deux noms de quantité', async () => {
		// `quantity` en caisse, `quantitySold` dans les factures : les deux
		// formats existaient dans les appelants, la couche les prend tels quels
		// plutôt que d'aller les renommer dans six fichiers.
		const { pb, updates } = fakePb([
			{ id: 'a', stock: 10 },
			{ id: 'b', stock: 4 },
		])

		await recordSale(pb, [
			{ productId: 'a', quantity: 3 },
			{ productId: 'b', quantitySold: 1 },
		])

		expect(updates).toEqual([
			{ id: 'a', data: { stock: 7 } },
			{ id: 'b', data: { stock: 3 } },
		])
	})

	it('ignore les lignes libres et les quantités nulles', async () => {
		// Un document porte des lignes sans produit — une remise, un forfait.
		const { pb, updates } = fakePb([{ id: 'a', stock: 10 }])
		await recordSale(pb, [
			{ productId: '', quantity: 2 },
			{ productId: 'a', quantity: 0 },
		])
		expect(updates).toHaveLength(0)
	})

	it('journalise la vente avec sa quantité', async () => {
		const { pb, journal } = fakePb([{ id: 'a', stock: 10 }])
		await recordSale(pb, [{ productId: 'a', quantity: 2 }], {
			sourceId: 'ticket-1',
		})
		expect(journal[0]).toMatchObject({
			event_type: 'stock_sale',
			source: 'sale',
			source_id: 'ticket-1',
			delta: { stock: -2 },
			metadata: { quantity_sold: 2 },
		})
	})

	it('ne lève jamais : un encaissement ne se refuse pas après coup', async () => {
		// Le ticket est déjà enregistré quand on arrive ici. Refuser laisserait
		// un client payé sans vente.
		const pb = {
			collection: () => {
				throw new Error('base injoignable')
			},
		} as any
		const resultats = await recordSale(pb, [{ productId: 'a', quantity: 1 }])
		expect(resultats).toHaveLength(1)
		expect(resultats[0].applied).toBe(false)
		expect(resultats[0].error).toBeTruthy()
	})
})

describe('toSoldLines', () => {
	it('ne garde que les lignes qui portent un produit et une quantité', () => {
		expect(
			toSoldLines([
				{ product_id: 'a', name: 'Ampli', quantity: 2 },
				{ product_id: null, name: 'Remise', quantity: 1 },
				{ product_id: 'b', name: 'Cable', quantity: 0 },
			]),
		).toEqual([{ productId: 'a', productName: 'Ampli', quantity: 2 }])
	})
})

describe('le mouvement passe par le serveur, et par lui seul', () => {
	it("n'écrit jamais le stock depuis le client", async () => {
		// La règle du 19 août 2026. Elle n'a pas d'autre gardien : un
		// `pb.collection('products').update({ stock })` compilerait, marcherait à
		// l'écran, et ne se verrait qu'au moment où deux postes vendent le même
		// produit. Le faux PocketBase lève dès qu'on touche la collection.
		const { pb, envois } = fakePb([{ id: 'pb1', stock: 5 }])

		await applyStockMovements(pb, [{ productId: 'pb1', delta: -1 }], {
			reason: 'sale',
		})

		expect(envois).toHaveLength(1)
		expect(envois[0].chemin).toBe('/api/stock/adjust')
	})

	it('envoie le lot entier en un seul appel, pas un appel par ligne', async () => {
		// Un appel par ligne rouvrirait la fenêtre qu'on vient de fermer entre
		// les lignes d'un même ticket.
		const { pb, envois } = fakePb([
			{ id: 'a', stock: 10 },
			{ id: 'b', stock: 4 },
		])

		await recordSale(pb, [
			{ productId: 'a', quantity: 3 },
			{ productId: 'b', quantity: 1 },
		])

		expect(envois).toHaveLength(1)
		expect(envois[0].body.movements).toHaveLength(2)
	})

	it('rapproche les résultats par position, pas par identifiant', async () => {
		// Un même produit peut figurer deux fois dans un ticket. Rapprocher par
		// `product_id` collerait le résultat de la première ligne sur la seconde.
		const { pb } = fakePb([{ id: 'a', stock: 10 }])

		const resultats = await applyStockMovements(
			pb,
			[
				{ productId: 'a', delta: -1 },
				{ productId: 'a', delta: -2 },
			],
			{ reason: 'sale' },
		)

		expect(resultats[0].stockBefore).toBe(10)
		expect(resultats[0].stockAfter).toBe(9)
		expect(resultats[1].stockBefore).toBe(9)
		expect(resultats[1].stockAfter).toBe(7)
	})

	it("rend l'échec ligne par ligne quand la route ne répond pas", async () => {
		// La caisse ne doit jamais voir une exception remonter d'ici : le ticket
		// est déjà encaissé quand on arrive là.
		const pb = {
			send: async () => {
				throw new Error('serveur injoignable')
			},
		} as unknown as PocketBase

		const resultats = await applyStockMovements(
			pb,
			[{ productId: 'a', delta: -1 }],
			{ reason: 'sale' },
		)

		expect(resultats).toHaveLength(1)
		expect(resultats[0].applied).toBe(false)
		expect(resultats[0].error).toContain('injoignable')
	})

	it("journalise le nom rendu par le serveur quand l'appelant n'en donne pas", async () => {
		// L'inventaire ne passe pas de nom : sans le nom rendu par la route, le
		// journal perdrait le libellé au moment du comptage.
		const { pb, journal } = fakePb([
			{ id: 'pb1', name: 'Ampli', sku: 'AMP-1', stock: 12 },
		])

		await setCountedStock(pb, 'pb1', 9)

		expect(journal[0]).toMatchObject({
			product_name_snapshot: 'Ampli',
			product_sku_snapshot: 'AMP-1',
		})
	})
})
