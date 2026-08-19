// frontend/lib/queries/image-upload.ts
//
// Envoyer un champ FICHIER à PocketBase, pour les entités du catalogue.
//
// POURQUOI CE FICHIER EXISTE. Les images du catalogue viennent aujourd'hui de
// l'import AppPos — `backend/catalog/load/loader.go` copie 4665 fichiers depuis
// `%APPDATA%\AppPOS\data\public`. **Les prochaines installations n'auront pas
// ce dossier** : une marque, une catégorie ou un produit créé ici doit pouvoir
// recevoir son image depuis l'écran. C'est le même geste que le logo
// d'entreprise (`lib/queries/companies.ts:118-176`), et c'est de là que vient
// la forme retenue.
//
// TROIS RÈGLES, chacune payée ailleurs :
//
//  1. un fichier ne passe QUE par `FormData` — un `File` dans un objet JSON
//     part en `{}` et PocketBase enregistre un champ vide sans se plaindre ;
//  2. **retirer une image, c'est envoyer la chaîne vide**, jamais `undefined` :
//     `undefined` disparaît du corps et l'ancienne valeur reste en base (règle
//     du 13 août 2026, déjà notée sur les champs texte) ;
//  3. ne rien dire du fichier laisse l'image EN PLACE. Un formulaire qu'on
//     enregistre sans toucher à l'image ne doit pas l'effacer.
//
// ── LA GALERIE, 19 août 2026 ──────────────────────────────────────────────
// `gallery` porte jusqu'à dix fichiers (`backend/migrations/catalog_v2.go:676`)
// et 747 produits sur 2999 en ont une (mesuré en base le 19 août 2026).
//
// **La liste envoyée est la liste complète après opération.** PocketBase
// remplace le champ entier : une entrée oubliée est un fichier supprimé, sans
// confirmation. C'est le piège nommé dans le prompt de reprise, et c'est la
// raison des trois tests qui suivent la règle 4.
//
//  4. une entrée DÉJÀ EN BASE repart sous son NOM, une entrée neuve part en
//     `File`. Renvoyer les noms dans un autre ordre RÉORDONNE la galerie :
//     ce n'est pas un contournement, c'est une capacité déclarée de la
//     bibliothèque — `forms/record_upsert.go:461` (v0.22.22),
//     « allow file key reasignments for file names sorting ».
//
// ⚠️ **Un fichier neuf atterrit TOUJOURS en fin de galerie**, quel que soit le
// rang qu'on lui donne ici : PocketBase traite les noms soumis d'abord
// (`form.data[key] = submittedNames`) puis ajoute les téléversements derrière.
// L'écran doit le refléter plutôt que promettre un rang qu'il n'obtiendra pas.
//
// ⚠️ **Ce fichier ne sait pas promouvoir.** Déplacer un nom de `gallery` vers
// `image` est refusé par la bibliothèque — le nom est inconnu du champ `image`
// (`forms/record_upsert.go:428-435`, refus mesuré :
// « The field contains unknown filenames. »). Ce geste passe par
// `POST /api/catalog/products/:id/promote-image`
// (`backend/routes/product_image_routes.go`).

/** Ce qu'un écran déclare à propos de l'image, en plus des champs texte. */
export interface ImageIntent {
	/** Un fichier choisi par l'utilisateur. */
	image?: File | null
	/** L'utilisateur a demandé le retrait de l'image existante. */
	removeImage?: boolean
}

/** Ce qu'un écran déclare à propos de la galerie. */
export interface GalleryIntent {
	/**
	 * La galerie COMPLÈTE après opération : un nom pour ce qui est déjà en
	 * base, un `File` pour ce qui arrive. `undefined` ne dit rien et laisse la
	 * galerie en place ; `[]` la vide — et supprime les fichiers.
	 */
	gallery?: (File | string)[]
}

/**
 * Rend le corps à envoyer : un objet simple quand l'image n'est pas concernée,
 * un `FormData` dès qu'elle l'est.
 *
 * Les valeurs `undefined` sont écartées dans les deux cas — `FormData` les
 * sérialiserait en la chaîne « undefined », ce qui écrirait ce mot-là en base.
 */
export function buildWritePayload<T extends Record<string, unknown>>(
	data: T & ImageIntent & GalleryIntent,
): Record<string, unknown> | FormData {
	// `gallery` est extrait ici : la boucle générique traite les tableaux comme
	// des relations multiples et sérialiserait un `File` en « [object File] ».
	const { image, removeImage, gallery, ...champs } = data as T &
		ImageIntent &
		GalleryIntent

	const propre: Record<string, unknown> = {}
	for (const [cle, valeur] of Object.entries(champs)) {
		if (valeur !== undefined) propre[cle] = valeur
	}

	// Règle 3, étendue à la galerie : rien n'est dit, on n'en parle pas au
	// serveur.
	const galerieConcernee = Array.isArray(gallery)
	if (!(image instanceof File) && !removeImage && !galerieConcernee) {
		return propre
	}

	const form = new FormData()
	for (const [cle, valeur] of Object.entries(propre)) {
		if (Array.isArray(valeur)) {
			// Une relation multiple — `brands` d'un fournisseur, `categories` d'un
			// produit — s'envoie en répétant la clé. Un tableau vide n'ajoute donc
			// aucune entrée : c'est ainsi qu'on vide une relation.
			for (const element of valeur) form.append(cle, String(element))
		} else {
			form.append(cle, valeur === null ? '' : String(valeur))
		}
	}

	if (image instanceof File) {
		form.append('image', image)
	} else if (removeImage) {
		// Règle 2.
		form.append('image', '')
	}
	// Ni fichier ni retrait demandé : on ne parle pas d'`image`. Sans ce
	// silence, enregistrer une galerie effacerait l'image principale — le
	// `FormData` étant désormais déclenché par la galerie seule.

	if (galerieConcernee) {
		if (gallery.length === 0) {
			// Règle 2, pour un champ multiple : la chaîne vide vide le champ.
			form.append('gallery', '')
		} else {
			// Règle 4 : l'ORDRE de cette boucle est l'ordre de la galerie.
			for (const entree of gallery) {
				form.append('gallery', entree)
			}
		}
	}

	return form
}
