import type { SuppliersRecord, SuppliersResponse } from '@/lib/pocketbase-types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

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

			return await pb.collection('suppliers').getFullList<SuppliersResponse>({
				sort: sort || 'name',
				expand: 'brands',
				filter: finalFilter,
				...otherOptions,
			})
		},
		enabled: !!companyId,
		refetchOnMount: 'always',
		staleTime: 0,
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
				.getOne<SuppliersResponse>(supplierId, {
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
		mutationFn: async (data: SuppliersRecord) => {
			return await pb.collection('suppliers').create<SuppliersResponse>(data)
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
		mutationFn: async ({
			id,
			data,
		}: { id: string; data: Partial<SuppliersRecord> }) => {
			return await pb
				.collection('suppliers')
				.update<SuppliersResponse>(id, data)
		},
		onSuccess: (
			_,
			variables: { id: string; data: Partial<SuppliersRecord> },
		) => {
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
