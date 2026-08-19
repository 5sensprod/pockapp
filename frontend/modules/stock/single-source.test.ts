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

describe('le choix produit des documents vient de PocketBase', () => {
	// Sept écrans faisaient le même préambule : `loginToAppPos('admin',
	// 'admin123')`, les 3000 produits chargés d'un coup, un filtre en mémoire à
	// chaque frappe. Ils passent tous par `useCatalogProductSearch` depuis le
	// 19 août 2026 — et cette liste ne doit pas se repeupler.
	const ecrans = [
		'modules/connect/pages/invoices/InvoiceCreatePage.tsx',
		'modules/connect/pages/invoices/InvoiceEditPage.tsx',
		'modules/connect/pages/quotes/QuoteCreatePage.tsx',
		'modules/connect/pages/quotes/QuoteEditPage.tsx',
		'modules/connect/pages/orders/OrderCreatePage.tsx',
		'modules/connect/pages/orders/OrderDetailPage.tsx',
		'modules/connect/features/orders/OrderCreateInline.tsx',
	]

	it.each(ecrans)('%s cherche dans le catalogue PocketBase', (fichier) => {
		const source = lire(fichier)
		expect(source).toMatch(/useCatalogProductSearch/)
		expect(source).not.toMatch(/useAppPosProducts/)
	})

	it.each(ecrans)('%s ne se connecte plus à AppPos', (fichier) => {
		const source = lire(fichier)
		// Le mot de passe était en clair dans chacun des sept fichiers.
		expect(source).not.toMatch(/loginToAppPos/)
	})
})

describe('les mouvements de stock ont un seul chemin', () => {
	// Front D, 19 août 2026. L'inventaire et le reclassement écrivaient dans
	// AppPos par deux routes distinctes ; ils passent par `stock-adjust.ts`.
	it("l'inventaire n'écrit plus dans AppPos", () => {
		const source = lire('lib/inventory/useInventorySession.ts')
		expect(source).not.toMatch(/updateAppPosProductStock/)
		expect(source).toMatch(/setCountedStock/)
	})

	it('le reclassement de retour non plus', () => {
		const source = lire('modules/common/StockReclassificationDialog.tsx')
		expect(source).not.toMatch(/incrementAppPosProductsStock/)
		expect(imports(source)).not.toMatch(/@\/lib\/apppos/)
	})

	it("la couche de mouvement n'écrit jamais dans AppPos", () => {
		const source = lire('lib/queries/stock-adjust.ts')
		expect(imports(source)).not.toMatch(/@\/lib\/apppos/)
	})

	it('la vente reste sur AppPos, et le dit', () => {
		// Front E. Tant que c'est vrai, les deux stocks divergent : le constat
		// doit rester visible dans le fichier qui le porte.
		const source = lire('lib/apppos/stock-utils.ts')
		expect(source).toMatch(/decrementAppPosProductsStock/)
	})
})
