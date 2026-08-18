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

// 🔢 Nombre de produits par marque — sur TOUT le catalogue
//
// ⚠️ NE PAS COMPTER DEPUIS `useProducts` : il rend `getList(1, 50)`, donc les
// 50 produits les plus récents. Compter les marques là-dedans donnait « 0 »
// pour l'immense majorité des 287 marques — non parce qu'elles n'ont pas de
// produits, mais parce que ces produits n'étaient pas dans la page. Constaté à
// l'écran le 13 août 2026.
//
// Une requête, et une seule : `fields: 'brand'` ne ramène que l'identifiant de
// marque de chaque produit. 2999 lignes d'un seul champ, là où 287 requêtes de
// comptage — une par marque — auraient été le réflexe coûteux.
export function useProductCountsByBrand(companyId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: ['products', 'counts-by-brand', companyId],
		// Le catalogue bouge au rythme des rechargements, pas à la seconde.
		staleTime: 5 * 60_000,
		queryFn: async () => {
			const rows = await pb.collection('products').getFullList<{
				brand?: string
			}>({
				fields: 'brand',
				filter: companyId ? `company = "${companyId}"` : undefined,
			})

			const counts: Record<string, number> = {}
			for (const row of rows) {
				if (row.brand) counts[row.brand] = (counts[row.brand] ?? 0) + 1
			}
			return counts
		},
		enabled: !!companyId,
	})
}

// 🔢 Produits rattachés à chaque catégorie — sur TOUT le catalogue
//
// Rend les IDENTIFIANTS et non un décompte, pour une raison précise : un
// produit peut appartenir à deux catégories sœurs, et il ne doit compter
// qu'une fois dans leur ancêtre commun. Additionner des décomptes en remontant
// l'arbre donnerait un total faux ; il faut pouvoir dédoublonner.
//
// Même remarque de pagination que `useProductCountsByBrand` : une requête,
// `fields: 'id,categories'`, sur l'ensemble du catalogue.
export function useProductIdsByCategory(companyId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: ['products', 'ids-by-category', companyId],
		staleTime: 5 * 60_000,
		queryFn: async () => {
			const rows = await pb.collection('products').getFullList<{
				id: string
				categories?: string[]
			}>({
				fields: 'id,categories',
				filter: companyId ? `company = "${companyId}"` : undefined,
			})

			const byCategory: Record<string, string[]> = {}
			for (const row of rows) {
				for (const categoryId of row.categories ?? []) {
					if (!byCategory[categoryId]) byCategory[categoryId] = []
					byCategory[categoryId].push(row.id)
				}
			}
			return byCategory
		},
		enabled: !!companyId,
	})
}
