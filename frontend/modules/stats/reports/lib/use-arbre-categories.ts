// frontend/modules/stats/reports/lib/use-arbre-categories.ts
// ═══════════════════════════════════════════════════════════════════════════
// L'ARBRE DE CATÉGORIES DE LA MODALE D'EXPORT
// ═══════════════════════════════════════════════════════════════════════════
// Remplace `hooks/useCategoryTree.js` d'AppPos, qui chargeait les 2999 produits
// ET les 463 catégories dans le navigateur pour compter, catégorie par
// catégorie, combien de fiches y avaient du stock.
//
// Les décomptes viennent maintenant de `par_categorie`
// (`GET /api/reports/stock-statistics`) : `direct` et `total`, calculés par la
// même fonction que `/api/catalog/counts` — un produit rangé dans deux
// catégories sœurs ne compte qu'une fois dans leur ancêtre commun.
//
// LES NŒUDS PORTENT `_id`, PAS `id`, ET C'EST DÉLIBÉRÉ. Les composants portés
// (`CategoryTreeNode.jsx`, `CategoryTreeSelector.jsx`) lisent la forme NeDB.
// Plutôt que de les réécrire, la catégorie PocketBase y est PROJETÉE, en un
// seul endroit — c'est le rôle qu'avait `produit-adapte.ts` dans le portage de
// l'affiche. À défaire le jour où ces composants passeront en TypeScript.
// ═══════════════════════════════════════════════════════════════════════════

import { useCategories } from '@/lib/queries/categories'
import { useCallback, useMemo, useState } from 'react'
import { construireArbreExport } from './arbre-export'
import type { NoeudCategorieExport } from './arbre-export'
import type { DecompteCategorie } from './use-statistiques-stock'

export { construireArbreExport }
export type { NoeudCategorieExport }

export function useArbreCategories(
	parCategorie: Record<string, DecompteCategorie> | undefined,
	companyId?: string,
) {
	const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
		new Set(),
	)
	const { data: categories, isLoading } = useCategories({ companyId })

	const categoryTree = useMemo(() => {
		if (!categories || !parCategorie) return []
		return construireArbreExport(categories, parCategorie)
	}, [categories, parCategorie])

	const collectAllCategoryIds = useCallback(
		(noeuds: NoeudCategorieExport[]): string[] => {
			const ids: string[] = []
			const pile = [...noeuds]
			while (pile.length) {
				const noeud = pile.pop()
				if (!noeud) continue
				ids.push(noeud._id)
				pile.push(...noeud.children)
			}
			return ids
		},
		[],
	)

	const toggleCategoryExpansion = useCallback((categoryId: string) => {
		setExpandedCategories((precedent) => {
			const suivant = new Set(precedent)
			if (suivant.has(categoryId)) suivant.delete(categoryId)
			else suivant.add(categoryId)
			return suivant
		})
	}, [])

	const expandAllCategories = useCallback(() => {
		setExpandedCategories(new Set(collectAllCategoryIds(categoryTree)))
	}, [categoryTree, collectAllCategoryIds])

	const collapseAllCategories = useCallback(() => {
		setExpandedCategories(new Set())
	}, [])

	const selectAllCategories = useCallback(
		() => collectAllCategoryIds(categoryTree),
		[categoryTree, collectAllCategoryIds],
	)

	/**
	 * Le nombre de fiches que la sélection couvre.
	 *
	 * ⚠️ Il ne s'obtient PAS en additionnant les `totalProductsInStock` des
	 * catégories cochées : cocher une branche coche aussi ses filles, et leurs
	 * totaux se recouvrent. On additionne les `direct` des catégories
	 * sélectionnées, ce qui compte chaque fiche une fois — sauf une fiche rangée
	 * dans deux catégories toutes deux cochées, cas où le nombre est annoncé
	 * comme une estimation, exactement comme dans AppPos.
	 */
	const getSelectedProductsCount = useCallback(
		(selection: string[]) => {
			if (!selection?.length || !parCategorie) return 0
			return selection.reduce(
				(total, id) => total + (parCategorie[id]?.direct ?? 0),
				0,
			)
		},
		[parCategorie],
	)

	return {
		categoryTree,
		loadingCategories: isLoading,
		expandedCategories,
		toggleCategoryExpansion,
		expandAllCategories,
		collapseAllCategories,
		selectAllCategories,
		collectAllCategoryIds,
		getSelectedProductsCount,
	}
}
