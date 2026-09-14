// frontend/lib/sync/relation-auto-sync.ts
// ═══════════════════════════════════════════════════════════════════════════
// CATÉGORIES ET MARQUES — LA MISE EN LIGNE PART TOUTE SEULE
// ═══════════════════════════════════════════════════════════════════════════
// Le 14 septembre 2026, la question posée après enregistrement d'une catégorie
// ou d'une marque (`RelationSyncAfterSaveDialog`) est remplacée par un envoi.
// Le vendeur qui renomme un rayon depuis l'arbre de `/stock/produits` n'a plus
// rien à décider : ce qu'il vient d'enregistrer part, et le toast de la file
// le nomme.
//
// **Ce qui ne change pas**, et c'est délibéré :
//
//  • `/site/catalogue` reste tel quel. C'est le filet en cas de
//    désynchronisation — un envoi manqué, un site injoignable, une reprise de
//    base. L'automatisation s'ajoute à côté, elle ne le remplace pas.
//  • Le dialogue PRODUIT reste (`SyncAfterSaveDialog.tsx`) : une fiche produit
//    porte huit champs qui ne vont nulle part en ligne et jusqu'à des dizaines
//    d'images ; une catégorie porte un nom, un texte, un parent et une photo.
//  • On ne balaie JAMAIS le catalogue. Une entité, ses quelques octets, et le
//    cache persistant d'`image-checksum-store.ts`.
//
// **Le sens des dépendances est inchangé** : `stock` importe ce fichier, ce
// fichier importe `site`. `site` n'importe rien de `stock`.
// ═══════════════════════════════════════════════════════════════════════════

import type { CatalogBrand, CatalogCategory } from '@/lib/queries/site-catalog'
import { useCatalogInventory } from '@/modules/site/hooks/use-catalog-sync'
import { useCallback } from 'react'

import { useSyncQueue } from './sync-queue-context'

import {
	type ChangementsRelation,
	type DecisionPublication,
	decisionPublication,
} from './relation-auto-sync-rule'

export type {
	ChangementsRelation,
	DecisionPublication,
} from './relation-auto-sync-rule'
export { decisionPublication } from './relation-auto-sync-rule'

/** Ce que les deux hooks partagent : lire l'inventaire, décider, empiler. */
function useRelationAutoSync(kind: 'categories' | 'brands', enabled: boolean) {
	const inventaire = useCatalogInventory(enabled)
	const { enqueue } = useSyncQueue()

	return useCallback(
		async (
			entity: CatalogCategory | CatalogBrand,
			changements: ChangementsRelation,
		): Promise<DecisionPublication> => {
			// ⚠️ « Pas encore arrivé » n'est PAS « pas en ligne ». L'inventaire ne
			// part qu'à l'ouverture du formulaire ; enregistrer vite — ou juste
			// après un démarrage — le trouvait en vol. On l'attend une fois.
			let enLigne = inventaire.data?.[kind]
			if (!enLigne) {
				try {
					enLigne = (await inventaire.refetch()).data?.[kind]
				} catch {
					// avalé : le refus se dit juste en dessous, avec sa raison
				}
			}

			const decision = decisionPublication(kind, {
				connueDuSite: enLigne ? entity.legacy_id in enLigne : null,
				isFeatured: (entity as CatalogCategory).is_featured,
				changements,
			})

			if (decision !== 'publier') {
				console.info(
					`[sync] ${kind} ${entity.legacy_id || '(sans legacy_id)'} — pas d'envoi : ${decision}.`,
				)
				return decision
			}

			// ── DONNÉES **ET** IMAGES, SANS CONDITION ───────────────────────────
			// Les deux étapes restent deux étapes (deux tuyaux, deux empreintes),
			// mais on ne choisit plus entre elles : une catégorie porte au plus UNE
			// photo, l'envoi est un multipart de quelques centaines de kilo-octets,
			// et c'est ce qui fait converger le miroir sans jamais rien balayer.
			// Comparer l'empreinte ici pour s'épargner cet envoi coûterait une
			// lecture d'octets et une requête d'inventaire d'images : plus cher que
			// ce qu'on économise.
			enqueue({
				label: entity.name,
				productIds: [],
				categoryIds: kind === 'categories' ? [entity.id] : undefined,
				brandIds: kind === 'brands' ? [entity.id] : undefined,
				donnees: true,
				images: true,
			})
			return 'publier'
		},
		[inventaire, enqueue, kind],
	)
}

/**
 * Après enregistrement d'une catégorie : l'envoyer si le site a quelque chose
 * à en faire. `enabled` pilote la seule lecture distante — l'inventaire du
 * catalogue, la requête de `/site/catalogue`, même clé TanStack Query.
 */
export function useCategoryAutoSync(enabled: boolean) {
	return useRelationAutoSync('categories', enabled)
}

/** Même chose pour une marque, sans l'exception de la mise en avant. */
export function useBrandAutoSync(enabled: boolean) {
	return useRelationAutoSync('brands', enabled)
}
