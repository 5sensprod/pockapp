// frontend/modules/site/lib/export-selection.ts
//
// De QUELS produits on part, à CE QU'ON ENVOIE : la fermeture des dépendances.
//
// Envoyer un produit seul laisserait le site avec un rattachement vers une
// catégorie ou une marque qu'il ne connaît pas. On joint donc la marque citée
// et les catégories citées, **ancêtres compris** — sinon l'arbre du site a des
// trous.
//
// Extrait de CatalogueEnLignePage.tsx le 26 août 2026, pour que la file de
// synchronisation (`frontend/lib/sync/`) parte de la même règle que l'écran :
// deux fermetures parallèles finiraient par diverger, et une relation manquante
// s'écrit sans lever (§2 du contrat, le serveur ne décide de rien).

import type {
	CatalogBrand,
	CatalogCategory,
	CatalogProduct,
} from '@/lib/queries/site-catalog'
import type { ExportInput } from '../hooks/use-catalog-sync'

/**
 * Ce que la sélection oblige à envoyer avec elle.
 *
 * Les listes `categories` et `brands` sont le catalogue COMPLET, pas une
 * sélection : c'est en lui qu'on résout les identifiants cités.
 */
export function collectExportInput(
	selection: CatalogProduct[],
	categories: CatalogCategory[],
	brands: CatalogBrand[],
): ExportInput {
	const categoryById = new Map(categories.map((c) => [c.id, c]))
	const brandById = new Map(brands.map((b) => [b.id, b]))

	const neededCategories = new Map<string, CatalogCategory>()
	const neededBrands = new Map<string, CatalogBrand>()

	for (const product of selection) {
		for (const categoryId of product.categories ?? []) {
			// Toute la chaîne d'ancêtres. Le garde-fou n'est pas décoratif : un
			// cycle dans `parent` boucle sans fin, et `categories.parent` est cassé
			// au schéma (CLAUDE.md).
			let current: string | undefined = categoryId
			const guard = new Set<string>()
			while (current && categoryById.has(current) && !guard.has(current)) {
				guard.add(current)
				const category = categoryById.get(current)
				if (!category) break
				neededCategories.set(category.id, category)
				current = category.parent || undefined
			}
		}
		const brand = product.brand ? brandById.get(product.brand) : undefined
		if (brand) neededBrands.set(brand.id, brand)
	}

	return {
		products: selection,
		categories: [...neededCategories.values()],
		brands: [...neededBrands.values()],
	}
}

/**
 * Le garde-fou d'avant-export, ajouté après un export qui a écrit
 * `brand = NULL`.
 *
 * Si les catégories ou les marques n'ont pas été chargées, les index
 * `id → legacy_id` sont vides : chaque produit part alors sans marque et sans
 * catégorie, et le serveur l'écrit sans broncher. Le résultat est une base de
 * site silencieusement amputée de toutes ses relations.
 *
 * Rend le message à afficher, ou `null` si l'export peut partir.
 */
export function exportBlocker(
	selection: CatalogProduct[],
	categories: CatalogCategory[],
	brands: CatalogBrand[],
): string | null {
	const referencesCategories = selection.some(
		(p) => (p.categories ?? []).length > 0,
	)
	const referencesBrands = selection.some((p) => Boolean(p.brand))

	if (referencesCategories && categories.length === 0) {
		return (
			'Export annulé : les catégories ne sont pas chargées. ' +
			'Les produits partiraient sans aucun rattachement.'
		)
	}
	if (referencesBrands && brands.length === 0) {
		return (
			'Export annulé : les marques ne sont pas chargées. ' +
			'Les produits partiraient sans marque.'
		)
	}
	return null
}
