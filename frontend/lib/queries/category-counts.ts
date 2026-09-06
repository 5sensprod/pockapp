interface CategoryCountsSnapshot {
	totalProduits: number
	parCategorie: Record<string, unknown>
}

/**
 * Une réponse persistée ou issue d'un ancien backend peut contenir le total du
 * catalogue sans la ventilation par catégorie. La traiter comme un vrai jeu de
 * zéros ferait disparaître l'arbre entier. Dans ce cas, l'interface doit
 * revenir à la liste complète jusqu'à ce qu'une réponse exploitable arrive.
 */
export function hasUsableCategoryCounts(
	counts: CategoryCountsSnapshot | undefined,
): boolean {
	if (!counts) return false
	return (
		counts.totalProduits === 0 || Object.keys(counts.parCategorie).length > 0
	)
}
