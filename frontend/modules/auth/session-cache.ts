// frontend/modules/auth/session-cache.ts
// ═══════════════════════════════════════════════════════════════════════════
// CE QUI A ÉTÉ LU SANS SESSION  (10 septembre 2026)
// ═══════════════════════════════════════════════════════════════════════════
// Les collections PocketBase exigent un compte (`@request.auth.id != ''`),
// mais un visiteur n'y reçoit PAS d'erreur : il reçoit `200` et une liste
// VIDE. Une requête partie avant la connexion met donc en cache « aucune
// catégorie », avec un statut de succès, pour toute la durée de son
// `staleTime` — et rien ne la relisait à la connexion.
//
// Constaté le 10 septembre 2026 (`logs.db`) : `categories` lue en `guest` à
// 07:47:46, connexion à 07:47:52, jamais relue. Le menu refusait alors de
// publier TOUTES ses destinations catégorie.
//
// ─── Pourquoi on ne vide pas tout le cache à la connexion ─────────────────
// `main.tsx` efface la session à chaque lancement : tout jeter à la connexion
// reviendrait à jeter à chaque lancement le catalogue persisté sur le disque,
// qui existe précisément pour ne pas repartir de zéro. On ne périme donc QUE
// ce qui a été lu (ou a échoué) depuis que la session manque.
// ═══════════════════════════════════════════════════════════════════════════

/** Ce que le prédicat regarde de l'état d'une requête TanStack Query. */
export interface EtatLecture {
	dataUpdatedAt: number
	errorUpdatedAt: number
}

/**
 * Vrai si la requête a reçu une réponse — succès ou échec — depuis `depuis`,
 * c'est-à-dire pendant que la session manquait.
 *
 * Une requête jamais aboutie (horodatages à 0) n'est pas concernée : elle
 * partira avec la session. Une donnée restaurée du disque porte l'horodatage
 * de la session qui l'a lue, antérieur : elle est gardée.
 */
export function luSansSession(etat: EtatLecture, depuis: number): boolean {
	return etat.dataUpdatedAt >= depuis || etat.errorUpdatedAt >= depuis
}
