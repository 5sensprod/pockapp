import { describe, expect, it } from 'vitest'
import {
	buildDocumentSearchFilter,
	parseDocumentSearchAmount,
} from '../document-search'

const formatFilter = (
	expression: string,
	params: Record<string, unknown>,
): string =>
	expression.replace(/\{:(\w+)\}/g, (_, key: string) =>
		JSON.stringify(params[key]),
	)

describe('parseDocumentSearchAmount', () => {
	it.each([
		['1250', 1250],
		['1250.50', 1250.5],
		['1 250,50 €', 1250.5],
		['1\u202f250,50', 1250.5],
	])('reconnaît le montant %s', (input, expected) => {
		expect(parseDocumentSearchAmount(input)).toBe(expected)
	})

	it.each(['FAC-2026-001', 'guitare 120', '12,345', ''])(
		'ignore le texte non exclusivement monétaire %s',
		(input) => {
			expect(parseDocumentSearchAmount(input)).toBeUndefined()
		},
	)
})

describe('buildDocumentSearchFilter', () => {
	it('cherche dans le numéro, les notes, les descriptions et le client', () => {
		const filter = buildDocumentSearchFilter({
			term: 'guitare',
			customerIds: ['client-1'],
			formatFilter,
		})

		expect(filter).toContain('number ~ "guitare"')
		expect(filter).toContain('notes ~ "guitare"')
		expect(filter).toContain('items ?~ "guitare"')
		expect(filter).toContain('customer = "client-1"')
	})

	it('ajoute le total TTC positif et négatif pour un montant', () => {
		const filter = buildDocumentSearchFilter({
			term: '120,50 €',
			formatFilter,
		})

		expect(filter).toContain('total_ttc = 120.5')
		expect(filter).toContain('total_ttc = -120.5')
	})

	it('permet les champs adaptés aux bons de commande', () => {
		const filter = buildDocumentSearchFilter({
			term: 'Dupont',
			textFields: ['number', 'customer_name', 'notes', 'items'],
			formatFilter,
		})

		expect(filter).toContain('customer_name ~ "Dupont"')
	})

	it('ne produit aucun filtre pour une recherche vide', () => {
		expect(
			buildDocumentSearchFilter({ term: '  ', formatFilter }),
		).toBeUndefined()
	})
})
