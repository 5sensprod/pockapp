// frontend/lib/pricing/use-plafond-remise.ts
//
// Le plafond de remise de l'utilisateur connecté, relu depuis PocketBase et
// non depuis l'authStore : l'admin peut le changer pendant que le vendeur est
// connecté. Séparé de `plafond-remise.ts` pour que la règle reste pure.

import { usePocketBase } from '@/lib/use-pocketbase'
import { useQuery } from '@tanstack/react-query'

import { type PlafondRemise, plafondDe } from './plafond-remise'

export function usePlafondRemise(): PlafondRemise {
	const pb = usePocketBase() as any
	const id: string | undefined = pb.authStore.model?.id

	const { data } = useQuery({
		queryKey: ['plafond-remise', id],
		enabled: !!id,
		staleTime: 60_000,
		refetchInterval: 5 * 60_000,
		queryFn: async () => pb.collection('users').getOne(id),
	})

	return plafondDe(data ?? pb.authStore.model)
}
