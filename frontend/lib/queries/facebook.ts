// frontend/lib/queries/facebook.ts
//
// La connexion du magasin à sa Page Facebook, pour l'écran « Clés API &
// Secrets ». Le client est `@/lib/facebook/client` ; ces hooks n'y ajoutent
// que le cache. La clé `facebook-etat` n'est PAS persistée (`CLES_PERSISTEES`,
// `main.tsx`) : rien de cette connexion ne s'écrit sur le disque du poste.

import {
	choisirPageFacebook,
	connecterFacebook,
	deconnecterFacebook,
	type EtatFacebook,
	lireEtatFacebook,
} from '@/lib/facebook/client'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

const CLE = ['facebook-etat']

export function useFacebookEtat() {
	const pb = usePocketBase() as any
	return useQuery<EtatFacebook>({
		queryKey: CLE,
		queryFn: () => lireEtatFacebook(pb),
		retry: false,
		// Un autre poste a pu connecter ou déconnecter la Page
		staleTime: 0,
	})
}

/** Chaque action rend le nouvel état : il remplace celui du cache, sans relecture. */
function useActionFacebook<T>(
	action: (pb: any, valeur: T) => Promise<EtatFacebook>,
) {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (valeur: T) => action(pb, valeur),
		onSuccess: (etat) => queryClient.setQueryData(CLE, etat),
	})
}

/** Le jeton utilisateur collé : il part une fois, et n'est gardé par aucun cache. */
export const useFacebookConnecter = () =>
	useActionFacebook<string>(connecterFacebook)

export const useFacebookChoisir = () =>
	useActionFacebook<string>(choisirPageFacebook)

export const useFacebookDeconnecter = () =>
	useActionFacebook<void>((pb) => deconnecterFacebook(pb))
