import type { BrandsRecord, BrandsResponse } from '@/lib/pocketbase-types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

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

			return await pb.collection('brands').getFullList<BrandsResponse>({
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
			return await pb.collection('brands').getOne<BrandsResponse>(brandId)
		},
		enabled: !!brandId,
	})
}

export function useCreateBrand() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: BrandsRecord) => {
			return await pb.collection('brands').create<BrandsResponse>(data)
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
		mutationFn: async ({
			id,
			data,
		}: { id: string; data: Partial<BrandsRecord> }) => {
			return await pb.collection('brands').update<BrandsResponse>(id, data)
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
