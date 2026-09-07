// frontend/lib/queries/restauration-selective.ts
// ═══════════════════════════════════════════════════════════════════════════
// RESTAURATION SÉLECTIVE — ACCÈS DONNÉES
// ═══════════════════════════════════════════════════════════════════════════
// La restauration ordinaire (`usePrepareRestore`, `secrets.ts`) remplace la
// base ENTIÈRE au démarrage suivant. Celle-ci ne ramène que trois champs, à
// chaud, et ne crée rien.
//
// Conception et règles : `backend/backup/selectif.go`, dont l'en-tête tient
// tout le raisonnement — la clé d'appariement, ce qui reste intact, et
// pourquoi le menu est un cas à part.
//
// ⚠️ **Aucun compteur n'est calculé ici.** Le Go rend des nombres, l'écran les
// affiche. C'est la même règle que pour les décomptes du catalogue
// (`/api/catalog/counts`) et l'agrégation de la caisse : deux calculs des
// mêmes règles finissent toujours par diverger, et le second est celui qu'on
// oublie de corriger.

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { usePocketBase } from '../use-pocketbase'
import { fetchWithAuth } from './secrets'

// ---------------------------------------------------------------------------
// LA FORME DU RAPPORT — miroir de `RapportSelectif` (backend/backup/selectif.go)
// ---------------------------------------------------------------------------

export interface ChangementChamp {
	/** Nom technique du champ — la clé de `par_champ`. */
	champ: string
	/** Son libellé métier, composé par le Go : « catégories », « publication ». */
	libelle: string
	/**
	 * Les deux valeurs, EN CLAIR : noms de catégories et non identifiants,
	 * « brouillon » et non `draft`. L'écran les affiche telles quelles — traduire
	 * ici reviendrait à écrire deux fois les mêmes règles.
	 */
	avant: string
	apres: string
}

export interface FicheChangee {
	id: string
	legacy_id: string
	nom: string
	/** « id » ou « legacy_id » — sur quelle clé les deux bases se sont reconnues. */
	appariee_par: string
	changements: ChangementChamp[]
}

export interface FicheNommee {
	id: string
	legacy_id: string
	nom: string
	motif: string
}

export interface EcartCollection {
	collection: string
	lues_snapshot: number
	lues_cible: number
	appariees_par_id: number
	appariees_par_legacy_id: number
	a_changer: number
	identiques: number
	/** Dans le snapshot, pas dans la base. Comptées, listées, JAMAIS créées. */
	nb_absentes_cible: number
	absentes_cible: FicheNommee[]
	/** Dans la base, pas dans le snapshot. Intactes — le produit né en caisse. */
	nb_intactes: number
	/** Appariées mais non écrites, avec le motif. */
	nb_ecartees: number
	ecartees: FicheNommee[]
	par_champ: Record<string, number>
	exemples: FicheChangee[]
	/** Combien de fiches changées ne sont PAS dans `exemples`. Une liste
	 *  plafonnée qui ne le dit pas ment par omission. */
	exemples_non_montres: number
}

export interface EcartMenu {
	snapshot: number
	cible: number
	a_creer: number
	a_mettre_a_jour: number
	a_supprimer: number
	exemples: FicheNommee[]
}

/**
 * Ce que la restauration déclenchera vers le site.
 *
 * `status` et `categories` entrent dans le checksum d'export
 * (`catalog-export.ts`, `CHAMPS_PRODUIT_EXPORTES`), `name` dans celui des
 * catégories : une fiche dont l'un d'eux change devient `modified` et repartira
 * au prochain export. Ce n'est pas un défaut, c'est la conséquence — et elle
 * s'annonce AVANT d'écrire, avec son nombre.
 *
 * `designation` n'y est pas : elle n'a aucun effet en ligne.
 */
export interface EffetExport {
	produits_a_republier: number
	categories_a_republier: number
}

export interface RapportSelectif {
	snapshot_id: string
	simulation: boolean
	produits: EcartCollection
	categories: EcartCollection
	menu_demande: boolean
	menu: EcartMenu | null
	effet_export: EffetExport
	/** Renseignés seulement quand l'écriture a eu lieu. */
	sauvegarde_avant: string
	ecrites: number
	duree_ms: number
}

