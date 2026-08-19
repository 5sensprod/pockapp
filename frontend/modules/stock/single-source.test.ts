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

	it("le module stock n'importe plus AppPos DU TOUT", () => {
		// L'inventaire physique était le dernier : il lisait son catalogue dans
		// AppPos jusqu'au 19 août 2026. La liste ne doit plus jamais s'allonger.
		const fichiers = [
			'modules/stock/ProductsPage.tsx',
			'modules/stock/BrandsPage.tsx',
			'modules/stock/CategoriesPage.tsx',
			'modules/stock/SuppliersPage.tsx',
			'modules/stock/components/ProductTable.tsx',
			'modules/stock/components/CatalogProductDialog.tsx',
			'modules/stock/InventoryPageAppPos.tsx',
			'lib/inventory/useInventorySession.ts',
		]
		for (const fichier of fichiers) {
			expect(imports(lire(fichier)), fichier).not.toMatch(/@\/lib\/apppos/)
		}
	})

	it("l'inventaire prend TOUT le catalogue, pas une page", () => {
		// `getList(1, 50)` a déjà donné « 0 produit » sur 205 marques. Un
		// snapshot d'inventaire qui pagine rendrait une session muette.
		const source = lire('lib/queries/catalog-snapshot.ts')
		expect(source).toMatch(/getFullList/)
		expect(source).not.toMatch(/getList\(/)
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

	it('la caisse ne parle plus à AppPos du tout', () => {
		// Front E : lecture du catalogue, création de produit et décrément de
		// vente. Le module `cash` n'a plus aucune raison d'importer AppPos.
		for (const fichier of [
			'modules/cash/CashTerminalPage.tsx',
			'modules/cash/CreateProductDialog.tsx',
			'modules/cash/components/terminal/hooks/useCartManager.ts',
			'modules/cash/components/terminal/products/ProductsPanel.tsx',
			'modules/cash/components/terminal/types/cart.ts',
		]) {
			expect(imports(lire(fichier)), fichier).not.toMatch(/@\/lib\/apppos/)
		}
	})

	it('la caisse crée ses produits dans PocketBase — le point dur', () => {
		// C'est ce qui rendait PocketBase en retard par construction : 53
		// produits y manquaient au 18 août 2026, tous nés en caisse.
		const source = lire('modules/cash/CreateProductDialog.tsx')
		expect(source).toMatch(/useCreateCatalogProduct/)
		expect(source).not.toMatch(/useCreateAppPosProduct/)
	})

	it("aucun mouvement de stock n'est conditionné à un jeton AppPos", () => {
		// La garde `getAppPosToken()` empêchait le reclassement d'un retour de
		// s'ouvrir quand AppPos ne tournait pas — donc la marchandise revenue de
		// rentrer en stock, alors que le stock est local depuis le front D.
		for (const fichier of [
			'modules/connect/components/InvoicePaymentDialog.tsx',
			'modules/connect/hooks/useInvoiceActions.tsx',
			'modules/connect/pages/invoices/InvoicesPage.tsx',
		]) {
			expect(lire(fichier), fichier).not.toMatch(/getAppPosToken/)
		}
	})

	it('la vente aussi, et son ancien chemin a disparu', () => {
		// Front E, 19 août 2026. `lib/apppos/stock-utils.ts` portait le décrément
		// de vente ; il est supprimé, et rien ne doit le faire revenir.
		expect(() => lire('lib/apppos/stock-utils.ts')).toThrow()
		for (const fichier of [
			'modules/cash/CashTerminalPage.tsx',
			'modules/connect/components/InvoicePaymentDialog.tsx',
			'modules/connect/pages/invoices/InvoicesPage.tsx',
			'lib/queries/invoices.ts',
			'lib/queries/quotes.ts',
		]) {
			expect(lire(fichier), fichier).toMatch(/recordSale/)
		}
	})
})
