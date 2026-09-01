// frontend/lib/sync/stock-sync.ts
// ═══════════════════════════════════════════════════════════════════════════
// LE STOCK QUI BOUGE HORS DE LA FICHE PRODUIT
// ═══════════════════════════════════════════════════════════════════════════
// `stock` est l'un des onze champs qui atteignent la page publique
// (`CHAMPS_PRODUIT_EXPORTES`). Or il bouge le plus souvent SANS que personne
// n'ouvre la fiche : à chaque vente en caisse, à chaque comptage d'inventaire.
// Ces deux chemins ne passaient par aucune proposition de synchronisation — la
// page publique gardait l'ancien chiffre jusqu'à un export manuel.
//
// **Deux gestes, deux réponses différentes, et ce n'est pas une inconséquence :**
//
//  • **En caisse, on ne coupe JAMAIS la vente.** Pas de modale, rien de modal
//    du tout : un toast en bas de l'écran, qui attend. Il ne se ferme pas seul
//    (`duration: Infinity`) — il faut « Synchroniser » ou « Plus tard ». Le
//    client suivant peut arriver, la caisse continue de fonctionner derrière.
//  • **À l'inventaire, on envoie sans demander.** Compter, c'est déjà l'acte
//    de décision : poser une question par produit compté rendrait un
//    inventaire de 300 lignes inutilisable. Le toast est un compte rendu, pas
//    une question.
//
// Dans les deux cas on ne touche qu'aux DONNÉES (`images: false`) : un
// mouvement de stock ne change aucun octet de fichier, et renvoyer les photos
// occuperait le mutualisé pour rien (§4.2 du contrat, deux empreintes).
//
// Ce fichier n'envoie rien lui-même : il empile dans la file
// (`SyncQueueProvider`), qui raconte la suite dans son propre toast et survit
// à la navigation.
// ═══════════════════════════════════════════════════════════════════════════

import { invalidateCatalog } from '@/lib/queries/catalog-products'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useCatalogInventory } from '@/modules/site/hooks/use-catalog-sync'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { toast } from 'sonner'

import {
	type ClientProduits,
	type ProduitDeplace,
	fichesEnLigne,
} from './stock-sync-selection'
import { useSyncQueue } from './sync-queue-context'

export type { ProduitDeplace } from './stock-sync-selection'

/** Ce qui a bougé le stock. N'entre PAS dans la décision d'envoyer — la fiche
 *  est en ligne ou elle ne l'est pas — seulement dans ce qui est écrit. */
export type MotifMouvement = 'vente' | 'retour'

