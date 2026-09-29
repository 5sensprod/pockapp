// frontend/modules/stick/labels/lib/use-synchro-produits-affiche.ts
//
// LES PRODUITS DU CANVAS SUIVENT LA BASE.
//
// Le store ne tient que des identifiants (`useLabelStore.js`,
// `selectedProductIds`). Ce hook les relit dans PocketBase en UNE requête,
// les projette par `versProduitAffiche` avec le contexte VIVANT (marques,
// fournisseurs) et réécrit le cache du store.
//
// Rien de neuf n'est écouté : la clé commence par `catalog-products`, que
// périme déjà le temps réel du catalogue sur `products` ; `brands` et
// `suppliers` sont périmées par le leur, et le contexte suit. Un prix changé
// en caisse sur un autre poste arrive donc ici comme dans `/stock/produits`.
//
// `staleTime: 0` : en revenant sur `/stick`, la relecture repart toujours —
// c'est le « au plus tard quand on y revient », même si un événement a été
// manqué (poste en veille, SSE coupé).

import { PRODUCT_FIELDS } from '@/lib/queries/catalog-products'
import type { CatalogProductShape } from '@/lib/queries/catalog-products'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import useLabelStore from '../store/useLabelStore'
import { versProduitAffiche } from './produit-adapte'
import {
	cleProduitsAffiche,
	filtreParIds,
	idsDisparus,
	idsNormalises,
} from './produits-par-ids'
import { useContexteAffiche } from './use-produits-affiche'

export function useSynchroProduitsAffiche(): void {
	const pb = usePocketBase() as any
	const ids: string[] = useLabelStore((s: any) => s.selectedProductIds)
	const synchroniser = useLabelStore((s: any) => s.synchroniserProduits)
	const ctx = useContexteAffiche()
	const cle = cleProduitsAffiche(ids)

	const requete = useQuery<CatalogProductShape[]>({
		queryKey: cle,
		enabled: idsNormalises(ids).length > 0,
		staleTime: 0,
		queryFn: async () =>
			(await pb.collection('products').getFullList({
				filter: filtreParIds(pb, ids),
				fields: PRODUCT_FIELDS,
				// Sans cela, le SDK ANNULE cette lecture dès qu'une autre lecture de
				// `products` part en même temps — exactement ce que provoque une
				// invalidation du temps réel, qui relance toutes les requêtes
				// `catalog-products` actives d'un coup. La relecture échouait en
				// silence et ne repassait qu'au retour de focus de la fenêtre.
				requestKey: null,
			})) as CatalogProductShape[],
	})

	// Revenir sur la fenêtre relit. TanStack ne relit qu'au changement de
	// VISIBILITÉ : sous Wails, repasser devant le navigateur ne rend pas la
	// page « visible » à nouveau — il fallait réduire puis agrandir la fenêtre.
	const { refetch } = requete
	const actif = idsNormalises(ids).length > 0
	useEffect(() => {
		if (!actif) return
		const relire = () => refetch()
		window.addEventListener('focus', relire)
		return () => window.removeEventListener('focus', relire)
	}, [actif, refetch])

	useEffect(() => {
		// Pas de données (chargement, erreur réseau) : on ne conclut RIEN — une
		// erreur ne doit pas faire passer toute la sélection pour supprimée.
		if (!requete.data || !requete.isSuccess) return
		synchroniser(
			requete.data.map((p) => versProduitAffiche(p, ctx)),
			idsDisparus(ids, requete.data),
		)
	}, [requete.data, requete.isSuccess, ctx, ids, synchroniser])
}
