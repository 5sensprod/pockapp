// frontend/lib/queries/product-stock-history.test.ts

import { describe, expect, it, vi } from 'vitest'

import type { ProductEvent } from '@/lib/product-events/product-events-types'

// `use-pocketbase.ts` construit un client dès l'import : on n'en teste que les
// fonctions pures, le hook n'est jamais appelé.
vi.mock('@/lib/use-pocketbase', () => ({ usePocketBase: () => ({}) }))

import {
	STOCK_EVENT_LABELS,
	STOCK_EVENT_TYPES,
	stockHistoryFilter,
	toStockHistoryLine,
} from './product-stock-history'
import { eventTypeFor } from './stock-adjust'

// Le vrai `pb.filter` substitue les paramètres ; on garde l'expression et les
// paramètres séparés pour vérifier qu'aucun identifiant n'est interpolé.
const pb = {
	filter: (expression: string, params?: Record<string, unknown>) =>
		JSON.stringify({ expression, params }),
}

function evenement(partiel: Partial<ProductEvent>): ProductEvent {
	return {
		id: 'e1',
		product_id: 'pb1',
		product_name_snapshot: '',
		product_sku_snapshot: '',
		event_type: 'stock_sale',
		source: 'sale',
		source_id: null,
		operator: '',
		occurred_at: '2026-09-10 14:00:00.000Z',
		before: null,
		after: null,
		delta: null,
		metadata: null,
		created: '2026-09-10 14:00:00.000Z',
		updated: '',
		collectionId: '',
		collectionName: 'product_events',
		...partiel,
	}
}

describe('stockHistoryFilter', () => {
	it('interroge aussi la clé NeDB : les événements d’avant le 19 août la portent', () => {
		const { expression, params } = JSON.parse(
			stockHistoryFilter(pb, 'pb1', 'nedb1'),
		)
		expect(expression).toContain('product_id = {:legacy}')
		expect(params).toMatchObject({ id: 'pb1', legacy: 'nedb1' })
		expect(expression).not.toContain('pb1')
	})

	it('ne double pas la condition quand la clé stable est l’identifiant lui-même', () => {
		const { expression } = JSON.parse(stockHistoryFilter(pb, 'pb1', 'pb1'))
		expect(expression).not.toContain('{:legacy}')
	})

	it('ne lit que les événements de stock', () => {
		const { params } = JSON.parse(stockHistoryFilter(pb, 'pb1'))
		expect(Object.values(params)).toEqual(
			expect.arrayContaining([...STOCK_EVENT_TYPES]),
		)
		expect(Object.values(params)).not.toContain('sale_price_changed')
	})
})

describe('les types et leurs libellés', () => {
	it('chaque type de stock a un libellé', () => {
		for (const type of STOCK_EVENT_TYPES) {
			expect(STOCK_EVENT_LABELS[type]).toBeTruthy()
		}
	})

	it('chaque motif écrit par la couche de mouvement est lu par l’historique', () => {
		// Un motif ajouté à `stock-adjust.ts` et oublié ici serait journalisé,
		// puis invisible sur la fiche.
		for (const motif of [
			'inventory',
			'return',
			'sale',
			'restock',
			'correction',
			'loss',
			'to_stock_b',
			'other',
		] as const) {
			expect(STOCK_EVENT_TYPES).toContain(eventTypeFor(motif))
		}
	})
})

describe('toStockHistoryLine', () => {
	it('rend bornes, delta et commentaire', () => {
		const ligne = toStockHistoryLine(
			evenement({
				event_type: 'stock_restock',
				before: { stock: 4 },
				after: { stock: 10 },
				delta: { stock: 6 },
				metadata: { comment: 'BL 2231', origin: 'product_detail' },
			}),
		)
		expect(ligne).toMatchObject({
			label: 'Réassort',
			before: 4,
			after: 10,
			delta: 6,
			detail: 'BL 2231',
			occurredAt: '2026-09-10T14:00:00.000Z',
		})
	})

	it('recalcule le delta quand l’événement ne le porte pas', () => {
		const ligne = toStockHistoryLine(
			evenement({ before: { stock: 5 }, after: { stock: 3 } }),
		)
		expect(ligne.delta).toBe(-2)
	})

	it('ne fait pas passer une saisie de la fiche pour un inventaire', () => {
		const ligne = toStockHistoryLine(
			evenement({
				event_type: 'stock_adjusted_inventory',
				metadata: { origin: 'product_detail' },
			}),
		)
		expect(ligne.label).toBe('Modification depuis la fiche (sans motif)')
	})

	it('lit les deux compteurs d’un passage en Stock B', () => {
		const ligne = toStockHistoryLine(
			evenement({
				event_type: 'stock_to_stock_b',
				before: { stock: 5, stock_b: 0 },
				after: { stock: 4, stock_b: 1 },
				delta: { stock: -1, stock_b: 1 },
			}),
		)
		expect(ligne).toMatchObject({
			label: 'Passage en Stock B',
			delta: -1,
			deltaB: 1,
			beforeB: 0,
			afterB: 1,
		})
	})

	it('n’invente pas de compteur B sur un événement ancien', () => {
		const ligne = toStockHistoryLine(
			evenement({ before: { stock: 5 }, after: { stock: 4 } }),
		)
		expect(ligne.deltaB).toBeNull()
	})

	it('dit où est parti un retour', () => {
		const ligne = toStockHistoryLine(
			evenement({
				event_type: 'stock_return',
				metadata: { destination: 'restock' },
			}),
		)
		expect(ligne.detail).toBe('remis en vente')
	})
})
