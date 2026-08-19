// frontend/lib/queries/gallery-order.ts
//
// L'ORDRE DE LA GALERIE — les quatre gestes, en fonctions pures.
//
// « L'ordre de la galerie est une donnée, pas un hasard de tri » (règle 3 du
// 19 août 2026, docs/DECISIONS.md). C'est lui qui décidera de l'ordre des
// vignettes sur le site : il se manipule donc explicitement, et il se teste.
//
// Une entrée est SOIT un nom de fichier déjà en base, SOIT un `File` choisi à
// l'écran et pas encore envoyé. C'est exactement ce que `buildWritePayload`
// attend, et c'est voulu : aucune conversion entre l'écran et l'envoi, donc
// aucun endroit où perdre une entrée.
//
// Ces fonctions ne suppriment jamais de fichier : elles rendent une liste.
// C'est l'envoi qui supprime ce qui n'y figure plus — voir `image-upload.ts`.

/** Une entrée de galerie : un nom déjà en base, ou un fichier à envoyer. */
export type GalleryEntry = string | File

/** Le maximum du schéma : `imageFileOptions(10)`,
 *  `backend/migrations/catalog_v2.go:679`. Au-delà, PocketBase refuse. */
export const MAX_GALERIE = 10

/** Une entrée déjà en base peut être promue principale ; un fichier pas encore
 *  envoyé n'a pas de nom, et la route serveur ne saurait pas le désigner. */
export function estPromouvable(entree: GalleryEntry): entree is string {
	return typeof entree === 'string'
}

/** Le libellé d'une entrée — sert de clé de rendu et d'intitulé. */
export function nomEntree(entree: GalleryEntry): string {
	return typeof entree === 'string' ? entree : entree.name
}

/**
 * Ajouter des fichiers, EN FIN DE LISTE et sans dépasser le maximum.
 *
 * La fin n'est pas un choix d'ergonomie : PocketBase traite les noms soumis
 * avant les téléversements (`forms/record_upsert.go:461`, puis `AddFiles`).
 * Un fichier neuf placé au milieu de la liste finirait à la fin en base, et
 * l'écran mentirait jusqu'au rechargement. On le place donc où il ira.
 */
export function ajouter(
	liste: GalleryEntry[],
	fichiers: File[],
): GalleryEntry[] {
	const place = MAX_GALERIE - liste.length
	if (place <= 0) return liste
	return [...liste, ...fichiers.slice(0, place)]
}

/** Retirer une entrée. Geste explicite : à l'envoi, le fichier correspondant
 *  est supprimé du stockage. */
export function retirer(liste: GalleryEntry[], index: number): GalleryEntry[] {
	if (index < 0 || index >= liste.length) return liste
	return [...liste.slice(0, index), ...liste.slice(index + 1)]
}

/**
 * Déplacer une entrée d'un rang à un autre.
 *
 * Les bornes sont ramenées dans la liste plutôt que levées : le seul appelant
 * est une paire de boutons « ← → » aux extrémités, et une exception y serait
 * un plantage d'écran pour un clic sans effet.
 */
export function deplacer(
	liste: GalleryEntry[],
	de: number,
	vers: number,
): GalleryEntry[] {
	if (de < 0 || de >= liste.length) return liste
	if (vers < 0 || vers >= liste.length) return liste
	if (de === vers) return liste

	const suivante = [...liste]
	const [entree] = suivante.splice(de, 1)
	suivante.splice(vers, 0, entree)
	return suivante
}

/**
 * Les deux listes désignent-elles la même galerie, dans le même ordre ?
 *
 * Sert à NE PAS PARLER de `gallery` quand l'utilisateur n'y a pas touché —
 * règle 3 d'`image-upload.ts`. Ce n'est pas une optimisation : une modale
 * ouverte avant qu'un autre poste — ou une promotion — modifie la galerie
 * porte une liste PÉRIMÉE, et la renvoyer supprimerait des fichiers ou ferait
 * échouer l'enregistrement sur « unknown filenames ». Constaté à l'usage le
 * 19 août 2026, sur un simple changement de prix.
 *
 * Un `File` n'est jamais égal à quoi que ce soit d'autre : sa présence signifie
 * qu'il y a quelque chose à envoyer.
 */
export function memeGalerie(a: GalleryEntry[], b: GalleryEntry[]): boolean {
	if (a.length !== b.length) return false
	return a.every((entree, i) => typeof entree === 'string' && entree === b[i])
}
