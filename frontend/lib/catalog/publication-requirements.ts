// frontend/lib/catalog/publication-requirements.ts
// ═══════════════════════════════════════════════════════════════════════════
// CE QU'IL FAUT À UNE FICHE POUR ÊTRE PUBLIÉE — LA RÈGLE, EN UN SEUL ENDROIT
// ═══════════════════════════════════════════════════════════════════════════
//
// Une fiche ne se publie pas sans image principale ni catégorie : sans image,
// la page du site n'a pas de visuel ; sans catégorie, elle n'est dans aucun
// rayon et personne ne la trouve.
//
// La règle vivait en ligne dans `ProductSitePanel.tsx`, c'est-à-dire dans un
// écran — et le lot « Publier la sélection » de la page produits, qui écrit
// `status` sans passer par cet écran, ne la connaissait pas. Elle est ici pour
// que les deux lisent la même chose, et le lot la fait respecter DANS LA
// MUTATION (`useUpdateCatalogProductStatusBatch`) : une garde qui ne vit que
// dans l'interface n'est pas une garde.
//
// Elle ne vaut que pour la PUBLICATION. Une fiche déjà en ligne dont l'image
// aurait disparu depuis reste publiée, à corriger à son rythme : on ne dépublie
// jamais de force.

/** Les libellés, tels qu'ils se lisent dans une phrase : « Manque … ». */
export const MANQUE_IMAGE = 'une image principale'
export const MANQUE_CATEGORIE = 'une catégorie'

export interface RessourcesDePublication {
	/** Le nom de fichier de l'image principale, tel que PocketBase le porte. */
	image?: string | null
	/** Les catégories de la fiche (identifiants). */
	categories?: readonly string[] | null
	/** Une image principale choisie mais pas encore enregistrée : la fiche la
	 *  portera à l'enregistrement, elle ne manque donc pas. Propre à l'écran de
	 *  la fiche — un lot n'en a jamais. */
	imageEnAttente?: boolean
}

/**
 * Ce qui manque à une fiche pour être publiée, dans un ordre stable : image,
 * puis catégorie. Vide = publiable.
 */
export function manquesPourPublier(ressources: RessourcesDePublication) {
	const manques: string[] = []
	const image = (ressources.image ?? '').trim()
	if (image === '' && !ressources.imageEnAttente) manques.push(MANQUE_IMAGE)
	if ((ressources.categories?.length ?? 0) === 0) manques.push(MANQUE_CATEGORIE)
	return manques
}

/** « une image principale et une catégorie » — pour un message. */
export function dire(manques: readonly string[]): string {
	return manques.join(' et ')
}
