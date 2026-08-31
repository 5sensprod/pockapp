// frontend/lib/queries/consignmentItems.ts
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const DEPOSITOR_TAG = 'déposant'

/** Ajoute le tag déposant sans perdre les autres tags ni créer de doublon. */
export function withDepositorTag(tags: readonly string[] = []): string[] {
	return Array.from(new Set([...tags, DEPOSITOR_TAG]))
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConsignmentStatus = 'available' | 'sold' | 'returned'

export interface ConsignmentItemDto {
	id: string
	description: string
	seller_price: number
	store_price: number
	/** Taux de commission contractuel en %, figé à la création */
	commission_rate?: number
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
	commission_rate?: number
	status?: ConsignmentStatus
	notes?: string
	customer: string
	owner_company: string
}

export interface UpdateConsignmentItemDto {
	description?: string
	seller_price?: number
	store_price?: number
	commission_rate?: number
	status?: ConsignmentStatus
	notes?: string
}

export interface CreateConsignmentItemResult {
	item: ConsignmentItemDto
	customerTagUpdateFailed: boolean
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
			const item = (await pb
				.collection('consignment_items')
				.create(data)) as ConsignmentItemDto

			try {
				const customer = (await pb
					.collection('customers')
					.getOne(data.customer, { fields: 'tags' })) as { tags?: string[] }
				const currentTags = customer.tags ?? []
				const nextTags = withDepositorTag(currentTags)

				if (!currentTags.includes(DEPOSITOR_TAG)) {
					await pb.collection('customers').update(data.customer, {
						tags: nextTags,
					})
				}

				return { item, customerTagUpdateFailed: false }
			} catch (error) {
				console.error(
					`Le dépôt ${item.id} a été créé, mais le tag déposant du client ${data.customer} n'a pas pu être posé.`,
					error,
				)
				return { item, customerTagUpdateFailed: true }
			}
		},
		onSuccess: (
			_: CreateConsignmentItemResult,
			variables: CreateConsignmentItemDto,
		) => {
			queryClient.invalidateQueries({
				queryKey: consignmentKeys.byCustomer(variables.customer),
			})
			queryClient.invalidateQueries({ queryKey: ['customers'] })
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
