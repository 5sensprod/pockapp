// frontend/lib/queries/catalog-rows.ts
//
// Du produit PocketBase à la ligne affichée par `ProductTable`.
//
// Pourquoi une fonction pure plutôt qu'un `expand` : les marques (287), les
// catégories (463) et les fournisseurs (43) sont déjà lus entiers et mis en
// cache par `useBrands` / `useCategories` / `useSuppliers`. Les redemander en
// `expand` à chaque page de 25 produits coûterait plus que de les résoudre en
// mémoire — c'est la raison notée dans `catalog-products.ts`, et cette fonction
// en est la conséquence.
//
// L'IMAGE est résolue ICI, une fois, par `pb.files.getUrl`. La table ne
// construit plus aucune URL : elle en recevait une d'AppPos jusqu'au 18 août
// 2026, ce qui suffisait à faire d'elle un fichier à deux provenances.

import { productHealth } from '@/lib/queries/catalog-health'
import type { CatalogProductShape } from '@/lib/queries/catalog-products'

/** Ce que la table LIT — et rien d'autre. Aucun champ ne nomme une base. */
export interface StockProductRow {
	id: string
	name: string
	/** LE NOM DU COMPTOIR — celui du ticket de caisse ET de l'étiquette
	 *  produit. `name` est le titre de la page du site : il ne s'imprime
	 *  jamais (`catalog-products.ts:94`). */
	designation?: string | null
	/** Date de création PocketBase, utilisée comme date d'ajout au catalogue. */
	created?: string | null
	sku?: string | null
	barcode?: string | null
	price_ttc?: number | null
	purchase_price_ht?: number | null
	stock?: number | null
	status?: 'draft' | 'published'
	healthScore: number
	healthMax: number
	healthMissing: string[]
	/** URL prête à poser dans un `<img src>`, ou `null` s'il n'y a pas d'image. */
	imageUrl?: string | null
	brandName?: string | null
	supplierName?: string | null
	categoryNames: string[]
}

export interface CatalogRowContext {
	brandById: Map<string, string>
	supplierById: Map<string, string>
	categoryById: Map<string, string>
	/** `pb.files.getUrl` — passé plutôt qu'importé, pour que ce module reste
	 *  testable sans instance PocketBase. */
	fileUrl: (record: CatalogProductShape, filename: string) => string
}

export function toStockRow(
	product: CatalogProductShape,
	ctx: CatalogRowContext,
): StockProductRow {
	const health = productHealth(product)
	return {
		id: product.id,
		name: product.name,
		designation: product.designation,
		created: product.created,
		sku: product.sku,
		barcode: product.barcode,
		price_ttc: product.price_ttc,
		purchase_price_ht: product.purchase_price_ht,
		stock: product.stock,
		status: product.status,
		healthScore: health.score,
		healthMax: health.max,
		healthMissing: health.missing,
		// `image` est un NOM DE FICHIER, pas une URL : seul `pb.files.getUrl` sait
		// en faire une, et il lui faut aussi `collectionId` et `id` — d'où leur
		// présence dans les champs demandés par `catalog-products.ts`.
		imageUrl: product.image ? ctx.fileUrl(product, product.image) : null,
		brandName: (product.brand && ctx.brandById.get(product.brand)) || null,
		supplierName:
			(product.supplier && ctx.supplierById.get(product.supplier)) || null,
		// Une catégorie inconnue du cache est ignorée plutôt que rendue en
		// identifiant brut : l'utilisateur n'a rien à faire d'un `n0zg4…`.
		categoryNames: (product.categories ?? [])
			.map((id) => ctx.categoryById.get(id))
			.filter((name): name is string => !!name),
	}
}
