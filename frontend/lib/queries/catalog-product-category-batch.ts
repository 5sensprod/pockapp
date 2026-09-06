export type CatalogCategoryBatchMode = 'add' | 'replace'

/** Calcule la relation complète à écrire : conserver les catégories en ajout,
 * ou ne garder que la destination en remplacement. */
export function categoriesAfterBatchChange(
	current: string[],
	destinationId: string,
	mode: CatalogCategoryBatchMode,
): string[] {
	if (mode === 'replace') return [destinationId]
	return Array.from(new Set([...current, destinationId]))
}
