// frontend/lib/sync/sync-queue.types.ts
//
// Le vocabulaire de la file de synchronisation du catalogue. Séparé du
// provider pour qu'un écran puisse typer ce qu'il empile sans importer le
// composant — et sans que Fast Refresh perde le contexte.

import type { ExportRejection } from '@/modules/site/hooks/use-catalog-sync'

/**
 * Ce qu'on demande à la file.
 *
 * `donnees` et `images` sont **deux étapes**, pas deux options d'une même :
 * les données partent en lots vers `/api/site/catalog/export` (plafond 1 Mio),
 * les images entité par entité vers le miroir (multipart, 24 Mio). Deux
 * tuyaux, deux empreintes — le checksum d'entité ne couvre aucun champ image,
 * exprès (CLAUDE.md, §4.2 du contrat). On ne les fond pas.
 */
export type SyncJob = {
	/** Ce que le toast nomme. « 12 produits », « Guitare folk Alvarez ». */
	label: string
	/** Identifiants PocketBase. La file les résout elle-même dans le catalogue,
	 *  et pose les relations en `legacy_id` par le chemin d'export habituel. */
	productIds: string[]
	/** Catégories et marques à envoyer POUR ELLES-MÊMES — les retouches de
	 *  texte isolées. Celles que les produits citent partent de toute façon,
	 *  ancêtres compris (`collectExportInput`). */
	categoryIds?: string[]
	brandIds?: string[]
	/** Après l'envoi des données d'un produit, envoyer aussi les images des
	 * catégories et marques qui n'existaient pas encore sur le site. Ne couvre
	 * jamais les images produit : elles restent un choix explicite. */
	relationImages?: boolean
	donnees: boolean
	images: boolean
}

export type SyncPhase = 'idle' | 'donnees' | 'images'

export type SyncProgress = { done: number; total: number }

export type SyncQueueState = {
	phase: SyncPhase
	/** Lots envoyés / lots à envoyer, pendant la phase `donnees`. */
	donnees: SyncProgress
	/** Entités envoyées / entités à envoyer, pendant la phase `images`. */
	images: SyncProgress
	/** L'entité en cours, telle qu'on la nomme à l'écran. */
	courant: string | null
	/** Ce qui reste dans la file derrière le travail en cours. */
	enAttente: number
	/** Les refus du serveur, accumulés sur toute la file. */
	rejets: ExportRejection[]
	/** Les échecs, en clair. Un lot qui échoue interrompt la suite et laisse
	 *  les précédents écrits (§6 du contrat : idempotent, on rejoue). */
	echecs: string[]
}

export const ETAT_INITIAL: SyncQueueState = {
	phase: 'idle',
	donnees: { done: 0, total: 0 },
	images: { done: 0, total: 0 },
	courant: null,
	enAttente: 0,
	rejets: [],
	echecs: [],
}

export type SyncQueueValue = {
	etat: SyncQueueState
	/** `true` dès qu'un travail est en cours ou en attente. */
	actif: boolean
	enqueue: (job: SyncJob) => void
	/** Demande l'arrêt : le travail en cours finit son entité, le reste de la
	 *  file est abandonné. Un lot de données déjà parti ne se rappelle pas. */
	annuler: () => void
}