export interface DemandeSelective {
	clientId: string
	snapshotId: string
	/** Remplacer AUSSI le menu, en entier — création et suppression comprises. */
	avecMenu: boolean
	/** Absent ou faux : simulation. C'est le défaut, ici comme côté serveur. */
	appliquer?: boolean
}

// ---------------------------------------------------------------------------
// LES MUTATIONS
// ---------------------------------------------------------------------------

/**
 * Simuler, puis appliquer — par la MÊME route, avec un drapeau.
 *
 * Deux routes auraient été deux chemins de code, et l'aperçu aurait fini par
 * diverger de ce qui s'écrit. C'est la leçon de la régression du Z du 20 mai
 * 2026, transposée : on ne réimplémente pas deux fois les mêmes règles.
 *
 * Volontairement une mutation et non une requête, même pour la simulation :
 * elle télécharge et déchiffre plusieurs Mio, elle ne doit partir que sur un
 * geste et ne pas traîner dans le cache.
 */
export function useRestaurationSelective() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation<RapportSelectif, Error, DemandeSelective>({
		mutationFn: async (demande) => {
			return await fetchWithAuth(pb, '/api/backup/selective-restore', {
				method: 'POST',
				body: JSON.stringify({
					client_id: demande.clientId,
					snapshot_id: demande.snapshotId,
					with_menu: demande.avecMenu,
					apply: demande.appliquer === true,
					// Redemandée ici ET par le serveur, et seulement pour écrire.
					// Deux gardes, pour qu'un appel programmatique n'écrive pas
					// dans la base d'un magasin par accident.
					confirm: demande.appliquer ? demande.snapshotId : '',
				}),
			})
		},
		onSuccess: (rapport, demande) => {
			// Une simulation n'a rien changé : rien à périmer. Invalider quand
			// même ferait repartir six requêtes pour rien, à chaque aperçu.
			if (!demande.appliquer) return

			// Les mêmes clés qu'`invalidateCatalog` (`catalog-products.ts`), et
			// pour la même raison : `catalog-counts` et `categories` sont
			// PERSISTÉES sur le disque (`CLES_PERSISTEES`, `main.tsx`). Les
			// oublier ici ne laisserait pas un écran en retard, il laisserait un
			// écran en retard QUI LE RESTE après un rechargement.
			//
			// Le `buster` de `main.tsx` n'a pas à changer : la FORME de ces
			// réponses est la même, seules leurs valeurs bougent.
			queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
			queryClient.invalidateQueries({ queryKey: ['products'] })
			queryClient.invalidateQueries({ queryKey: ['categories'] })
			queryClient.invalidateQueries({ queryKey: ['catalog-counts'] })
			queryClient.invalidateQueries({ queryKey: ['site-catalog'] })

			if (rapport.menu_demande) {
				// La clé de `site-menu.ts`. Sur LES AUTRES postes, en revanche,
				// le menu n'apparaîtra qu'au rechargement : `site_menu` n'est pas
				// dans `COLLECTIONS_SURVEILLEES` du temps réel, contrairement à
				// `products` et `categories`.
				queryClient.invalidateQueries({ queryKey: ['site_menu'] })
			}
		},
	})
}

/**
 * Effacer les snapshots déchiffrés laissés par les simulations.
 *
 * Ils sont conservés exprès entre l'aperçu et l'écriture — pour que la
 * validation porte sur exactement ce qui a été montré —, mais un snapshot
 * déchiffré est la base du client EN CLAIR sur le disque. Quand on renonce, il
 * n'a plus de raison d'être là.
 */
export function usePurgerSnapshotsDeTravail() {
	const pb = usePocketBase() as any

	return useMutation<{ deleted: number }>({
		mutationFn: async () => {
			return await fetchWithAuth(pb, '/api/backup/selective-restore/cache', {
				method: 'DELETE',
			})
		},
	})
}
