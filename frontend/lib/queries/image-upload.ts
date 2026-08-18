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

/** Ce qu'un écran déclare à propos de l'image, en plus des champs texte. */
export interface ImageIntent {
	/** Un fichier choisi par l'utilisateur. */
	image?: File | null
	/** L'utilisateur a demandé le retrait de l'image existante. */
	removeImage?: boolean
}

/**
 * Rend le corps à envoyer : un objet simple quand l'image n'est pas concernée,
 * un `FormData` dès qu'elle l'est.
 *
 * Les valeurs `undefined` sont écartées dans les deux cas — `FormData` les
 * sérialiserait en la chaîne « undefined », ce qui écrirait ce mot-là en base.
 */
export function buildWritePayload<T extends Record<string, unknown>>(
	data: T & ImageIntent,
): Record<string, unknown> | FormData {
	const { image, removeImage, ...champs } = data as T & ImageIntent

	const propre: Record<string, unknown> = {}
	for (const [cle, valeur] of Object.entries(champs)) {
		if (valeur !== undefined) propre[cle] = valeur
	}

	// Règle 3 : rien n'est dit de l'image, on n'en parle pas au serveur.
	if (!(image instanceof File) && !removeImage) return propre

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
	} else {
		// Règle 2.
		form.append('image', '')
	}

	return form
}
