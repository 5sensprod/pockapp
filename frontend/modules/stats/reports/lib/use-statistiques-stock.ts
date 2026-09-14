// frontend/modules/stats/reports/lib/use-statistiques-stock.ts
// ═══════════════════════════════════════════════════════════════════════════
// LES STATISTIQUES DE STOCK — LECTURE DE LA ROUTE GO
// ═══════════════════════════════════════════════════════════════════════════
// Remplace `hooks/useStockStatistics.js` d'AppPos, qui appelait AppServe
// (`/api/products/stock/statistics`) et écoutait un WebSocket. Ici la route est
// `GET /api/reports/stock-statistics` (`backend/routes/stock_statistics_routes.go`)
// et la fraîcheur vient du temps réel PocketBase, comme partout ailleurs.
//
// ⚠️ RIEN N'EST CALCULÉ ICI, ET C'EST VOLONTAIRE. L'écran affiche ce que le Go
// a additionné. Le calcul d'origine balayait les 2999 produits dans le
// navigateur ; le refaire à l'écran ferait exister deux additions des mêmes
// fiches, ce qui est la forme exacte de la régression du 20 mai 2026.
// ═══════════════════════════════════════════════════════════════════════════

import { usePocketBase } from '@/lib/use-pocketbase'
import { useQuery } from '@tanstack/react-query'

/** Une tranche de la ventilation par taux de TVA. */
export interface TrancheTVA {
	rate: number
	product_count: number
	inventory_value: number
	retail_value: number
	retail_value_ttc: number
	tax_amount: number
}

/** Une part du camembert : une catégorie RACINE et ce que son stock vaut. */
export interface CategorieRacine {
	id: string
	name: string
	value: number
	products: number
	margin: number
}

export interface DecompteCategorie {
	direct: number
	total: number
}

export interface StatistiquesStock {
	summary: {
		total_products: number
		simple_products: number
		products_in_stock: number
		excluded_products: number
	}
	financial: {
		inventory_value: number
		retail_value: number
		retail_value_ttc: number
		potential_margin: number
		margin_percentage: number
		/** ⚠️ La TVA que le stock PORTERAIT s'il était vendu. Pas une TVA
		 *  collectée, pas une déclaration : voir l'en-tête de la route Go. */
		tax_amount: number
		tax_breakdown: Record<string, TrancheTVA>
	}
	performance: {
		avg_inventory_per_product: number
		avg_retail_per_product: number
	}
	categories: {
		rootCategories: CategorieRacine[]
		totals: {
			totalValue: number
			totalProducts: number
			totalMargin: number
		}
	}
	/** Le nombre de fiches VALORISÉES par catégorie, `direct` et `total`.
	 *  Distinct de `/api/catalog/counts`, qui compte le catalogue entier. */
	par_categorie: Record<string, DecompteCategorie>
}

export const CLE_STATISTIQUES_STOCK = ['stock-statistics'] as const

export function useStatistiquesStock(companyId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: [...CLE_STATISTIQUES_STOCK, companyId],
		queryFn: async (): Promise<StatistiquesStock> => {
			const parametres = companyId
				? `?company=${encodeURIComponent(companyId)}`
				: ''
			return await pb.send(`/api/reports/stock-statistics${parametres}`, {
				method: 'GET',
			})
		},
		// Deux requêtes SQLite sur 2999 fiches : ce n'est pas gratuit, et rien
		// n'oblige à le refaire à chaque aller-retour entre deux écrans. Le
		// temps réel du catalogue périme cette clé quand une fiche bouge.
		staleTime: 5 * 60 * 1000,
	})
}
