// frontend/lib/pricing/use-prix-fiches.ts
//
// Les prix des fiches présentes dans une facture ou un devis, pour brider les
// remises au plafond du vendeur (`plafond-remise.ts`). Une ligne relue d'un
// document enregistré ne porte ni le prix promo ni sa période : on les relit.
// Ne sert que si un plafond s'applique.

import { usePocketBase } from '@/lib/use-pocketbase'
import { useQuery } from '@tanstack/react-query'

import type { PrixProduitB } from './promo-price'

export function usePrixFiches(
	productIds: Array<string | undefined>,
	actif: boolean,
): Map<string, PrixProduitB> {
	const pb = usePocketBase() as any
	const ids = [...new Set(productIds.filter((id): id is string => !!id))].sort()

	const { data } = useQuery({
		queryKey: ['prix-fiches', ids],
		enabled: actif && ids.length > 0,
		staleTime: 60_000,
		queryFn: async () => {
			const filtre = ids
				.map((id) => pb.filter('id = {:id}', { id }))
				.join(' || ')
			const fiches = await pb.collection('products').getFullList({
				filter: filtre,
				fields:
					'id,price_ttc,promo_price_ttc,sale_state,promo_start,promo_end,stock_b_price_ttc',
			})
			return fiches as Array<PrixProduitB & { id: string }>
		},
	})

	return new Map((data ?? []).map((f) => [f.id, f]))
}
