import type { CustomersResponse } from '@/lib/pocketbase-types'
// frontend/lib/queries/customers.ts
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// DTO envoyé à PocketBase
export interface CustomerDto {
	name: string
	email?: string
	phone?: string
	company?: string
	address?: string
	notes?: string
	tags?: string
	customer_type?:
		| 'individual'
		| 'professional'
		| 'administration'
		| 'association'
	payment_terms?: 'immediate' | '30_days' | '45_days' | '60_days'
	owner_company: string | string[]
}

export interface CustomersListOptions {
	companyId?: string
	filter?: string
	sort?: string
	expand?: string
	page?: number
	perPage?: number
	[key: string]: unknown
}

// Type du résultat de getList() pour les clients
export interface CustomersListResult {
	page: number
	perPage: number
	totalItems: number
	totalPages: number
	items: CustomersResponse[]
}

// 📋 Liste tous les clients
export function useCustomers(options: CustomersListOptions = {}) {
	const pb = usePocketBase() as any
	const {
		companyId,
		filter,
		sort,
		page = 1,
		perPage = 20,
		...otherOptions
	} = options

	return useQuery<CustomersListResult>({
		queryKey: ['customers', companyId, filter, sort, page, perPage],
		queryFn: async () => {
			const filters: string[] = []

			if (companyId) {
				filters.push(`owner_company = "${companyId}"`)
			}

			if (filter) {
				filters.push(filter)
			}

			const finalFilter = filters.length > 0 ? filters.join(' && ') : undefined

			const result = await pb.collection('customers').getList(page, perPage, {
				sort: sort || '-created',
				expand: '',
				filter: finalFilter,
				...otherOptions,
			})

			return result as CustomersListResult
		},
		enabled: !!companyId,
		refetchOnMount: 'always',
		staleTime: 0,
	})
}

// 👤 Détails d'un client
export function useCustomer(customerId?: string) {
	const pb = usePocketBase() as any

	return useQuery<CustomersResponse>({
		queryKey: ['customers', customerId],
		queryFn: async () => {
			if (!customerId) throw new Error('customerId is required')
			const result = await pb.collection('customers').getOne(customerId, {
				expand: '',
			})
			return result as CustomersResponse
		},
		enabled: !!customerId,
	})
}

// ➕ Créer un client
export function useCreateCustomer() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: CustomerDto) => {
			const result = await pb.collection('customers').create(data)
			return result as CustomersResponse
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['customers'] })
		},
	})
}

// ✏️ Modifier un client
export function useUpdateCustomer() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			data,
		}: { id: string; data: Partial<CustomerDto> }) => {
			const result = await pb.collection('customers').update(id, data)
			return result as CustomersResponse
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ['customers'] })
			queryClient.invalidateQueries({ queryKey: ['customers', variables.id] })
		},
	})
}

// 🗑️ Supprimer un client
export function useDeleteCustomer() {
	const pb = usePocketBase() as any
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (customerId: string) => {
			return await pb.collection('customers').delete(customerId)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['customers'] })
		},
	})
}

// 🔍 Recherche clients
export function useSearchCustomers(searchTerm: string, companyId?: string) {
	const pb = usePocketBase() as any

	return useQuery<CustomersListResult | { items: CustomersResponse[] }>({
		queryKey: ['customers', 'search', searchTerm, companyId],
		queryFn: async () => {
			if (!searchTerm) return { items: [] as CustomersResponse[] }

			const filters: string[] = [
				`name ~ "${searchTerm}" || email ~ "${searchTerm}" || phone ~ "${searchTerm}"`,
			]

			if (companyId) {
				filters.push(`owner_company = "${companyId}"`)
			}

			const result = await pb.collection('customers').getList(1, 20, {
				filter: filters.join(' && '),
				sort: '-created',
			})

			return result as CustomersListResult
		},
		enabled: searchTerm.length > 2 && !!companyId,
	})
}
