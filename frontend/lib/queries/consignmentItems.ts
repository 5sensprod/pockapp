// frontend/lib/queries/consignmentItems.ts
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConsignmentStatus = 'available' | 'sold' | 'returned'

export interface ConsignmentItemDto {
	id: string
	description: string
	seller_price: number
	store_price: number
	status: ConsignmentStatus
	notes?: string
	customer: string
	owner_company: string
	created: string
	updated: string
}

export interface CreateConsignmentItemDto {
	description: string
	seller_price: number
	store_price: number
	status?: ConsignmentStatus
	notes?: string
	customer: string
	owner_company: string
}

export interface UpdateConsignmentItemDto {
	description?: string
	seller_price?: number
	store_price?: number
	status?: ConsignmentStatus
	notes?: string
}

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const consignmentKeys = {
	all: ['consignment_items'] as const,
	byCustomer: (customerId: string) =>
		['consignment_items', 'customer', customerId] as const,
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** Liste tous les produits d'occasion d'un client */
export function useConsignmentItems(customerId: string | undefined) {
	const pb = usePocketBase() as any

	return useQuery({
		queryKey: consignmentKeys.byCustomer(customerId ?? ''),
		enabled: !!customerId,
		refetchOnMount: 'always',
		staleTime: 0,
		queryFn: async () => {
			const result = await pb.collection('consignment_items').getList(1, 200, {
				filter: `customer = "${customerId}"`,
				sort: '-created',
			})
			return result as {
				page: number
				perPage: number
				totalItems: number
				totalPages: number
				items: ConsignmentItemDto[]
			}
		},
	})
}

/** Crée un nouveau produit d'occasion */
export function useCreateConsignmentItem() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: CreateConsignmentItemDto) => {
			const result = await pb.collection('consignment_items').create(data)
			return result as ConsignmentItemDto
		},
		onSuccess: (_: ConsignmentItemDto, variables: CreateConsignmentItemDto) => {
			queryClient.invalidateQueries({
				queryKey: consignmentKeys.byCustomer(variables.customer),
			})
		},
	})
}

/** Met à jour un produit d'occasion */
export function useUpdateConsignmentItem() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			data,
			customerId,
		}: {
			id: string
			data: UpdateConsignmentItemDto
			customerId: string
		}) => {
			const result = await pb.collection('consignment_items').update(id, data)
			return { result: result as ConsignmentItemDto, customerId }
		},
		onSuccess: ({
			customerId,
		}: { result: ConsignmentItemDto; customerId: string }) => {
			queryClient.invalidateQueries({
				queryKey: consignmentKeys.byCustomer(customerId),
			})
		},
	})
}

/** Supprime un produit d'occasion */
export function useDeleteConsignmentItem(customerId: string) {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (id: string) => {
			await pb.collection('consignment_items').delete(id)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: consignmentKeys.byCustomer(customerId),
			})
		},
	})
}
