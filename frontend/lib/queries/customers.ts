import { usePocketBase } from '@/lib/use-pocketbase'
// frontend/lib/queries/customers.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// DTO envoyé à PocketBase
export interface CustomerDto {
	name: string
	email?: string
	phone?: string
	company?: string
	address?: string
	notes?: string
	tags?: string[]
}

export interface CustomersListOptions {
	companyId?: string
	filter?: string
	sort?: string
	expand?: string
	[key: string]: unknown
}

// 📋 Liste tous les clients
export function useCustomers(options: CustomersListOptions = {}) {
	const pb = usePocketBase() as any
	const { companyId, filter, sort, ...otherOptions } = options

	return useQuery({
		queryKey: ['customers', companyId, filter, sort],
		queryFn: async () => {
			const filters: string[] = []

			// Filtrer par entreprise si un companyId est fourni
			if (companyId) {
				filters.push(`owner_company = "${companyId}"`)
			}

			// Ajouter les autres filtres s'ils existent
			if (filter) {
				filters.push(filter)
			}

			const finalFilter = filters.length > 0 ? filters.join(' && ') : undefined

			return await pb.collection('customers').getList(1, 50, {
				sort: sort || '-created',
				expand: '',
				filter: finalFilter,
				...otherOptions,
			})
		},
		enabled: !!companyId,
		refetchOnMount: 'always',
		staleTime: 0,
	})
}

// 👤 Détails d'un client
export function useCustomer(customerId?: string) {
	const pb = usePocketBase() as any

	return useQuery({
		queryKey: ['customers', customerId],
		queryFn: async () => {
			if (!customerId) throw new Error('customerId is required')
			return await pb.collection('customers').getOne(customerId, {
				expand: '',
			})
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
			return await pb.collection('customers').create(data)
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
			return await pb.collection('customers').update(id, data)
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

	return useQuery({
		queryKey: ['customers', 'search', searchTerm, companyId],
		queryFn: async () => {
			if (!searchTerm) return { items: [] }

			const filters: string[] = [
				`name ~ "${searchTerm}" || email ~ "${searchTerm}" || phone ~ "${searchTerm}"`,
			]

			if (companyId) {
				filters.push(`owner_company = "${companyId}"`)
			}

			return await pb.collection('customers').getList(1, 20, {
				filter: filters.join(' && '),
				sort: '-created',
			})
		},
		enabled: searchTerm.length > 2 && !!companyId,
	})
}
