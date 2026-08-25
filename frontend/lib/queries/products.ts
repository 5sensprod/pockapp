// frontend/lib/queries/products.ts
//
// Ce qui reste ici est de la LECTURE AGRÉGÉE sur PocketBase, et rien d'autre.
// L'écriture des produits vit dans `catalog-products.ts`
// (`useCreateCatalogProduct` / `useUpdateCatalogProduct`), qui est le seul
// chemin d'écriture. `useUpdateProductUniversal` — qui choisissait sa base sur
// un `source?: string` optionnel, donc écrivait dans l'autre au moindre oubli —
// a été SUPPRIMÉ le 18 août 2026 avec son unique appelant, `ProductDialog`.
// Ne pas le réintroduire : la source se déclare au point d'appel, typée.
import { usePocketBase } from '@/lib/use-pocketbase'
import { useQuery } from '@tanstack/react-query'

// 🔢 LES DÉCOMPTES DU CATALOGUE — UNE REQUÊTE, CALCULÉE PAR LE SERVEUR
//
// Remplace `useProductCountsByBrand` et `useProductIdsByCategory`, qui
// balayaient tous deux le catalogue ENTIER depuis le navigateur — 2999
// produits, et `getFullList` les lit par lots de 500 dont chacun n'est demandé
// qu'après la réponse du précédent : six allers-retours en série, refaits à
// chaque montage des trois écrans qui en dépendaient, et à chaque rechargement
// de l'application. Mesuré le 25 août 2026.
//
// Le calcul vit maintenant dans `backend/routes/catalog_counts_routes.go`, là
// où sont les données. ⚠️ **Ne pas revenir à un décompte côté client** : le
// total d'une branche n'est pas la somme des totaux de ses enfants — un
// produit rangé dans deux catégories sœurs ne compte qu'une fois dans leur
// ancêtre commun —, et deux comptages écrits séparément finissent toujours par
// diverger. C'est exactement ce qui a produit la régression du Z. La règle est
// gardée par `backend/routes/catalog_counts_test.go`.
export interface CategoryCounts {
	/** Produits rattachés à CE nœud. */
	direct: number
	/** Produits DISTINCTS de la sous-arborescence, ce nœud compris. */
	total: number
}

export interface CatalogCounts {
	parMarque: Record<string, number>
	parCategorie: Record<string, CategoryCounts>
	totalProduits: number
}

/** La forme rendue par `GET /api/catalog/counts`. */
interface ReponseDecomptes {
	par_marque: Record<string, number>
	par_categorie: Record<string, CategoryCounts>
	total_produits: number
}

export function useCatalogCounts(companyId?: string) {
	const pb = usePocketBase()

	return useQuery<CatalogCounts>({
		queryKey: ['catalog-counts', companyId],
		// Le catalogue bouge au rythme des ventes et des imports, pas à la
		// seconde ; le temps réel PocketBase invalide cette clé quand un autre
		// poste écrit (`frontend/lib/realtime/`).
		staleTime: 5 * 60_000,
		queryFn: async () => {
			const reponse: ReponseDecomptes = await pb.send('/api/catalog/counts', {
				method: 'GET',
				query: companyId ? { company: companyId } : undefined,
			})

			return {
				parMarque: reponse.par_marque ?? {},
				parCategorie: reponse.par_categorie ?? {},
				totalProduits: reponse.total_produits ?? 0,
			}
		},
		enabled: !!companyId,
	})
}

/** Le décompte d'une catégorie, ou zéro. Évite de répéter le repli sur chaque
 *  nœud de l'arbre. */
export function countsOfCategory(
	counts: CatalogCounts | undefined,
	categoryId: string,
): CategoryCounts {
	return counts?.parCategorie[categoryId] ?? { direct: 0, total: 0 }
}
