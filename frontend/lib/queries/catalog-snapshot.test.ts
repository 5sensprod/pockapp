// Gardien de la résolution à DEUX CLÉS, et de l'arbre des catégories.
//
// La règle n'a pas d'autre gardien : le compilateur accepte parfaitement qu'on
// n'interroge que `id`, et l'écran n'affiche alors ni erreur ni ligne vide — il
// affiche « produit absent du catalogue » sur les 2370 entrées qui, elles,
// existent. Mesure du 19 août 2026 sur la base installée : 0 entrée se résout
// par `id`, 2370 par `legacy_id`, 95 par aucun des deux.

import { describe, expect, it } from 'vitest'
import {
	type CatalogSnapshotProduct,
	construireArbreCategories,
	indexCatalogueParCle,
	resoudreProduit,
} from './catalog-snapshot'

const produit = (
	id: string,
	legacyId: string,
	categories: string[] = [],
): CatalogSnapshotProduct => ({
	id,
	legacyId,
	name: `produit ${id}`,
	sku: '',
	barcode: '',
	imageUrl: null,
	categories,
	stock: 0,
})

describe('la résolution des entrées d’inventaire', () => {
	const catalogue = [produit('pb1', 'nedb1'), produit('pb2', 'pa_abc')]
	const index = indexCatalogueParCle(catalogue)

	it('retrouve un produit par son identifiant PocketBase', () => {
		expect(resoudreProduit(index, 'pb1')?.name).toBe('produit pb1')
	})

	it('retrouve un produit par son identifiant NeDB — les entrées d’avant', () => {
		expect(resoudreProduit(index, 'nedb1')?.name).toBe('produit pb1')
	})

	it('retrouve un produit né en caisse par sa clé stable `pa_`', () => {
		expect(resoudreProduit(index, 'pa_abc')?.name).toBe('produit pb2')
	})

	it('rend `undefined` — et non une erreur — pour les 95 entrées orphelines', () => {
		expect(resoudreProduit(index, 'disparu')).toBeUndefined()
		expect(resoudreProduit(index, '')).toBeUndefined()
		expect(resoudreProduit(index, null)).toBeUndefined()
	})

	it('n’indexe pas la clé vide, qui confondrait tous les produits sans legacy', () => {
		const sansLegacy = indexCatalogueParCle([produit('pb3', '')])
		expect(resoudreProduit(sansLegacy, '')).toBeUndefined()
		expect(resoudreProduit(sansLegacy, 'pb3')?.id).toBe('pb3')
	})
})

describe('l’arbre des catégories et ses compteurs', () => {
	const categories = [
		{ id: 'racine', name: 'Guitares', parent: '' },
		{ id: 'fille', name: 'Électriques', parent: 'racine' },
		{ id: 'orpheline', name: 'Perdue', parent: 'inexistante' },
	]
	const produits = [
		produit('a', 'na', ['racine']),
		produit('b', 'nb', ['fille']),
		produit('c', 'nc', ['fille']),
	]

	const arbre = construireArbreCategories(categories, produits)

	it('compte le direct et le cumulé séparément', () => {
		const racine = arbre.find((c) => c._id === 'racine')
		expect(racine?.productCount).toBe(1)
		expect(racine?.totalProductCount).toBe(3)
		expect(racine?.children[0].productCount).toBe(2)
	})

	it('remonte une catégorie au parent absent en racine, plutôt que de la perdre', () => {
		expect(arbre.map((c) => c._id).sort()).toEqual(['orpheline', 'racine'])
	})
})
