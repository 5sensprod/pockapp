// frontend/lib/queries/suppliers.ts
//
// ⚠️ NE PAS REVENIR AUX TYPES `Suppliers*` DE
// `pocketbase-types.ts` : ils décrivent le schéma v1 — `active`, `address`,
// `contact`, `email`, `notes`, `phone` —, dont **aucun champ n'existe** dans la
// collection installée. Mesuré le 13 août 2026 dans `pb_data/data.db`.
// La forme réelle est dans `catalog-shapes.ts`, déclarée à la main.
//
// Ces hooks ne sont utilisés que par le module `stock` (vérifié le 13 août
// 2026) : les retyper n'a donc aucun effet sur la caisse ni sur les documents
// commerciaux. Détail : §6bis.2 et §6bis.4 du rituel de migration AppStock.

import type {
	CatalogSupplierShape,
	PocketBaseRecord,
} from '@/lib/queries/catalog-shapes'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

/** Ce qu'on peut écrire : la forme réelle, moins ce que PocketBase pose
 *  lui-même. `legacy_id` en fait partie — il vient de NeDB, on ne l'invente
 *  pas pour un fournisseur saisi ici. */
export type SupplierWrite = Partial<
	Omit<CatalogSupplierShape, keyof PocketBaseRecord | 'legacy_id'>
> & { name: string; company?: string }

export interface SuppliersListOptions {
	companyId?: string
	filter?: string
	sort?: string
	[key: string]: unknown
}

export function useSuppliers(options: SuppliersListOptions = {}) {
	const pb = usePocketBase()
	const { companyId, filter, sort, ...otherOptions } = options

	return useQuery({
		queryKey: ['suppliers', companyId, filter, sort],
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

			return await pb
				.collection('suppliers')
				.getFullList<CatalogSupplierShape>({
					// `name_sort`, pas `name` : SQLite trie en BINARY — toutes les
					// majuscules avant toutes les minuscules, accents après « Z ».
					// La clé est calculée à l'écriture (`backend/catalog/sortkey`).
					sort: sort || 'name_sort',
					expand: 'brands',
					filter: finalFilter,
					...otherOptions,
				})
		},
		enabled: !!companyId,
		// Le catalogue est tenu à jour d'un poste à l'autre par le temps réel
		// PocketBase (`frontend/lib/realtime/`, règle du 19 août 2026), qui
		// invalide cette clé dès qu'un autre poste écrit. Un `staleTime: 0` avec
		// `refetchOnMount: 'always'` par-dessus refaisait donc un `getFullList`
		// entier à CHAQUE montage d'écran pour rien : 43 fournisseurs et leur expand `brands`. Mesuré le
		// 25 août 2026 — c'est ce qui rendait /stock lent après le premier
		// chargement.
		staleTime: 5 * 60_000,
	})
}

export function useSupplier(supplierId?: string) {
	const pb = usePocketBase()
	return useQuery({
		queryKey: ['suppliers', supplierId],
		queryFn: async () => {
			if (!supplierId) throw new Error('supplierId is required')
			return await pb
				.collection('suppliers')
				.getOne<CatalogSupplierShape>(supplierId, {
					expand: 'brands',
				})
		},
		enabled: !!supplierId,
	})
}

export function useCreateSupplier() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: SupplierWrite) => {
			return await pb.collection('suppliers').create<CatalogSupplierShape>(data)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['suppliers'] })
		},
	})
}

export function useUpdateSupplier() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({ id, data }: { id: string; data: SupplierWrite }) => {
			return await pb
				.collection('suppliers')
				.update<CatalogSupplierShape>(id, data)
		},
		onSuccess: (_, variables: { id: string; data: SupplierWrite }) => {
			queryClient.invalidateQueries({ queryKey: ['suppliers'] })
			queryClient.invalidateQueries({ queryKey: ['suppliers', variables.id] })
		},
	})
}

export function useDeleteSupplier() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (supplierId: string) => {
			return await pb.collection('suppliers').delete(supplierId)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['suppliers'] })
		},
	})
}
