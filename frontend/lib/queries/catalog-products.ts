// frontend/lib/queries/catalog-products.ts
// ═══════════════════════════════════════════════════════════════════════════
// LES PRODUITS DU CATALOGUE POCKETBASE — LECTURE, PAGINÉE CÔTÉ SERVEUR
// ═══════════════════════════════════════════════════════════════════════════
// Source explicite : PocketBase, et rien d'autre (docs/DECISIONS.md,
// 2026-08-13). Ce fichier n'écrit rien — l'édition des produits demande un
// arbitrage qui n'est pas rendu : `price_ttc` et `stock` appartiennent à
// AppStock, et la caisse écrit encore dans NeDB.
//
// ⚠️ PAGINATION CÔTÉ SERVEUR, ET C'EST LA RAISON D'ÊTRE DE CE FICHIER.
// Le catalogue porte 2999 produits. `useProducts` (`products.ts`) rend
// `getList(1, 50)` : une page, sans le dire, ce qui a déjà produit un écran de
// compteurs à zéro. Ici la page est un paramètre, le total est rendu, et
// l'appelant sait sur quoi il travaille.
//
// Pas d'`expand` : les marques (287) et les catégories (463) sont déjà lues
// entières et mises en cache ailleurs. Les redemander à chaque page de 25
// produits coûterait plus que de les résoudre en mémoire.
//
// Schéma lu : backend/migrations/catalog_v2.go.
// ═══════════════════════════════════════════════════════════════════════════

import { usePocketBase } from '@/lib/use-pocketbase'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import type { PocketBaseRecord } from './catalog-shapes'

export type CatalogProductStatus = 'draft' | 'published'

export type CatalogProductShape = PocketBaseRecord & {
	legacy_id: string
	name: string
	designation?: string
	sku?: string
	barcode?: string
	slug?: string
	description?: string
	type?: 'simple' | 'service'
	status: CatalogProductStatus
	price_ttc?: number
	purchase_price_ht?: number
	tax_rate?: number
	stock?: number
	min_stock?: number
	manage_stock?: boolean
	image?: string
	/** Relation simple vers `brands`. Chaîne vide si absente. */
	brand?: string
	/** Relation simple vers `suppliers`. */
	supplier?: string
	/** Relation multiple vers `categories`. */
	categories?: string[]
	company?: string
}

export type CatalogProductPage = {
	items: CatalogProductShape[]
	page: number
	perPage: number
	totalItems: number
	totalPages: number
}

const PRODUCT_FIELDS =
	'id,collectionId,collectionName,legacy_id,name,designation,sku,barcode,slug,status,type,price_ttc,purchase_price_ht,tax_rate,stock,min_stock,manage_stock,image,brand,supplier,categories'

export type CatalogProductQuery = {
	companyId?: string
	page: number
	perPage: number
	/** Cherché dans le nom, la référence et le code-barres. */
	search?: string
	/** `undefined` = les deux intentions de publication. */
	status?: CatalogProductStatus
	/** Identifiant PocketBase d'une marque. */
	brandId?: string
	sort?: string
}

export function useCatalogProducts(query: CatalogProductQuery) {
	const pb = usePocketBase() as any
	const { companyId, page, perPage, search, status, brandId, sort } = query

	return useQuery<CatalogProductPage>({
		queryKey: [
			'catalog-products',
			companyId,
			page,
			perPage,
			search,
			status,
			brandId,
			sort,
		],
		// Sans cela, changer de page vide la table le temps de la requête et la
		// hauteur saute. La page précédente reste affichée, grisée par l'appelant.
		placeholderData: keepPreviousData,
		staleTime: 60_000,
		queryFn: async () => {
			const clauses: string[] = []

			if (companyId) {
				clauses.push(pb.filter('company = {:company}', { company: companyId }))
			}
			if (status) {
				clauses.push(pb.filter('status = {:status}', { status }))
			}
			if (brandId) {
				clauses.push(pb.filter('brand = {:brand}', { brand: brandId }))
			}

			const term = search?.trim()
			if (term) {
				// `pb.filter` échappe la valeur : une apostrophe dans un nom de
				// produit — il y en a — ne peut pas casser la requête, ni servir à
				// en injecter une autre.
				clauses.push(
					pb.filter('(name ~ {:q} || sku ~ {:q} || barcode ~ {:q})', {
						q: term,
					}),
				)
			}

			const result = await pb.collection('products').getList(page, perPage, {
				filter: clauses.length ? clauses.join(' && ') : undefined,
				fields: PRODUCT_FIELDS,
				sort: sort || 'name',
			})

			return {
				items: result.items as CatalogProductShape[],
				page: result.page as number,
				perPage: result.perPage as number,
				totalItems: result.totalItems as number,
				totalPages: result.totalPages as number,
			}
		},
		enabled: !!companyId,
	})
}
