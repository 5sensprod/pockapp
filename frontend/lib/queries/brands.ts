// frontend/lib/queries/brands.ts
//
// ⚠️ NE PAS REVENIR AUX TYPES `Brands*` DE `pocketbase-types.ts` : ils
// déclarent `logo` et `website`, qui n'existent pas. La collection installée
// porte `name, slug, description, image, wp_image_url, legacy_id, company`
// (mesuré le 13 août 2026 dans `pb_data/data.db`). `image` est un champ
// FICHIER : il se résout par `pb.files.getUrl`, ce n'est pas une URL.
//
// Ces hooks ne servent qu'au module `stock` (vérifié le 13 août 2026).
// Détail : §6bis.4 du rituel de migration AppStock.

import type {
	CatalogBrandShape,
	PocketBaseRecord,
} from '@/lib/queries/catalog-shapes'
import { newLegacyKey } from '@/lib/queries/legacy-key'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

/** Ce qu'on peut écrire. `legacy_id` n'en fait pas partie : la couche le pose
 *  elle-même à la création, aucun écran ne doit pouvoir l'oublier. */
export type BrandWrite = Partial<
	Omit<CatalogBrandShape, keyof PocketBaseRecord | 'legacy_id'>
> & { name: string; company?: string }

export interface BrandsListOptions {
	companyId?: string
	filter?: string
	sort?: string
	[key: string]: unknown
}

export function useBrands(options: BrandsListOptions = {}) {
	const pb = usePocketBase()
	const { companyId, filter, sort, ...otherOptions } = options

	return useQuery({
		queryKey: ['brands', companyId, filter, sort],
		queryFn: async () => {
			const filters: string[] = []

			// Filtrer par entreprise si un companyId est fourni
			if (companyId) {
				filters.push(`company = "${companyId}"`)
			}

			// Ajouter les autres filtres s'ils existent
			if (filter) {
				filters.push(filter)
			}

			const finalFilter = filters.length > 0 ? filters.join(' && ') : undefined

			return await pb.collection('brands').getFullList<CatalogBrandShape>({
				sort: sort || 'name',
				filter: finalFilter,
				...otherOptions,
			})
		},
		enabled: !!companyId,
		refetchOnMount: 'always',
		staleTime: 0,
	})
}

export function useBrand(brandId?: string) {
	const pb = usePocketBase()
	return useQuery({
		queryKey: ['brands', brandId],
		queryFn: async () => {
			if (!brandId) throw new Error('brandId is required')
			return await pb.collection('brands').getOne<CatalogBrandShape>(brandId)
		},
		enabled: !!brandId,
	})
}

export function useCreateBrand() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: BrandWrite) => {
			// Clé stable posée par la couche, jamais par l'écran : une marque sans
			// `legacy_id` est refusée à l'export ET disparaît des relations des
			// produits qui la citent, en silence (docs/DECISIONS.md, 2026-08-13).
			return await pb
				.collection('brands')
				.create<CatalogBrandShape>({ legacy_id: newLegacyKey(), ...data })
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['brands'] })
		},
	})
}

export function useUpdateBrand() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({ id, data }: { id: string; data: BrandWrite }) => {
			return await pb.collection('brands').update<CatalogBrandShape>(id, data)
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ['brands'] })
			queryClient.invalidateQueries({ queryKey: ['brands', variables.id] })
		},
	})
}

export function useDeleteBrand() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (brandId: string) => {
			return await pb.collection('brands').delete(brandId)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['brands'] })
		},
	})
}
