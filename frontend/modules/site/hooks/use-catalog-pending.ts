// frontend/modules/site/hooks/use-catalog-pending.ts
// ═══════════════════════════════════════════════════════════════════════════
// LA PASTILLE — ce qui attend d'être mis en ligne, vu de n'importe quel écran
// ═══════════════════════════════════════════════════════════════════════════
// Écrit le 14 septembre 2026. Depuis que les catégories et les marques partent
// seules, le vendeur n'a plus de raison d'ouvrir `/site/catalogue` — et c'est
// justement là que se voient les deux cas qui, eux, n'ont AUCUN automatisme :
//
//   • un produit créé ici et publié n'est jamais parti tout seul la première
//     fois (`useSyncAfterSave` ne propose rien pour une fiche que le site ne
//     connaît pas) ;
//   • un produit supprimé ici reste en ligne, page comprise
//     (`catalog-products.ts:978` le dit : le miroir n'est pas touché).
//
// Sans pastille, ces deux-là ne se découvrent qu'en allant voir. Avec, la barre
// latérale le dit depuis n'importe quel écran.
//
// ── CE QU'ELLE NE FAIT PAS, ET POURQUOI ────────────────────────────────────
// Elle ne compte PAS les fiches modifiées. Le savoir demande une empreinte par
// produit — le calcul que `/site/catalogue` fait sur 2848 fiches — et le faire
// tourner en fond, sur tous les écrans, pour poser un chiffre dans un menu,
// serait payer très cher un rappel. Les deux états comptés ici se lisent par
// simple présence d'une clé : **une liste de `legacy_id` d'un côté,
// l'inventaire distant de l'autre**, aucune empreinte, aucun octet d'image.
//
// La conséquence est à dire à l'écran : pastille éteinte ne veut pas dire site
// à jour, cela veut dire « rien de neuf et rien de disparu ». C'est le rôle de
// son infobulle, et c'est `/site/catalogue` qui fait foi.
// ═══════════════════════════════════════════════════════════════════════════

import { usePocketBase } from '@/lib/use-pocketbase'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { useCatalogInventory } from './use-catalog-sync'

/** Cinq minutes : c'est un rappel, pas un cadran. Le chiffre exact et frais se
 *  lit sur `/site/catalogue`, qui relit tout à l'ouverture. */
const PENDING_STALE_TIME = 5 * 60_000

type IndexLigne = { legacy_id: string; status: string }

export type CataloguePending = {
	/** Publiés ici, inconnus de la base du site : jamais envoyés. */
	jamaisEnvoyes: number
	/** En ligne là-bas, absents d'ici : supprimés au comptoir. Aucun geste ne
	 *  les retire aujourd'hui — voir `20-conception-retrait.md`. */
	disparus: number
	/** Ce que la pastille affiche. `0` l'éteint. */
	total: number
	/** Faux tant que l'inventaire distant n'a pas été lu : on n'affiche jamais
	 *  un zéro qui voudrait dire « je ne sais pas ». */
	mesure: boolean
}

const VIDE: CataloguePending = {
	jamaisEnvoyes: 0,
	disparus: 0,
	total: 0,
	mesure: false,
}

/**
 * L'index des `legacy_id` locaux, avec leur statut. DEUX champs, tous statuts
 * confondus : ~2900 lignes minuscules, contre la projection d'export complète
 * que lit `/site/catalogue`. Les brouillons en font partie — ce sont eux qui
 * empêchent de prendre une fiche dépubliée pour une fiche supprimée.
 */
function useLegacyIndex(enabled: boolean) {
	const pb = usePocketBase() as any

	return useQuery<IndexLigne[]>({
		queryKey: ['site-catalog', 'legacy-index'],
		enabled,
		staleTime: PENDING_STALE_TIME,
		queryFn: async () =>
			(await pb.collection('products').getFullList({
				fields: 'legacy_id,status',
				// Clé explicite, même raison qu'ailleurs : deux requêtes de même
				// méthode et même chemin s'auto-annulent dans le SDK PocketBase.
				requestKey: 'site-catalog-legacy-index',
			})) as IndexLigne[],
	})
}

export function useCataloguePending(enabled = true): CataloguePending {
	const inventaire = useCatalogInventory(enabled)
	const index = useLegacyIndex(enabled)

	return useMemo(() => {
		const enLigne = inventaire.data?.products
		if (!enLigne || !index.data) return VIDE

		let jamaisEnvoyes = 0
		const locaux = new Set<string>()
		for (const ligne of index.data) {
			if (!ligne.legacy_id) continue
			locaux.add(ligne.legacy_id)
			if (ligne.status === 'published' && !(ligne.legacy_id in enLigne)) {
				jamaisEnvoyes++
			}
		}

		let disparus = 0
		for (const legacyId of Object.keys(enLigne)) {
			if (!locaux.has(legacyId)) disparus++
		}

		return {
			jamaisEnvoyes,
			disparus,
			total: jamaisEnvoyes + disparus,
			mesure: true,
		}
	}, [inventaire.data, index.data])
}
