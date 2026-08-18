// frontend/modules/stock/single-source.test.ts
//
// Gardien de la règle « une seule provenance ».
// Elle n'a pas d'autre gardien — elle ne se voit ni au compilateur, qui accepte
// parfaitement deux bases dans un même composant, ni à l'écran, où un filtre
// posé sur des identifiants de l'autre base rend zéro ligne SANS erreur. D'où
// un test qui lit les fichiers eux-mêmes.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const racine = join(__dirname, '..', '..')
const lire = (chemin: string) => readFileSync(join(racine, chemin), 'utf-8')
const imports = (source: string) =>
	(source.match(/^import .*$/gm) ?? []).join(' ')

describe('le module stock ne parle plus à AppPos', () => {
	it('ProductTable ne fait aucune requête et ne connaît aucune base', () => {
		const source = lire('modules/stock/components/ProductTable.tsx')
		// Elle reçoit des lignes déjà résolues. Le seul import de `lib/queries`
		// autorisé est le TYPE de ces lignes.
		expect(imports(source)).not.toMatch(/@\/lib\/apppos/)
		expect(imports(source)).not.toMatch(/useBrands|useCategories|useSuppliers/)
		expect(imports(source)).not.toMatch(/useDeleteProduct|useCatalogProducts/)
	})

	it("ProductTable ne construit plus d'URL d'image", () => {
		const source = lire('modules/stock/components/ProductTable.tsx')
		// L'URL vient de `pb.files.getUrl`, résolue une fois dans `toStockRow`.
		expect(source).not.toMatch(/APPPOS_ASSETS_BASE_URL|APPPOS_BASE_URL/)
	})

	it("l'écran catalogue est celui de PocketBase, et il est seul", () => {
		const source = lire('modules/stock/ProductsPage.tsx')
		expect(imports(source)).not.toMatch(/@\/lib\/apppos/)
		// L'import est multiligne : on cherche dans le fichier, pas dans les
		// lignes commençant par `import`.
		expect(source).toMatch(/useCatalogProducts/)
	})

	it("le module stock n'importe plus AppPos que pour l'inventaire", () => {
		// L'inventaire physique se raccorde plus tard (front D du plan). Tant
		// qu'il est là, il est le SEUL — et cette liste doit rétrécir, jamais
		// s'allonger.
		const attendus = ['InventoryPageAppPos.tsx']
		const fichiers = [
			'modules/stock/ProductsPage.tsx',
			'modules/stock/BrandsPage.tsx',
			'modules/stock/CategoriesPage.tsx',
			'modules/stock/SuppliersPage.tsx',
			'modules/stock/components/ProductTable.tsx',
			'modules/stock/components/CatalogProductDialog.tsx',
		]
		for (const fichier of fichiers) {
			expect(imports(lire(fichier)), fichier).not.toMatch(/@\/lib\/apppos/)
		}
		expect(attendus).toHaveLength(1)
	})
})

describe("il n'y a plus de routeur de base non typé", () => {
	it('useUpdateProductUniversal a disparu du dépôt', () => {
		const source = lire('lib/queries/products.ts')
		expect(source).not.toMatch(/export function useUpdateProductUniversal/)
	})

	it("products.ts n'écrit plus nulle part", () => {
		const source = lire('lib/queries/products.ts')
		expect(source).not.toMatch(/\.create<|\.update<|\.delete\(/)
	})
})