export function useStockSync(): {
	/**
	 * Après une vente ou un retour : POSE LA QUESTION, sans rien bloquer. À
	 * appeler sans `await` — l'encaissement ne doit pas attendre le site.
	 *
	 * `reference` nomme le toast (numéro de ticket, id de facture) : deux
	 * documents de suite font deux toasts, chacun avec ses produits, plutôt
	 * qu'un seul qui écrase l'autre. `motif` ne change QUE le texte.
	 */
	proposerApresMouvement: (
		lignes: ProduitDeplace[],
		options?: { reference?: string; motif?: MotifMouvement },
	) => Promise<void>
	/** Après un comptage d'inventaire : ENVOIE, et le dit. */
	synchroniserApresComptage: (produit: ProduitDeplace) => Promise<void>
} {
	const pb = usePocketBase()
	const queryClient = useQueryClient()
	const { enqueue } = useSyncQueue()
	// `false` : aucune lecture du site tant que rien n'a bougé. On la déclenche
	// à la demande, une vente ou un comptage à la fois — et `staleTime` (30 s)
	// évite qu'un inventaire complet la redemande à chaque ligne comptée.
	const inventaire = useCatalogInventory(false)

	/**
	 * L'inventaire du site, lu à la demande. Indisponible, on se TAIT — la
	 * sélection s'en charge (`stock-sync-selection.ts`) — mais on le DIT en
	 * console : sans cela ce silence est indistinguable d'un catalogue jamais
	 * exporté. Même posture que `useSyncAfterSave` et `CatalogSyncBar`.
	 */
	const resoudre = useCallback(
		async (produits: ProduitDeplace[]) => {
			let enLigne = inventaire.data?.products
			if (!enLigne) {
				try {
					enLigne = (await inventaire.refetch()).data?.products
				} catch {
					// avalé : le silence est expliqué juste en dessous
				}
			}
			if (!enLigne) {
				console.info(
					'[sync] inventaire du site indisponible : mouvement de stock non synchronisé.',
				)
				return []
			}
			return await fichesEnLigne(
				pb as unknown as ClientProduits,
				enLigne,
				produits,
			)
		},
		[inventaire, pb],
	)

	const envoyer = useCallback(
		(label: string, ids: string[]) => {
			// Le stock vient d'être écrit par `/api/stock/adjust`, hors TanStack
			// Query : sans cette invalidation la file exporterait la projection
			// `site-catalog` d'AVANT le mouvement, telle qu'elle est encore en
			// cache. Même geste que la fiche détail après un ajustement.
			invalidateCatalog(queryClient)
			enqueue({ label, productIds: ids, donnees: true, images: false })
		},
		[enqueue, queryClient],
	)

	const proposerApresMouvement = useCallback(
		async (
			lignes: ProduitDeplace[],
			options: { reference?: string; motif?: MotifMouvement } = {},
		) => {
			try {
				const fiches = await resoudre(lignes)
				if (fiches.length === 0) return

				const motif = options.motif ?? 'vente'
				const nombre = fiches.length
				// Un avoir REMET du stock : dire « produits vendus » sur un retour
				// serait faux à l'écran, et c'est l'écran qui décide si on envoie.
				const pluriel =
					motif === 'retour' ? 'produits retournés' : 'produits vendus'
				const titre =
					nombre === 1
						? `${fiches[0].name} : stock modifié, la fiche est en ligne.`
						: `${nombre} ${pluriel} sont en ligne.`

				toast(titre, {
					// Un identifiant par document : ventes et retours s'enchaînent,
					// leurs toasts ne doivent pas se remplacer l'un l'autre.
					id: `sync-stock-${motif}-${options.reference ?? Date.now()}`,
					description:
						"Le site affiche encore l'ancien stock tant que rien n'est envoyé.",
					// IL ATTEND. Se fermer seul au bout de quatre secondes, au milieu
					// d'un encaissement, revient à ne jamais poser la question.
					duration: Number.POSITIVE_INFINITY,
					action: {
						label: 'Synchroniser',
						onClick: () =>
							envoyer(
								nombre === 1 ? fiches[0].name : `${nombre} ${pluriel}`,
								fiches.map((f) => f.id),
							),
					},
					cancel: { label: 'Plus tard', onClick: () => {} },
				})
			} catch (error) {
				// RIEN de ce fichier ne doit pouvoir remonter dans la vente ni dans
				// un remboursement — c'est déjà la règle de `recordSale` : un souci
				// de synchronisation ne laisse pas un client payé sans ticket.
				console.error('[sync] proposition après mouvement abandonnée', error)
			}
		},
		[resoudre, envoyer],
	)

	const synchroniserApresComptage = useCallback(
		async (produit: ProduitDeplace) => {
			try {
				const fiches = await resoudre([produit])
				if (fiches.length === 0) return

				const nom = fiches[0].name || produit.productName || 'Produit'
				envoyer(nom, [fiches[0].id])
				toast.success(`${nom} : stock mis à jour et synchronisé`)
			} catch (error) {
				console.error('[sync] synchronisation après comptage abandonnée', error)
			}
		},
		[resoudre, envoyer],
	)

	return { proposerApresMouvement, synchroniserApresComptage }
}
