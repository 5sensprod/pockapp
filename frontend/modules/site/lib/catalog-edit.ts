// frontend/modules/site/lib/catalog-edit.ts
// ═══════════════════════════════════════════════════════════════════════════
// CE QU'UNE SAISIE ÉDITORIALE A LE DROIT D'ÊTRE
// ═══════════════════════════════════════════════════════════════════════════
// Fonctions pures — aucun réseau, aucun React —, pour que la règle soit
// vérifiable seule : catalog-edit.test.ts.
//
// Deux champs : le `name` canonique du produit et la `description` du produit,
// de la catégorie ou de la marque. Il n'existe pas de second titre éditorial.
//
// Ni prix, ni stock : ils appartiennent à AppStock.
//
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
 * Le rognage évite de marquer une fiche comme modifiée pour des espaces seuls.
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
				'Le titre ne peut pas être vide : garde la référence ou génère un titre.',
		}
	}
	if (name.length > NAME_MAX) {
		return {
			ok: false,
			error: `Le titre dépasse ${NAME_MAX} caractères (${name.length}).`,
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
