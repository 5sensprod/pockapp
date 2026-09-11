// frontend/lib/pricing/use-jour-serveur.ts
//
// LE JOUR DU SERVEUR, pour juger la période d'une promo.
//
// Séparé de `promo-price.ts` pour que la règle reste pure et testable sans
// PocketBase (`use-pocketbase` touche `window` à l'import).
//
// La caisse ne lit jamais l'horloge du navigateur (décision du 10 septembre
// 2026) : le déploiement est multi-postes, et un poste mal réglé appliquerait
// une promo finie. Le jour vient de `GET /api/time/today`, à Paris.
//
// Il n'est PAS persisté (`CLES_PERSISTEES`, `main.tsx`) : un jour relu depuis
// le disque serait précisément un jour périmé. Relu toutes les dix minutes,
// ce qui fait passer minuit sans rechargement.

import { usePocketBase } from '@/lib/use-pocketbase'
import { useQuery } from '@tanstack/react-query'

import type { JourServeur } from './promo-price'

export function useJourServeur(): JourServeur {
	const pb = usePocketBase() as any

	const { data } = useQuery<string>({
		queryKey: ['jour-serveur'],
		staleTime: 5 * 60_000,
		refetchInterval: 10 * 60_000,
		queryFn: async () => {
			const res = (await pb.send('/api/time/today', {
				method: 'GET',
				// Plusieurs écrans montent ce hook ensemble : sans clé nulle, le SDK
				// annulerait les requêtes identiques les unes par les autres.
				requestKey: null,
			})) as { today: string }
			return res.today
		},
	})

	return data ?? null
}
