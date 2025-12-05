import type {
	QuoteCreateDto,
	QuoteResponse,
	QuotesListOptions,
} from '@/lib/types/invoice.types'
// frontend/lib/queries/quotes.ts
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const quoteKeys = {
	all: ['quotes'] as const,
	lists: () => [...quoteKeys.all, 'list'] as const,
	list: (options: QuotesListOptions) =>
		[...quoteKeys.lists(), options] as const,
	details: () => [...quoteKeys.all, 'detail'] as const,
	detail: (id: string) => [...quoteKeys.details(), id] as const,
}

// 📋 Liste des devis
export function useQuotes(options: QuotesListOptions = {}) {
	const pb = usePocketBase()
	const {
		companyId,
		customerId,
		status,
		filter,
		sort,
		page = 1,
		perPage = 50,
	} = options

	return useQuery({
		queryKey: quoteKeys.list(options),
		queryFn: async () => {
			const filters: string[] = []

			if (companyId) filters.push(`owner_company = "${companyId}"`)
			if (customerId) filters.push(`customer = "${customerId}"`)
			if (status) filters.push(`status = "${status}"`)
			if (filter) filters.push(filter)

			const finalFilter = filters.length ? filters.join(' && ') : undefined

			const result = await pb.collection('quotes').getList(page, perPage, {
				sort: sort || '-created',
				filter: finalFilter,
				expand: 'customer,generated_invoice_id',
			})

			return result as unknown as {
				items: QuoteResponse[]
				totalItems: number
				totalPages: number
				page: number
				perPage: number
			}
		},
		enabled: !!companyId,
		refetchOnMount: 'always',
		staleTime: 0,
	})
}

// 🔍 Détail devis
export function useQuote(quoteId?: string) {
	const pb = usePocketBase()

	return useQuery({
		queryKey: quoteKeys.detail(quoteId || ''),
		queryFn: async () => {
			if (!quoteId) throw new Error('quoteId is required')
			const result = await pb.collection('quotes').getOne(quoteId, {
				expand: 'customer,generated_invoice_id',
			})
			return result as unknown as QuoteResponse
		},
		enabled: !!quoteId,
	})
}

// ➕ Créer un devis
export function useCreateQuote() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: QuoteCreateDto) => {
			const result = await pb.collection('quotes').create(data)
			return result as unknown as QuoteResponse
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: quoteKeys.all })
		},
	})
}

// ✏️ Mettre à jour un devis
export function useUpdateQuote() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			data,
		}: {
			id: string
			data: Partial<QuoteCreateDto>
		}) => {
			const result = await pb.collection('quotes').update(id, data)
			return result as unknown as QuoteResponse
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: quoteKeys.all })
			queryClient.invalidateQueries({
				queryKey: quoteKeys.detail(variables.id),
			})
		},
	})
}

// 🗑️ Supprimer un devis
export function useDeleteQuote() {
	const pb = usePocketBase()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (quoteId: string) => {
			await pb.collection('quotes').delete(quoteId)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: quoteKeys.all })
		},
	})
}
