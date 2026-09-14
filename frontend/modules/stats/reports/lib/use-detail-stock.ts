// frontend/modules/stats/reports/lib/use-detail-stock.ts
// ═══════════════════════════════════════════════════════════════════════════
// LES LIGNES DU RAPPORT DÉTAILLÉ
// ═══════════════════════════════════════════════════════════════════════════
// `GET /api/reports/stock-statistics/products`
// (`backend/routes/stock_statistics_detail_routes.go`).
//
// Ce n'est PAS un `useQuery` : ces lignes ne s'affichent nulle part, elles ne
// servent qu'à fabriquer un PDF, au moment où l'on clique. Les garder en cache
// reviendrait à tenir 2999 fiches en mémoire pour un document qu'on n'imprime
// peut-être qu'une fois par mois.
// ═══════════════════════════════════════════════════════════════════════════

import { usePocketBase } from '@/lib/use-pocketbase'
import { useCallback } from 'react'

export interface LigneDetailStock {
	id: string
	sku: string
	designation: string
	stock: number
	purchase_price: number
	price_ht: number
	price_ttc: number
	tax_rate: number
	inventory_value: number
	retail_value: number
	margin: number
}

export interface GroupeDetailStock {
	category_id: string
	category_name: string
	/** Absentes en mode simplifié : le serveur ne les envoie pas. */
	lines: LigneDetailStock[] | null
	product_count: number
	inventory_value: number
	retail_value: number
	margin: number
}

export interface DetailStock {
	groups: GroupeDetailStock[]
	totals: {
		product_count: number
		inventory_value: number
		retail_value: number
		margin: number
	}
	simplified: boolean
}

export interface OptionsDetailStock {
	groupByCategory?: boolean
	selectedCategories?: string[]
	includeUncategorized?: boolean
	isSimplified?: boolean
	sortBy?: string
	sortOrder?: string
	companyId?: string
}

export function useDetailStock() {
	const pb = usePocketBase()

	return useCallback(
		async (options: OptionsDetailStock = {}): Promise<DetailStock> => {
			const parametres = new URLSearchParams()
			if (options.groupByCategory) parametres.set('group_by_category', 'true')
			if (options.includeUncategorized)
				parametres.set('include_uncategorized', 'true')
			if (options.isSimplified) parametres.set('simplified', 'true')
			if (options.sortBy) parametres.set('sort_by', options.sortBy)
			if (options.sortOrder) parametres.set('sort_order', options.sortOrder)
			if (options.selectedCategories?.length)
				parametres.set('categories', options.selectedCategories.join(','))
			if (options.companyId) parametres.set('company', options.companyId)

			const requete = parametres.toString()
			return await pb.send(
				`/api/reports/stock-statistics/products${requete ? `?${requete}` : ''}`,
				{ method: 'GET' },
			)
		},
		[pb],
	)
}
