// frontend/lib/realtime/use-catalog-realtime.ts
//
// L'abonnement lui-même. La règle qu'il porte — regrouper les événements — est
// dans `catalog-realtime.ts`, testée séparément.

import { usePocketBase } from '@/lib/use-pocketbase'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
	COLLECTIONS_SURVEILLEES,
	type Regroupeur,
	creerRegroupeur,
} from './catalog-realtime'

/**
 * Tient le catalogue à jour d'un poste à l'autre : ventes, prix, stock,
 * et les arbres catégories / marques / fournisseurs.
 *
 * Monté UNE FOIS, sous l'authentification — la collection `products` exige un
 * compte (`backend/migrations/catalog_v2.go:261`), donc un abonnement ouvert
 * avant la connexion serait refusé.
 *
 * Ne bloque rien et ne remonte rien : si le temps réel ne s'ouvre pas, les
 * écrans se comportent comme avant ce fichier — ils se rafraîchissent au
 * changement de page. C'est un confort, jamais une dépendance de la caisse.
 */
export function useCatalogRealtime(actif: boolean) {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	useEffect(() => {
		if (!actif) return

		let demonte = false
		const aFermer: Array<() => void> = []
		const regroupeurs: Regroupeur[] = []

		for (const [collection, cles] of Object.entries(COLLECTIONS_SURVEILLEES)) {
			// Un regroupeur par collection : une salve de produits ne doit pas
			// retarder l'affichage d'une marque renommée, et inversement.
			const regroupeur = creerRegroupeur(() => {
				for (const cle of cles) {
					queryClient.invalidateQueries({ queryKey: cle })
				}
			})
			regroupeurs.push(regroupeur)

			pb.collection(collection)
				.subscribe('*', () => regroupeur.signaler())
				.then((fn: () => void) => {
					// Le démontage a pu arriver avant que l'abonnement soit ouvert :
					// sans cette garde, il resterait ouvert pour toujours.
					if (demonte) fn()
					else aFermer.push(fn)
				})
				.catch((error: unknown) => {
					// Un refus n'empêche rien : les écrans se rafraîchissent au
					// changement de page, comme avant ce fichier.
					console.warn(`[temps réel] abonnement ${collection} refusé`, error)
				})
		}

		return () => {
			demonte = true
			for (const r of regroupeurs) r.arreter()
			for (const fermer of aFermer) fermer()
		}
	}, [actif, pb, queryClient])
}
