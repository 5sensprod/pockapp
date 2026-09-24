// frontend/modules/stock/lib/suppliers-directory.test.ts
// GARDIEN — le répertoire fournisseurs / marques que le PDF met en page.

import type {
	CatalogBrandShape,
	CatalogSupplierShape,
} from '@/lib/queries/catalog-shapes'
import { describe, expect, it } from 'vitest'
import { construireRepertoire, lettreDe } from './suppliers-directory'

const marque = (id: string, name: string) =>
	({ id, name }) as unknown as CatalogBrandShape

const fournisseur = (
	id: string,
	name: string,
	brands: string[] = [],
	extra: Partial<CatalogSupplierShape> = {},
) => ({ id, name, brands, ...extra }) as unknown as CatalogSupplierShape

const marques = [
	marque('m1', 'Lag'),
	marque('m2', 'Yamaha'),
	marque('m3', 'Éclat'),
	marque('m4', 'Zoom'),
	marque('m5', '3M'),
	marque('m6', 'Orpheline'),
]

describe('construireRepertoire', () => {
	it('liste les marques de chaque fournisseur, dans l’ordre alphabétique', () => {
		const r = construireRepertoire(
			[fournisseur('f1', 'Musicdistrib', ['m2', 'm1', 'm3'])],
			marques,
		)
		expect(r.fournisseurs[0].marques).toEqual(['Éclat', 'Lag', 'Yamaha'])
	})

	it('range les fournisseurs sans tenir compte de la casse ni des accents', () => {
		const r = construireRepertoire(
			[
				fournisseur('f1', 'zeta'),
				fournisseur('f2', 'Éole'),
				fournisseur('f3', 'Alpha'),
				fournisseur('f4', 'eole 2'),
			],
			marques,
		)
		expect(r.fournisseurs.map((f) => f.nom)).toEqual([
			'Alpha',
			'Éole',
			'eole 2',
			'zeta',
		])
	})

	it('donne l’index inverse : la marque est l’entrée, le fournisseur la réponse', () => {
		const r = construireRepertoire(
			[
				fournisseur('f1', 'Musicdistrib', ['m1']),
				fournisseur('f2', 'Bandland', ['m2']),
			],
			marques,
		)
		const aplat = r.index.flatMap((g) => g.entrees)
		expect(aplat).toEqual([
			{ marque: 'Lag', fournisseurs: ['Musicdistrib'] },
			{ marque: 'Yamaha', fournisseurs: ['Bandland'] },
		])
	})

	it('une marque à plusieurs fournisseurs les liste TOUS, sans doublon', () => {
		const r = construireRepertoire(
			[
				fournisseur('f1', 'Musicdistrib', ['m1', 'm1']),
				fournisseur('f2', 'Bandland', ['m1']),
			],
			marques,
		)
		const lag = r.index
			.flatMap((g) => g.entrees)
			.find((e) => e.marque === 'Lag')
		expect(lag?.fournisseurs).toEqual(['Bandland', 'Musicdistrib'])
	})

	it('groupe par lettre sans accent, et met « # » en dernier', () => {
		const r = construireRepertoire(
			[fournisseur('f1', 'F', ['m1', 'm2', 'm3', 'm4', 'm5'])],
			marques,
		)
		expect(r.index.map((g) => g.lettre)).toEqual(['E', 'L', 'Y', 'Z', '#'])
		expect(r.index[0].entrees[0].marque).toBe('Éclat')
	})

	it('signale les marques qu’aucun fournisseur ne distribue', () => {
		const r = construireRepertoire([fournisseur('f1', 'F', ['m1'])], marques)
		expect(r.marquesSansFournisseur).toEqual([
			'3M',
			'Éclat',
			'Orpheline',
			'Yamaha',
			'Zoom',
		])
		expect(r.totaux).toEqual({
			fournisseurs: 1,
			marques: 6,
			marquesRattachees: 1,
		})
	})

	it('ignore une marque dont la fiche n’existe plus', () => {
		// La relation pointe vers un identifiant supprimé : rien d'imprimable.
		const r = construireRepertoire(
			[fournisseur('f1', 'F', ['m1', 'disparue'])],
			marques,
		)
		expect(r.fournisseurs[0].marques).toEqual(['Lag'])
	})

	it('reprend les coordonnées, nettoyées, et JAMAIS la banque ni les règlements', () => {
		const r = construireRepertoire(
			[
				fournisseur('f1', 'F', [], {
					supplier_code: ' FR01 ',
					contact_name: ' Anne ',
					contact_email: 'a@f.fr',
					contact_phone: '01 02',
					banking: { iban: 'FR76 SECRET' },
					payment_terms: { jours: 30 },
				}),
			],
			marques,
		)
		expect(r.fournisseurs[0]).toEqual({
			id: 'f1',
			nom: 'F',
			code: 'FR01',
			contact: 'Anne',
			email: 'a@f.fr',
			telephone: '01 02',
			marques: [],
		})
		expect(JSON.stringify(r)).not.toContain('SECRET')
	})

	it('tient avec des relations absentes', () => {
		const r = construireRepertoire(
			[{ id: 'f1', name: 'F' } as unknown as CatalogSupplierShape],
			marques,
		)
		expect(r.fournisseurs[0].marques).toEqual([])
		expect(construireRepertoire([], [])).toMatchObject({
			fournisseurs: [],
			index: [],
			marquesSansFournisseur: [],
		})
	})
})

describe('lettreDe', () => {
	it('plie les accents et la casse', () => {
		expect(lettreDe('Éclat')).toBe('E')
		expect(lettreDe('  ukulélé')).toBe('U')
	})
	it('range chiffres et symboles sous « # »', () => {
		expect(lettreDe('3M')).toBe('#')
		expect(lettreDe('&Co')).toBe('#')
		expect(lettreDe('')).toBe('#')
	})
})
