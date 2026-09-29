// frontend/modules/stick/labels/lib/produits-par-ids.ts
//
// RELIRE LES PRODUITS AFFICHÉS PAR LEURS IDENTIFIANTS.
//
// Règles pures, séparées du hook pour être testables sans navigateur (comme
// `catalog-realtime.ts` : `catalog-products.ts` construit un client
// PocketBase au chargement du module).

/** Préfixe de clé : `['catalog-products', …]` est ce que périment
 *  `invalidateCatalog` ET `COLLECTIONS_SURVEILLEES.products`. Rien de neuf à
 *  inscrire dans le temps réel — un test le vérifie. */
export const CLE_PRODUITS_AFFICHE = [
	'catalog-products',
	'affiche-par-ids',
] as const

/** Ids uniques, non vides, TRIÉS : l'ordre de la sélection ne doit pas
 *  multiplier les entrées de cache ni refaire partir la requête. */
export function idsNormalises(ids: readonly string[]): string[] {
	return [...new Set(ids.filter((id) => typeof id === 'string' && id))].sort()
}

export function cleProduitsAffiche(ids: readonly string[]) {
	return [...CLE_PRODUITS_AFFICHE, idsNormalises(ids).join(',')] as const
}

/** UNE requête `id = … || id = …`, pas N. Chaque valeur passe par
 *  `pb.filter`, qui l'échappe. */
export function filtreParIds(
	pb: { filter: (expr: string, params: Record<string, unknown>) => string },
	ids: readonly string[],
): string {
	return idsNormalises(ids)
		.map((id) => pb.filter('id = {:id}', { id }))
		.join(' || ')
}

/** Ids demandés que la réponse ne contient plus : produits supprimés. */
export function idsDisparus(
	demandes: readonly string[],
	rendus: readonly { id: string }[],
): string[] {
	const presents = new Set(rendus.map((p) => p.id))
	return idsNormalises(demandes).filter((id) => !presents.has(id))
}
