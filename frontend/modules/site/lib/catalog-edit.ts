// frontend/modules/site/lib/catalog-edit.ts
// ═══════════════════════════════════════════════════════════════════════════
// CE QU'UNE SAISIE ÉDITORIALE A LE DROIT D'ÊTRE
// ═══════════════════════════════════════════════════════════════════════════
// Fonctions pures — aucun réseau, aucun React —, pour que la règle soit
// vérifiable seule : catalog-edit.test.ts.
//
// Deux champs, et deux seulement (docs/DECISIONS.md, 2026-08-12) :
//
//   • `name` du produit, qui FAIT OFFICE de titre de site — `catalog.php`
//     retombe dessus quand `site_title` est vide (`present_product`, :134-141) ;
//   • `description` du produit, de la catégorie et de la marque.
//
// Ni prix, ni stock : ils appartiennent à AppStock.
//
// ⚠️ `name` est REQUIS au schéma (backend/migrations/catalog_v2.go:553). Une
// chaîne vide part en écriture, revient en erreur PocketBase brute, et
// l'utilisateur lit un message de validation d'API pour un champ qu'il vient
// d'effacer. On refuse ici, avec une phrase.
// ═══════════════════════════════════════════════════════════════════════════

/** Longueurs du schéma. Dépassées, PocketBase refuse — autant le dire avant. */
export const NAME_MAX = 255
export const DESCRIPTION_MAX = 20000

export type EditorialDraft = {
	/** Absent pour une catégorie ou une marque : seule leur description s'édite. */
	name?: string
	description: string
}

/** Ce qui part vers PocketBase. `description` vide devient chaîne vide, et non
 *  `undefined` : c'est ainsi qu'on efface un champ texte, et l'export la
 *  retraduira en `null` (`nullable`, catalog-export.ts:129). */
export type EditorialPatch = {
	name?: string
	description: string
}

export type EditorialValidation =
	| { ok: true; patch: EditorialPatch }
	| { ok: false; error: string }

/**
 * Valide et normalise une saisie.
 *
 * Le rognage n'est pas cosmétique : un `name` réduit à des espaces passerait la
 * garde du champ requis côté PocketBase — la chaîne n'est pas vide — et le site
 * afficherait un titre blanc.
 */
export function validateEditorial(draft: EditorialDraft): EditorialValidation {
	const description = draft.description.trim()

	if (description.length > DESCRIPTION_MAX) {
		return {
			ok: false,
			error: `La description dépasse ${DESCRIPTION_MAX} caractères (${description.length}).`,
		}
	}

	if (draft.name === undefined) return { ok: true, patch: { description } }

	const name = draft.name.trim()

	if (name === '') {
		return {
			ok: false,
			error:
				'Le nom ne peut pas être vide : il est requis au schéma, et c’est lui ' +
				'que le site affiche comme titre du produit.',
		}
	}

	if (name.length > NAME_MAX) {
		return {
			ok: false,
			error: `Le nom dépasse ${NAME_MAX} caractères (${name.length}).`,
		}
	}

	return { ok: true, patch: { name, description } }
}

/**
 * Une saisie identique à l'existant ne doit pas partir en écriture : elle
 * changerait `updated` sans rien changer d'autre, et surtout elle ferait
 * repasser le produit par la file d'export pour rien.
 */
export function isUnchanged(
	patch: EditorialPatch,
	current: { name?: string; description?: string },
): boolean {
	const sameName =
		patch.name === undefined || patch.name === (current.name ?? '')
	return sameName && patch.description === (current.description ?? '')
}
