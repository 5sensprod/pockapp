// frontend/lib/sync/product-publish-auto-sync.ts
// ═══════════════════════════════════════════════════════════════════════════
// UN PRODUIT PUBLIÉ POUR LA PREMIÈRE FOIS PART TOUT SEUL
// ═══════════════════════════════════════════════════════════════════════════
// Miroir de `relation-auto-sync.ts`, pour les produits : la question posée
// après un enregistrement (`SyncAfterSaveDialog`) ne se pose plus quand la
// fiche vient de passer publiée — elle part, données ET images ensemble,
// comme le fait déjà `relation-auto-sync.ts` pour une catégorie ou une marque
// mise en avant.
//
// **Ce qui ne change pas** :
//
//  • `/site/catalogue` reste le point de contrôle — l'envoi manqué (réseau,
//    hébergeur indisponible, image trop lourde) s'y rattrape, dans le groupe
//    des fiches jamais parties.
//  • `SyncAfterSaveDialog` reste le chemin d'une fiche DÉJÀ en ligne qu'on
//    retouche : ce fichier ne couvre que le PASSAGE à publié, jamais une
//    modification ultérieure.
//  • On n'envoie qu'UN produit à la fois, par la même file sérielle que tout
//    le reste (`SyncQueueProvider`) — aucun nouveau chemin d'écriture.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback } from 'react'

import { useSyncQueue } from './sync-queue-context'

import {
	type DecisionPublicationProduit,
	decisionPublicationProduit,
} from './product-publish-auto-sync-rule'

export type { DecisionPublicationProduit } from './product-publish-auto-sync-rule'
export { decisionPublicationProduit } from './product-publish-auto-sync-rule'

/**
 * À appeler juste après l'enregistrement d'un produit, avec son état avant et
 * après. N'envoie que sur la transition non-publié → publié ; le reste ne fait
 * rien, en silence — ce n'est pas son rôle de le signaler, l'appelant garde la
 * main pour ses propres décisions (proposer la question habituelle, etc.).
 */
export function useProductPublishAutoSync() {
	const { enqueue } = useSyncQueue()

	return useCallback(
		(
			product: { id: string; name: string },
			etat: { avantPublie: boolean; apresPublie: boolean },
		): DecisionPublicationProduit => {
			const decision = decisionPublicationProduit(etat)
			if (decision !== 'publier') return decision

			// Données ET images, sans condition — même choix que pour une
			// catégorie ou une marque (`relation-auto-sync.ts`) : comparer une
			// empreinte pour s'épargner cet envoi coûterait déjà une lecture
			// d'octets, pour une fiche qu'on sait n'avoir jamais été envoyée.
			enqueue({
				label: product.name,
				productIds: [product.id],
				relationImages: true,
				donnees: true,
				images: true,
			})
			return 'publier'
		},
		[enqueue],
	)
}
