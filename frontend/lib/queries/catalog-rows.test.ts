// frontend/lib/queries/catalog-rows.test.ts

import { describe, expect, it } from 'vitest'
import type { CatalogProductShape } from './catalog-products'
import { toStockRow } from './catalog-rows'

const contexte = {
	brandById: new Map([['b1', 'Fender']]),
	supplierById: new Map([['f1', 'Algam']]),
	categoryById: new Map([
		['c1', 'Guitares'],
		['c2', 'Électriques'],
	]),
	fileUrl: (record: CatalogProductShape, filename: string) =>
		`/api/files/${record.collectionId}/${record.id}/${filename}`,
}

const produit = (extra: Partial<CatalogProductShape> = {}) =>
	({
		id: 'p1',
		collectionId: 'pbc_products',
		collectionName: 'products',
		created: '',
		updated: '',
		legacy_id: 'abc',
		name: 'Stratocaster',
		status: 'published',
		...extra,
	}) as CatalogProductShape

describe('toStockRow', () => {
	it('résout la marque, le fournisseur et les catégories par leur nom', () => {
		const row = toStockRow(
			produit({ brand: 'b1', supplier: 'f1', categories: ['c1', 'c2'] }),
			contexte,
		)
		expect(row.brandName).toBe('Fender')
		expect(row.supplierName).toBe('Algam')
		expect(row.categoryNames).toEqual(['Guitares', 'Électriques'])
	})

	it("ignore une catégorie absente du cache plutôt que d'afficher son identifiant", () => {
		const row = toStockRow(
			produit({ categories: ['c1', 'inconnue'] }),
			contexte,
		)
		expect(row.categoryNames).toEqual(['Guitares'])
	})

	it("rend null — et non une URL vide — quand le produit n'a pas d'image", () => {
		// Une chaîne vide dans `<img src>` fait recharger la page courante ;
		// `null` laisse le composant afficher son emplacement vide.
		expect(toStockRow(produit(), contexte).imageUrl).toBeNull()
		expect(toStockRow(produit({ image: '' }), contexte).imageUrl).toBeNull()
	})

	it("construit l'URL de l'image par le résolveur de fichiers PocketBase", () => {
		const row = toStockRow(produit({ image: 'strato.jpg' }), contexte)
		expect(row.imageUrl).toBe('/api/files/pbc_products/p1/strato.jpg')
	})

	it('laisse une relation vide à null, sans inventer de nom', () => {
		const row = toStockRow(
			produit({ brand: '', supplier: undefined }),
			contexte,
		)
		expect(row.brandName).toBeNull()
		expect(row.supplierName).toBeNull()
		expect(row.categoryNames).toEqual([])
	})

	it('recopie le statut sans le traduire en « actif »', () => {
		// `active` n'existe plus au schéma depuis catalog_v2 ; c'est l'intention
		// de publication qui décide, et elle a deux valeurs, pas un booléen.
		expect(toStockRow(produit({ status: 'draft' }), contexte).status).toBe(
			'draft',
		)
	})
})
