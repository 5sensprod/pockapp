// frontend/lib/queries/stock-alerts.ts
// ═══════════════════════════════════════════════════════════════════════════
// ALERTES DE STOCK MINIMUM — LA LOGIQUE DU « STOCK MINIMUM » ENFIN LUE
// ═══════════════════════════════════════════════════════════════════════════
// `products.min_stock` se saisit depuis la fiche (ProductStockCard) mais
// personne ne le lisait. Ce hook rend les produits dont le stock NEUF est
// tombé au seuil ou en dessous, pour le bouton « Stock alert » de l'en-tête.
//
// Le filtre est écrit pour PocketBase et compté par lui (`totalItems`) : ce
// n'est ni un second décompte ni un balayage du catalogue côté React.
//   • `min_stock > 0` : 0 veut dire « pas de seuil », pas « alerter à 0 » ;
//   • `type != 'service'` : un service n'a pas de stock (règle de
//     `/api/stock/adjust`) ;
//   • le Stock B n'entre pas : le seuil se rapporte au compteur neuf.
// La clé commence par `catalog-products`, donc le temps réel du catalogue et
// `invalidateCatalog` la périment sans rien ajouter.

import { usePocketBase } from '@/lib/use-pocketbase'
import { useQuery } from '@tanstack/react-query'

export type StockAlertProduct = {
	id: string
	name: string
	designation?: string
	sku?: string
	stock: number
	min_stock: number
}

export type StockAlerts = {
	items: StockAlertProduct[]
	totalItems: number
}

const MAX_AFFICHES = 8

export function useStockAlerts(companyId?: string) {
	const pb = usePocketBase() as any

	return useQuery<StockAlerts>({
		queryKey: ['catalog-products', 'stock-alerts', companyId],
		enabled: !!companyId,
		staleTime: 60_000,
		queryFn: async () => {
			const filter = pb.filter(
				"company = {:company} && type != 'service' && min_stock > 0 && stock <= min_stock",
				{ company: companyId },
			)
			const result = await pb.collection('products').getList(1, MAX_AFFICHES, {
				filter,
				fields: 'id,name,designation,sku,stock,min_stock',
				// Les plus à sec d'abord : l'écart au seuil, pas l'ordre alphabétique.
				sort: 'stock',
			})
			return {
				items: result.items as StockAlertProduct[],
				totalItems: result.totalItems as number,
			}
		},
	})
}
